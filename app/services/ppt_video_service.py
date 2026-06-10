"""
数分视频 — PPT presentation video generation service.
Pipeline: PPTX slides + per-slide narration text + agent voice clone → portrait MP4.
Reuses intro/cover/ffmpeg helpers from xhs_video_service.
"""
import glob as _glob
import json
import os
import re
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
MAX_SLIDES = 5
MIN_SLIDE_DURATION = 2.0

_JOBS: dict = {}
_JOB_TTL = 600
_GENERATION_LOCK = threading.Semaphore(1)


# ── Job helpers ───────────────────────────────────────────────────────────────

def _job_set(job_id, data):
    entry = _JOBS.setdefault(job_id, {})
    entry.update(data)
    entry["ts"] = time.time()


def get_ppt_job(job_id):
    return _JOBS.get(job_id)


def _job_clean():
    now = time.time()
    expired = [k for k, v in list(_JOBS.items()) if now - v.get("ts", 0) > _JOB_TTL]
    for k in expired:
        _JOBS.pop(k, None)


# ── Tool discovery ────────────────────────────────────────────────────────────

def _find_ffmpeg():
    from app.services.xhs_video_service import _find_ffmpeg as _xff
    return _xff()


def _find_soffice():
    """Find LibreOffice soffice binary."""
    for candidate in ["soffice", "libreoffice"]:
        if shutil.which(candidate):
            return candidate
    for path in [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
    ]:
        if os.path.exists(path):
            return path
    return None


# ── PPTX → images ────────────────────────────────────────────────────────────

def _slide_sort_key(path):
    """Natural-sort so Slide1 < Slide2 < Slide10."""
    name = os.path.basename(path)
    nums = re.findall(r"\d+", name)
    return (int(nums[-1]) if nums else 0, name)


