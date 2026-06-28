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

def _collect_washroom_info(row: dict) -> str | None:
    rooms = []
    for i in range(1, 10):
        pieces = _clean(row.get(f"washroomInfo_{i}_pieces"))
        level  = _clean(row.get(f"washroomInfo_{i}_level"))
        count  = _clean(row.get(f"washroomInfo_{i}_of_washrooms"))
        if not any([pieces, level, count]):
            break
        rooms.append({"count": count, "pieces": pieces, "level": level})
    return json.dumps(rooms, ensure_ascii=False) if rooms else None

def _normalize_row(row: dict) -> dict:
    beds_raw  = _clean(row.get("beds") or row.get("headlineBeds") or "")
    baths_raw = _clean(row.get("baths") or row.get("headlineBaths") or "")
    beds  = _to_int(re.sub(r"\+.*", "", beds_raw)  if beds_raw  else "")
    baths = _to_float(re.sub(r"\+.*", "", baths_raw) if baths_raw else "")
    sqft  = str(row.get("squareFeet") or row.get("headlineSqFt") or "").replace(",", "").strip() or None
    price_raw = row.get("price") or row.get("summaryPrice") or ""
    price_match = re.search(r"\$?\s*([\d,]+)", price_raw) if price_raw else None
    price_int = _to_int(price_match.group(1).replace(",", "")) if price_match else None
    price = price_int if (price_int and 50000 < price_int < 100_000_000) else None
    city   = _clean(row.get("city") or "")
    street = _clean(row.get("streetAddress") or row.get("address") or "")
    desc   = _clean(row.get("clientRemarks") or "")
    style  = _clean(row.get("propertyType") or row.get("propertySubtype") or "")
    mls    = _clean(row.get("listingId") or row.get("mlsId") or row.get("mlsNumber") or "")
    photos = _collect_photos(row)
    label  = " ".join(filter(None, [street, city])) or mls or "Listing"

    return {
        # Core
        "mls_number":          mls or label,
        "label":               label,
        "list_price":          price,
        "style":               style,
        "description":         (desc or "")[:5000],
        "brokerage_remarks":   _clean(row.get("brokerageRemarks")),
        # Address
        "street_name":         street,
        "city":                city,
        "province":            _clean(row.get("province")),
        "postal_code":         _clean(row.get("postalCode")),
        "neighborhood":        _clean(row.get("propertyInfo_community")),
        "municipality":        _clean(row.get("propertyInfo_municipality")),
        "area":                _clean(row.get("propertyInfo_area")),
        "cross_street":        _clean(row.get("propertyInfo_dir_cross_st")),
        "directions":          _clean(row.get("propertyInfo_directions")),
        # Beds / baths / size
        "bed":                 beds,
        "bath":                baths,
        "sqft":                str(sqft) if sqft else None,
        "above_grade_sqft":    _clean(row.get("propertyInfo_above_grade_finished_sqft")),
        "beds_above_grade":    _to_int(re.sub(r"\+.*", "", _clean(row.get("propertyInfo_bedrooms")) or "") or None),
        "basement_beds":       None,
        "rooms":               _to_int(row.get("propertyInfo_rooms")),
        "kitchens":            _to_int(row.get("propertyInfo_kitchens")),
        "dom":                 _to_int(row.get("dom")),
        # Agent
        "agent_name":          _clean(row.get("listingAgentName")),
        "agent_email":         _clean(row.get("listingAgentEmail")),
        "agent_phone":         _clean(row.get("listingAgentPhone")),
        "brokerage":           _clean(row.get("listingBrokerageName")),
        # Systems
        "cooling":             _clean(row.get("propertyInfo_a_c")),
        "heating":             _clean(row.get("propertyInfo_heating_type")),
        "heating_source":      _clean(row.get("propertyInfo_heating_source")),
        "water":               _clean(row.get("propertyInfo_water")),
        "sewers":              _clean(row.get("propertyInfo_sewers")),
        "pool":                _clean(row.get("propertyInfo_pool")),
        "basement":            _clean(row.get("propertyInfo_basement")),
        "exterior":            _clean(row.get("propertyInfo_exterior")),
        "roof":                _clean(row.get("propertyInfo_roof")),
        "foundation":          _clean(row.get("propertyInfo_foundation")),
        # Parking / lot
        "parking_total":       _to_int(row.get("propertyInfo_total_parking_spaces")),
        "garage_yn":           bool(_clean(row.get("propertyInfo_garage_type"))),
        "garage_type":         _clean(row.get("propertyInfo_garage_type")),
        "garage_spaces":       _to_int(row.get("propertyInfo_garage_parking_spaces")),
        "drive_type":          _clean(row.get("propertyInfo_drive")),
        "parking_drive_spaces": _to_int(row.get("propertyInfo_parking_drive_spaces")),
        "lot_frontage":        _clean(row.get("propertyInfo_lot_size")),
        "fronting_on":         _clean(row.get("propertyInfo_fronting_on")),
        "approx_age":          _clean(row.get("propertyInfo_approx_age")),
        # Features / notes
        "features":            _clean(row.get("features")),
        "interior_features":   _clean(row.get("interiorFeatures")),
        "building_features":   _clean(row.get("buildingFeatures")),
        "included_items":      _clean(row.get("included") or row.get("includedItems")),
        "exclusions":          _clean(row.get("exclusions")),
        "rental_items":        _clean(row.get("rentalItems")),
        "showing_requirements": _clean(row.get("showingRequirements")),
        "special_designations": _clean(row.get("specialDesignations")),
        "room_info":           _clean(row.get("roomInfo")),
        "washroom_info":       _collect_washroom_info(row),
        # Listing contract
        "taxes":               _clean(row.get("listingInfo_taxes")),
        "tax_year":            _clean(row.get("listingInfo_tax_year")),
        "pin":                 _clean(row.get("listingInfo_pin")),
        "legal_description":   _clean(row.get("listingInfo_legal_description")),
        "possession_remarks":  _clean(row.get("listingInfo_possession_remarks")),
        "possession_type":     _clean(row.get("listingInfo_possession_type")),
        "occupancy":           _clean(row.get("listingInfo_occupancy")),
        "commission":          _clean(row.get("listingInfo_commission_co_op_brokerage")),
        "holdover":            _clean(row.get("listingInfo_holdover")),
        "expiry_date":         _clean(row.get("listingInfo_expiry_date")),
        "last_update_date":    _clean(row.get("listingInfo_last_update")),
        "hst_applicable":      _clean(row.get("propertyInfo_hst_applicable_to_sale_price")),
        "sale_type":           _clean(row.get("saleType")),
        # Photos
        "images":              photos,
        "primary_photo_url":   _clean(row.get("primaryPhotoUrl")),
        # Metadata
        "source_url":          _clean(row.get("scrapedUrl") or ""),
        "scraped_at":          _clean(row.get("scrapedAt")),
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
    print(f"[GEOCODE] street={street!r} city={city!r}")
    try:
        if street and city:
            q = f"{street}, {city}, Ontario, Canada"
            print(f"[GEOCODE] querying: {q}")
            lat, lng = _nominatim(q)
            print(f"[GEOCODE] result: {lat}, {lng}")
            if lat is not None:
                return lat, lng
        if city:
            q = f"{city}, Ontario, Canada"
            print(f"[GEOCODE] fallback: {q}")
            lat, lng = _nominatim(q)
            print(f"[GEOCODE] fallback result: {lat}, {lng}")
            return lat, lng
    except Exception as e:
        print(f"[GEOCODE] error: {e}")
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

    # Lat/lng sent directly from the extension (parsed from Realm's page)
    pushed_lat = listing.get("lat")
    pushed_lng = listing.get("lng")
    try:
        pushed_lat = float(pushed_lat) if pushed_lat is not None else None
        pushed_lng = float(pushed_lng) if pushed_lng is not None else None
    except (TypeError, ValueError):
        pushed_lat = pushed_lng = None

    def _apply_fields(row, listing, city, street, pushed_lat, pushed_lng):
        """Write all listing fields onto a MlsListing ORM row (create or update)."""
        row.images               = listing["images"]
        row.photos_count         = len(listing["images"])
        row.primary_photo_url    = listing.get("primary_photo_url") or (listing["images"][0] if listing.get("images") else None)
        row.list_price           = listing.get("list_price")
        row.bed                  = listing.get("bed")
        row.bath                 = int(listing["bath"]) if listing.get("bath") else None
        row.sqft                 = listing.get("sqft")
        row.above_grade_sqft     = listing.get("above_grade_sqft")
        row.beds_above_grade     = listing.get("beds_above_grade")
        row.basement_beds        = listing.get("basement_beds")
        row.rooms                = listing.get("rooms")
        row.kitchens             = listing.get("kitchens")
        row.dom                  = listing.get("dom")
        row.city                 = city
        row.state                = listing.get("province")
        row.zip                  = listing.get("postal_code")
        row.street_name          = street
        row.neighborhood         = listing.get("neighborhood")
        row.municipality         = listing.get("municipality")
        row.area                 = listing.get("area")
        row.cross_street         = listing.get("cross_street")
        row.directions           = listing.get("directions")
        row.description          = listing.get("description")
        row.brokerage_remarks    = listing.get("brokerage_remarks")
        row.style                = listing.get("style")
        row.status               = "A"
        row.standard_status      = "Active"
        row.agent_name           = listing.get("agent_name")
        row.agent_email          = listing.get("agent_email")
        row.agent_phone          = listing.get("agent_phone")
        row.brokerage            = listing.get("brokerage")
        row.cooling              = listing.get("cooling")
        row.heating              = listing.get("heating")
        row.heating_source       = listing.get("heating_source")
        row.water                = listing.get("water")
        row.sewers               = listing.get("sewers")
        row.pool                 = listing.get("pool")
        row.basement             = listing.get("basement")
        row.exterior             = listing.get("exterior")
        row.roof                 = listing.get("roof")
        row.foundation           = listing.get("foundation")
        row.parking_total        = listing.get("parking_total")
        row.garage_yn            = listing.get("garage_yn")
        row.garage_type          = listing.get("garage_type")
        row.garage_spaces        = listing.get("garage_spaces")
        row.drive_type           = listing.get("drive_type")
        row.parking_drive_spaces = listing.get("parking_drive_spaces")
        row.lot_frontage         = listing.get("lot_frontage")
        row.fronting_on          = listing.get("fronting_on")
        row.approx_age           = listing.get("approx_age")
        row.features             = listing.get("features")
        row.interior_features    = listing.get("interior_features")
        row.building_features    = listing.get("building_features")
        row.included_items       = listing.get("included_items")
        row.exclusions           = listing.get("exclusions")
        row.rental_items         = listing.get("rental_items")
        row.showing_requirements = listing.get("showing_requirements")
        row.special_designations = listing.get("special_designations")
        row.room_info            = listing.get("room_info")
        row.washroom_info        = listing.get("washroom_info")
        row.taxes                = listing.get("taxes")
        row.tax_year             = listing.get("tax_year")
        row.pin                  = listing.get("pin")
        row.legal_description    = listing.get("legal_description")
        row.possession_remarks   = listing.get("possession_remarks")
        row.possession_type      = listing.get("possession_type")
        row.occupancy            = listing.get("occupancy")
        row.commission           = listing.get("commission")
        row.holdover             = listing.get("holdover")
        row.expiry_date          = listing.get("expiry_date")
        row.last_update_date     = listing.get("last_update_date")
        row.hst_applicable       = listing.get("hst_applicable")
        row.sale_type            = listing.get("sale_type")
        row.scraped_at           = listing.get("scraped_at")
        if pushed_lat is not None:
            row.lat = pushed_lat
            row.lng = pushed_lng

    try:
        row = MlsListing.query.filter_by(mls_number=mls_number).first()
        if row:
            _apply_fields(row, listing, city, street, pushed_lat, pushed_lng)
            needs_geocode = (row.lat is None or row.lng is None)
        else:
            row = MlsListing(
                mls_number = mls_number,
                lat        = pushed_lat,
                lng        = pushed_lng,
            )
            _apply_fields(row, listing, city, street, pushed_lat, pushed_lng)
            db.session.add(row)
            needs_geocode = (pushed_lat is None)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

    # Geocode only if extension didn't send coordinates
    if needs_geocode:
        lat, lng = _geocode(street, city)
        if lat is not None:
            try:
                row.lat = lat
                row.lng = lng
                db.session.commit()
            except Exception:
                db.session.rollback()

    # Bust the map cache so the new listing appears immediately
    try:
        from app.api.mls_listing_routes import _cache, _pin_index_cache
        _cache.clear()
        _pin_index_cache['json'] = None
        _pin_index_cache['ts'] = 0.0
    except Exception:
        pass

    return jsonify({
        "mls_number":    mls_number,
        "listing_url":   f"https://tourit.ca/listing/{mls_number}",
        "make_video_url": f"https://tourit.ca/make-video?mls={mls_number}",
        "lat":           float(row.lat) if row.lat is not None else None,
        "lng":           float(row.lng) if row.lng is not None else None,
    })


@scraper_routes.route("/recent", methods=["GET"])
def recent_listings():
    """Return recently extension-pushed listings (identified by no external_id)."""
    rows = (
        MlsListing.query
        .filter(
            MlsListing.external_id.is_(None),
            MlsListing.images.isnot(None),
        )
        .order_by(MlsListing.created_at.desc())
        .limit(100)
        .all()
    )
    result = []
    for r in rows:
        imgs = r.effective_images
        result.append({
            "mls_number":       r.mls_number,
            "street":           r.street or "",
            "city":             r.city or "",
            "price":            r.list_price or 0,
            "bed":              r.bed or 0,
            "bath":             float(r.bath) if r.bath else 0,
            "sqft":             str(r.sqft) if r.sqft else None,
            "front_img":        imgs[0] if imgs else None,
            "images":           imgs,
            "description":      r.description or "",
            "style":            r.style or "",
            "beds_above_grade": r.beds_above_grade,
            "basement_beds":    r.basement_beds,
        })
    return jsonify({"listings": result})
