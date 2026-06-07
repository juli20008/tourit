"""
One-time fix: deactivate-stale wrongly marked all 162k listings Inactive,
filling Neon's 512MB disk. Steps:
  1. VACUUM mls_listings — reclaims dead tuple space from the deactivation
  2. UPDATE in batches of 10k — reuses freed pages, no file extension needed
"""
import os, psycopg2, time

url = os.environ.get("DATABASE_URL")
if not url:
    raise RuntimeError("DATABASE_URL env var is required")

# Step 1: VACUUM (must run outside a transaction)
print("Step 1: VACUUM mls_listings to reclaim dead tuple space...")
conn = psycopg2.connect(url)
conn.autocommit = True
conn.cursor().execute("VACUUM mls_listings")
conn.close()
print("VACUUM done.")

# Step 2: Restore in batches of 10k
print("Step 2: Restoring listings to Active in batches...")
conn = psycopg2.connect(url)
conn.autocommit = False
cur = conn.cursor()

total = 0
BATCH = 10000
while True:
    cur.execute("""
        UPDATE mls_listings
        SET standard_status = 'Active', status = 'A'
        WHERE mls_number IN (
            SELECT mls_number FROM mls_listings
            WHERE standard_status = 'Inactive'
            LIMIT %s
        )
    """, (BATCH,))
    n = cur.rowcount
    conn.commit()
    total += n
    print(f"  restored {total} so far...")
    if n == 0:
        break
    time.sleep(0.1)

conn.close()
print(f"Done. Total restored: {total}")