def _convert_pptx_to_images(soffice, pptx_path, out_dir):
    """Convert PPTX → PNG using LibreOffice headless. Returns sorted list of PNG paths."""
    subprocess.run(
        [soffice, "--headless", "--convert-to", "png", "--outdir", out_dir, pptx_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=120,
    )
    pngs = sorted(_glob.glob(os.path.join(out_dir, "*.png")), key=_slide_sort_key)
    return pngs


# ── Per-slide clip helpers ────────────────────────────────────────────────────

def _get_audio_duration(ffprobe, audio_path):
    """Return duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", audio_path],
            capture_output=True, text=True, timeout=15,
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return MIN_SLIDE_DURATION


def _make_slide_clip(ffmpeg, img_path, duration, out_path):
    """Still clip: single image held for `duration` seconds, letterboxed to 720×960."""
    subprocess.run(
        [
            ffmpeg, "-y",
            "-loop", "1", "-i", img_path,
            "-t", str(max(duration, 1.0)),
            "-vf", (
                f"scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease,"
                f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:black"
            ),
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-r", str(FPS), "-pix_fmt", "yuv420p",
            out_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=60,
    )


# ── Main pipeline ─────────────────────────────────────────────────────────────

def _run_ppt_pipeline(job_id, agent_id, pptx_bytes, slide_texts, cover_lines, flask_app, intro_bytes=None):
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

            minimax_voice_id = agent.elevenlabs_voice_id
            ffmpeg, ffprobe = _find_ffmpeg()
            tmpdir = tempfile.mkdtemp(prefix="pptvid_")
            clips_dir = os.path.join(tmpdir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            # ── Step 1: PPTX → images ─────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Converting slides..."})
            soffice = _find_soffice()
            if not soffice:
                _job_set(job_id, {"status": "error", "message": "服务器未安装 LibreOffice，无法转换 PPT"})
                return

            pptx_path = os.path.join(tmpdir, "presentation.pptx")
            with open(pptx_path, "wb") as fh:
                fh.write(pptx_bytes)
            pptx_bytes = None  # free memory

            slides_dir = os.path.join(tmpdir, "slides")
            os.makedirs(slides_dir, exist_ok=True)
            slide_images = _convert_pptx_to_images(soffice, pptx_path, slides_dir)

            if not slide_images:
                _job_set(job_id, {"status": "error", "message": "无法解析 PPT 文件，请确认格式正确（.pptx）"})
                return

            slide_images = slide_images[:MAX_SLIDES]
            n = len(slide_images)
            # Align texts list length with actual slide count
            slide_texts = list((slide_texts or []))[:n]
            while len(slide_texts) < n:
                slide_texts.append("")

            # ── Step 2: Intro clip + cover (same as XHS video) ────────────────
            _job_set(job_id, {"status": "processing", "step": "Creating intro..."})

            from app.services.xhs_video_service import (
                _transcode_intro, _generate_intro_overlay, _composite_overlay,
                _generate_cover, _generate_composite_cover, _video_content_rect,
            )

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
                    _make_slide_clip(ffmpeg, cover_path, 3.0, cover_clip)
                    intro_clip_path = cover_clip

            # Composite cover image (slide 1 as background + agent cutout)
            _cover_r2_url = None
            comp_png = os.path.join(tmpdir, "composite_cover.png")
            intro_src = raw_intro if raw_intro and os.path.exists(raw_intro) else None
            ok = _generate_composite_cover(
                ffmpeg, intro_src, slide_images[0],
                cover_lines[0], cover_lines[1], cover_lines[2], comp_png,
            )
            if ok and os.path.exists(comp_png):
                try:
                    from app.s3_helpers import _upload_file_obj
                    cover_r2_key = f"ppt-covers/{job_id}.jpg"
                    with open(comp_png, "rb") as _cf:
                        _cover_r2_url = _upload_file_obj(_cf, cover_r2_key, "image/jpeg")
                except Exception:
                    pass

            # ── Step 3: Per-slide TTS + clips ────────────────────────────────
            from app.services.elevenlabs_service import generate_speech

            slide_clip_paths = []
            slide_audio_paths = []

            for i, (img_path, text) in enumerate(zip(slide_images, slide_texts)):
                _job_set(job_id, {"status": "processing", "step": f"Generating voiceover {i+1}/{n}..."})
                narration = text.strip() if text and text.strip() else f"第{i+1}页"
                try:
                    audio_bytes = generate_speech(narration, fish_voice_id=minimax_voice_id)
                    audio_path = os.path.join(tmpdir, f"slide_{i:02d}.mp3")
                    with open(audio_path, "wb") as fh:
                        fh.write(audio_bytes)
                    duration = _get_audio_duration(ffprobe, audio_path)
                except Exception:
                    audio_path = None
                    duration = MIN_SLIDE_DURATION

                slide_audio_paths.append(audio_path)

                _job_set(job_id, {"status": "processing", "step": f"Rendering slide {i+1}/{n}..."})
                clip_path = os.path.join(clips_dir, f"slide_{i:04d}.mp4")
                _make_slide_clip(ffmpeg, img_path, duration, clip_path)
                slide_clip_paths.append(clip_path)

            # ── Step 4: Concatenate video clips ──────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Assembling video..."})
            all_clips = []
            if intro_clip_path and os.path.exists(intro_clip_path):
                all_clips.append(intro_clip_path)
            all_clips.extend(slide_clip_paths)

            list_file = os.path.join(tmpdir, "clips.txt")
            with open(list_file, "w", encoding="utf-8") as fh:
                for cp in all_clips:
                    fh.write(f"file '{cp}'\n")

            silent_path = os.path.join(tmpdir, "silent.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", silent_path],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

            # ── Step 5: Mix all audio tracks ─────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio..."})
            audio_inputs = []
            if intro_audio_path and os.path.exists(intro_audio_path):
                audio_inputs.append(intro_audio_path)
            audio_inputs.extend([p for p in slide_audio_paths if p and os.path.exists(p)])

            if not audio_inputs:
                _job_set(job_id, {"status": "error", "message": "所有幻灯片的语音生成均失败"})
                return

            if len(audio_inputs) == 1:
                final_audio_path = audio_inputs[0]
            else:
                combined_audio_path = os.path.join(tmpdir, "combined_audio.aac")
                filter_str = "".join(f"[{i}:a]" for i in range(len(audio_inputs)))
                filter_complex = f"{filter_str}concat=n={len(audio_inputs)}:v=0:a=1[outa]"
                cmd = [ffmpeg, "-y"]
                for ap in audio_inputs:
                    cmd += ["-i", ap]
                cmd += ["-filter_complex", filter_complex, "-map", "[outa]",
                        "-c:a", "aac", "-threads", "1", combined_audio_path]
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                final_audio_path = combined_audio_path

            final_path = os.path.join(tmpdir, "final.mp4")
            subprocess.run(
                [ffmpeg, "-y",
                 "-i", silent_path, "-i", final_audio_path,
                 "-map", "0:v:0", "-map", "1:a:0",
                 "-c:v", "copy", "-c:a", "aac", "-shortest",
                 final_path],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

            # ── Step 6: Upload ────────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Uploading..."})
            from app.s3_helpers import _upload_file_obj

            r2_key = f"ppt-videos/{uuid.uuid4().hex}.mp4"
            with open(final_path, "rb") as fh:
                video_url = _upload_file_obj(fh, r2_key, "video/mp4")

            # ── Step 7: Save record ───────────────────────────────────────────
            from datetime import datetime, timedelta
            from sqlalchemy import text as _text
            from app.models import db
            expires_at = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            try:
                db.session.execute(
                    _text("""INSERT INTO ppt_videos
                             (agent_id, video_url, cover_url, storage_path,
                              cover1, cover2, cover3, slide_count, expires_at)
                             VALUES (:aid, :url, :cv, :sp, :c1, :c2, :c3, :sc, :exp)"""),
                    {"aid": agent_id, "url": video_url, "cv": _cover_r2_url,
                     "sp": r2_key, "c1": cover_lines[0], "c2": cover_lines[1],
                     "c3": cover_lines[2], "sc": n, "exp": expires_at},
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


def start_ppt_video_job(agent_id, pptx_bytes, slide_texts, cover_lines, flask_app, intro_bytes=None):
    """Start background PPT video generation. Returns job_id."""
    _job_clean()
    job_id = uuid.uuid4().hex
    _job_set(job_id, {"status": "queued", "step": "Queued..."})
    t = threading.Thread(
        target=_run_ppt_pipeline,
        args=(job_id, agent_id, pptx_bytes, slide_texts, cover_lines, flask_app),
        kwargs={"intro_bytes": intro_bytes},
        daemon=True,
    )
    t.start()
    return job_id
