"""
XHS (小红书) video generation service.
Pipeline: listing photos + agent voice clone → portrait MP4 with narration.
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

import requests

OUTPUT_W = 720
OUTPUT_H = 960
PHOTO_DURATION = 3.5
FPS = 24
CRF = 26
PRESET = "fast"
ZOOM_START = 1.0
ZOOM_END = 1.25
MAX_PHOTOS = 8

_JOBS: dict = {}
_JOB_TTL = 600  # 10 minutes


# ── ffmpeg discovery (same logic as photo_to_video.py) ────────────────────────

def _find_ffmpeg():
    import glob as _glob
    if shutil.which("ffmpeg"):
        return "ffmpeg", "ffprobe"
    candidates = [
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"),
        r"C:\ProgramData\chocolatey\bin",
        os.path.expandvars(r"%USERPROFILE%\scoop\shims"),
        r"C:\ffmpeg\bin",
        r"C:\Program Files\ffmpeg\bin",
        "/usr/bin",
        "/usr/local/bin",
    ]
    winget_base = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    for pkg in _glob.glob(os.path.join(winget_base, "Gyan.FFmpeg*", "**", "bin"), recursive=True):
        candidates.insert(0, pkg)
    for d in candidates:
        ff = os.path.join(d, "ffmpeg") if not d.endswith(".bin") else d
        fp = os.path.join(d, "ffprobe") if not d.endswith(".bin") else d.replace("ffmpeg", "ffprobe")
        ff_exe = ff + (".exe" if os.name == "nt" else "")
        fp_exe = fp + (".exe" if os.name == "nt" else "")
        if os.path.isfile(ff_exe):
            return ff_exe, fp_exe
    raise RuntimeError("ffmpeg not found on this server")


# ── Chinese font ───────────────────────────────────────────────────────────────

_FONT_CACHE: dict[str, str | None] = {}

def _get_chinese_font():
    if "path" in _FONT_CACHE:
        return _FONT_CACHE["path"]

    system_candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    ]
    # Also glob for any Noto CJK font installed on system
    import glob as _glob
    for pattern in [
        "/usr/share/fonts/**/*CJK*Regular*",
        "/usr/share/fonts/**/*noto*sc*",
    ]:
        for found in _glob.glob(pattern, recursive=True):
            system_candidates.append(found)
    for p in system_candidates:
        if os.path.exists(p):
            _FONT_CACHE["path"] = p
            return p

    # Download NotoSansSC from Google Fonts GitHub (OTF subset)
    dl_path = "/tmp/NotoSansSC-Regular.otf"
    if os.path.exists(dl_path):
        _FONT_CACHE["path"] = dl_path
        return dl_path

    font_url = (
        "https://github.com/googlefonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf"
    )
    try:
        r = requests.get(font_url, timeout=30)
        if r.ok:
            with open(dl_path, "wb") as f:
                f.write(r.content)
            _FONT_CACHE["path"] = dl_path
            return dl_path
    except Exception:
        pass

    _FONT_CACHE["path"] = None
    return None


# ── Cover slide ────────────────────────────────────────────────────────────────

def _generate_cover(line1, line2, line3, out_path):
    """Render a 1080×1440 cover image with 3 lines of Chinese text."""
    try:
        from PIL import Image, ImageDraw, ImageFont

        img = Image.new("RGB", (OUTPUT_W, OUTPUT_H), "#0f172a")
        draw = ImageDraw.Draw(img)

        font_path = _get_chinese_font()

        def _load(size):
            if font_path:
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    pass
            return ImageFont.load_default()

        f1, f2, f3 = _load(88), _load(64), _load(52)

        # Subtle horizontal rule
        draw.rectangle([(120, 360), (OUTPUT_W - 120, 364)], fill="#3b82f6")

        y = 420
        for text, font, gap in [(line1, f1, 130), (line2, f2, 106), (line3, f3, 86)]:
            if text:
                bbox = draw.textbbox((0, 0), text, font=font)
                w = bbox[2] - bbox[0]
                x = (OUTPUT_W - w) // 2
                draw.text((x, y), text, font=font, fill="#f8fafc")
                y += gap

        img.save(out_path, "PNG")
    except ImportError:
        # Pillow not installed — generate a plain-color placeholder via ffmpeg
        pass


# ── Narration text ─────────────────────────────────────────────────────────────

def _generate_narration(listing_data):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None

    price = f"{int(listing_data.get('list_price') or 0):,}"
    beds = listing_data.get("bed", "?")
    baths = listing_data.get("bath", "?")
    street_parts = filter(None, [
        str(listing_data.get("street_number", "") or ""),
        str(listing_data.get("street_name", "") or ""),
        str(listing_data.get("street_suffix", "") or ""),
    ])
    address = " ".join(street_parts) + f", {listing_data.get('city', '')}"
    desc = (listing_data.get("description") or "")[:600]
    style = listing_data.get("style") or listing_data.get("property_type") or "住宅"
    sqft = listing_data.get("sqft", "")

    prompt = f"""你是一位加拿大华人房产经纪，请用普通话为以下房源录制一段看房视频口播文案，时长大约30秒（约220-260字）。

