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
OUTRO_DURATION = 4.0
FPS = 30
CRF = 23
PRESET = "fast"
ZOOM_START = 1.0
ZOOM_END = 1.15
MAX_PHOTOS = 50

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
_OUTRO_PATH = os.path.join(_ASSETS_DIR, "outro.png")
_TEAM_PHOTO_PATH = os.path.join(_ASSETS_DIR, "team-photo.png")
_TEAM_PHOTO_DURATION = 3.0

_JOBS: dict = {}
_JOB_TTL = 600  # 10 minutes
_GENERATION_LOCK = threading.Semaphore(1)  # only one video at a time on 512 MB
_JOB_CALLBACKS: dict = {}  # job_id -> fn(job_id, data) for out-of-process status updates


def register_job_callback(job_id, callback):
    _JOB_CALLBACKS[job_id] = callback


def unregister_job_callback(job_id):
    _JOB_CALLBACKS.pop(job_id, None)


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
    """Render a 720×960 cover image — three lines evenly distributed in top/mid/bottom thirds."""
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

        def _fit(text, start_size=96):
            size = start_size
            while size >= 20:
                f = _load(size)
                bbox = draw.textbbox((0, 0), text, font=f, stroke_width=STROKE_W)
                if bbox[2] - bbox[0] <= MAX_W:
                    return f, size
                size -= 4
            return _load(20), 20

        f1 = _fit(line1)[0] if line1 else _load(96)
        f2 = _fit(line2, 76)[0] if line2 else _load(76)
        f3 = _fit(line3)[0] if line3 else _load(96)

        # Lines 1 & 2 stacked at top
        spacing = 20
        y = int(OUTPUT_H * 0.08)
        for text, font in [(t, f) for t, f in [(line1, f1), (line2, f2)] if t]:
            bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            _draw_impact_text(draw, text, font, (OUTPUT_W - w) // 2, y, STROKE_W)
            y += h + spacing

        # Line 3 at bottom
        if line3:
            bbox = draw.textbbox((0, 0), line3, font=f3, stroke_width=STROKE_W)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            _draw_impact_text(draw, line3, f3, (OUTPUT_W - w) // 2, int(OUTPUT_H * 0.78) - h // 2, STROKE_W)

        img.save(out_path, "PNG")
    except ImportError:
        pass


def _generate_composite_cover(ffmpeg, intro_path, photo_path, line1, line2, line3, out_path):
    """
    Cover frame: first property photo (cropped 3:4) as background,
    agent person-cutout (rembg) from intro first frame in centre-bottom,
    three impact-text lines overlaid.
    Falls back to plain _generate_cover() if anything fails.
    """
    import io as _io
    try:
        from PIL import Image, ImageDraw, ImageEnhance

        # ── 1. Extract first frame from intro (skip if no intro provided) ───────
        person_rgba = None
        if intro_path and os.path.exists(intro_path):
            frame_png = out_path + "_frame.png"
            try:
                subprocess.run(
                    [ffmpeg, "-y", "-i", intro_path,
                     "-vframes", "1", "-q:v", "2", frame_png],
                    timeout=120,

                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                if os.path.exists(frame_png) and os.path.getsize(frame_png) > 1000:
                    from rembg import remove as rembg_remove
                    with open(frame_png, "rb") as _rf:
                        person_rgba = Image.open(
                            __import__("io").BytesIO(rembg_remove(_rf.read()))
                        ).convert("RGBA")
            except Exception:
                pass
            finally:
                try:
                    os.unlink(frame_png)
                except OSError:
                    pass

        # ── 3. Crop property photo to 720×960 (centre-crop) ───────────────────
        bg = Image.open(photo_path).convert("RGB")
        bw, bh = bg.size
        tgt_ratio = OUTPUT_W / OUTPUT_H          # 0.75 (portrait)
        if bw / bh > tgt_ratio:                  # too wide → crop sides
            new_w = int(bh * tgt_ratio)
            bg = bg.crop(((bw - new_w) // 2, 0, (bw - new_w) // 2 + new_w, bh))
        else:                                    # too tall → crop top/bottom
            new_h = int(bw / tgt_ratio)
            bg = bg.crop((0, (bh - new_h) // 2, bw, (bh - new_h) // 2 + new_h))
        bg = bg.resize((OUTPUT_W, OUTPUT_H), Image.LANCZOS)
        # Darken background for text contrast
        bg = ImageEnhance.Brightness(bg).enhance(0.65)
        canvas = bg.convert("RGBA")

        # ── 4. Scale + position person (centre, aligned to bottom) ───────────
        if person_rgba is not None:
            pw, ph = person_rgba.size
            target_h = int(OUTPUT_H * 0.80)
            target_w = int(pw * target_h / ph)
            if target_w > OUTPUT_W:              # clamp if too wide
                target_w = OUTPUT_W
                target_h = int(ph * target_w / pw)
            person_rgba = person_rgba.resize((target_w, target_h), Image.LANCZOS)

            # White stroke around person (自媒体白边效果)
            import numpy as _np
            from scipy.ndimage import binary_dilation as _dilate
            _a = _np.array(person_rgba.split()[3])
            _r = 12
            _yi, _xi = _np.ogrid[-_r:_r+1, -_r:_r+1]
            _struct = _xi**2 + _yi**2 <= _r**2
            _dilated = _dilate(_a > 30, structure=_struct)
            _stroke = _np.zeros((*_a.shape, 4), dtype=_np.uint8)
            _stroke[_dilated] = [255, 255, 255, 255]
            person_rgba = Image.alpha_composite(
                Image.fromarray(_stroke, "RGBA"), person_rgba
            )

            px = (OUTPUT_W - target_w) // 2
            py = OUTPUT_H - target_h
            canvas.paste(person_rgba, (px, py), person_rgba)

        # ── 5. Impact text overlay ────────────────────────────────────────────
        result = canvas.convert("RGB")
        draw = ImageDraw.Draw(result)
        font_path = _get_chinese_font(bold=True)

        def _load(size):
            if font_path:
                try:
                    return ImageFont.truetype(font_path, size)
                except Exception:
                    pass
            from PIL import ImageFont as _IF
            return _IF.load_default()

        from PIL import ImageFont
        STROKE_W = 9
        MAX_W = OUTPUT_W - 60

        def _fit(text, start_size=96):
            size = start_size
            while size >= 20:
                f = _load(size)
                bbox = draw.textbbox((0, 0), text, font=f, stroke_width=STROKE_W)
                if bbox[2] - bbox[0] <= MAX_W:
                    return f
                size -= 4
            return _load(20)

        f1 = _fit(line1) if line1 else _load(96)
        f2 = _fit(line2, 76) if line2 else _load(76)
        f3 = _fit(line3) if line3 else _load(96)

        # Lines 1 & 2 stacked at top (above person)
        spacing = 18
        y = int(OUTPUT_H * 0.05)
        for text, font in [(t, f) for t, f in [(line1, f1), (line2, f2)] if t]:
            bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            _draw_impact_text(draw, text, font, (OUTPUT_W - w) // 2, y, STROKE_W)
            y += h + spacing

        # Line 3 lower portion (~78% from top)
        if line3:
            bbox = draw.textbbox((0, 0), line3, font=f3, stroke_width=STROKE_W)
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            _draw_impact_text(draw, line3, f3, (OUTPUT_W - w) // 2, int(OUTPUT_H * 0.78) - h // 2, STROKE_W)

        result.save(out_path, "PNG")
        return True

    except Exception as _e:
        return False


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

        def _fit(text, start_size=96):
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

        f1 = _fit(line1) if line1 else _load(96)
        f2 = _fit(line2, 76) if line2 else _load(76)
        f3 = _fit(line3) if line3 else _load(96)

        # Lines 1 & 2 stacked near top of content area
        spacing = 20
        y_cursor = y_off + int(ch * 0.05)
        for text, font in [(t, f) for t, f in [(line1, f1), (line2, f2)] if t]:
            bbox = draw.textbbox((0, 0), text, font=font, stroke_width=STROKE_W)
            h = bbox[3] - bbox[1]
            _draw_centered(text, font, y_cursor + h // 2)
            y_cursor += h + spacing

        # Line 3 at bottom of content area
        if line3:
            _draw_centered(line3, f3, y_off + ch - 90)

        img.save(out_path, "PNG")

    except ImportError:
        pass


# ── Intro video transcoder ─────────────────────────────────────────────────────

def _transcode_intro(ffmpeg, src_path, out_path, speed=1.2):
    """
    Resize/pad intro to 720×960 (portrait), re-encode at `speed`x. Audio stripped.
    Pass 1: resize/pad. Pass 2: speed-up with setpts (two passes avoids -r overriding pts).
    """
    import tempfile as _tf
    tmp = out_path + "_nospeed.mp4"
    # Pass 1: resize + pad
    vf = (
        f"[0:v]scale='min(iw,{OUTPUT_W})':'min(ih,{OUTPUT_H})'"
        f":force_original_aspect_ratio=decrease:flags=bilinear,split[a][b];"
        f"[a]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease:flags=bilinear,"
        f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:color=black[fg];"
        f"[b]scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=increase:flags=bilinear,"
        f"crop={OUTPUT_W}:{OUTPUT_H},boxblur=20:5[bg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2"
    )
    subprocess.run(
        [ffmpeg, "-y", "-i", src_path, "-filter_complex", vf, "-an",
         "-r", str(FPS), "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
         "-pix_fmt", "yuv420p", "-threads", "1", tmp],
        timeout=120, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    # Pass 2: speed up video only (setpts without -r so pts are respected)
    subprocess.run(
        [ffmpeg, "-y", "-i", tmp,
         "-vf", f"setpts=PTS/{speed}",
         "-an", "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
         "-pix_fmt", "yuv420p", "-threads", "1", out_path],
        timeout=120, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        os.unlink(tmp)
    except OSError:
        pass


def _composite_overlay(ffmpeg, video_path, overlay_png, out_path):
    """Composite a transparent PNG overlay onto a video (input is always audio-less)."""
    subprocess.run(
        [
            ffmpeg, "-y",
            "-i", video_path,
            "-i", overlay_png,
            "-filter_complex", "[0:v][1:v]overlay=0:0",
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-an",
            "-pix_fmt", "yuv420p",
            "-threads", "1",
            out_path,
        ],
        timeout=120,

        check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


# ── Subtitle generation ────────────────────────────────────────────────────────

_ASS_HEADER_TMPL = """\
[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 960
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK SC,40,&H00FFFFFF,&H000000FF,&H00000000,&HAA000000,0,0,0,0,100,100,1,0,3,0,2,2,30,30,55,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
_ASS_ANIM = r"{\fad(120,80)\t(0,100,\fscx108\fscy108)\t(100,200,\fscx100\fscy100)}"


def _ass_ts(secs):
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = secs % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _narration_to_segments(narration):
    import re
    raw = re.split(r'(?<=[，。！？、；：\n])', narration)
    segs = []
    for chunk in raw:
        chunk = chunk.strip()
        if not chunk:
            continue
        while len(chunk) > 20:
            segs.append(chunk[:20])
            chunk = chunk[20:]
        if chunk:
            segs.append(chunk)
    return segs


def _build_ass(narration: str, audio_duration_secs: float, font_path, out_path: str,
               offset_secs: float = 0.0):
    """
    Build an ASS subtitle file from narration text.
    offset_secs: shift all timestamps (e.g. by intro clip duration).
    """
    segs = _narration_to_segments(narration)
    if not segs:
        return
    total_chars = max(sum(len(s) for s in segs), 1)
    lines = []
    t = offset_secs
    for seg in segs:
        dur = max(audio_duration_secs * (len(seg) / total_chars), 0.5)
        lines.append(f"Dialogue: 0,{_ass_ts(t)},{_ass_ts(t + dur)},Default,,0,0,0,,{_ASS_ANIM}{seg}")
        t += dur
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(_ASS_HEADER_TMPL)
        f.write("\n".join(lines))


def _build_ppt_ass(slide_segments, out_path: str, offset_secs: float = 0.0):
    """
    Build ASS for PPT: slide_segments = [(narration_text, audio_duration_secs), ...].
    offset_secs: duration of intro clip prepended before slides.
    """
    lines = []
    t = offset_secs
    for narration, slide_dur in slide_segments:
        if not narration or not narration.strip() or slide_dur <= 0:
            t += slide_dur
            continue
        segs = _narration_to_segments(narration)
        if not segs:
            t += slide_dur
            continue
        total_chars = max(sum(len(s) for s in segs), 1)
        for seg in segs:
            dur = max(slide_dur * (len(seg) / total_chars), 0.5)
            lines.append(f"Dialogue: 0,{_ass_ts(t)},{_ass_ts(t + dur)},Default,,0,0,0,,{_ASS_ANIM}{seg}")
            t += dur
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(_ASS_HEADER_TMPL)
        f.write("\n".join(lines))


# ── Word-count enforcement helpers ────────────────────────────────────────────

import re as _re_mod
_SENT_END = _re_mod.compile(r'[。！？；]')

def _trim_to_target(text, target, tolerance=20):
    """Trim text to target±tolerance, cutting only at sentence boundaries."""
    if len(text) <= target + tolerance:
        return text
    boundaries = [m.end() for m in _SENT_END.finditer(text)]
    # Find the last boundary at or before target+tolerance
    for pos in reversed(boundaries):
        if pos <= target + tolerance:
            return text[:pos]
    # No boundary found — hard cut as last resort
    return text[:target + tolerance]

def _pad_to_target(text, target, tolerance=20, api_key="", context_hint=""):
    """Append AI-generated continuation if text is below target-tolerance."""
    if len(text) >= target - tolerance:
        return text
    deficit = target - len(text)
    if not api_key:
        return text
    try:
        pad_resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "max_tokens": deficit + 80,
                "messages": [{"role": "user", "content":
                    f"以下是看房视频口播{context_hint}，还差约{deficit}字才到目标字数。"
                    f"请直接续写该空间的具体细节描述（不要重复已有内容，不要加标题，用普通日常口语，直接接着写）：\n\n{text}"
                }],
            },
            timeout=30,
        )
        if pad_resp.ok:
            extra = pad_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if extra:
                combined = text + extra
                return _trim_to_target(combined, target, tolerance)
    except Exception:
        pass
    return text


# ── Narration text ─────────────────────────────────────────────────────────────

def _round_dims(text):
    """Force all decimal numbers with 2+ decimal places to exactly 1 decimal place."""
    import re as _re
    return _re.sub(r'\d+\.\d{2,}', lambda m: f"{float(m.group()):.1f}", text)


def _generate_narration(listing_data, cover_lines=None, photo_count=30):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None

    def _fv(key):
        v = listing_data.get(key)
        return str(v).strip() if v else ""

    baths      = _fv("bath") or "?"
    beds_above = listing_data.get("beds_above_grade")
    bsmt_beds  = listing_data.get("basement_beds")
    style = _fv("style") or _fv("property_type") or "住宅"
    sqft  = _fv("sqft")

    if beds_above is not None and bsmt_beds:
        beds_detail = f"{beds_above}+{bsmt_beds}卧（地上{beds_above}个，地下室{bsmt_beds}个），{baths}卫"
    elif beds_above is not None:
        beds_detail = f"{beds_above}室{baths}卫"
    else:
        beds_detail = f"{listing_data.get('bed', '?')}室{baths}卫"

    target_chars = 15 * photo_count

    cover_hints = ""
    cover_opener = ""
    if cover_lines:
        hints = [l for l in cover_lines if l and l.strip()]
        if hints:
            cover_hints = f"\n封面关键词（开头前两句内自然融入）：{'、'.join(hints)}"
            cover_opener = f"\n- 开头前两句自然点出封面关键词：{'、'.join(hints)}"

    # Build full property info block
    info_parts = []
    for label, key in [
        ("主要描述", "description"), ("经纪备注", "brokerage_remarks"),
        ("特色", "features"), ("室内特色", "interior_features"),
        ("建筑特色", "building_features"), ("包含物品", "included_items"),
        ("不含物品", "exclusions"), ("租用设备", "rental_items"),
        ("房间详情", "room_info"), ("洗手间详情", "washroom_info"),
        ("地下室", "basement"), ("外墙", "exterior"), ("屋顶", "roof"),
        ("地基", "foundation"), ("冷气", "cooling"), ("暖气", "heating"),
        ("热源", "heating_source"), ("供水", "water"), ("下水", "sewers"),
        ("泳池", "pool"), ("车库", "garage_type"), ("总停车", "parking_total"),
        ("地块", "lot_frontage"), ("朝向", "fronting_on"), ("房龄", "approx_age"),
        ("税务", "taxes"), ("入住", "possession_type"), ("特殊条款", "special_designations"),
    ]:
        v = _fv(key)
        if v:
            info_parts.append(f"【{label}】{v}")
    property_info = "\n".join(info_parts) or "暂无"

    prompt = f"""你是加拿大华人房产经纪，录制小红书看房视频口播。

任务：阅读下方【房源完整信息】，自动提炼这套房子最值得说的卖点，写一段流畅的口播旁白。只说listing里有的内容，严禁编造任何未提到的细节。

目标字数：约{target_chars}字。
- 字数不够：在listing已有信息中找更多细节展开（尺寸、材质、配置等），绝不补充套话
- 字数超出：保留最有价值的细节，删去泛泛描述，口语精简
- 所有尺寸数字精确到小数点后一位，不要四舍五入成整数

房源：{listing_data.get('neighborhood') or listing_data.get('city', '')}，{style}，{beds_detail}{f'，{sqft} sqft' if sqft else ''}{cover_hints}

===== 房源完整信息 =====
{property_info}
=====

格式要求：
- 第一句报基本信息：几室几卫、面积{cover_opener}
- 口语自然，像给朋友介绍
- 严格只说listing里实际记载的内容
- 禁止任何招客套话："欢迎来看房""感兴趣联系我""值不值得来看"等
- 禁止词："大家好""今天带大家""空间宽敞""采光好""布局合理""性价比高""动线""功能分区""坐北朝南""尊贵""奢华""格局"
- 不要提地址、价格、门牌号
只输出口播正文"""

    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "max_tokens": 2000,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=40,
        )
        if not resp.ok:
            return None
        result = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if not result:
            return None
        # Enforce target±20: trim if over, pad if under
        result = _trim_to_target(result, target_chars)
        result = _pad_to_target(result, target_chars, api_key=api_key)
        result = result.replace("动线", "衔接")
        result = _round_dims(result)
        return result
    except Exception:
        pass
    return None


# ── Floor-segmented narration ──────────────────────────────────────────────────

_FLOOR_ORDER = ["exterior", "main_floor", "upper_floor", "basement"]
_FLOOR_ZH    = {
    "exterior":      "室外",       "main_floor":   "主层",
    "upper_floor":   "上层",       "basement":     "地下室",
    "exterior_main": "室外及主层",
    "main_living":   "客厅",       "main_kitchen": "厨房餐厅",
    "upper_master":  "主卧",       "upper_bath":   "主卧卫浴",
    # keys used when photo_ranges is provided from the frontend
    "living":        "客厅",       "kitchen":      "厨房餐厅",
    "master_suite":  "主卧套件",
}


def _photo_boundaries(n_photos, floor_breaks, room_breaks, n_segs):
    """
    Build explicit (start, end) photo ranges (0-indexed, end exclusive) for each
    narration segment using floor_breaks + room_breaks.
    Returns list of tuples if the break count matches n_segs, else None (caller
    falls back to even split).
    """
    floor_breaks = floor_breaks or []
    room_breaks  = room_breaks  or {}

    def _i(v):
        try: return int(v) if v else None
        except Exception: return None

    upper_1    = _i(floor_breaks[0]) if len(floor_breaks) > 0 else None
    basement_1 = _i(floor_breaks[1]) if len(floor_breaks) > 1 else None
    living_1   = _i(room_breaks.get("living_start"))
    kitchen_1  = _i(room_breaks.get("kitchen_start"))
    bath_1     = _i(room_breaks.get("master_bath_start"))

    # Sort the valid break points (1-indexed photo numbers)
    raw = sorted(b for b in [living_1, kitchen_1, upper_1, bath_1, basement_1]
                 if b is not None and 1 <= b <= n_photos)
    if not raw:
        return None

    # Build (start, end) pairs using 0-indexed slicing
    edges = [0] + [b - 1 for b in raw] + [n_photos]
    pairs = [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]

    if len(pairs) != n_segs:
        return None  # mismatch — caller uses even split
    return pairs


def _floor_heuristic(n):
    labels = []
    for i in range(n):
        r = i / max(n - 1, 1)
        if r < 0.12:
            labels.append("exterior")
        elif r < 0.55:
            labels.append("main_floor")
        elif r < 0.80:
            labels.append("upper_floor")
        else:
            labels.append("basement")
    return labels


def _classify_photos_by_floor(photo_paths, api_key):
    """Classify each photo into a floor group via DeepSeek-VL. Falls back to heuristic."""
    import base64 as _b64, json as _json, re as _re
    n = len(photo_paths)
    if not api_key or not photo_paths:
        return _floor_heuristic(n)

    # Sample up to 15 photos evenly to keep payload small
    if n <= 15:
        indices = list(range(n))
    else:
        step = n / 15
        indices = [int(i * step) for i in range(15)]

    content = []
    valid_indices = []
    for idx in indices:
        try:
            with open(photo_paths[idx], "rb") as _f:
                b64 = _b64.b64encode(_f.read()).decode()
            ext = photo_paths[idx].rsplit(".", 1)[-1].lower()
            mime = "image/png" if ext == "png" else "image/jpeg"
            content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
            valid_indices.append(idx)
        except Exception:
            pass

    if not content:
        return _floor_heuristic(n)

    num = len(valid_indices)
    content.append({"type": "text", "text": (
        f"以上{num}张是一套房源照片，按播放顺序排列。"
        "请将每张照片归类（只能选以下之一）：\n"
        "exterior（室外/外观/车道/后院）\n"
        "main_floor（主层：客厅/餐厅/厨房/入口大厅）\n"
        "upper_floor（上层：卧室/浴室/走廊）\n"
        "basement（地下室）\n"
        f"只输出长度为{num}的JSON数组，例：[\"exterior\",\"main_floor\"]"
    )})

    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-vl2",
                "messages": [{"role": "user", "content": content}],
                "max_tokens": 200,
            },
            timeout=60,
        )
        if resp.ok:
            raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
            if m:
                sample_labels = _json.loads(m.group())
                sample_labels = [l if l in _FLOOR_ORDER else "main_floor" for l in sample_labels]
                if len(sample_labels) == len(valid_indices):
                    labels = []
                    for i in range(n):
                        nearest = min(range(len(valid_indices)), key=lambda j: abs(valid_indices[j] - i))
                        labels.append(sample_labels[nearest])
                    return labels
    except Exception as e:
        print(f"[XHS] Photo classification error ({e}), using heuristic")

    return _floor_heuristic(n)


def _build_photo_sequence_hint(photo_inputs, api_key):
    """
    Classify photos into specific room types and return an ordered hint string for the narration AI.
    photo_inputs: list of local file paths OR list of (url_str, bytes) tuples.
    Returns a formatted string, or None on failure (silent degradation).
    """
    import base64 as _b64, json as _json, re as _re
    n = len(photo_inputs)
    if not api_key or not photo_inputs:
        return None, None

    # Sample up to 15 photos evenly
    if n <= 15:
        indices = list(range(n))
    else:
        step = n / 15
        indices = [int(i * step) for i in range(15)]

    content = []
    valid_indices = []
    for idx in indices:
        try:
            inp = photo_inputs[idx]
            if isinstance(inp, str):
                with open(inp, "rb") as _f:
                    data = _f.read()
                ext = inp.rsplit(".", 1)[-1].lower()
            else:
                data = inp[1]
                ext = "jpg"
            mime = "image/png" if ext == "png" else "image/jpeg"
            b64 = _b64.b64encode(data).decode()
            content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
            valid_indices.append(idx)
        except Exception:
            pass

    if not content:
        return None, None

    num = len(valid_indices)
    _ROOM_OPTS = (
        "室外/车道/车库, 客厅, 餐厅, 厨房, 早餐区, 书房/多功能室, "
        "主卧, 主浴/套浴, 次卧, 浴室/卫生间, 洗衣房, 地下室, 户外后院/泳池"
    )
    content.append({"type": "text", "text": (
        f"以上{num}张是一套房源照片，按播放顺序排列（第1张最先播放）。\n"
        f"请将每张照片归类（从以下选项中选最接近的）：{_ROOM_OPTS}\n"
        f"只输出长度为{num}的JSON数组，元素为上方标签原文。"
    )})

    try:
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "deepseek-vl2",
                  "messages": [{"role": "user", "content": content}],
                  "max_tokens": 300},
            timeout=60,
        )
        if not resp.ok:
            return None
        raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
        m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
        if not m:
            return None
        sample_labels = _json.loads(m.group())
        if len(sample_labels) != num:
            return None

        # Map sampled labels back to all photos via nearest-neighbor
        all_labels = []
        for i in range(n):
            nearest = min(range(num), key=lambda j: abs(valid_indices[j] - i))
            all_labels.append(sample_labels[nearest])

        # Compress consecutive identical labels into ranges
        runs = []
        for i, label in enumerate(all_labels):
            if runs and runs[-1][0] == label:
                runs[-1] = (label, runs[-1][1], i + 1)
            else:
                runs.append((label, i + 1, i + 1))

        lines = []
        for label, start, end in runs:
            lines.append(f"  第{start}{'–' + str(end) if end != start else ''}张：{label}")

        hint = "照片播放顺序（请严格按此顺序描述各区域，先出现的先描述）：\n" + "\n".join(lines)
        return hint, all_labels

    except Exception as e:
        print(f"[XHS] Photo sequence hint error: {e}")
        return None, None


def _generate_floor_narrations(listing_data, active_groups, cover_lines=None, style="concise",
                               photo_sequence=None):
    """Generate one narration segment per floor group. Returns [str] or None."""
    import json as _json, re as _re
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None

    def _f(key):
        v = listing_data.get(key)
        return str(v).strip() if v else ""

    baths      = _f("bath") or "?"
    beds_above = listing_data.get("beds_above_grade")
    bsmt_beds  = listing_data.get("basement_beds")
    prop_style = _f("style") or _f("property_type") or "住宅"
    sqft       = _f("sqft")

    if beds_above is not None and bsmt_beds:
        beds_detail = f"{beds_above}+{bsmt_beds}卧（地上{beds_above}个，地下室{bsmt_beds}个），{baths}卫"
    elif beds_above is not None:
        beds_detail = f"{beds_above}室{baths}卫"
    else:
        beds_detail = f"{listing_data.get('bed', '?')}室{baths}卫"

    CHARS_PER_PHOTO = 15

    seg_targets = {floor: count * CHARS_PER_PHOTO for floor, count in active_groups}

    seg_lines = "\n".join(
        f"- 【{_FLOOR_ZH[floor]}】{count}张照片，约{seg_targets[floor]}字"
        for floor, count in active_groups
    )

    cover_hints = ""
    if cover_lines:
        hints = [l for l in cover_lines if l and l.strip()]
        if hints:
            cover_hints = f"\n封面关键词（第一段开头自然融入）：{'、'.join(hints)}"

    # Build structured property info from all available fields
    def _section(label, *values):
        parts = [v for v in values if v]
        return f"【{label}】{' / '.join(parts)}" if parts else ""

    info_blocks = []
    if _f("description"):
        info_blocks.append(f"【主要描述】\n{_f('description')}")
    if _f("brokerage_remarks"):
        info_blocks.append(f"【经纪备注】\n{_f('brokerage_remarks')}")
    if _f("features"):
        info_blocks.append(f"【特色】{_f('features')}")
    if _f("interior_features"):
        info_blocks.append(f"【室内特色】{_f('interior_features')}")
    if _f("building_features"):
        info_blocks.append(f"【建筑特色】{_f('building_features')}")
    if _f("included_items"):
        info_blocks.append(f"【包含物品】{_f('included_items')}")
    if _f("exclusions"):
        info_blocks.append(f"【不含物品】{_f('exclusions')}")
    if _f("rental_items"):
        info_blocks.append(f"【租用设备】{_f('rental_items')}")
    if _f("room_info"):
        info_blocks.append(f"【房间详情】{_f('room_info')}")
    if _f("washroom_info"):
        info_blocks.append(f"【洗手间详情】{_f('washroom_info')}")
    s = _section("停车/车库",
        f"车库：{_f('garage_type')}" if _f("garage_type") else "",
        f"{_f('garage_spaces')}个车位" if _f("garage_spaces") else "",
        f"总停车：{_f('parking_total')}" if _f("parking_total") else "",
        f"车道：{_f('drive_type')}" if _f("drive_type") else "",
    )
    if s: info_blocks.append(s)
    s = _section("地块",
        f"地块：{_f('lot_frontage')}" if _f("lot_frontage") else "",
        f"朝向：{_f('fronting_on')}" if _f("fronting_on") else "",
        f"泳池：{_f('pool')}" if _f("pool") else "",
    )
    if s: info_blocks.append(s)
    s = _section("房屋系统",
        f"冷气：{_f('cooling')}" if _f("cooling") else "",
        f"暖气：{_f('heating')}" if _f("heating") else "",
        f"热源：{_f('heating_source')}" if _f("heating_source") else "",
        f"供水：{_f('water')}" if _f("water") else "",
        f"下水：{_f('sewers')}" if _f("sewers") else "",
    )
    if s: info_blocks.append(s)
    s = _section("建材",
        f"外墙：{_f('exterior')}" if _f("exterior") else "",
        f"屋顶：{_f('roof')}" if _f("roof") else "",
        f"地基：{_f('foundation')}" if _f("foundation") else "",
        f"地下室：{_f('basement')}" if _f("basement") else "",
        f"房龄：{_f('approx_age')}" if _f("approx_age") else "",
    )
    if s: info_blocks.append(s)
    s = _section("税务/其他",
        f"税：{_f('taxes')}（{_f('tax_year')}年）" if _f("taxes") else "",
        f"入住：{_f('possession_type')}" if _f("possession_type") else "",
        f"面积（地上）：{_f('above_grade_sqft')} sqft" if _f("above_grade_sqft") else "",
    )
    if s: info_blocks.append(s)
    if _f("special_designations"):
        info_blocks.append(f"【特殊条款】{_f('special_designations')}")

    property_info = "\n".join(info_blocks) or "暂无"

    prompt = f"""你是加拿大华人房产经纪，正在录制小红书看房视频口播。

任务：阅读下方【房源完整信息】，提炼真实卖点，按楼层写旁白。严格基于listing内容，绝不编造任何未提及的设施、特点或评价。

各段目标字数：
{seg_lines}
- 字数不足：在listing已有信息中找更多细节继续展开（具体尺寸、材质、配置、收纳等），绝不补充"欢迎来看房""感兴趣联系我"之类的套话
- 字数超出：保留最有价值的细节，删去泛泛而谈的部分，口语精简

房源：{listing_data.get('neighborhood') or listing_data.get('city', '')}，{prop_style}，{beds_detail}{f'，{sqft} sqft' if sqft else ''}{cover_hints}

===== 房源完整信息 =====
{property_info}
=====

{photo_sequence + chr(10) if photo_sequence else ''}卖点分配参考（严格基于listing已有信息）：
- 主层段：室外外观、车库/停车、地块、入口、客厅、餐厅、厨房、主层卫浴
- 上层段：主卧（面积/walk-in/套浴）、次卧数量和特色、上层卫浴
- 地下室段：地下室类型、地下室卧室、额外空间、户外（如有）
- 学区/税务/交通/入住 → 放最后一段末尾，有才说，没有就不提

写作要求：
- 第一段第一句报基本信息：几室几卫、面积
- 口语自然，像给朋友介绍，不用书面语
- 严格只说listing里实际记载的内容，哪怕字数不够也不能编造
- 禁止任何招客套话：不能写"欢迎来看房""感兴趣可以联系我""期待与您相遇""值不值得来看"等
- 禁止词："大家好""今天带大家""空间宽敞""采光好""布局合理""性价比高""动线""功能分区""坐北朝南""尊贵""奢华""格局"
- 不要提地址、价格、门牌号
- 所有尺寸数字精确到小数点后一位，包括"几乘以几"格式（如 3.5 x 4.2 米、15.0 x 30.0 尺），不要四舍五入成整数

只输出JSON数组，长度={len(active_groups)}，每个元素是对应段落的字符串。"""

    def _call(messages):
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "max_tokens": 3000, "messages": messages},
            timeout=60,
        )
        if not resp.ok:
            return None
        raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        m = _re.search(r'\[.*?\]', raw, _re.DOTALL)
        if not m:
            return None
        try:
            parsed = _json.loads(m.group())
            if isinstance(parsed, list) and len(parsed) == len(active_groups):
                return [str(s) for s in parsed]
        except Exception:
            pass
        return None

    try:
        messages = [{"role": "user", "content": prompt}]
        result = _call(messages)
        if not result:
            return None

        # Retry only if a segment is catastrophically short (< 60% of target)
        catastrophic = [
            i for i in range(len(result))
            if len(result[i]) < seg_targets[active_groups[i][0]] * 0.6
        ]
        if catastrophic:
            feedback = "\n".join(
                f"【{_FLOOR_ZH[active_groups[i][0]]}】要求约{seg_targets[active_groups[i][0]]}字，只写了{len(result[i])}字，请补充"
                for i in catastrophic
            )
            messages += [
                {"role": "assistant", "content": _json.dumps(result, ensure_ascii=False)},
                {"role": "user", "content": f"以下段落内容太少：\n{feedback}\n\n重新输出完整JSON数组。"},
            ]
            retry = _call(messages)
            if retry:
                result = retry

        # Enforce target±20 per segment: trim if over, pad if under
        for i, (floor, _) in enumerate(active_groups):
            target = seg_targets[floor]
            floor_zh = _FLOOR_ZH[floor]
            result[i] = _trim_to_target(result[i], target)
            result[i] = _pad_to_target(result[i], target, api_key=api_key,
                                       context_hint=f"【{floor_zh}】段落")
            result[i] = result[i].replace("动线", "衔接")
            result[i] = _round_dims(result[i])

        return result
    except Exception as e:
        print(f"[XHS] Floor narration generation failed: {e}")
    return None


# ── ffmpeg clip builder ────────────────────────────────────────────────────────

def _probe_dimensions(ffprobe, path):
    r = subprocess.run(
        [ffprobe, "-v", "quiet", "-print_format", "json", "-show_streams", path],
        timeout=60,

        capture_output=True, text=True,
    )
    for stream in json.loads(r.stdout).get("streams", []):
        if "width" in stream and "height" in stream:
            return stream["width"], stream["height"]
    return OUTPUT_W, OUTPUT_H


def _make_clip(ffmpeg, ffprobe, img_path, out_path, reverse=False,
               duration=None, zoom_start=None, zoom_end=None):
    dur = duration if duration is not None else PHOTO_DURATION
    zs  = zoom_start if zoom_start is not None else ZOOM_START
    ze  = zoom_end   if zoom_end   is not None else ZOOM_END
    src_w, src_h = _probe_dimensions(ffprobe, img_path)
    ease = f"(1-cos(PI*t/{dur}))/2"
    if reverse:
        ease = f"(1-({ease}))"
    z = f"({zs}+({ze}-{zs})*({ease}))"
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
            "-loop", "1", "-t", str(dur),
            "-i", img_path,
            "-vf", f"{scale},{crop}",
            "-r", str(FPS),
            "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
            "-pix_fmt", "yuv420p",
            "-threads", "1",
            out_path,
        ],
        timeout=120,

        check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def _concat_clips(ffmpeg, clip_paths, out_path):
    """Concatenate video-only clips (no audio) using ffmpeg concat demuxer."""
    import tempfile as _tf
    list_file = out_path + ".txt"
    try:
        with open(list_file, "w") as f:
            for p in clip_paths:
                f.write(f"file '{p}'\n")
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0",
             "-i", list_file,
             "-c", "copy", out_path],
            timeout=120,

            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return out_path
    except Exception:
        # concat failed — return the original intro clip unchanged
        return clip_paths[-1] if clip_paths else None
    finally:
        try:
            os.unlink(list_file)
        except OSError:
            pass


# ── Job state helpers ──────────────────────────────────────────────────────────

def _job_set(job_id, data):
    _JOBS[job_id] = {**data, "ts": time.time()}
    cb = _JOB_CALLBACKS.get(job_id)
    if cb:
        try:
            cb(job_id, data)
        except Exception:
            pass


def _job_clean():
    now = time.time()
    expired = [k for k, v in list(_JOBS.items()) if now - v.get("ts", 0) > _JOB_TTL]
    for k in expired:
        _JOBS.pop(k, None)


def get_job(job_id):
    return _JOBS.get(job_id)


# ── Main pipeline (runs in background thread) ──────────────────────────────────

def _run_pipeline(job_id, mls_number, agent_id, cover_lines, flask_app, intro_bytes=None,
                  cover_bg_bytes=None, cover_photo_index=0, narration_override=None,
                  external_listing=None, photo_count=30,
                  upper_start=None, basement_start=None):
    """
    external_listing: pre-scraped dict with keys bed, bath, sqft, city, description,
                      style, list_price, images (list[str]), street, mls_number.
                      When provided the DB lookup for MlsListing is skipped entirely.
    """
    if not _GENERATION_LOCK.acquire(blocking=False):
        with flask_app.app_context():
            _job_set(job_id, {"status": "error", "message": "另一个视频正在生成中，完成后会发邮件通知您再来试 / Another video is already generating — you'll get an email when it's done, then try again"})
        return
    with flask_app.app_context():
        tmpdir = None
        try:
            _job_set(job_id, {"status": "processing", "step": "Loading listing..."})

            from app.models.user import User

            agent = User.query.get(agent_id)
            if not agent or not agent.elevenlabs_voice_id:
                _job_set(job_id, {"status": "error", "message": "请先在个人资料页面录制并上传您的声音样本 / Please record your voice sample first in My Profile"})
                return

            minimax_voice_id = agent.elevenlabs_voice_id
            bg_music_url = getattr(agent, 'bg_music_url', None)
            tmpdir = tempfile.mkdtemp(prefix="xhsvid_")

            # ── Step 1: Download photos ────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Downloading photos..."})

            img_dir = os.path.join(tmpdir, "imgs")
            os.makedirs(img_dir, exist_ok=True)

            if external_listing:
                raw_images = external_listing.get("images") or []
            else:
                from app.models.mls_listing import MlsListing
                listing = MlsListing.query.filter_by(mls_number=mls_number).first()
                if not listing:
                    _job_set(job_id, {"status": "error", "message": f"Listing {mls_number} not found"})
                    return
                raw_images = listing.effective_images or []

            n_photos = max(1, int(photo_count)) if photo_count else len(all_images_raw) or 30
            all_images_raw = raw_images
            if len(all_images_raw) == 0:
                image_urls = []
            elif len(all_images_raw) >= n_photos:
                step = len(all_images_raw) / n_photos
                image_urls = [all_images_raw[int(i * step)] for i in range(n_photos)]
            else:
                image_urls = [all_images_raw[i % len(all_images_raw)] for i in range(n_photos)]

            downloaded = []
            for i, url in enumerate(image_urls):
                try:
                    r = requests.get(url, timeout=8, stream=True)
                    if r.ok:
                        ext = url.rsplit(".", 1)[-1].lower().split("?")[0]
                        if ext not in {"jpg", "jpeg", "png", "webp"}:
                            ext = "jpg"
                        path = os.path.join(img_dir, f"{i:04d}.{ext}")
                        with open(path, "wb") as f:
                            for chunk in r.iter_content(chunk_size=65536):
                                f.write(chunk)
                        downloaded.append(path)
                        if len(downloaded) >= n_photos:
                            break
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
            raw_intro = None
            if intro_bytes and len(intro_bytes) > 1000:
                try:
                    raw_intro = os.path.join(tmpdir, "intro_raw.webm")
                    with open(raw_intro, "wb") as f:
                        f.write(intro_bytes)
                    intro_bytes = None  # free memory immediately after writing to disk

                    # Extract + denoise + speed up intro audio to 1.2x
                    _intro_audio_tmp = os.path.join(tmpdir, "intro_audio.aac")
                    subprocess.run(
                        [ffmpeg, "-y", "-i", raw_intro, "-vn",
                         "-af", "highpass=f=80,afftdn=nf=-25,atempo=1.2,loudnorm=I=-6:LRA=7:TP=-0.5",
                         "-c:a", "aac", "-threads", "1", _intro_audio_tmp],
                        timeout=120,

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

            # No intro provided — start directly with photos (no dark cover slide)

            # ── Generate composite cover image (property photo + agent cutout + text)
            # Uploaded to R2 as a separate asset — NOT inserted into the video timeline.
            # The user downloads it and sets it as the XHS thumbnail manually.
            _cover_r2_url = None
            _cover_bg_path = None
            if cover_bg_bytes:
                _cover_bg_path = os.path.join(tmpdir, "cover_bg.jpg")
                with open(_cover_bg_path, "wb") as _f:
                    _f.write(cover_bg_bytes)
            if downloaded or _cover_bg_path:
                comp_png = os.path.join(tmpdir, "composite_cover.png")
                intro_src = raw_intro if raw_intro and os.path.exists(raw_intro) else None
                _idx = min(cover_photo_index, len(downloaded) - 1) if downloaded else 0
                bg_photo = _cover_bg_path if _cover_bg_path else downloaded[_idx]
                ok = _generate_composite_cover(
                    ffmpeg, intro_src, bg_photo,
                    cover_lines[0], cover_lines[1], cover_lines[2],
                    comp_png,
                )
                if ok and os.path.exists(comp_png):
                    try:
                        from app.s3_helpers import _upload_file_obj
                        cover_r2_key = f"xhs-covers/{job_id}.jpg"
                        with open(comp_png, "rb") as _cf:
                            _cover_r2_url = _upload_file_obj(_cf, cover_r2_key, "image/jpeg")
                    except Exception:
                        pass

            def _build_listing_data(src, is_orm=False):
                def g(key):
                    return getattr(src, key, None) if is_orm else src.get(key)
                return {
                    "list_price":          g("list_price"),
                    "bed":                 g("bed"),
                    "bath":                g("bath"),
                    "beds_above_grade":    g("beds_above_grade"),
                    "basement_beds":       g("basement_beds"),
                    "city":                g("city"),
                    "neighborhood":        g("neighborhood"),
                    "description":         g("description"),
                    "brokerage_remarks":   g("brokerage_remarks"),
                    "style":               g("style"),
                    "property_type":       g("property_type"),
                    "sqft":                g("sqft"),
                    "above_grade_sqft":    g("above_grade_sqft"),
                    "rooms":               g("rooms"),
                    "kitchens":            g("kitchens"),
                    "dom":                 g("dom"),
                    # Systems
                    "cooling":             g("cooling"),
                    "heating":             g("heating"),
                    "heating_source":      g("heating_source"),
                    "water":               g("water"),
                    "sewers":              g("sewers"),
                    "pool":                g("pool"),
                    "basement":            g("basement"),
                    "exterior":            g("exterior"),
                    "roof":                g("roof"),
                    "foundation":          g("foundation"),
                    # Parking / lot
                    "parking_total":       g("parking_total"),
                    "garage_type":         g("garage_type"),
                    "garage_spaces":       g("garage_spaces"),
                    "drive_type":          g("drive_type"),
                    "parking_drive_spaces": g("parking_drive_spaces"),
                    "lot_frontage":        g("lot_frontage"),
                    "fronting_on":         g("fronting_on"),
                    "approx_age":          g("approx_age"),
                    # Features / remarks
                    "features":            g("features"),
                    "interior_features":   g("interior_features"),
                    "building_features":   g("building_features"),
                    "included_items":      g("included_items"),
                    "exclusions":          g("exclusions"),
                    "rental_items":        g("rental_items"),
                    "special_designations": g("special_designations"),
                    "room_info":           g("room_info"),
                    "washroom_info":       g("washroom_info"),
                    # Contract
                    "taxes":               g("taxes"),
                    "tax_year":            g("tax_year"),
                    "possession_type":     g("possession_type"),
                    "occupancy":           g("occupancy"),
                }

            if external_listing:
                listing_data = _build_listing_data(external_listing, is_orm=False)
            else:
                listing_data = _build_listing_data(listing, is_orm=True)

            # ── Step 2.5: Classify photos by floor ───────────────────────────────
            segment_audio_info = []  # [(audio_path, duration, [img_paths])]
            use_segments = False

            # narration_override from the preview step uses "---" as segment separator
            _SEG_SEP = "---"
            override_segments = None
            if narration_override and _SEG_SEP in narration_override:
                # Strip 【floor】 labels the preview adds, keep only the narration text
                import re as _re
                raw_segs = [s.strip() for s in narration_override.split(_SEG_SEP) if s.strip()]
                override_segments = [_re.sub(r'^【[^】]*】\s*', '', s).strip() for s in raw_segs]

            if override_segments and downloaded:
                n_segs = len(override_segments)
                n_dl   = len(downloaded)
                # Prefer floor-break boundaries (upper_start / basement_start)
                boundaries = None
                if upper_start:
                    us = upper_start - 1  # 0-indexed start of upper floor
                    if basement_start and n_segs == 3:
                        bs = basement_start - 1
                        boundaries = [(0, us), (us, bs), (bs, n_dl)]
                    elif not basement_start and n_segs == 2:
                        boundaries = [(0, us), (us, n_dl)]
                _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
                from app.services.elevenlabs_service import generate_speech
                for k, seg_text in enumerate(override_segments):
                    if boundaries:
                        start, end = boundaries[k]
                    else:
                        chunk = len(downloaded) / n_segs
                        start = int(k * chunk)
                        end   = int((k + 1) * chunk) if k < n_segs - 1 else len(downloaded)
                    photos = downloaded[start:end] or downloaded[-1:]
                    audio_bytes = generate_speech(seg_text, fish_voice_id=minimax_voice_id)
                    seg_path = os.path.join(tmpdir, f"narration_seg{k}.mp3")
                    with open(seg_path, "wb") as f:
                        f.write(audio_bytes)
                    try:
                        seg_dur = float(subprocess.run(
                            [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
                             "-of", "default=noprint_wrappers=1:nokey=1", seg_path],
                            timeout=60, capture_output=True, text=True,
                        ).stdout.strip())
                    except Exception:
                        seg_dur = 3.0 * len(photos)
                    segment_audio_info.append((seg_path, seg_dur, photos))
                use_segments = True

            elif not narration_override and downloaded:
                _job_set(job_id, {"status": "processing", "step": "Classifying photos..."})
                deepseek_key = os.environ.get("DEEPSEEK_API_KEY", "")
                floor_labels = _classify_photos_by_floor(downloaded, deepseek_key)

                from collections import defaultdict
                floor_buckets = defaultdict(list)
                for path, label in zip(downloaded, floor_labels):
                    floor_buckets[label].append(path)
                active_groups = [(fl, floor_buckets[fl]) for fl in _FLOOR_ORDER if floor_buckets.get(fl)]

                # Merge exterior + main_floor into one continuous segment
                ext   = next((p for fl, p in active_groups if fl == "exterior"),   [])
                main  = next((p for fl, p in active_groups if fl == "main_floor"), [])
                rest  = [(fl, p) for fl, p in active_groups if fl not in ("exterior", "main_floor")]
                if ext or main:
                    active_groups = [("exterior_main", ext + main)] + rest

                # ── Step 3: Per-floor narration ────────────────────────────────
                _job_set(job_id, {"status": "processing", "step": "Writing narration..."})
                photo_seq, _ = _build_photo_sequence_hint(downloaded, deepseek_key)
                floor_texts = _generate_floor_narrations(
                    listing_data,
                    [(fl, len(photos)) for fl, photos in active_groups],
                    cover_lines=cover_lines,
                    photo_sequence=photo_seq,
                )

                if floor_texts:
                    _UPPER_CTA = "喜欢这套房，点赞关注我，或私信定制你的专属找房方案。"
                    _BASEMENT_CTA = "打算卖房，联系我，用小红书爆款视频，把你的房子送上全网热门。"
                    for _i, (_fl, _) in enumerate([(fl, p) for fl, p in active_groups]):
                        if _fl == "upper_floor":
                            floor_texts[_i] += _UPPER_CTA
                        elif _fl == "basement":
                            floor_texts[_i] += _BASEMENT_CTA
                    # ── Step 4: Per-floor TTS ──────────────────────────────────
                    _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
                    from app.services.elevenlabs_service import generate_speech
                    for (fl, photos), seg_text in zip(active_groups, floor_texts):
                        audio_bytes = generate_speech(seg_text, fish_voice_id=minimax_voice_id)
                        seg_path = os.path.join(tmpdir, f"narration_{fl}.mp3")
                        with open(seg_path, "wb") as f:
                            f.write(audio_bytes)
                        try:
                            dur_r = subprocess.run(
                                [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
                                 "-of", "default=noprint_wrappers=1:nokey=1", seg_path],
                                timeout=60, capture_output=True, text=True,
                            )
                            seg_dur = float(dur_r.stdout.strip())
                        except Exception:
                            seg_dur = 3.0 * len(photos)
                        segment_audio_info.append((seg_path, seg_dur, photos))
                    use_segments = True

            # ── Step 3 fallback: single narration ─────────────────────────────
            if not use_segments:
                _job_set(job_id, {"status": "processing", "step": "Writing narration..."})
                narration = narration_override or _generate_narration(listing_data, cover_lines=cover_lines, photo_count=n_photos)
                if not narration:
                    city = listing.city or "多伦多"
                    bed = listing.bed or "?"
                    bath = listing.bath or "?"
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
                narration = narration + "如果你觉得我挑的房子不错，记得点赞订阅，或者找我定制私人找房服务。"
                _job_set(job_id, {"status": "processing", "step": "Generating voiceover..."})
                from app.services.elevenlabs_service import generate_speech
                audio_bytes = generate_speech(narration, fish_voice_id=minimax_voice_id)
                audio_path = os.path.join(tmpdir, "narration.mp3")
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)
                try:
                    narr_dur = float(subprocess.run(
                        [ffprobe, "-v", "quiet", "-show_entries", "format=duration",
                         "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
                        timeout=60, capture_output=True, text=True,
                    ).stdout.strip())
                except Exception:
                    narr_dur = 0.0
                segment_audio_info = [(audio_path, narr_dur, downloaded)]

            # ── Step 5: Render video ──────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Rendering video..."})

            clip_paths = []
            if intro_clip_path and os.path.exists(intro_clip_path):
                clip_paths.append(intro_clip_path)

            photo_idx = 0
            for (seg_audio_path, seg_dur, seg_photos) in segment_audio_info:
                # Every photo is exactly PHOTO_DURATION (3 s) — no exceptions.
                # Audio shorter than n×3 s plays out then the video continues in silence;
                # audio longer than n×3 s gets cut off at the video end. Never skip photos.
                kept = seg_photos
                clip_dur = PHOTO_DURATION
                discarded = []

                for img_path in kept:
                    clip_path = os.path.join(clips_dir, f"clip_{photo_idx:04d}.mp4")
                    _make_clip(ffmpeg, ffprobe, img_path, clip_path,
                               duration=clip_dur, reverse=(photo_idx % 2 == 1))
                    clip_paths.append(clip_path)
                    photo_idx += 1

                for img_path in (kept + discarded):
                    try:
                        os.remove(img_path)
                    except OSError:
                        pass

            # Build combined narration audio from all segments
            if use_segments and len(segment_audio_info) > 1:
                concat_inputs = []
                for seg_path, _, _ in segment_audio_info:
                    concat_inputs.extend(["-i", seg_path])
                narr_concat_path = os.path.join(tmpdir, "narration_all.aac")
                n_segs = len(segment_audio_info)
                subprocess.run(
                    [ffmpeg, "-y"] + concat_inputs + [
                        "-filter_complex",
                        "".join(f"[{k}:a]" for k in range(n_segs)) + f"concat=n={n_segs}:v=0:a=1[outa]",
                        "-map", "[outa]", "-c:a", "aac", "-threads", "1", narr_concat_path,
                    ],
                    timeout=120, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                audio_path = narr_concat_path
            else:
                audio_path = segment_audio_info[0][0]
            narr_dur = sum(d for _, d, _ in segment_audio_info)

            # Team photo clip (3 s, before outro)
            if os.path.exists(_TEAM_PHOTO_PATH):
                team_clip = os.path.join(clips_dir, "clip_team.mp4")
                _make_clip(ffmpeg, ffprobe, _TEAM_PHOTO_PATH, team_clip,
                           duration=_TEAM_PHOTO_DURATION, zoom_start=1.0, zoom_end=1.0)
                clip_paths.append(team_clip)

            # Outro clip — extend if narration audio overruns the photo clips
            # so the CTA lines play out fully over the tail image.
            _total_photo_dur = sum(PHOTO_DURATION * len(p) for _, _, p in segment_audio_info)
            _team_dur = _TEAM_PHOTO_DURATION if os.path.exists(_TEAM_PHOTO_PATH) else 0.0
            _outro_dur = max(OUTRO_DURATION, narr_dur - _total_photo_dur - _team_dur + 1.0)

            if os.path.exists(_OUTRO_PATH):
                outro_clip = os.path.join(clips_dir, "clip_outro.mp4")
                subprocess.run(
                    [ffmpeg, "-y", "-loop", "1", "-i", _OUTRO_PATH,
                     "-t", str(_outro_dur),
                     "-vf", (f"scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease,"
                             f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:black"),
                     "-c:v", "libx264", "-crf", str(CRF), "-preset", PRESET,
                     "-r", str(FPS), "-pix_fmt", "yuv420p", "-threads", "1", outro_clip],
                    timeout=120,

                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                clip_paths.append(outro_clip)

            list_file = os.path.join(tmpdir, "clips.txt")
            with open(list_file, "w", encoding="utf-8") as f:
                for cp in clip_paths:
                    f.write(f"file '{cp}'\n")

            silent_path = os.path.join(tmpdir, "silent.mp4")
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", silent_path],
                timeout=120,

                check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

            for cp in clip_paths:
                try:
                    os.remove(cp)
                except OSError:
                    pass

            # ── Step 6: Mix audio ─────────────────────────────────────────────
            _job_set(job_id, {"status": "processing", "step": "Mixing audio..."})

            final_audio_path = audio_path
            if intro_audio_path:
                try:
                    combined_audio_path = os.path.join(tmpdir, "combined_audio.aac")
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
                        timeout=120,

                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
                    final_audio_path = combined_audio_path
                except Exception:
                    final_audio_path = audio_path

            # Pad audio with silence so all photos + team photo + outro play fully.
            # whole_dur=600 ensures audio is always longer than the video; -shortest
            # in the final mux trims it to exact video length.
            # When there's no intro video, prepend 0.8 s of silence so the first
            # sentence isn't heard before the viewer has settled.
            lead_silence = "" if intro_audio_path else "adelay=800|800,"
            padded_audio_path = os.path.join(tmpdir, "padded_audio.aac")
            try:
                subprocess.run(
                    [ffmpeg, "-y", "-i", final_audio_path,
                     "-af", f"{lead_silence}loudnorm=I=-6:LRA=7:TP=-0.5,apad=whole_dur=600",
                     "-c:a", "aac", "-threads", "1", padded_audio_path],
                    timeout=120,

                    check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                final_audio_path = padded_audio_path
            except Exception:
                pass

            # ── Mix background music (low volume under voice) ─────────────────
            if bg_music_url:
                try:
                    bg_ext = bg_music_url.rsplit('.', 1)[-1].lower().split('?')[0]
                    if bg_ext not in {'mp3', 'wav', 'm4a', 'aac', 'ogg'}:
                        bg_ext = 'mp3'
                    bg_path = os.path.join(tmpdir, f"bgmusic.{bg_ext}")
                    r = requests.get(bg_music_url, timeout=15, stream=True)
                    if r.ok:
                        with open(bg_path, "wb") as _f:
                            for chunk in r.iter_content(65536):
                                _f.write(chunk)
                        mixed_path = os.path.join(tmpdir, "mixed_audio.aac")
                        # Loop music to 600s, duck it to -22dB under voice
                        subprocess.run(
                            [ffmpeg, "-y",
                             "-i", final_audio_path,
                             "-stream_loop", "-1", "-i", bg_path,
                             "-filter_complex",
                             "[1:a]volume=0.12,apad=whole_dur=600[bg];"
                             "[0:a][bg]amix=inputs=2:duration=first:dropout_transition=3[outa]",
                             "-map", "[outa]", "-c:a", "aac", "-threads", "1", mixed_path],
                            timeout=120, check=True,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        )
                        final_audio_path = mixed_path
                except Exception as _e:
                    print(f"[XHS] BG music mix failed (non-fatal): {_e}")

            final_path = os.path.join(tmpdir, "final.mp4")

            _job_set(job_id, {"status": "processing", "step": "Rendering final video..."})
            subprocess.run(
                [ffmpeg, "-y",
                 "-i", silent_path, "-i", final_audio_path,
                 "-map", "0:v:0", "-map", "1:a:0",
                 "-c:v", "copy", "-c:a", "aac", "-shortest", final_path],
                timeout=120,

                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
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

            done_payload = {"status": "done", "url": video_url, "expires_at": expires_at}
            if _cover_r2_url:
                done_payload["cover_url"] = _cover_r2_url
            _job_set(job_id, done_payload)

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
            unregister_job_callback(job_id)


def start_video_job(mls_number, agent_id, cover_lines, flask_app, intro_bytes=None,
                    cover_bg_bytes=None, cover_photo_index=0, narration_override=None,
                    external_listing=None, photo_count=30,
                    upper_start=None, basement_start=None):
    """Start background video generation. Returns job_id."""
    _job_clean()
    job_id = uuid.uuid4().hex
    _job_set(job_id, {"status": "processing", "step": "Starting..."})
    t = threading.Thread(
        target=_run_pipeline,
        args=(job_id, mls_number, agent_id, cover_lines, flask_app),
        kwargs={"intro_bytes": intro_bytes, "cover_bg_bytes": cover_bg_bytes,
                "cover_photo_index": cover_photo_index,
                "narration_override": narration_override,
                "external_listing": external_listing,
                "photo_count": photo_count,
                "upper_start": upper_start,
                "basement_start": basement_start},
        daemon=True,
    )
    t.start()
    return job_id
