"""
Inject listings from a Realm MLS CSV export into Neon DB mls_listings.

Usage:
    python scripts/inject_from_realm_csv.py C:/Users/Hrana/Downloads/Realm_Leads_2026-05-21.csv
    python scripts/inject_from_realm_csv.py ... --mls=N13106358   # single listing
"""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

# ── Env ───────────────────────────────────────────────────────────────────────

def load_env(path):
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env(os.path.join(os.path.dirname(__file__), '..', '.env'))
load_env(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

NEON_URL = (
    os.environ.get('NEON_DATABASE_URL') or
    os.environ.get('DATABASE_URL') or
    "postgresql://neondb_owner:npg_b6lcC0BeaRxn@ep-lucky-wildflower-at0z2w6v.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def clean(v):
    return v.strip() if v and v.strip() else None

def to_int(v):
    try:
        return int(float(str(v).replace(',', '').strip()))
    except Exception:
        return None

def to_float(v):
    try:
        return float(str(v).replace(',', '').strip())
    except Exception:
        return None

def to_price(v):
    if not v:
        return None
    m = re.search(r'\$[\d,]+', str(v))
    if m:
        return to_int(m.group().replace('$', ''))
    return None

def parse_beds(v):
    if not v:
        return None, None
    m = re.match(r'(\d+)\+(\d+)', str(v))
    if m:
        return int(m.group(1)), int(m.group(2))
    n = to_int(v)
    return n, None

def parse_address(street_address):
    if not street_address:
        return None, None, None
    parts = street_address.strip().split(' ', 1)
    number = parts[0] if parts else None
    rest   = parts[1] if len(parts) > 1 else ''
    rest_parts = rest.rsplit(' ', 1)
    name   = rest_parts[0] if rest_parts else rest
    suffix = rest_parts[1] if len(rest_parts) > 1 else None
    return clean(number), clean(name), clean(suffix)

def extract_postal(raw):
    if not raw:
        return None
    m = re.search(r'[A-Z]\d[A-Z]\s?\d[A-Z]\d', str(raw))
    return m.group().strip() if m else None

def extract_city(postal_raw, address_raw):
    for text in [postal_raw, address_raw]:
        if not text:
            continue
        cities = ['Richmond Hill', 'North York', 'Scarborough', 'Etobicoke', 'East York',
                  'Markham', 'Vaughan', 'Aurora', 'Newmarket', 'King City', 'Mississauga',
                  'Brampton', 'Oakville', 'Burlington', 'Hamilton', 'Toronto']
        for c in cities:
            if c in str(text):
                return c
    return None

def derive_category(property_type, unit_number, assoc_fee):
    pt = str(property_type or '').lower()
    if 'condo' in pt or 'apartment' in pt:
        return 'Condo'
    if 'townhouse' in pt or 'town' in pt:
        return 'Townhouse'
    if unit_number:
        return 'Condo'
    if assoc_fee and assoc_fee > 0:
        return 'Condo'
    return 'House'

def parse_date(v):
    if not v:
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y'):
        try:
            return datetime.strptime(v.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None

def collect_photos(row):
    urls = []
    for i in range(1, 100):
        u = row.get(f'photos_{i}_url', '')
        if u and u.startswith('http'):
            urls.append(u)
        elif not u:
            break
    return urls

# ── Mapping ───────────────────────────────────────────────────────────────────

def collect_washroom_info(row):
    """Collect washroomInfo_N_* into a JSON string."""
    rooms = []
    for i in range(1, 10):
        pieces = clean(row.get(f'washroomInfo_{i}_pieces'))
        level  = clean(row.get(f'washroomInfo_{i}_level'))
        count  = clean(row.get(f'washroomInfo_{i}_of_washrooms'))
        if not any([pieces, level, count]):
            break
        rooms.append({'count': count, 'pieces': pieces, 'level': level})
    return json.dumps(rooms, ensure_ascii=False) if rooms else None

def map_row(row):
    mls = clean(row.get('listingId') or row.get('mlsId') or row.get('mlsNumber'))
    if not mls:
        return None

    street_raw = clean(row.get('streetAddress'))
    street_num, street_name, street_suffix = parse_address(street_raw)

    city_raw    = clean(row.get('city'))
    postal_raw  = clean(row.get('postalCode'))
    address_raw = clean(row.get('address'))
    city = extract_city(postal_raw, address_raw)
    if not city and city_raw and len(city_raw) < 50 and not re.match(r'^\d', city_raw):
        city = city_raw

    postal = extract_postal(postal_raw) or extract_postal(address_raw)

    beds_raw = clean(row.get('propertyInfo_bedrooms') or row.get('beds'))
    beds_above, basement_beds = parse_beds(beds_raw)

    tx = str(row.get('transactionType') or '').upper()
    transaction_type = 'For Lease' if 'LEASE' in tx or 'RENT' in tx else 'For Sale'

    property_type = clean(row.get('propertyType') or row.get('propertySubtype'))
    category = derive_category(property_type, clean(row.get('unit_number')), None)

    photos = collect_photos(row)

    return {
        # ── Core ─────────────────────────────────────────────────────────────
        'mls_number':           mls,
        'external_id':          mls,
        'status':               'A',
        'standard_status':      'Active',
        'transaction_type':     transaction_type,
        'property_type':        property_type,
        'category':             category,
        'list_price':           to_price(row.get('listingInfo_list') or row.get('price') or row.get('summaryPrice')),
        'original_price':       to_price(row.get('listingInfo_original_list')),
        'list_date':            parse_date(row.get('listingInfo_contract_date')),
        'last_status':          clean(row.get('listingInfo_status')),
        # ── Address ──────────────────────────────────────────────────────────
        'street_number':        street_num,
        'street_name':          street_name,
        'street_suffix':        street_suffix,
        'unit_number':          None,  # addressLine2 is full address in Realm CSV, not unit
        'city':                 city,
        'state':                'Ontario',
        'zip':                  postal,
        'country':              'Canada',
        'neighborhood':         clean(row.get('propertyInfo_community')),
        'municipality':         clean(row.get('propertyInfo_municipality')),
        'area':                 clean(row.get('propertyInfo_area')),
        'lat':                  to_float(row.get('latitude')),
        'lng':                  to_float(row.get('longitude')),
        'cross_street':         clean(row.get('propertyInfo_dir_cross_st')),
        'directions':           clean(row.get('propertyInfo_directions')),
        # ── Beds / baths / size ───────────────────────────────────────────────
        'bed':                  beds_above,
        'bath':                 to_int(row.get('propertyInfo_washrooms') or row.get('baths')),
        'beds_above_grade':     beds_above,
        'basement_beds':        basement_beds,
        'sqft':                 clean(row.get('propertyInfo_square_feet') or row.get('squareFeet')),
        'above_grade_sqft':     clean(row.get('propertyInfo_above_grade_finished_sqft')),
        'rooms':                to_int(row.get('propertyInfo_rooms')),
        'kitchens':             to_int(row.get('propertyInfo_kitchens')),
        'dom':                  to_int(row.get('dom')),
        # ── Description / remarks ─────────────────────────────────────────────
        'description':          clean(row.get('clientRemarks')),
        'brokerage_remarks':    clean(row.get('brokerageRemarks')),
        'features':             clean(row.get('features')),
        'interior_features':    clean(row.get('interiorFeatures')),
        'building_features':    clean(row.get('buildingFeatures')),
        'included_items':       clean(row.get('included') or row.get('includedItems')),
        'exclusions':           clean(row.get('exclusions')),
        'rental_items':         clean(row.get('rentalItems')),
        'showing_requirements': clean(row.get('showingRequirements')),
        'special_designations': clean(row.get('specialDesignations')),
        'room_info':            clean(row.get('roomInfo')),
        'washroom_info':        collect_washroom_info(row),
        # ── Agent / brokerage ─────────────────────────────────────────────────
        'agent_name':           clean(row.get('listingAgentName')),
        'agent_email':          clean(row.get('listingAgentEmail')),
        'agent_phone':          clean(row.get('listingAgentPhone')),
        'brokerage':            clean(row.get('listingBrokerageName')),
        # ── Systems ──────────────────────────────────────────────────────────
        'cooling':              clean(row.get('propertyInfo_a_c')),
        'heating':              clean(row.get('propertyInfo_heating_type')),
        'heating_source':       clean(row.get('propertyInfo_heating_source')),
        'water':                clean(row.get('propertyInfo_water')),
        'sewers':               clean(row.get('propertyInfo_sewers')),
        'pool':                 clean(row.get('propertyInfo_pool')),
        'basement':             clean(row.get('propertyInfo_basement')),
        'exterior':             clean(row.get('propertyInfo_exterior')),
        'roof':                 clean(row.get('propertyInfo_roof')),
        'foundation':           clean(row.get('propertyInfo_foundation')),
        # ── Parking / lot ─────────────────────────────────────────────────────
        'parking_total':        to_int(row.get('propertyInfo_total_parking_spaces')),
        'garage_yn':            bool(clean(row.get('propertyInfo_garage_type'))),
        'garage_type':          clean(row.get('propertyInfo_garage_type')),
        'garage_spaces':        to_int(row.get('propertyInfo_garage_parking_spaces')),
        'drive_type':           clean(row.get('propertyInfo_drive')),
        'parking_drive_spaces': to_int(row.get('propertyInfo_parking_drive_spaces')),
        'lot_frontage':         clean(row.get('propertyInfo_lot_size')),
        'fronting_on':          clean(row.get('propertyInfo_fronting_on')),
        'approx_age':           clean(row.get('propertyInfo_approx_age')),
        # ── Listing contract info ─────────────────────────────────────────────
        'taxes':                clean(row.get('listingInfo_taxes')),
        'tax_year':             clean(row.get('listingInfo_tax_year')),
        'pin':                  clean(row.get('listingInfo_pin')),
        'legal_description':    clean(row.get('listingInfo_legal_description')),
        'possession_remarks':   clean(row.get('listingInfo_possession_remarks')),
        'possession_type':      clean(row.get('listingInfo_possession_type')),
        'occupancy':            clean(row.get('listingInfo_occupancy')),
        'commission':           clean(row.get('listingInfo_commission_co_op_brokerage')),
        'holdover':             clean(row.get('listingInfo_holdover')),
        'expiry_date':          clean(row.get('listingInfo_expiry_date')),
        'last_update_date':     clean(row.get('listingInfo_last_update')),
        'hst_applicable':       clean(row.get('propertyInfo_hst_applicable_to_sale_price')),
        'sale_type':            clean(row.get('saleType')),
        # ── Photos ───────────────────────────────────────────────────────────
        'photos_count':         len(photos),
        'images':               photos,
        'primary_photo_url':    clean(row.get('primaryPhotoUrl')) or (photos[0] if photos else None),
        # ── Metadata ─────────────────────────────────────────────────────────
        'scraped_at':           clean(row.get('scrapedAt')),
        'created_at':           datetime.now(timezone.utc).isoformat(),
        'updated_at':           datetime.now(timezone.utc).isoformat(),
        'last_seen_at':         datetime.now(timezone.utc).isoformat(),
    }

# ── Neon upsert ───────────────────────────────────────────────────────────────

COLUMNS = [
    # Core
    'mls_number', 'external_id', 'status', 'standard_status', 'transaction_type',
    'property_type', 'category', 'list_price', 'original_price', 'list_date',
    'last_status',
    # Address
    'street_number', 'street_name', 'street_suffix', 'unit_number',
    'city', 'state', 'zip', 'country', 'neighborhood', 'municipality', 'area',
    'lat', 'lng', 'cross_street', 'directions',
    # Beds / baths / size
    'bed', 'bath', 'beds_above_grade', 'basement_beds', 'sqft', 'above_grade_sqft',
    'rooms', 'kitchens', 'dom',
    # Description / remarks
    'description', 'brokerage_remarks', 'features', 'interior_features',
    'building_features', 'included_items', 'exclusions', 'rental_items',
    'showing_requirements', 'special_designations', 'room_info', 'washroom_info',
    # Agent / brokerage
    'agent_name', 'agent_email', 'agent_phone', 'brokerage',
    # Systems
    'cooling', 'heating', 'heating_source', 'water', 'sewers', 'pool',
    'basement', 'exterior', 'roof', 'foundation',
    # Parking / lot
    'parking_total', 'garage_yn', 'garage_type', 'garage_spaces',
    'drive_type', 'parking_drive_spaces', 'lot_frontage', 'fronting_on', 'approx_age',
    # Listing contract
    'taxes', 'tax_year', 'pin', 'legal_description', 'possession_remarks',
    'possession_type', 'occupancy', 'commission', 'holdover',
    'expiry_date', 'last_update_date', 'hst_applicable', 'sale_type',
    # Photos
    'photos_count', 'images', 'primary_photo_url',
    # Metadata
    'scraped_at', 'created_at', 'updated_at', 'last_seen_at',
]

# created_at should not be overwritten on conflict
_NO_UPDATE_COLS = {'mls_number', 'created_at'}

def ensure_table_setup(conn):
    """Ensure id sequence and unique constraint exist (idempotent)."""
    with conn.cursor() as cur:
        # Check id column type
        cur.execute("""
            SELECT data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'mls_listings' AND column_name = 'id'
        """)
        row = cur.fetchone()
        id_type, id_default = (row[0], row[1]) if row else ('bigint', None)

        # Resolve sequence name: try pg_get_serial_sequence first, then parse column_default
        cur.execute("SELECT pg_get_serial_sequence('mls_listings', 'id')")
        actual_seq = (cur.fetchone() or [None])[0]
        if not actual_seq and id_default:
            m = re.search(r"nextval\('([^']+)'", id_default)
            if m:
                actual_seq = m.group(1)

        if actual_seq:
            # Advance the sequence past the current max id
            if 'int' in id_type.lower():
                cur.execute(f"""
                    SELECT setval('{actual_seq}',
                        COALESCE((SELECT MAX(id) FROM mls_listings), 0) + 1, false)
                """)
            else:
                cur.execute(f"""
                    SELECT setval('{actual_seq}',
                        COALESCE((SELECT MAX(id::bigint) FROM mls_listings
                                  WHERE id ~ E'^\\\\d+$'), 0) + 1, false)
                """)
        else:
            # No sequence at all — create one and wire it up
            cur.execute("CREATE SEQUENCE IF NOT EXISTS mls_listings_id_seq")
            if 'int' in id_type.lower():
                cur.execute("""
                    SELECT setval('mls_listings_id_seq',
                        COALESCE((SELECT MAX(id) FROM mls_listings), 0) + 1, false)
                """)
                cur.execute("""
                    ALTER TABLE mls_listings
                    ALTER COLUMN id SET DEFAULT nextval('mls_listings_id_seq')
                """)
            else:
                cur.execute("""
                    SELECT setval('mls_listings_id_seq',
                        COALESCE((SELECT MAX(id::bigint) FROM mls_listings
                                  WHERE id ~ E'^\\\\d+$'), 0) + 1, false)
                """)
                cur.execute("""
                    ALTER TABLE mls_listings
                    ALTER COLUMN id SET DEFAULT nextval('mls_listings_id_seq')::text
                """)
            print(f'  OK Added id sequence to mls_listings (type: {id_type}).')

        # Add unique constraint on mls_number if missing
        cur.execute("""
            SELECT 1 FROM pg_constraint
            WHERE conname = 'mls_listings_mls_number_key'
              AND conrelid = 'mls_listings'::regclass
        """)
        if not cur.fetchone():
            cur.execute("""
                ALTER TABLE mls_listings
                ADD CONSTRAINT mls_listings_mls_number_key UNIQUE (mls_number)
            """)
            print('  OK Added unique constraint on mls_number.')
    conn.commit()


def neon_upsert(rows):
    conn = psycopg2.connect(NEON_URL)
    try:
        ensure_table_setup(conn)
        with conn:
            with conn.cursor() as cur:
                for row in rows:
                    values = []
                    for col in COLUMNS:
                        v = row.get(col)
                        if col == 'images':
                            v = psycopg2.extras.Json(v or [])
                        values.append(v)

                    placeholders = ', '.join(['%s'] * len(COLUMNS))
                    col_list     = ', '.join(COLUMNS)
                    updates      = ', '.join(
                        f"{c} = EXCLUDED.{c}"
                        for c in COLUMNS if c not in _NO_UPDATE_COLS
                    )

                    cur.execute(f"""
                        INSERT INTO mls_listings ({col_list})
                        VALUES ({placeholders})
                        ON CONFLICT (mls_number) DO UPDATE SET {updates}
                    """, values)

        print(f'  OK Upserted {len(rows)} row(s) into Neon.')
    finally:
        conn.close()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print('Usage: python scripts/inject_from_realm_csv.py <path_to_csv> [--mls=N13106358]')
        sys.exit(1)

    csv_path   = args[0]
    mls_filter = next((a.split('=', 1)[1] for a in args if a.startswith('--mls=')), None)

    rows = []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            mls = clean(row.get('listingId') or row.get('mlsId'))
            if mls_filter and mls != mls_filter:
                continue
            mapped = map_row(row)
            if mapped:
                rows.append(mapped)

    if not rows:
        print(f'No matching rows found{" for " + mls_filter if mls_filter else ""}.')
        sys.exit(1)

    print(f'Found {len(rows)} listing(s) to upsert (status=Active):')
    for r in rows:
        price = r['list_price']
        price_str = f'${price:,}' if price else 'N/A'
        photos_count = len(r.get('images') or [])
        print(f'  {r["mls_number"]} — {r["city"]} — {price_str} — {photos_count} photos')

    neon_upsert(rows)
    print('Done.')

if __name__ == '__main__':
    main()
