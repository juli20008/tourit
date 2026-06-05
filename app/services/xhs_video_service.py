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

OUTPUT_W = 540
OUTPUT_H = 720
PHOTO_DURATION = 3.0
FPS = 20
CRF = 28
PRESET = "ultrafast"
ZOOM_START = 1.0
ZOOM_END = 1.15
MAX_PHOTOS = 30

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


# ── Cover slide (plain — used when no intro video) ─────────────────────────────

def _generate_cover(line1, line2, line3, out_path):
    """Render a 720×960 cover image with 3 lines of Chinese text."""
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
        pass


# ── 小红书-style cover overlay for intro video ──────────────────────────────────

def _generate_intro_overlay(line1, line2, line3, out_path):
    """
    Render a transparent 720×960 PNG overlay with 小红书-style pill text boxes.
    Three lines sit in the lower third with gradient fade, drop shadows, rounded pills.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        import math

        W, H = OUTPUT_W, OUTPUT_H
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        font_path = _get_chinese_font()

        def _load(size):
            if font_path:
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    pass
            return ImageFont.load_default()

        # Gradient overlay — bottom 45% of frame fades from transparent to near-black
        grad_top = int(H * 0.55)
        for y in range(grad_top, H):
            alpha = int(200 * ((y - grad_top) / (H - grad_top)) ** 1.4)
            draw.line([(0, y), (W, y)], fill=(0, 0, 0, alpha))

        lines = [
            (line1, _load(52), (255, 255, 255)),
            (line2, _load(42), (253, 224, 71)),   # warm yellow accent
            (line3, _load(36), (203, 213, 225)),   # muted blue-grey
        ]

        pad_x, pad_y, radius = 24, 12, 22
        pill_colors = [
            (30, 64, 175, 200),   # deep blue
            (146, 64, 14, 200),   # warm amber
            (15, 118, 110, 200),  # teal
        ]

        # Measure all lines, stack from bottom up
        rendered = []
        for text, font, color in lines:
            if not text:
                rendered.append(None)
                continue
            bbox = draw.textbbox((0, 0), text, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            rendered.append((text, font, color, tw, th))

        spacing = 18
        total_h = sum((r[4] + pad_y * 2 + spacing) for r in rendered if r) - spacing
        start_y = H - 80 - total_h

        shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_layer)

        y_cursor = start_y
        for i, r in enumerate(rendered):
            if not r:
                continue
            text, font, color, tw, th = r
            pill_w = tw + pad_x * 2
            pill_h = th + pad_y * 2
            x = (W - pill_w) // 2

            # Drop shadow (offset 3px)
            sx, sy = x + 3, y_cursor + 3
            sdraw.rounded_rectangle([sx, sy, sx + pill_w, sy + pill_h], radius=radius, fill=(0, 0, 0, 120))

            # Pill background
            draw.rounded_rectangle([x, y_cursor, x + pill_w, y_cursor + pill_h],
                                    radius=radius, fill=pill_colors[i])

            # Text centered in pill
            tx = x + pad_x
            ty = y_cursor + pad_y
            draw.text((tx, ty), text, font=font, fill=color)

            y_cursor += pill_h + spacing

        # Merge shadow beneath main layer
        base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        base = Image.alpha_composite(base, shadow_layer)
        base = Image.alpha_composite(base, img)
        base.save(out_path, "PNG")

    except ImportError:
        pass


# ── Intro video transcoder ─────────────────────────────────────────────────────

def _transcode_intro(ffmpeg, src_path, out_path):
    """
    Trim intro to 10s, resize/pad to 720×960 (portrait), re-encode.
    Audio is stripped — narration track replaces it later.
    Input may be vertical (good) or landscape (pad with blurred background).
    """
    vf = (
        f"[0:v]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease,"
        f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:color=black[fg];"
        f"[0:v]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=increase,"
        f"crop={OUTPUT_W}:{OUTPUT_H},boxblur=20:5[bg];"
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

    prompt = f"""你是一位加拿大华人房产经纪，请用普通话为以下房源录制一段看房视频口播文案，时长大约90秒（约650-700字）。

房源信息：
社区：{listing_data.get('neighborhood') or listing_data.get('city', '')}
房型：{style}，{beds}卧{baths}卫
面积：{f'{sqft}平方英尺' if sqft else '未知'}
描述：{desc if desc else '暂无'}

写作要求：
- 语言自然，像真人在视频里直接说话，无需标题或解释
- 开头直接介绍房子，不要用"大家好""我是地产经纪""今天带大家""今天介绍"等套话，一上来就讲房源亮点，可以提社区名称
- 不要提及价格或售价
- 中间详细介绍4-5个亮点（根据描述），每个亮点展开讲2-3句，语气真实平实
- 结尾一句邀请预约看房
- 不要夸大，不要使用"顶级""超值""绝对"等夸张词
- 只输出口播正文，不要任何额外说明"""

    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "max_tokens": 900,
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

            # ── Step 2: Cover / intro clip ─────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Creating cover..."})
            ffmpeg, ffprobe = _find_ffmpeg()
            clips_dir = os.path.join(tmpdir, "clips")
            os.makedirs(clips_dir, exist_ok=True)

            intro_clip_path = None
            if intro_bytes and len(intro_bytes) > 1000:
                try:
                    raw_intro = os.path.join(tmpdir, "intro_raw.webm")
                    with open(raw_intro, "wb") as f:
                        f.write(intro_bytes)

                    transcoded_intro = os.path.join(tmpdir, "intro_base.mp4")
                    _transcode_intro(ffmpeg, raw_intro, transcoded_intro)

                    overlay_png = os.path.join(tmpdir, "intro_overlay.png")
                    _generate_intro_overlay(cover_lines[0], cover_lines[1], cover_lines[2], overlay_png)

                    intro_clip_path = os.path.join(clips_dir, "clip_intro.mp4")
                    if os.path.exists(overlay_png):
                        _composite_overlay(ffmpeg, transcoded_intro, overlay_png, intro_clip_path)
                    else:
                        os.rename(transcoded_intro, intro_clip_path)
                except Exception:
                    intro_clip_path = None  # intro failed — fall back to cover slide

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
            narration = _generate_narration(listing_data)
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

            # ── Step 6: Mix audio + burn subtitles ───────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio & subtitles..."})

            # Get exact audio duration via ffprobe
            try:
                probe = subprocess.run(
                    [ffprobe, "-v", "quiet", "-print_format", "json", "-show_format", audio_path],
                    capture_output=True, text=True,
                )
                audio_duration = float(json.loads(probe.stdout).get("format", {}).get("duration", 0))
            except Exception:
                audio_duration = os.path.getsize(audio_path) / 16000

            ass_path = os.path.join(tmpdir, "subs.ass")
            font_path = _get_chinese_font()
            _build_ass(narration, audio_duration, font_path, ass_path)

            final_path = os.path.join(tmpdir, "final.mp4")

            # Build subtitle filter — include font dir if we have a font
            if font_path and os.path.exists(ass_path):
                font_dir = os.path.dirname(font_path).replace("\\", "/").replace(":", "\\:")
                ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")
                sub_filter = f"subtitles='{ass_escaped}':fontsdir='{font_dir}'"
                vf_args = ["-vf", sub_filter]
                vc_args = ["-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET, "-pix_fmt", "yuv420p", "-threads", "1", "-bufsize", "512k", "-maxrate", "1500k"]
            else:
                vf_args = []
                vc_args = ["-c:v", "copy"]

            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", silent_path,
                    "-i", audio_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    *vf_args,
                    *vc_args,
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
