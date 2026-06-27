"""
Add new columns to mls_listings in Neon to store all Realm CSV fields.
Safe to re-run — uses ADD COLUMN IF NOT EXISTS.

Run:
    python scripts/migrate_add_realm_columns.py
"""
import os, re, psycopg2

def load_env(path):
    if not os.path.exists(path): return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env(os.path.join(os.path.dirname(__file__), '..', '.env'))
load_env(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

NEON_URL = (
    os.environ.get('NEON_DATABASE_URL') or
    os.environ.get('DATABASE_URL') or
    "postgresql://neondb_owner:npg_b6lcC0BeaRxn@ep-lucky-wildflower-at0z2w6v.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"
)

NEW_COLUMNS = [
    # Agent / brokerage
    ("agent_phone",           "TEXT"),
    # Listing info
    ("dom",                   "INTEGER"),
    ("sale_type",             "TEXT"),
    ("taxes",                 "TEXT"),
    ("tax_year",              "TEXT"),
    ("expiry_date",           "TEXT"),
    ("last_update_date",      "TEXT"),
    ("commission",            "TEXT"),
    ("holdover",              "TEXT"),
    ("legal_description",     "TEXT"),
    ("pin",                   "TEXT"),
    ("possession_remarks",    "TEXT"),
    ("possession_type",       "TEXT"),
    ("occupancy",             "TEXT"),
    ("hst_applicable",        "TEXT"),
    # Property details
    ("approx_age",            "TEXT"),
    ("fronting_on",           "TEXT"),
    ("above_grade_sqft",      "TEXT"),
    ("cross_street",          "TEXT"),
    ("directions",            "TEXT"),
    ("pool",                  "TEXT"),
    ("heating_source",        "TEXT"),
    ("water",                 "TEXT"),
    ("sewers",                "TEXT"),
    ("basement",              "TEXT"),
    ("garage_type",           "TEXT"),
    ("garage_spaces",         "INTEGER"),
    ("drive_type",            "TEXT"),
    ("parking_drive_spaces",  "INTEGER"),
    ("rooms",                 "INTEGER"),
    ("kitchens",              "INTEGER"),
    ("exterior",              "TEXT"),
    ("roof",                  "TEXT"),
    ("foundation",            "TEXT"),
    ("municipality",          "TEXT"),
    ("area",                  "TEXT"),
    ("primary_photo_url",     "TEXT"),
    # Features / remarks
    ("features",              "TEXT"),
    ("interior_features",     "TEXT"),
    ("building_features",     "TEXT"),
    ("included_items",        "TEXT"),
    ("exclusions",            "TEXT"),
    ("rental_items",          "TEXT"),
    ("showing_requirements",  "TEXT"),
    ("special_designations",  "TEXT"),
    ("brokerage_remarks",     "TEXT"),
    ("room_info",             "TEXT"),
    ("washroom_info",         "TEXT"),
    # Scrape metadata
    ("scraped_at",            "TEXT"),
]

def main():
    print(f"Connecting to Neon...")
    conn = psycopg2.connect(NEON_URL)
    conn.autocommit = True
    cur = conn.cursor()

    added = 0
    for col, col_type in NEW_COLUMNS:
        cur.execute(f"ALTER TABLE mls_listings ADD COLUMN IF NOT EXISTS {col} {col_type}")
        print(f"  OK  {col} {col_type}")
        added += 1

    conn.close()
    print(f"\nDone. {added} column(s) ensured on mls_listings.")

if __name__ == "__main__":
    main()
