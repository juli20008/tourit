import os
import uuid
import requests as _req
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

new_home_video_routes = Blueprint("new_home_video_routes", __name__)

MAX_MAIN_BYTES     = 200 * 1024 * 1024   # 200 MB
MAX_INTRO_BYTES    =  50 * 1024 * 1024   #  50 MB
MAX_COVER_BG_BYTES =  10 * 1024 * 1024   #  10 MB


def _trigger_github_actions(job_id):
    gh_pat  = os.environ.get("GH_PAT", "")
    gh_repo = os.environ.get("GH_REPO", "juli20008/tourit")
    if not gh_pat:
        return False
    try:
        r = _req.post(
            f"https://api.github.com/repos/{gh_repo}/dispatches",
            headers={
                "Authorization": f"Bearer {gh_pat}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"event_type": "generate-new-home-video", "client_payload": {"job_id": job_id}},
            timeout=10,
        )
        return r.status_code == 204
    except Exception:
        return False


@new_home_video_routes.route("/generate", methods=["POST"])
@login_required
def generate_new_home_video():
    try:
        if not current_user.agent:
            return jsonify({"error": "Agent account required"}), 403

        if "main_video" not in request.files:
            return jsonify({"error": "主视频文件必须上传"}), 400

        main_bytes = request.files["main_video"].read(MAX_MAIN_BYTES + 1)
        if len(main_bytes) > MAX_MAIN_BYTES:
            return jsonify({"error": "主视频过大（最大 200MB）"}), 400
        if len(main_bytes) < 1000:
            return jsonify({"error": "视频文件无效"}), 400

        narration = (request.form.get("narration") or "").strip()
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

        cover_bg_bytes = None
        if "cover_bg" in request.files:
            cover_bg_bytes = request.files["cover_bg"].read(MAX_COVER_BG_BYTES + 1)
            if len(cover_bg_bytes) > MAX_COVER_BG_BYTES:
                cover_bg_bytes = None

        use_actions = bool(os.environ.get("GH_PAT"))

        if use_actions:
            job_id = uuid.uuid4().hex
            from app.s3_helpers import _upload_bytes

            ext = "mp4" if (main_bytes[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20')
                            or main_bytes[4:8] == b'ftyp') else "mov"
            main_r2_key = f"tmp-new-home-videos/{job_id}.{ext}"
            _upload_bytes(main_bytes, main_r2_key, f"video/{ext}")

            intro_r2_key = None
            if intro_bytes and len(intro_bytes) > 1000:
                i_ext = "mp4" if (intro_bytes[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20')
                                   or intro_bytes[4:8] == b'ftyp') else "webm"
                intro_r2_key = f"tmp-new-home-intros/{job_id}.{i_ext}"
                _upload_bytes(intro_bytes, intro_r2_key, f"video/{i_ext}")

            cover_bg_r2_key = None
            if cover_bg_bytes and len(cover_bg_bytes) > 100:
                cover_bg_r2_key = f"tmp-cover-bg/{job_id}.jpg"
                _upload_bytes(cover_bg_bytes, cover_bg_r2_key, "image/jpeg")

            from app.services.new_home_db_jobs import ensure_jobs_table, create_job
            ensure_jobs_table()
            create_job(job_id, current_user.id, main_r2_key, narration, cover_lines, intro_r2_key, cover_bg_r2_key)

            dispatched = _trigger_github_actions(job_id)
            if not dispatched:
                return jsonify({"error": "Failed to trigger video generation. Check GH_PAT."}), 500

            return jsonify({"job_id": job_id, "status": "queued"})

        # Fallback: local/dev — run in background thread
        from app.services.new_home_video_service import start_new_home_job
        job_id = start_new_home_job(
            agent_id=current_user.id,
            main_video_bytes=main_bytes,
            narration=narration,
            cover_lines=cover_lines,
            flask_app=current_app._get_current_object(),
            intro_bytes=intro_bytes,
            cover_bg_bytes=cover_bg_bytes,
        )
        return jsonify({"job_id": job_id, "status": "queued"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@new_home_video_routes.route("/status/<job_id>", methods=["GET"])
@login_required
def new_home_video_status(job_id):
    if os.environ.get("GH_PAT"):
        from app.services.new_home_db_jobs import get_job
    else:
        from app.services.new_home_video_service import get_new_home_job as get_job
    job = get_job(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404
    return jsonify({k: v for k, v in job.items() if k != "ts"})


@new_home_video_routes.route("/", methods=["GET"])
@login_required
def list_new_home_videos():
    if not current_user.agent:
        return jsonify({"videos": []})
    try:
        from sqlalchemy import text
        from app.models import db
        rows = db.session.execute(
            text("""SELECT id, video_url, cover_url, cover1, cover2, cover3,
                           created_at, expires_at
                    FROM new_home_videos
                    WHERE agent_id = :aid AND expires_at > NOW()
                    ORDER BY created_at DESC LIMIT 20"""),
            {"aid": current_user.id},
        ).fetchall()
        return jsonify({"videos": [
            {"id": r[0], "video_url": r[1], "cover_url": r[2],
             "cover1": r[3], "cover2": r[4], "cover3": r[5],
             "created_at": str(r[6]), "expires_at": str(r[7])}
            for r in rows
        ]})
    except Exception as e:
        return jsonify({"videos": [], "error": str(e)})
