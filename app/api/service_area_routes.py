import re
from flask import Blueprint, request
from app.models import User, db, AgentArea
from flask_login import current_user, login_required

service_area_routes = Blueprint('service_areas', __name__)

# Canadian FSA (first 3 chars of postal code, e.g. "M5V")
_CA_FSA     = re.compile(r'^[A-Z]\d[A-Z]$')
# Full Canadian postal code with or without space
_CA_POSTAL  = re.compile(r'^[A-Z]\d[A-Z]\s?\d[A-Z]\d$')
_US_ZIP     = re.compile(r'^\d{5}$')

MAX_SERVICE_AREAS = 6


def _normalize(raw: str) -> str:
    """Return the canonical storage value for a service-area code.

    - Canadian (FSA or full postal) → first 3 chars uppercase, e.g. "M5V"
    - US zip → 5-digit string unchanged
    """
    raw = raw.strip().upper().replace(" ", "")
    if _US_ZIP.match(raw):
        return raw
    # FSA (3 chars) or full CA postal (6 chars stripped of space)
    return raw[:3]


@service_area_routes.route("/<path:zip>", methods=["DELETE"])
@login_required
def delete_service_area(zip):
    service = AgentArea.query.filter(
        AgentArea.zip == zip,
        AgentArea.agent_id == current_user.id
    ).first()

    if not service:
        return {"errors": ["Unauthorized"]}, 401

    db.session.delete(service)
    db.session.commit()

    return {"zip": zip}


@service_area_routes.route("/", methods=["POST"])
@login_required
def add_service_area():
    if not current_user.agent:
        return {"errors": ["Unauthorized"]}, 401

    data = request.get_json(silent=True) or {}
    raw = (data.get("zip") or "").strip().upper().replace(" ", "")

    if not raw:
        return {"errors": ["Please enter a postal code"]}, 400

    # Validate format: CA FSA, full CA postal, or US zip
    is_ca_fsa    = bool(_CA_FSA.match(raw))
    is_ca_postal = bool(_CA_POSTAL.match(raw))
    is_us_zip    = bool(_US_ZIP.match(raw))

    if not (is_ca_fsa or is_ca_postal or is_us_zip):
        return {"errors": ["Enter a valid Canadian FSA (M5V), postal code (M5V 2T6), or US zip (12345)"]}, 400

    normalized = _normalize(raw)

    # Enforce max 6 service areas
    current_count = AgentArea.query.filter_by(agent_id=current_user.id).count()
    if current_count >= MAX_SERVICE_AREAS:
        return {"errors": [f"You can add up to {MAX_SERVICE_AREAS} service areas"]}, 400

    if AgentArea.query.filter_by(agent_id=current_user.id, zip=normalized).first():
        return {"errors": ["This service area is already added"]}

    db.session.add(AgentArea(agent_id=current_user.id, zip=normalized))
    db.session.commit()

    return {"area": {"zip": normalized, "cities": []}}
