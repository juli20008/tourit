from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required
from app.models import db
from app.models.live_tour import LiveTour

live_tour_routes = Blueprint("live_tours", __name__)


@live_tour_routes.route("/", methods=["GET"])
def get_live_tours():
    """Public: list upcoming live tours for a listing."""
    mls_number = request.args.get("mls")
    if not mls_number:
        return {"errors": ["mls query param required"]}, 400

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    tours = (
        LiveTour.query
        .filter(LiveTour.mls_number == mls_number, LiveTour.scheduled_at >= now)
        .order_by(LiveTour.scheduled_at)
        .all()
    )
    return {"live_tours": [t.to_dict() for t in tours]}


@live_tour_routes.route("/", methods=["POST"])
@login_required
def create_live_tour():
    """Agent only: schedule a live tour for a listing."""
    if not current_user.agent:
        return {"errors": ["Agents only"]}, 403

    payload = request.get_json(silent=True) or {}
    mls_number   = payload.get("mls_number", "").strip()
    scheduled_at = payload.get("scheduled_at", "").strip()   # ISO 8601 UTC
    stream_url   = payload.get("stream_url", "").strip()
    title        = payload.get("title", "").strip() or None

    if not mls_number or not scheduled_at or not stream_url:
        return {"errors": ["mls_number, scheduled_at, and stream_url are required"]}, 400

    try:
        dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return {"errors": ["scheduled_at must be ISO 8601 (e.g. 2026-05-25T14:00:00Z)"]}, 400

    if dt < datetime.utcnow():
        return {"errors": ["scheduled_at must be in the future"]}, 400

    tour = LiveTour(
        agent_id=current_user.id,
        mls_number=mls_number,
        scheduled_at=dt,
        stream_url=stream_url,
        title=title,
    )
    db.session.add(tour)
    db.session.commit()
    return {"live_tour": tour.to_dict()}, 201


@live_tour_routes.route("/<int:tour_id>", methods=["DELETE"])
@login_required
def delete_live_tour(tour_id):
    """Agent only: delete own live tour."""
    tour = LiveTour.query.get(tour_id)
    if not tour:
        return {"errors": ["Not found"]}, 404
    if tour.agent_id != current_user.id:
        return {"errors": ["Unauthorized"]}, 403

    db.session.delete(tour)
    db.session.commit()
    return {"success": True}
