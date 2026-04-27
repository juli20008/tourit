import requests, json

headers = {"REPLIERS-API-KEY": "4yqEXgYNnrWBYBsQaUPTNgbkxlgKSq"}
BASE = "https://csr-api.repliers.io"

r = requests.get(f"{BASE}/listings",
                 headers=headers,
                 params={"resultsPerPage": 1},
                 timeout=15)

print("HTTP status:", r.status_code)
data = r.json()

if not isinstance(data, dict):
    print("Unexpected:", str(data)[:300])
    raise SystemExit

print(f"count={data.get('count')}  numPages={data.get('numPages')}  pageSize={data.get('pageSize')}")
listings = data.get("listings", [])
if not listings:
    print("No listings:", data)
    raise SystemExit

listing = listings[0]

print("\n--- address ---")
print(json.dumps(listing.get("address"), indent=2))

print("\n--- map ---")
print(json.dumps(listing.get("map"), indent=2))

print("\n--- details (ALL keys) ---")
print(json.dumps(listing.get("details"), indent=2))

print("\n--- agents ---")
print(json.dumps(listing.get("agents"), indent=2))

print("\n--- office ---")
print(json.dumps(listing.get("office"), indent=2))

print("\n--- top-level ---")
for k in ["mlsNumber","status","class","type","listPrice","listDate",
          "soldPrice","soldDate","lastStatus","standardStatus"]:
    print(f"  {k}: {listing.get(k)}")

print("\n--- images[:2] ---")
print(listing.get("images", [])[:2])