房源信息：
地址：{address}
房型：{style}，{beds}卧{baths}卫
面积：{f'{sqft}平方英尺' if sqft else '未知'}
售价：${price} 加元
描述：{desc if desc else '暂无'}

写作要求：
- 语言自然，像真人在视频里直接说话，无需标题或解释
- 开头简短问候，介绍房源地址和基本情况
- 中间重点介绍2-3个亮点（根据描述），语气真实平实
- 结尾一句邀请预约看房
- 不要夸大，不要使用"顶级""超值""绝对"等夸张词
- 只输出口播正文，不要任何额外说明"""

    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "max_tokens": 600,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        if resp.ok:
            return resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
    except Exception:
        pass
    return None


# ── ffmpeg clip builder ────────────────────────────────────────────────────────

def _probe_dimensions(ffprobe, path):
    r = subprocess.run(
        [ffprobe, "-v", "quiet", "-print_format", "json", "-show_streams", path],
        capture_output=True, text=True,
    )
    for stream in json.loads(r.stdout).get("streams", []):
        if "width" in stream and "height" in stream:
            return stream["width"], stream["height"]
    return OUTPUT_W, OUTPUT_H


def _make_clip(ffmpeg, ffprobe, img_path, out_path, reverse=False):
    src_w, src_h = _probe_dimensions(ffprobe, img_path)
    ease = f"(1-cos(PI*t/{PHOTO_DURATION}))/2"
    if reverse:
        ease = f"(1-({ease}))"
    z = f"({ZOOM_START}+({ZOOM_END}-{ZOOM_START})*({ease}))"
    scaled_w_at_1 = src_w * OUTPUT_H / src_h
    if scaled_w_at_1 >= OUTPUT_W:
        sw = f"trunc(iw*{OUTPUT_H}/ih*({z})/2)*2"
        sh = f"trunc({OUTPUT_H}*({z})/2)*2"
        px = f"(in_w-{OUTPUT_W})*({ease})"
        py = f"(in_h-{OUTPUT_H})/2"
    else:
        sw = f"trunc({OUTPUT_W}*({z})/2)*2"
        sh = f"trunc(ih*{OUTPUT_W}/iw*({z})/2)*2"
        px = f"(in_w-{OUTPUT_W})/2"
        py = f"(in_h-{OUTPUT_H})*({ease})"
    scale = f"scale='{sw}':'{sh}':eval=frame:flags=lanczos"
    crop = f"crop={OUTPUT_W}:{OUTPUT_H}:'{px}':'{py}'"
    subprocess.run(
        [
            ffmpeg, "-y",
            "-loop", "1", "-t", str(PHOTO_DURATION),
            "-i", img_path,
            "-vf", f"{scale},{crop}",
            "-r", str(FPS),
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p",
            "-threads", "1",
            out_path,
        ],
        check=True,
        capture_output=True,
    )


# ── Job state helpers ──────────────────────────────────────────────────────────

def _job_set(job_id, data):
    _JOBS[job_id] = {**data, "ts": time.time()}


def _job_clean():
    now = time.time()
    expired = [k for k, v in list(_JOBS.items()) if now - v.get("ts", 0) > _JOB_TTL]
    for k in expired:
        _JOBS.pop(k, None)


def get_job(job_id):
    return _JOBS.get(job_id)


# ── Main pipeline (runs in background thread) ──────────────────────────────────

def _run_pipeline(job_id, mls_number, agent_id, cover_lines, flask_app):
    with flask_app.app_context():
        tmpdir = None
        try:
            _job_set(job_id, {"status": "processing", "step": "Loading listing..."})

            from app.models.mls_listing import MlsListing
            from app.models.user import User

            listing = MlsListing.query.filter_by(mls_number=mls_number).first()
            if not listing:
                _job_set(job_id, {"status": "error", "message": f"Listing {mls_number} not found"})
                return

            agent = User.query.get(agent_id)
            if not agent or not agent.elevenlabs_voice_id:
                _job_set(job_id, {"status": "error", "message": "Please record your voice sample first"})
                return

            voice_id = agent.elevenlabs_voice_id
            tmpdir = tempfile.mkdtemp(prefix="xhsvid_")

            # ── Step 1: Download photos ────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Downloading photos..."})

            img_dir = os.path.join(tmpdir, "imgs")
            os.makedirs(img_dir, exist_ok=True)
            image_urls = listing.effective_images[:MAX_PHOTOS]

            downloaded = []
            for i, url in enumerate(image_urls):
                try:
                    r = requests.get(url, timeout=20)
                    if r.ok:
                        ext = url.rsplit(".", 1)[-1].lower().split("?")[0]
                        if ext not in {"jpg", "jpeg", "png", "webp"}:
                            ext = "jpg"
                        path = os.path.join(img_dir, f"{i:04d}.{ext}")
                        with open(path, "wb") as f:
                            f.write(r.content)
                        downloaded.append(path)
                except Exception:
                    pass

            if not downloaded:
                _job_set(job_id, {"status": "error", "message": "No photos available for this listing"})
                return

            # ── Step 2: Cover slide ────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Creating cover slide..."})
            cover_path = os.path.join(tmpdir, "cover.png")
            _generate_cover(cover_lines[0], cover_lines[1], cover_lines[2], cover_path)

            all_images = ([cover_path] if os.path.exists(cover_path) else []) + downloaded

            # ── Step 3: Narration text ────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Writing narration..."})
            listing_data = {
                "list_price": listing.list_price,
                "bed": listing.bed,
                "bath": listing.bath,
                "street_number": listing.street_number,
                "street_name": listing.street_name,
                "street_suffix": listing.street_suffix,
                "city": listing.city,
                "description": listing.description,
                "style": listing.style,
                "property_type": listing.property_type,
                "sqft": listing.sqft,
            }
            narration = _generate_narration(listing_data)
            if not narration:
                city = listing.city or "多伦多"
                bed = listing.bed or "?"
                narration = (
                    f"大家好，今天来给大家介绍一套位于{city}的精品房源。"
                    f"这套房子共有{bed}间卧室，设计精良，采光充足，性价比很高。"
                    f"感兴趣的朋友欢迎联系我预约看房，期待和您一起找到心仪的家。"
                )

            # ── Step 4: Voice narration ───────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
            from app.services.elevenlabs_service import generate_speech
            audio_bytes = generate_speech(voice_id, narration)
            audio_path = os.path.join(tmpdir, "narration.mp3")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

            # ── Step 5: Render video ──────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Rendering video..."})
            ffmpeg, ffprobe = _find_ffmpeg()

            clips_dir = os.path.join(tmpdir, "clips")
            os.makedirs(clips_dir, exist_ok=True)
            clip_paths = []
            for i, img_path in enumerate(all_images):
                clip_path = os.path.join(clips_dir, f"clip_{i:04d}.mp4")
                _make_clip(ffmpeg, ffprobe, img_path, clip_path, reverse=(i % 2 == 1))
                clip_paths.append(clip_path)

            list_file = os.path.join(tmpdir, "clips.txt")
            with open(list_file, "w", encoding="utf-8") as f:
                for cp in clip_paths:
                    f.write(f"file '{cp}'\n")

            silent_path = os.path.join(tmpdir, "silent.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", silent_path],
                check=True, capture_output=True,
            )

            # ── Step 6: Mix audio ─────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio..."})
            final_path = os.path.join(tmpdir, "final.mp4")
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", silent_path,
                    "-i", audio_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-shortest",
                    final_path,
                ],
                check=True, capture_output=True,
            )

            # ── Step 7: Upload ────────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Uploading..."})
            from app.s3_helpers import _supabase_config, _ensure_bucket

            supabase_url, service_key, _ = _supabase_config()
            bucket = "xhs-videos"
            _ensure_bucket(supabase_url, service_key, bucket)

            filename = f"{uuid.uuid4().hex}.mp4"
            file_size = os.path.getsize(final_path)
            with open(final_path, "rb") as f:
                resp = requests.post(
                    f"{supabase_url}/storage/v1/object/{bucket}/{filename}",
                    headers={
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "video/mp4",
                        "Content-Length": str(file_size),
                        "x-upsert": "true",
                    },
                    data=f,
                    timeout=180,
                )
            if resp.status_code not in (200, 201):
                _job_set(job_id, {"status": "error", "message": f"Upload failed: {resp.status_code}"})
                return

            video_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{filename}"

            # ── Step 8: Save record (7-day expiry) ───────────────────────────
            from datetime import datetime, timedelta
            expires_at = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            try:
                requests.post(
                    f"{supabase_url}/rest/v1/xhs_videos",
                    headers={
                        "apikey": service_key,
                        "Authorization": f"Bearer {service_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    json={
                        "agent_id": agent_id,
                        "mls_number": mls_number,
                        "video_url": video_url,
                        "storage_path": filename,
                        "cover1": cover_lines[0],
                        "cover2": cover_lines[1],
                        "cover3": cover_lines[2],
                        "expires_at": expires_at,
                    },
                    timeout=10,
                )
            except Exception:
                pass  # Don't fail the whole job if DB write fails

            _job_set(job_id, {"status": "done", "url": video_url, "expires_at": expires_at})

            # Email notification (best-effort)
            try:
                from app.utils.mailer import send_xhs_video_ready
                address = listing.street or mls_number
                if listing.city:
                    address += f", {listing.city}"
                send_xhs_video_ready(agent.email, agent.username or agent.email, address, video_url)
            except Exception as mail_err:
                print(f"[XHS] Email notify failed (non-fatal): {mail_err}")

        except Exception as e:
            _job_set(job_id, {"status": "error", "message": str(e)})
        finally:
            if tmpdir:
                shutil.rmtree(tmpdir, ignore_errors=True)


def start_video_job(mls_number, agent_id, cover_lines, flask_app):
    """Start background video generation. Returns job_id."""
    _job_clean()
    job_id = uuid.uuid4().hex
    _job_set(job_id, {"status": "processing", "step": "Starting..."})
    t = threading.Thread(
        target=_run_pipeline,
        args=(job_id, mls_number, agent_id, cover_lines, flask_app),
        daemon=True,
    )
    t.start()
    return job_id
