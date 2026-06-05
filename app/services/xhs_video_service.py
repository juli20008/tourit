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
PHOTO_DURATION = 3.0
FPS = 15
CRF = 28
PRESET = "ultrafast"
ZOOM_START = 1.0
ZOOM_END = 1.15
MAX_PHOTOS = 12

_JOBS: dict = {}
_JOB_TTL = 600  # 10 minutes
_GENERATION_LOCK = threading.Semaphore(1)  # only one video at a time on 512 MB


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

def _get_chinese_font(bold=False):
    cache_key = "bold" if bold else "regular"
    if cache_key in _FONT_CACHE:
        return _FONT_CACHE[cache_key]

    import glob as _glob

    bold_candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto-cjk/NotoSansCJK-Bold.ttc",
    ]
    regular_candidates = [
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
    for pattern in ["/usr/share/fonts/**/*CJK*Bold*", "/usr/share/fonts/**/*noto*sc*bold*"]:
        for found in _glob.glob(pattern, recursive=True):
            bold_candidates.append(found)
    for pattern in ["/usr/share/fonts/**/*CJK*Regular*", "/usr/share/fonts/**/*noto*sc*"]:
        for found in _glob.glob(pattern, recursive=True):
            regular_candidates.append(found)

    candidates = (bold_candidates + regular_candidates) if bold else regular_candidates
    for p in candidates:
        if os.path.exists(p):
            _FONT_CACHE[cache_key] = p
            return p

    # Download bold first, fall back to regular
    for variant, url in [
        ("Bold",    "https://github.com/googlefonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf"),
        ("Regular", "https://github.com/googlefonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf"),
    ]:
        dl_path = f"/tmp/NotoSansSC-{variant}.otf"
        if os.path.exists(dl_path):
            _FONT_CACHE[cache_key] = dl_path
            return dl_path
        if bold or variant == "Regular":
            try:
                r = requests.get(url, timeout=30)
                if r.ok:
                    with open(dl_path, "wb") as f:
                        f.write(r.content)
                    _FONT_CACHE[cache_key] = dl_path
                    return dl_path
            except Exception:
                pass

    _FONT_CACHE[cache_key] = None
    return None


# ── Cover slide (plain — used when no intro video) ─────────────────────────────

def _draw_impact_text(draw, text, font, x, y, stroke_w):
    """White fill + black stroke — XHS/TikTok impact style."""
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 255),
              stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))


def _generate_cover(line1, line2, line3, out_path):
    """Render a 720×960 cover image — XHS impact style: white text, thick black stroke."""
    try:
        from PIL import Image, ImageDraw, ImageFont

        img = Image.new("RGB", (OUTPUT_W, OUTPUT_H), "#0f172a")
        draw = ImageDraw.Draw(img)

        font_path = _get_chinese_font(bold=True)

        def _load(size):
            if font_path:
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    pass
            return ImageFont.load_default()

        STROKE_W = 9
        MAX_W = OUTPUT_W - 60

        def _fit(text, start_size):
            size = start_size
            while size >= 20:
                f = _load(size)
                bbox = draw.textbbox((0, 0), text, font=f, stroke_width=STROKE_W)
                if bbox[2] - bbox[0] <= MAX_W:
                    return f
                size -= 4
            return _load(20)

        f1 = _fit(line1, 96) if line1 else _load(96)
        f2 = _fit(line2, 76) if line2 else _load(76)
        f3 = _fit(line3, 62) if line3 else _load(62)

        # Line 1 at 2/10 from top
        if line1:
            bbox = draw.textbbox((0, 0), line1, font=f1, stroke_width=STROKE_W)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            x = (OUTPUT_W - w) // 2
            y = int(OUTPUT_H * 0.2) - h // 2
            _draw_impact_text(draw, line1, f1, x, y, STROKE_W)

        # Lines 2-3 at bottom
        spacing = 20
        bottom = [(t, f) for t, f in [(line2, f2), (line3, f3)] if t]
        if bottom:
            total_h = sum(
                draw.textbbox((0, 0), t, font=f, stroke_width=STROKE_W)[3] -
                draw.textbbox((0, 0), t, font=f, stroke_width=STROKE_W)[1]
                for t, f in bottom
            ) + spacing * (len(bottom) - 1)
            y = OUTPUT_H - 90 - total_h
            for text, font in bottom:
                bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
                w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
                x = (OUTPUT_W - w) // 2
                _draw_impact_text(draw, text, font, x, y, STROKE_W)
                y += h + spacing

        img.save(out_path, "PNG")
    except ImportError:
        pass


