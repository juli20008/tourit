"""
One-time fix: deactivate-stale ran with partial DDF data and wrongly marked
all 162k listings as Inactive. This resets them all back to Active.
"""
import os, psycopg2

url = os.environ.get("DATABASE_URL", "postgresql://neondb_owner:npg_jcMeU1KQ5FGo@ep-floral-hat-aqals0gl.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require")
conn = psycopg2.connect(url)
conn.autocommit = False
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM mls_listings WHERE standard_status = 'Inactive'")
n = cur.fetchone()[0]
print(f"Listings currently Inactive: {n}")

cur.execute("""
    UPDATE mls_listings
    SET standard_status = 'Active',
        status = 'A'
    WHERE standard_status = 'Inactive'
""")
print(f"Restored {cur.rowcount} listings to Active")
conn.commit()
conn.close()
print("Done.")
