import re
from flask import Blueprint, request
from app.models import User, db, AgentArea
from flask_login import current_user, login_required

service_area_routes = Blueprint('service_areas', __name__)

_US_ZIP    = re.compile(r'^\d{5}$')
_CA_POSTAL = re.compile(r'^[A-Z]\d[A-Z]\s?\d[A-Z]\d$')


@service_area_routes.route("/<zip>", methods=["DELETE"])
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

    return {"user": User.query.get(current_user.id).to_dict()}


@service_area_routes.route("/", methods=["POST"])
@login_required
def add_service_area():
    if not current_user.agent:
        return {"errors": ["Unauthorized"]}, 401

    data = request.get_json(silent=True) or {}
    raw = (data.get("zip") or "").strip().upper()

    if not raw:
        return {"errors": ["Please enter a postal code"]}, 400

    if not _US_ZIP.match(raw) and not _CA_POSTAL.match(raw):
        return {"errors": ["Enter a valid US zip (12345) or Canadian postal code (A1A 1A1)"]}, 400

    # Normalise CA without space: M5V2T6 → M5V 2T6
    if len(raw) == 6 and raw.isalnum():
        raw = f"{raw[:3]} {raw[3:]}"

    if AgentArea.query.filter_by(agent_id=current_user.id, zip=raw).first():
        return {"errors": ["This postal code is already in your service areas"]}

    db.session.add(AgentArea(agent_id=current_user.id, zip=raw))
    db.session.commit()

    return {"user": User.query.get(current_user.id).to_dict()}