# ── 小红书-style cover overlay for intro video ──────────────────────────────────

def _video_content_rect(ffprobe, src_path):
    """
    Return (x_off, y_off, cw, ch) — the rect where actual video pixels land
    inside the 720×960 canvas after scale-to-fit + pad with black.
    Falls back to full canvas if probe fails.
    """
    try:
        import json as _json
        out = subprocess.check_output(
            [ffprobe, "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height",
             "-of", "json", src_path],
            stderr=subprocess.DEVNULL,
        )
        info = _json.loads(out)
        sw = info["streams"][0]["width"]
        sh = info["streams"][0]["height"]
        scale = min(OUTPUT_W / sw, OUTPUT_H / sh)
        cw = int(sw * scale)
        ch = int(sh * scale)
        x_off = (OUTPUT_W - cw) // 2
        y_off = (OUTPUT_H - ch) // 2
        return x_off, y_off, cw, ch
    except Exception:
        return 0, 0, OUTPUT_W, OUTPUT_H


def _generate_intro_overlay(line1, line2, line3, out_path, content_rect=None):
    """
    Render a transparent 720×960 PNG overlay — 小红书 style:
    dark text with white stroke, no pill background.
    Text is constrained to content_rect (the actual video area, not black bars).
    Line 1 at 2/10 from top of content; lines 2-3 stacked at bottom of content.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont

        W, H = OUTPUT_W, OUTPUT_H
        if content_rect:
            x_off, y_off, cw, ch = content_rect
        else:
            x_off, y_off, cw, ch = 0, 0, W, H

        MARGIN = 30
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        font_path = _get_chinese_font(bold=True)

        def _load(size):
            if font_path:
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    pass
            return ImageFont.load_default()

        STROKE_W = 9
        MAX_W    = cw - MARGIN * 2  # constrained to content width

        def _fit(text, start_size):
            size = start_size
            while size >= 20:
                f = _load(size)
                bbox = draw.textbbox((0, 0), text, font=f, stroke_width=STROKE_W)
                if bbox[2] - bbox[0] <= MAX_W:
                    return f
                size -= 4
            return _load(20)

        def _draw_centered(text, font, y_center):
            bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            x = x_off + (cw - tw) // 2
            y = y_center - th // 2
            _draw_impact_text(draw, text, font, x, y, STROKE_W)
            return th

        fonts = [
            _fit(line1, 96) if line1 else _load(96),
            _fit(line2, 76) if line2 else _load(76),
            _fit(line3, 62) if line3 else _load(62),
        ]
        lines_data = [line1, line2, line3]

        # Line 1 at 2/10 from top of content area
        if line1:
            _draw_centered(line1, fonts[0], y_off + int(ch * 0.2))

        # Lines 2-3 stacked at bottom of content area
        spacing = 20
        bottom_texts = [(t, f) for t, f in zip(lines_data[1:], fonts[1:]) if t]
        if bottom_texts:
            total_h = sum(
                draw.textbbox((0, 0), t, font=f, stroke_width=STROKE_W)[3] -
                draw.textbbox((0, 0), t, font=f, stroke_width=STROKE_W)[1]
                for t, f in bottom_texts
            ) + spacing * (len(bottom_texts) - 1)
            y_cursor = y_off + ch - 90 - total_h
            for text, font in bottom_texts:
                bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
                th = bbox[3] - bbox[1]
                tw = bbox[2] - bbox[0]
                x = x_off + (cw - tw) // 2
                _draw_impact_text(draw, text, font, x, y_cursor, STROKE_W)
                y_cursor += th + spacing

        img.save(out_path, "PNG")

    except ImportError:
        pass


# ── Intro video transcoder ─────────────────────────────────────────────────────

def _transcode_intro(ffmpeg, src_path, out_path):
    """
    Trim intro to 10s, resize/pad to 720×960 (portrait), re-encode.
    Audio is stripped — narration track replaces it later.
    Input may be vertical (good) or landscape (pad with blurred background).
    """
    # Pre-downscale to ≤720×960 first (caps 4K/1080p input before complex filter),
    # then split into fg (padded) and bg (blurred) paths.
    vf = (
        f"[0:v]scale='min(iw,{OUTPUT_W})':'min(ih,{OUTPUT_H})'"
        f":force_original_aspect_ratio=decrease:flags=bilinear,split[a][b];"
        f"[a]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease:flags=bilinear,"
        f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:color=black[fg];"
        f"[b]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=increase:flags=bilinear,"
        f"crop={OUTPUT_W}:{OUTPUT_H},boxblur=6:2[bg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2"
    )
    subprocess.run(
        [
            ffmpeg, "-y",
            "-i", src_path,
            "-t", "10",
            "-filter_complex", vf,
            "-an",
            "-r", str(FPS),
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p",
            "-threads", "1",
            out_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _composite_overlay(ffmpeg, video_path, overlay_png, out_path):
    """Composite a transparent PNG overlay onto a video."""
    subprocess.run(
        [
            ffmpeg, "-y",
            "-i", video_path,
            "-i", overlay_png,
            "-filter_complex", "[0:v][1:v]overlay=0:0",
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-threads", "1",
            out_path,
        ],
        check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# ── Subtitle generation ────────────────────────────────────────────────────────

def _build_ass(narration: str, audio_duration_secs: float, font_path: str | None, out_path: str):
    """
    Build an ASS subtitle file from narration text.
    Segments text into ~20-char lines, estimates per-line timing from total duration.
    """
    import re

    # Split at sentence boundaries and punctuation
    raw = re.split(r'(?<=[，。！？、；：\n])', narration)
    segments = []
    for chunk in raw:
        chunk = chunk.strip()
        if not chunk:
            continue
        # Further split long chunks into ≤20 char pieces
        while len(chunk) > 20:
            segments.append(chunk[:20])
            chunk = chunk[20:]
        if chunk:
            segments.append(chunk)

    total_chars = max(sum(len(s) for s in segments), 1)

    def _ts(secs):
        h = int(secs // 3600)
        m = int((secs % 3600) // 60)
        s = secs % 60
        return f"{h}:{m:02d}:{s:05.2f}"

    font_name = "Noto Sans SC"
    if font_path:
        import os as _os
        font_name = _os.path.splitext(_os.path.basename(font_path))[0].replace("-Regular", "").replace("-", " ")

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 960
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},40,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,0,0,0,0,100,100,1,0,3,0,2,2,30,30,55,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    # 弹入 + 淡入淡出：每行字幕缩放弹出，出现/消失带渐变
    _anim = r"{\fad(120,80)\t(0,100,\fscx108\fscy108)\t(100,200,\fscx100\fscy100)}"

    lines = []
    t = 0.0
    for seg in segments:
        duration = audio_duration_secs * (len(seg) / total_chars)
        duration = max(duration, 0.5)
        lines.append(f"Dialogue: 0,{_ts(t)},{_ts(t + duration)},Default,,0,0,0,,{_anim}{seg}")
        t += duration

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(lines))


# ── Narration text ─────────────────────────────────────────────────────────────

def _generate_narration(listing_data, cover_lines=None):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None

    beds = listing_data.get("bed", "?")
    baths = listing_data.get("bath", "?")
    desc = (listing_data.get("description") or "")[:600]
    style = listing_data.get("style") or listing_data.get("property_type") or "住宅"
    sqft = listing_data.get("sqft", "")

    cover_hints = ""
    cover_opener = ""
    if cover_lines:
        hints = [l for l in cover_lines if l and l.strip()]
        if hints:
            cover_hints = f"\n封面关键词（必须在开头前两句内直接点出，不要拖到后面）：{'、'.join(hints)}"
            cover_opener = f"\n- 开头前两句必须直接点出封面关键词：{'、'.join(hints)}；这是观众第一眼看到的，要马上呼应"

    prompt = f"""你是一位加拿大华人房产经纪，请用普通话为以下房源录制一段看房视频口播文案，时长大约60秒（约440-480字）。

