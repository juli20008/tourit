from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

ppt_video_routes = Blueprint("ppt_video_routes", __name__)

MAX_PPTX_BYTES = 50 * 1024 * 1024   # 50 MB
MAX_INTRO_BYTES = 50 * 1024 * 1024  # 50 MB


@ppt_video_routes.route("/generate", methods=["POST"])
@login_required
def generate_ppt_video():
    if not current_user.agent:
        return jsonify({"error": "Agent account required"}), 403
    if "pptx" not in request.files:
        return jsonify({"error": "pptx file required"}), 400

    pptx_bytes = request.files["pptx"].read(MAX_PPTX_BYTES + 1)
    if len(pptx_bytes) > MAX_PPTX_BYTES:
        return jsonify({"error": "PPT 文件过大（最大 50MB）"}), 400

    slide_texts = [
        (request.form.get(f"slide_{i}") or "").strip()
        for i in range(1, 6)
    ]
    cover_lines = [
        (request.form.get("cover1") or "").strip()[:40],
        (request.form.get("cover2") or "").strip()[:40],
        (request.form.get("cover3") or "").strip()[:40],
    ]

    intro_bytes = None
    if "intro_video" in request.files:
        intro_bytes = request.files["intro_video"].read(MAX_INTRO_BYTES + 1)
        if len(intro_bytes) > MAX_INTRO_BYTES:
            intro_bytes = None

    from app.services.ppt_video_service import start_ppt_video_job
    job_id = start_ppt_video_job(
        agent_id=current_user.id,
        pptx_bytes=pptx_bytes,
        slide_texts=slide_texts,
        cover_lines=cover_lines,
        flask_app=current_app._get_current_object(),
        intro_bytes=intro_bytes,
    )
    return jsonify({"job_id": job_id, "status": "queued"})


@ppt_video_routes.route("/status/<job_id>", methods=["GET"])
@login_required
def ppt_video_status(job_id):
    from app.services.ppt_video_service import get_ppt_job
    job = get_ppt_job(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404
    return jsonify({k: v for k, v in job.items() if k != "ts"})


@ppt_video_routes.route("/", methods=["GET"])
@login_required
def list_ppt_videos():
    if not current_user.agent:
        return jsonify({"videos": []})
    try:
        from sqlalchemy import text
        from app.models import db
        rows = db.session.execute(
            text("""SELECT id, video_url, cover_url, cover1, cover2, cover3,
                           slide_count, created_at, expires_at
                    FROM ppt_videos
                    WHERE agent_id = :aid AND expires_at > NOW()
                    ORDER BY created_at DESC LIMIT 20"""),
            {"aid": current_user.id},
        ).fetchall()
        return jsonify({"videos": [
            {"id": r[0], "video_url": r[1], "cover_url": r[2],
             "cover1": r[3], "cover2": r[4], "cover3": r[5],
             "slide_count": r[6], "created_at": str(r[7]), "expires_at": str(r[8])}
            for r in rows
        ]})
    except Exception as e:
        return jsonify({"videos": [], "error": str(e)})
