import os
import uuid
import requests as _req
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

ppt_video_routes = Blueprint("ppt_video_routes", __name__)

MAX_IMAGE_BYTES  = 10 * 1024 * 1024   # 10 MB per image
MAX_INTRO_BYTES  = 50 * 1024 * 1024   # 50 MB
MAX_COVER_BG_BYTES = 10 * 1024 * 1024  # 10 MB


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
            json={"event_type": "generate-ppt-video", "client_payload": {"job_id": job_id}},
            timeout=10,
        )
        return r.status_code == 204
    except Exception:
        return False


@ppt_video_routes.route("/generate", methods=["POST"])
@login_required
def generate_ppt_video():
    try:
        if not current_user.agent:
            return jsonify({"error": "Agent account required"}), 403

        slide_images_bytes = []
        for i in range(1, 6):
            key = f"image_{i}"
            if key not in request.files:
                continue
            img_bytes = request.files[key].read(MAX_IMAGE_BYTES + 1)
            if len(img_bytes) > MAX_IMAGE_BYTES:
                return jsonify({"error": f"图片 {i} 过大（每张最大 10MB）"}), 400
            if img_bytes:
                slide_images_bytes.append(img_bytes)

        if not slide_images_bytes:
            return jsonify({"error": "请至少上传一张幻灯片图片"}), 400

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

        cover_bg_bytes = None
        if "cover_bg" in request.files:
            cover_bg_bytes = request.files["cover_bg"].read(MAX_COVER_BG_BYTES + 1)
            if len(cover_bg_bytes) > MAX_COVER_BG_BYTES:
                cover_bg_bytes = None

        use_actions = bool(os.environ.get("GH_PAT"))

        if use_actions:
            job_id = uuid.uuid4().hex
            from app.s3_helpers import _upload_bytes

            # Upload each slide image to R2 as temp file
            image_r2_keys = []
            for idx, img_bytes in enumerate(slide_images_bytes):
                r2_key = f"tmp-ppt-images/{job_id}/{idx:02d}.jpg"
                _upload_bytes(img_bytes, r2_key, "image/jpeg")
                image_r2_keys.append(r2_key)

            # Upload intro to R2 if present
            intro_r2_key = None
            if intro_bytes and len(intro_bytes) > 1000:
                ext = "mp4" if (intro_bytes[:4] in (b'\x00\x00\x00\x18', b'\x00\x00\x00\x20') or intro_bytes[4:8] == b'ftyp') else "webm"
                intro_r2_key = f"tmp-ppt-intros/{job_id}.{ext}"
                _upload_bytes(intro_bytes, intro_r2_key, f"video/{ext}")

            # Upload cover background to R2 if present
            cover_bg_r2_key = None
            if cover_bg_bytes and len(cover_bg_bytes) > 100:
                cover_bg_r2_key = f"tmp-cover-bg/{job_id}.jpg"
                _upload_bytes(cover_bg_bytes, cover_bg_r2_key, "image/jpeg")

            from app.services.ppt_db_jobs import ensure_jobs_table, create_job
            ensure_jobs_table()
            create_job(job_id, current_user.id, image_r2_keys, slide_texts, cover_lines, intro_r2_key, cover_bg_r2_key)

            dispatched = _trigger_github_actions(job_id)
            if not dispatched:
                return jsonify({"error": "Failed to trigger video generation. Check GH_PAT."}), 500

            return jsonify({"job_id": job_id, "status": "queued"})

        # Fallback: run in background thread on Render (local dev)
        from app.services.ppt_video_service import start_ppt_video_job
        job_id = start_ppt_video_job(
            agent_id=current_user.id,
            slide_images_bytes=slide_images_bytes,
            slide_texts=slide_texts,
            cover_lines=cover_lines,
            flask_app=current_app._get_current_object(),
            intro_bytes=intro_bytes,
            cover_bg_bytes=cover_bg_bytes,
        )
        return jsonify({"job_id": job_id, "status": "queued"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ppt_video_routes.route("/status/<job_id>", methods=["GET"])
@login_required
def ppt_video_status(job_id):
    if os.environ.get("GH_PAT"):
        from app.services.ppt_db_jobs import get_job
    else:
        from app.services.ppt_video_service import get_ppt_job as get_job
    job = get_job(job_id)
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