房源信息：
社区：{listing_data.get('neighborhood') or listing_data.get('city', '')}
房型：{style}，{beds}卧{baths}卫
面积：{f'{sqft}平方英尺' if sqft else '未知'}
描述：{desc if desc else '暂无'}{cover_hints}

写作要求：
- 语言自然，像真人在视频里直接说话，无需标题或解释{cover_opener}
- 不要用"大家好""我是地产经纪""今天带大家""今天介绍"等套话
- 不要提及价格或售价
- 中间详细介绍3-4个亮点（根据描述），语气真实平实
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
    scale = f"scale='{sw}':'{sh}':eval=frame:flags=bilinear"
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
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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

def _run_pipeline(job_id, mls_number, agent_id, cover_lines, flask_app, intro_bytes=None):
    if not _GENERATION_LOCK.acquire(blocking=False):
        with flask_app.app_context():
            _job_set(job_id, {"status": "error", "message": "另一个视频正在生成中，完成后会发邮件通知您再来试 / Another video is already generating — you'll get an email when it's done, then try again"})
        return
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
                _job_set(job_id, {"status": "error", "message": "请先在个人资料页面录制并上传您的声音样本 / Please record your voice sample first in My Profile"})
                return

            minimax_voice_id = agent.elevenlabs_voice_id
            tmpdir = tempfile.mkdtemp(prefix="xhsvid_")

            # ── Step 1: Download photos ────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Downloading photos..."})

            img_dir = os.path.join(tmpdir, "imgs")
            os.makedirs(img_dir, exist_ok=True)
            all_images = listing.effective_images or []
            if len(all_images) <= MAX_PHOTOS:
                image_urls = all_images
            else:
                step = len(all_images) / MAX_PHOTOS
                image_urls = [all_images[int(i * step)] for i in range(MAX_PHOTOS)]

            downloaded = []
            for i, url in enumerate(image_urls):
                try:
                    r = requests.get(url, timeout=20, stream=True)
                    if r.ok:
                        ext = url.rsplit(".", 1)[-1].lower().split("?")[0]
                        if ext not in {"jpg", "jpeg", "png", "webp"}:
                            ext = "jpg"
                        path = os.path.join(img_dir, f"{i:04d}.{ext}")
                        with open(path, "wb") as f:
                            for chunk in r.iter_content(chunk_size=65536):
                                f.write(chunk)
                        downloaded.append(path)
                except Exception:
                    pass

            if not downloaded:
                _job_set(job_id, {"status": "error", "message": "No photos available for this listing"})
                return

            # ── Step 2: Cover / intro clip ─────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Creating cover..."})
            ffmpeg, ffprobe = _find_ffmpeg()
            clips_dir = os.path.join(tmpdir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            intro_clip_path = None
            intro_audio_path = None
            if intro_bytes and len(intro_bytes) > 1000:
                try:
                    raw_intro = os.path.join(tmpdir, "intro_raw.webm")
                    with open(raw_intro, "wb") as f:
                        f.write(intro_bytes)
                    intro_bytes = None  # free memory immediately after writing to disk

                    # Extract original audio (user's voice) before stripping for video
                    _intro_audio_tmp = os.path.join(tmpdir, "intro_audio.aac")
                    subprocess.run(
                        [ffmpeg, "-y", "-i", raw_intro, "-vn", "-t", "10",
                         "-c:a", "aac", "-threads", "1", _intro_audio_tmp],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    if os.path.exists(_intro_audio_tmp) and os.path.getsize(_intro_audio_tmp) > 100:
                        intro_audio_path = _intro_audio_tmp

                    transcoded_intro = os.path.join(tmpdir, "intro_base.mp4")
                    content_rect = _video_content_rect(ffprobe, raw_intro)
                    _transcode_intro(ffmpeg, raw_intro, transcoded_intro)

                    overlay_png = os.path.join(tmpdir, "intro_overlay.png")
                    _generate_intro_overlay(cover_lines[0], cover_lines[1], cover_lines[2], overlay_png, content_rect=content_rect)

                    intro_clip_path = os.path.join(clips_dir, "clip_intro.mp4")
                    if os.path.exists(overlay_png):
                        _composite_overlay(ffmpeg, transcoded_intro, overlay_png, intro_clip_path)
                    else:
                        os.rename(transcoded_intro, intro_clip_path)
                except Exception:
                    intro_clip_path = None
                    intro_audio_path = None

            if not intro_clip_path:
                # Fall back to static cover slide
                cover_path = os.path.join(tmpdir, "cover.png")
                _generate_cover(cover_lines[0], cover_lines[1], cover_lines[2], cover_path)
                if os.path.exists(cover_path):
                    cover_clip_path = os.path.join(clips_dir, "clip_cover.mp4")
                    _make_clip(ffmpeg, ffprobe, cover_path, cover_clip_path)
                    intro_clip_path = cover_clip_path

            all_images = downloaded

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
            narration = _generate_narration(listing_data, cover_lines=cover_lines)
            if not narration:
                city = listing.city or "多伦多"
                bed = listing.bed or "?"
                bath = listing.bath or "?"
                price_str = f"{int(listing.list_price or 0):,}" if listing.list_price else "面议"
                narration = (
                    f"这套房子是{bed}卧{bath}卫的户型，空间布局非常合理，每个功能区划分清晰，住起来很舒适。"
                    f"房屋的采光条件相当好，主要生活区域在白天都能享受到充足的自然光，整体氛围明亮通透。"
                    f"厨房和卫浴的装修保持得很好，设施齐全，日常使用完全没有问题，入住即可。"
                    f"主卧空间宽敞，有足够的储物空间，其他卧室也都能满足家庭日常居住需求。"
                    f"{city}这个区域配套设施非常成熟，周边有超市、餐厅、公园，生活非常便利。"
                    f"交通方面也很方便，无论是开车还是乘坐公共交通，通勤都比较顺畅。"
                    f"学区方面，这里周边的学校口碑也不错，对于有孩子的家庭来说是一个加分项。"
                    f"如果您对这套房源感兴趣，欢迎随时联系我预约实地看房，期待和您一起找到心仪的家。"
                )

            # ── Step 4: Voice narration ───────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
            from app.services.elevenlabs_service import generate_speech

            audio_bytes = generate_speech(narration, fish_voice_id=minimax_voice_id)
            audio_path = os.path.join(tmpdir, "narration.mp3")
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

            # ── Step 5: Render video ──────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Rendering video..."})

            clip_paths = []
            if intro_clip_path and os.path.exists(intro_clip_path):
                clip_paths.append(intro_clip_path)
            for i, img_path in enumerate(all_images):
                clip_path = os.path.join(clips_dir, f"clip_{i:04d}.mp4")
                _make_clip(ffmpeg, ffprobe, img_path, clip_path, reverse=(i % 2 == 1))
                clip_paths.append(clip_path)
                # Free disk space: delete source image immediately after clip is made
                try:
                    os.remove(img_path)
                except OSError:
                    pass

            list_file = os.path.join(tmpdir, "clips.txt")
            with open(list_file, "w", encoding="utf-8") as f:
                for cp in clip_paths:
                    f.write(f"file '{cp}'\n")

            silent_path = os.path.join(tmpdir, "silent.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", silent_path],
                check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

            # Free disk space: delete individual clips after concat
            for cp in clip_paths:
                try:
                    os.remove(cp)
                except OSError:
                    pass

            # ── Step 6: Mix audio ─────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio..."})

            # If intro had audio, prepend it before the narration
            final_audio_path = audio_path
            if intro_audio_path:
                try:
                    combined_audio_path = os.path.join(tmpdir, "combined_audio.aac")
                    # filter_complex concat handles mixed formats (AAC + MP3) correctly
                    subprocess.run(
                        [
                            ffmpeg, "-y",
                            "-i", intro_audio_path,
                            "-i", audio_path,
                            "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[outa]",
                            "-map", "[outa]",
                            "-c:a", "aac", "-threads", "1",
                            combined_audio_path,
                        ],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    final_audio_path = combined_audio_path
                except Exception:
                    final_audio_path = audio_path  # fallback to narration only

            final_path = os.path.join(tmpdir, "final.mp4")

            # Copy video stream — no re-encode (avoids OOM on 512MB)
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", silent_path,
                    "-i", final_audio_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-shortest",
                    final_path,
                ],
                check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

            # ── Step 7: Upload ────────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Uploading..."})
            from app.s3_helpers import _upload_file_obj

            r2_key = f"xhs-videos/{uuid.uuid4().hex}.mp4"
            with open(final_path, "rb") as f:
                video_url = _upload_file_obj(f, r2_key, "video/mp4")

            # ── Step 8: Save record (7-day expiry) ───────────────────────────
            from datetime import datetime, timedelta
            from sqlalchemy import text
            from app.models import db
            expires_at = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
            try:
                db.session.execute(
                    text("""INSERT INTO xhs_videos
                            (agent_id, mls_number, video_url, storage_path, cover1, cover2, cover3, expires_at)
                            VALUES (:aid, :mls, :url, :sp, :c1, :c2, :c3, :exp)"""),
                    {
                        'aid': agent_id, 'mls': mls_number, 'url': video_url,
                        'sp': r2_key, 'c1': cover_lines[0], 'c2': cover_lines[1],
                        'c3': cover_lines[2], 'exp': expires_at,
                    }
                )
                db.session.commit()
            except Exception:
                db.session.rollback()

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
            _GENERATION_LOCK.release()


def start_video_job(mls_number, agent_id, cover_lines, flask_app, intro_bytes=None):
    """Start background video generation. Returns job_id."""
    _job_clean()
    job_id = uuid.uuid4().hex
    _job_set(job_id, {"status": "processing", "step": "Starting..."})
    t = threading.Thread(
        target=_run_pipeline,
        args=(job_id, mls_number, agent_id, cover_lines, flask_app, intro_bytes),
        daemon=True,
    )
    t.start()
    return job_id
