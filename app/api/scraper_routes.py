"""
/api/scrape/push    — extension pushes a Realm listing; returns a short-lived token
/api/scrape/pending — dashboard polls for the listing by token
"""
import re
import time
import uuid
from flask import Blueprint, jsonify, request

scraper_routes = Blueprint("scraper", __name__)

# In-memory store: token → {listing, ts}
_PENDING: dict = {}
_TTL = 3600  # 1 hour


def _clean(v):
    return v.strip() if v and v.strip() else None

def _to_int(v):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except Exception:
        return None

def _to_float(v):
    try:
        return float(str(v).replace(",", "").strip())
    except Exception:
        return None

def _collect_photos(row: dict) -> list:
    urls = []
    for i in range(1, 100):
        u = row.get(f"photos_{i}_url", "")
        if u and u.startswith("http"):
            urls.append(u)
        elif not u:
            break
    return urls

def _normalize_row(row: dict) -> dict:
    beds_raw  = _clean(row.get("beds") or row.get("headlineBeds") or "")
    baths_raw = _clean(row.get("baths") or row.get("headlineBaths") or "")
    beds  = _to_int(re.sub(r"\+.*", "", beds_raw)  if beds_raw  else "")
    baths = _to_float(re.sub(r"\+.*", "", baths_raw) if baths_raw else "")
    sqft  = _to_int(row.get("squareFeet") or row.get("headlineSqFt") or "")
    price_raw = row.get("price") or row.get("summaryPrice") or ""
    price = _to_int(re.sub(r"[^0-9]", "", price_raw)) if price_raw else None
    city  = _clean(row.get("city") or "")
    street = _clean(row.get("streetAddress") or row.get("address") or "")
    desc  = _clean(row.get("clientRemarks") or row.get("brokerageRemarks") or "")
    style = _clean(row.get("propertyType") or row.get("propertySubtype") or "")
    mls   = _clean(row.get("listingId") or row.get("mlsId") or row.get("mlsNumber") or "")
    photos = _collect_photos(row)
    label = " ".join(filter(None, [street, city])) or mls or "Listing"

    return {
        "mls_number": mls or label,
        "label":      label,
        "bed":        beds,
        "bath":       baths,
        "sqft":       sqft,
        "list_price": price,
        "city":       city,
        "street":     street,
        "description": (desc or "")[:1000],
        "style":      style,
        "images":     photos,
        "source_url": _clean(row.get("scrapedUrl") or ""),
    }


@scraper_routes.route("/push", methods=["POST"])
def push_listing():
    """Extension pushes a scraped Realm listing; returns a short-lived token."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    # If data is already normalized (has 'images' key), use as-is
    # If it looks like a raw row dict, normalize it
    if "images" in data:
        listing = data
    else:
        listing = _normalize_row(data)

    if not listing.get("images"):
        return jsonify({"error": "Listing has no photos — cannot generate video"}), 422

    token = str(uuid.uuid4())
    _PENDING[token] = {"listing": listing, "ts": time.time()}

    # Evict expired entries
    expired = [k for k, v in _PENDING.items() if time.time() - v["ts"] > _TTL]
    for k in expired:
        _PENDING.pop(k, None)

    return jsonify({
        "token": token,
        "dashboard_url": f"https://tourit.ca/dashboard?token={token}",
    })


@scraper_routes.route("/pending", methods=["GET"])
def get_pending():
    """Dashboard polls for listing data by token."""
    token = request.args.get("token", "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    entry = _PENDING.get(token)
    if not entry:
        return jsonify({"error": "not found"}), 404

    if time.time() - entry["ts"] > _TTL:
        _PENDING.pop(token, None)
        return jsonify({"error": "expired"}), 410

    return jsonify({"listing": entry["listing"]})
