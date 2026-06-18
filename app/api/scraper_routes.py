"""
/api/scrape/push  — extension pushes a Realm listing; upserts into mls_listings,
                    returns mls_number so the dashboard can open the video UI.
"""
import re
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
    price = _to_int(re.sub(r"[^0-9]", "", price_raw)) if price_raw else None
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

    try:
        row = MlsListing.query.filter_by(mls_number=mls_number).first()
        street = listing.get("street_name") or listing.get("street")
        if row:
            # Update existing
            row.images      = listing["images"]
            row.list_price  = listing.get("list_price")
            row.bed         = listing.get("bed")
            row.bath        = int(listing["bath"]) if listing.get("bath") else None
            row.sqft        = listing.get("sqft")
            row.city        = listing.get("city")
            row.street_name = street
            row.description = listing.get("description")
            row.style       = listing.get("style")
            row.status      = "A"
            row.standard_status = "Active"
        else:
            row = MlsListing(
                mls_number      = mls_number,
                status          = "A",
                standard_status = "Active",
                list_price      = listing.get("list_price"),
                bed             = listing.get("bed"),
                bath            = int(listing["bath"]) if listing.get("bath") else None,
                sqft            = listing.get("sqft"),
                city            = listing.get("city"),
                street_name     = street,
                description     = listing.get("description"),
                style           = listing.get("style"),
                images          = listing["images"],
                photos_count    = len(listing["images"]),
            )
            db.session.add(row)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "mls_number":    mls_number,
        "make_video_url": f"https://tourit.ca/make-video?mls={mls_number}",
    })
