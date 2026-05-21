from flask import Blueprint, request
from flask_login import current_user, login_required
from app.models import db
from app.models.historical_live_tour import HistoricalLiveTour
from app.s3_helpers import allowed_video, upload_video_to_supabase, delete_from_supabase

historical_live_tour_routes = Blueprint("historical_live_tours", __name__)


@historical_live_tour_routes.route("/", methods=["GET"])
def get_historical_live_tours():
    mls_number = request.args.get("mls")
    if not mls_number:
        return {"errors": ["mls query param required"]}, 400

    tours = (
        HistoricalLiveTour.query
        .filter(HistoricalLiveTour.mls_number == mls_number)
        .order_by(HistoricalLiveTour.created_at.desc())
        .all()
    )
    return {"historical_tours": [t.to_dict() for t in tours]}


@historical_live_tour_routes.route("/", methods=["POST"])
@login_required
def create_or_replace_historical_live_tour():
    if not current_user.agent:
        return {"errors": ["Agents only"]}, 403

    mls_number = request.form.get("mls_number", "").strip()
    title = request.form.get("title", "").strip() or None
    video_file = request.files.get("video")

    if not mls_number:
        return {"errors": ["mls_number is required"]}, 400
    if not video_file:
        return {"errors": ["video file is required"]}, 400
    if not allowed_video(video_file.filename):
        return {"errors": ["Allowed formats: mp4, mov, webm, m4v"]}, 400

    existing = HistoricalLiveTour.query.filter_by(
        agent_id=current_user.id, mls_number=mls_number
    ).first()
    if existing:
        delete_from_supabase(existing.video_url)
        db.session.delete(existing)
        db.session.flush()

    result = upload_video_to_supabase(video_file)
    if "errors" in result:
        db.session.rollback()
        return {"errors": result["errors"]}, 500

    tour = HistoricalLiveTour(
        agent_id=current_user.id,
        mls_number=mls_number,
        video_url=result["url"],
        title=title,
    )
    db.session.add(tour)
    db.session.commit()
    return {"historical_tour": tour.to_dict()}, 201


@historical_live_tour_routes.route("/<int:tour_id>", methods=["DELETE"])
@login_required
def delete_historical_live_tour(tour_id):
    tour = HistoricalLiveTour.query.get(tour_id)
    if not tour:
        return {"errors": ["Not found"]}, 404
    if tour.agent_id != current_user.id:
        return {"errors": ["Unauthorized"]}, 403

    delete_from_supabase(tour.video_url)
    db.session.delete(tour)
    db.session.commit()
    return {"success": True}
