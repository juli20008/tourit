"""
新房视频 — agent uploads a main property video + optional intro.
Pipeline: main video → transcode to 720×960 → replace audio with TTS narration
        → prepend intro clip (if any) → composite cover → upload R2.
"""
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

OUTPUT_W = 720
OUTPUT_H = 960
FPS = 20
CRF = 28
PRESET = "ultrafast"

_JOBS: dict = {}
_JOB_TTL = 600
_GENERATION_LOCK = threading.Semaphore(1)
_JOB_CALLBACKS: dict = {}


def register_job_callback(job_id, callback):
    _JOB_CALLBACKS[job_id] = callback


def unregister_job_callback(job_id):
    _JOB_CALLBACKS.pop(job_id, None)


def _job_set(job_id, data):
    entry = _JOBS.setdefault(job_id, {})
    entry.update(data)
    entry["ts"] = time.time()
    cb = _JOB_CALLBACKS.get(job_id)
    if cb:
        try:
            cb(job_id, data)
        except Exception:
            pass


def get_new_home_job(job_id):
    return _JOBS.get(job_id)


def _find_ffmpeg():
    from app.services.xhs_video_service import _find_ffmpeg as _xff
    return _xff()


def _run_new_home_pipeline(job_id, agent_id, main_video_bytes, narration, cover_lines,
                            flask_app, intro_bytes=None, cover_bg_bytes=None):
    if not _GENERATION_LOCK.acquire(blocking=False):
        with flask_app.app_context():
            _job_set(job_id, {"status": "error", "message": "另一个视频正在生成中，请稍后再试"})
        return

    with flask_app.app_context():
        tmpdir = None
        try:
            _job_set(job_id, {"status": "processing", "step": "Loading..."})

            from app.models.user import User
            agent = User.query.get(agent_id)
            if not agent or not agent.elevenlabs_voice_id:
                _job_set(job_id, {"status": "error", "message": "请先在「My Profile」录制声音样本"})
                return

            voice_id = agent.elevenlabs_voice_id
            ffmpeg, ffprobe = _find_ffmpeg()
            tmpdir = tempfile.mkdtemp(prefix="newhome_")
            clips_dir = os.path.join(tmpdir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            # ── Step 1: Write + transcode main video ─────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Transcoding video..."})

            raw_main = os.path.join(tmpdir, "main_raw.mp4")
            with open(raw_main, "wb") as fh:
                fh.write(main_video_bytes)
            main_video_bytes = None

            from app.services.xhs_video_service import (
                _transcode_intro, _generate_intro_overlay, _composite_overlay,
                _generate_cover, _generate_composite_cover, _video_content_rect,
            )

            transcoded_main = os.path.join(tmpdir, "main_base.mp4")
            _transcode_intro(ffmpeg, raw_main, transcoded_main)

            # ── Step 2: Generate TTS narration ───────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
            from app.services.elevenlabs_service import generate_speech

            narration_text = (narration or "").strip() or "欢迎观看这套精选房源。"
            audio_bytes = generate_speech(narration_text, fish_voice_id=voice_id)
            audio_path = os.path.join(tmpdir, "narration.mp3")
            with open(audio_path, "wb") as fh:
                fh.write(audio_bytes)

            # ── Step 3: Mux video + narration audio ──────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio..."})
            main_with_audio = os.path.join(tmpdir, "main_mixed.mp4")

            def _dur(path):
                r = subprocess.run(
                    [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
                     "-of", "default=noprint_wrappers=1:nokey=1", path],
                    capture_output=True, text=True,
                )
                try:
                    return float(r.stdout.strip())
                except Exception:
                    return 0.0

            video_dur = _dur(transcoded_main)
            audio_dur = _dur(audio_path)

            if audio_dur > video_dur + 0.5:
                # Narration longer than video — loop video until audio ends
                subprocess.run(
                    [ffmpeg, "-y",
                     "-stream_loop", "-1", "-i", transcoded_main,
                     "-i", audio_path,
                     "-map", "0:v:0", "-map", "1:a:0",
                     "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
                     "-r", str(FPS), "-pix_fmt", "yuv420p",
                     "-c:a", "aac", "-shortest",
                     main_with_audio],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            else:
                subprocess.run(
                    [ffmpeg, "-y",
                     "-i", transcoded_main, "-i", audio_path,
                     "-map", "0:v:0", "-map", "1:a:0",
                     "-c:v", "copy", "-c:a", "aac", "-shortest",
                     main_with_audio],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )

            # ── Step 4: Intro clip + cover ───────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Creating intro..."})

            intro_clip_path = None
            intro_audio_path = None
            raw_intro = None

            if intro_bytes and len(intro_bytes) > 1000:
                try:
                    raw_intro = os.path.join(tmpdir, "intro_raw.webm")
                    with open(raw_intro, "wb") as fh:
                        fh.write(intro_bytes)
                    intro_bytes = None

                    _intro_audio_tmp = os.path.join(tmpdir, "intro_audio.aac")
                    subprocess.run(
                        [ffmpeg, "-y", "-i", raw_intro, "-vn",
                         "-af", "highpass=f=80,afftdn=nf=-25,loudnorm",
                         "-c:a", "aac", "-threads", "1", _intro_audio_tmp],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    if os.path.exists(_intro_audio_tmp) and os.path.getsize(_intro_audio_tmp) > 100:
                        intro_audio_path = _intro_audio_tmp

                    transcoded_intro = os.path.join(tmpdir, "intro_base.mp4")
                    content_rect = _video_content_rect(ffprobe, raw_intro)
                    _transcode_intro(ffmpeg, raw_intro, transcoded_intro)

                    overlay_png = os.path.join(tmpdir, "intro_overlay.png")
                    _generate_intro_overlay(cover_lines[0], cover_lines[1], cover_lines[2],
                                            overlay_png, content_rect=content_rect)
                    intro_clip_path = os.path.join(clips_dir, "clip_intro.mp4")
                    if os.path.exists(overlay_png):
                        _composite_overlay(ffmpeg, transcoded_intro, overlay_png, intro_clip_path)
                    else:
                        os.rename(transcoded_intro, intro_clip_path)
                except Exception:
                    intro_clip_path = None

            if not intro_clip_path:
                cover_path = os.path.join(tmpdir, "cover.png")
                _generate_cover(cover_lines[0], cover_lines[1], cover_lines[2], cover_path)
                if os.path.exists(cover_path):
                    cover_clip = os.path.join(clips_dir, "clip_cover.mp4")
                    subprocess.run(
                        [ffmpeg, "-y", "-loop", "1", "-i", cover_path,
                         "-t", "3",
                         "-vf", f"scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease,"
                                f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:black",
                         "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
                         "-r", str(FPS), "-pix_fmt", "yuv420p", cover_clip],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    intro_clip_path = cover_clip

            # ── Composite cover image ─────────────────────────────────────────
            _cover_r2_url = None
            _cover_bg_path = None
            if cover_bg_bytes:
                _cover_bg_path = os.path.join(tmpdir, "cover_bg.jpg")
                with open(_cover_bg_path, "wb") as _f:
                    _f.write(cover_bg_bytes)
            frame_path = os.path.join(tmpdir, "main_frame.jpg")
            subprocess.run(
                [ffmpeg, "-y", "-i", transcoded_main, "-vframes", "1", "-q:v", "2", frame_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            intro_src = raw_intro if raw_intro and os.path.exists(raw_intro) else None
            bg_img = _cover_bg_path if _cover_bg_path else (frame_path if os.path.exists(frame_path) else None)
            if bg_img:
                comp_png = os.path.join(tmpdir, "composite_cover.png")
                ok = _generate_composite_cover(
                    ffmpeg, intro_src, bg_img,
                    cover_lines[0], cover_lines[1], cover_lines[2], comp_png,
                )
                if ok and os.path.exists(comp_png):
                    try:
                        from app.s3_helpers import _upload_file_obj
                        cover_r2_key = f"new-home-covers/{job_id}.jpg"
                        with open(comp_png, "rb") as _cf:
                            _cover_r2_url = _upload_file_obj(_cf, cover_r2_key, "image/jpeg")
                    except Exception:
                        pass

            # ── Step 5: Concatenate intro + main ─────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Assembling video..."})
            all_clips = []
            if intro_clip_path and os.path.exists(intro_clip_path):
                all_clips.append(intro_clip_path)
            all_clips.append(main_with_audio)

            if len(all_clips) == 1:
                final_path = all_clips[0]
            else:
                list_file = os.path.join(tmpdir, "clips.txt")
                with open(list_file, "w", encoding="utf-8") as fh:
                    for cp in all_clips:
                        fh.write(f"file '{cp}'\n")
                final_path = os.path.join(tmpdir, "final.mp4")
                subprocess.run(
                    [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file,
                     "-c", "copy", final_path],
                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )

            # ── Step 6: Upload ────────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Uploading..."})
            from app.s3_helpers import _upload_file_obj

            r2_key = f"new-home-videos/{uuid.uuid4().hex}.mp4"
            with open(final_path, "rb") as fh:
                video_url = _upload_file_obj(fh, r2_key, "video/mp4")

            # ── Step 7: Save record ───────────────────────────────────────────
            from datetime import datetime, timedelta
            from sqlalchemy import text as _text
            from app.models import db
            expires_at = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            try:
                db.session.execute(
                    _text("""INSERT INTO new_home_videos
                             (agent_id, video_url, cover_url, storage_path,
                              cover1, cover2, cover3, expires_at)
                             VALUES (:aid, :url, :cv, :sp, :c1, :c2, :c3, :exp)"""),
                    {"aid": agent_id, "url": video_url, "cv": _cover_r2_url,
                     "sp": r2_key, "c1": cover_lines[0], "c2": cover_lines[1],
                     "c3": cover_lines[2], "exp": expires_at},
                )
                db.session.commit()
            except Exception:
                db.session.rollback()

            done_payload = {"status": "done", "url": video_url, "expires_at": expires_at}
            if _cover_r2_url:
                done_payload["cover_url"] = _cover_r2_url
            _job_set(job_id, done_payload)

        except Exception as e:
            _job_set(job_id, {"status": "error", "message": str(e)})
        finally:
            if tmpdir:
                shutil.rmtree(tmpdir, ignore_errors=True)
            _GENERATION_LOCK.release()
            unregister_job_callback(job_id)


def start_new_home_job(agent_id, main_video_bytes, narration, cover_lines,
                        flask_app, intro_bytes=None, cover_bg_bytes=None):
    job_id = uuid.uuid4().hex
    _job_set(job_id, {"status": "queued", "step": "Queued..."})
    t = threading.Thread(
        target=_run_new_home_pipeline,
        args=(job_id, agent_id, main_video_bytes, narration, cover_lines, flask_app),
        kwargs={"intro_bytes": intro_bytes, "cover_bg_bytes": cover_bg_bytes},
        daemon=True,
    )
    t.start()
    return job_id
