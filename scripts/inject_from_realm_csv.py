"""
Inject listings from a Realm MLS CSV export into Supabase mls_listings.

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
from urllib import request, parse

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

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

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
    """Extract numeric price from strings like '$1,698,888' or 'PCFor Sale$1,698,888 ...'"""
    if not v:
        return None
    m = re.search(r'\$[\d,]+', str(v))
    if m:
        return to_int(m.group().replace('$', ''))
    return None

def parse_beds(v):
    """Parse '4+3' → (above=4, basement=3); '3' → (3, None)"""
    if not v:
        return None, None
    m = re.match(r'(\d+)\+(\d+)', str(v))
    if m:
        return int(m.group(1)), int(m.group(2))
    n = to_int(v)
    return n, None

def parse_address(street_address):
    """Split '8 Marchwood Cres' → (number, name, suffix)"""
    if not street_address:
        return None, None, None
    parts = street_address.strip().split(' ', 1)
    number = parts[0] if parts else None
    rest   = parts[1] if len(parts) > 1 else ''
    # last word is suffix
    rest_parts = rest.rsplit(' ', 1)
    name   = rest_parts[0] if rest_parts else rest
    suffix = rest_parts[1] if len(rest_parts) > 1 else None
    return clean(number), clean(name), clean(suffix)

def extract_postal(raw):
    """Find 'L4C 8M8' style postal code from messy string."""
    if not raw:
        return None
    m = re.search(r'[A-Z]\d[A-Z]\s?\d[A-Z]\d', str(raw))
    return m.group().strip() if m else None

def extract_city(postal_raw, address_raw):
    """Try to get 'Richmond Hill' from the address blobs."""
    # Realm seems to put city inside the postalCode column - look for known patterns
    for text in [postal_raw, address_raw]:
        if not text:
            continue
        # Look for Ontario city names preceded by comma-space
        m = re.search(r'(?:^|,\s*)([A-Z][a-zA-Z ]+?)\s+(?:Richmond Hill|Toronto|Markham|Vaughan|Aurora|Newmarket|King|Mississauga|Brampton|Oakville|Burlington|Hamilton)', str(text))
        if m:
            return m.group(1).strip()
        # Try direct match for known cities
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
    """Parse '05/20/2026' or '2026-05-20' to ISO date string."""
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

def map_row(row):
    mls = clean(row.get('listingId') or row.get('mlsId') or row.get('mlsNumber'))
    if not mls:
        return None

    street_raw = clean(row.get('streetAddress'))
    street_num, street_name, street_suffix = parse_address(street_raw)

    # city column in Realm CSV is unreliable — extract from other fields
    city_raw    = clean(row.get('city'))
    postal_raw  = clean(row.get('postalCode'))
    address_raw = clean(row.get('address'))
    city = extract_city(postal_raw, address_raw)
    if not city and city_raw and len(city_raw) < 50 and not re.match(r'^\d', city_raw):
        city = city_raw  # fallback if it looks like a real city name

    postal = extract_postal(postal_raw) or extract_postal(address_raw)

    beds_raw = clean(row.get('propertyInfo_bedrooms') or row.get('beds'))
    beds_above, basement_beds = parse_beds(beds_raw)

    tx = str(row.get('transactionType') or '').upper()
    transaction_type = 'For Lease' if 'LEASE' in tx or 'RENT' in tx else 'For Sale'

    status_raw = clean(row.get('listingInfo_status'))
    # PC = Price Changed (still active), A = Active, U = Unavailable, etc.
    standard_status = 'Active' if status_raw in ('A', 'PC', None) else 'Inactive'

    list_price = to_price(row.get('listingInfo_list') or row.get('price') or row.get('summaryPrice'))

    property_type = clean(row.get('propertyType') or row.get('propertySubtype'))
    category = derive_category(property_type, clean(row.get('unit_number')), None)

    photos = collect_photos(row)

    return {
        'mls_number':       mls,
        'external_id':      mls,
        'status':           'A' if standard_status == 'Active' else 'U',
        'standard_status':  standard_status,
        'transaction_type': transaction_type,
        'property_type':    property_type,
        'category':         category,
        'list_price':       list_price,
        'original_price':   to_price(row.get('listingInfo_original_list')),
        'list_date':        parse_date(row.get('listingInfo_contract_date')),
        'last_status':      status_raw,
        'street_number':    street_num,
        'street_name':      street_name,
        'street_suffix':    street_suffix,
        'unit_number':      None,
        'city':             city,
        'state':            'Ontario',
        'zip':              postal,
        'country':          'Canada',
        'neighborhood':     clean(row.get('propertyInfo_community')),
        'lat':              to_float(row.get('latitude')),
        'lng':              to_float(row.get('longitude')),
        'bed':              beds_above,
        'bath':             to_int(row.get('propertyInfo_washrooms') or row.get('baths')),
        'beds_above_grade': beds_above,
        'basement_beds':    basement_beds,
        'sqft':             clean(row.get('propertyInfo_square_feet') or row.get('squareFeet')),
        'description':      clean(row.get('clientRemarks')),
        'agent_name':       clean(row.get('listingAgentName')),
        'agent_email':      clean(row.get('listingAgentEmail')),
        'brokerage':        clean(row.get('listingBrokerageName')),
        'cooling':          clean(row.get('propertyInfo_a_c')),
        'heating':          clean(row.get('propertyInfo_heating_type')),
        'parking_total':    to_int(row.get('propertyInfo_total_parking_spaces')),
        'garage_yn':        bool(clean(row.get('propertyInfo_garage_type'))),
        'lot_size_area':    None,
        'lot_frontage':     clean(row.get('propertyInfo_lot_size')),
        'photos_count':     len(photos),
        'images':           photos,
        'updated_at':       datetime.now(timezone.utc).isoformat(),
        'last_seen_at':     datetime.now(timezone.utc).isoformat(),
    }

# ── Supabase upsert ───────────────────────────────────────────────────────────

def supabase_upsert(rows):
    url = f"{SUPABASE_URL}/rest/v1/mls_listings?on_conflict=mls_number"
    body = json.dumps(rows).encode('utf-8')
    req = request.Request(url, data=body, method='POST', headers={
        'apikey':         SUPABASE_KEY,
        'Authorization':  f'Bearer {SUPABASE_KEY}',
        'Content-Type':   'application/json',
        'Prefer':         'resolution=merge-duplicates,return=minimal',
    })
    try:
        with request.urlopen(req) as resp:
            return resp.status
    except Exception as e:
        body = e.read().decode('utf-8') if hasattr(e, 'read') else str(e)
        raise RuntimeError(f"HTTP {getattr(e, 'code', '?')}: {body}") from e

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    if not args:
        print('Usage: python scripts/inject_from_realm_csv.py <path_to_csv> [--mls=N13106358]')
        sys.exit(1)

    csv_path  = args[0]
    mls_filter = next((a.split('=',1)[1] for a in args if a.startswith('--mls=')), None)

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

    print(f'Found {len(rows)} listing(s) to upsert:')
    for r in rows:
        photos_count = len(r.get('images') or [])
        print(f'  {r["mls_number"]} — {r["city"]} — ${r["list_price"]:,} — {photos_count} photos')

    status = supabase_upsert(rows)
    print(f'\nSupabase response: HTTP {status}')
    print('Done.')

if __name__ == '__main__':
    main()
