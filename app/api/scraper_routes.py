"""
/api/scrape/push  — extension pushes a Realm listing; upserts into mls_listings,
                    returns mls_number so the dashboard can open the video UI.
"""
import re
import json
import urllib.request
import urllib.parse
from flask import Blueprint, jsonify, request
from app.models import db
from app.models.mls_listing import MlsListing

scraper_routes = Blueprint("scraper", __name__)


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
    for i in range(1, 200):
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
    price_match = re.search(r"\$?\s*([\d,]+)", price_raw) if price_raw else None
    price_int = _to_int(price_match.group(1).replace(",", "")) if price_match else None
    price = price_int if (price_int and 50000 < price_int < 100_000_000) else None
    city  = _clean(row.get("city") or "")
    street = _clean(row.get("streetAddress") or row.get("address") or "")
    desc  = _clean(row.get("clientRemarks") or row.get("brokerageRemarks") or "")
    style = _clean(row.get("propertyType") or row.get("propertySubtype") or "")
    mls   = _clean(row.get("listingId") or row.get("mlsId") or row.get("mlsNumber") or "")
    photos = _collect_photos(row)
    label = " ".join(filter(None, [street, city])) or mls or "Listing"

    return {
        "mls_number":  mls or label,
        "label":       label,
        "bed":         beds,
        "bath":        baths,
        "sqft":        str(sqft) if sqft else None,
        "list_price":  price,
        "city":        city,
        "street_name": street,
        "description": (desc or "")[:5000],
        "style":       style,
        "images":      photos,
        "source_url":  _clean(row.get("scrapedUrl") or ""),
    }


def _nominatim(q: str) -> tuple[float | None, float | None]:
    params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 1})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "tourit.ca/1.0"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        results = json.loads(resp.read())
    if results:
        return float(results[0]["lat"]), float(results[0]["lon"])
    return None, None


def _geocode(street: str | None, city: str | None) -> tuple[float | None, float | None]:
    """Geocode via Nominatim; falls back to city-only if full address fails."""
    try:
        if street and city:
            lat, lng = _nominatim(f"{street}, {city}, Ontario, Canada")
            if lat is not None:
                return lat, lng
        # Fallback: city only
        if city:
            return _nominatim(f"{city}, Ontario, Canada")
    except Exception:
        pass
    return None, None


@scraper_routes.route("/push", methods=["POST"])
def push_listing():
    """Extension pushes a scraped Realm listing; upserts into mls_listings."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No JSON body"}), 400

    # Accept either already-normalized (has 'images') or raw row
    if "images" in data:
        listing = data
    else:
        listing = _normalize_row(data)

    if not listing.get("images"):
        return jsonify({"error": "Listing has no photos"}), 422

    mls_number = listing["mls_number"]
    street = listing.get("street_name") or listing.get("street")
    city   = listing.get("city")

    try:
        row = MlsListing.query.filter_by(mls_number=mls_number).first()
        if row:
            row.images           = listing["images"]
            row.list_price       = listing.get("list_price")
            row.bed              = listing.get("bed")
            row.bath             = int(listing["bath"]) if listing.get("bath") else None
            row.sqft             = listing.get("sqft")
            row.city             = city
            row.state            = listing.get("province")
            row.zip              = listing.get("postal_code")
            row.street_name      = street
            row.neighborhood     = listing.get("neighborhood")
            row.beds_above_grade = listing.get("beds_above_grade")
            row.basement_beds    = listing.get("basement_beds")
            row.description      = listing.get("description")
            row.style            = listing.get("style")
            row.status           = "A"
            row.standard_status  = "Active"
            needs_geocode = (row.lat is None or row.lng is None)
        else:
            row = MlsListing(
                mls_number       = mls_number,
                status           = "A",
                standard_status  = "Active",
                list_price       = listing.get("list_price"),
                bed              = listing.get("bed"),
                bath             = int(listing["bath"]) if listing.get("bath") else None,
                sqft             = listing.get("sqft"),
                city             = city,
                state            = listing.get("province"),
                zip              = listing.get("postal_code"),
                street_name      = street,
                neighborhood     = listing.get("neighborhood"),
                beds_above_grade = listing.get("beds_above_grade"),
                basement_beds    = listing.get("basement_beds"),
                description      = listing.get("description"),
                style            = listing.get("style"),
                images           = listing["images"],
                photos_count     = len(listing["images"]),
            )
            db.session.add(row)
            needs_geocode = True
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    # Geocode after commit so a geocoding failure never blocks the response
    if needs_geocode:
        lat, lng = _geocode(street, city)
        if lat is not None:
            try:
                row.lat = lat
                row.lng = lng
                db.session.commit()
            except Exception:
                db.session.rollback()

    return jsonify({
        "mls_number":    mls_number,
        "listing_url":   f"https://tourit.ca/listing/{mls_number}",
        "make_video_url": f"https://tourit.ca/make-video?mls={mls_number}",
        "lat":           float(row.lat) if row.lat is not None else None,
        "lng":           float(row.lng) if row.lng is not None else None,
    })
