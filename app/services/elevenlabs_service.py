"""
TTS pipeline — MiniMax international API (api.minimax.io):
1. MiniMax TTS with cloned voice  — if agent has a stored voice_id
2. MiniMax TTS with preset voice  — fallback (no clone available)

Voice clone creation is a 2-step process:
  a) Upload audio file  → file_id
  b) POST /v1/voice_clone with file_id → voice_id (stored in users.elevenlabs_voice_id)
"""
import os
import re
import subprocess
import tempfile
import uuid
import requests


def _normalize_for_tts(text: str) -> str:
    """Expand currency/number shorthands so MiniMax reads them correctly in Chinese."""
    # $X.XXM or $XM → "X.XX million 加元"   e.g. $1.07M → 1.07 million 加元
    text = re.sub(r'\$(\d+\.?\d*)\s*[Mm]\b', r'\1 million 加元', text)
    # X.XXM or XM (no $) → "X.XX million"   e.g. 2.3M → 2.3 million
    text = re.sub(r'\b(\d+\.?\d+)\s*[Mm]\b', r'\1 million', text)
    # $X,XXX,XXX or $XXX,XXX → convert to million/万 + 加元
    def _fmt(m):
        n = float(m.group(1).replace(',', ''))
        if n >= 1_000_000:
            s = f"{n / 1_000_000:.2f}".rstrip('0').rstrip('.')
            return f"{s} million 加元"
        if n >= 10_000:
            s = f"{n / 10_000:.1f}".rstrip('0').rstrip('.')
            return f"{s}万加元"
        return f"{m.group(1).replace(',', '')}加元"
    text = re.sub(r'\$([\d,]+)', _fmt, text)
    # Any remaining bare $
    text = text.replace('$', '加元')
    return text

_MINIMAX_BASE = os.environ.get("MINIMAX_BASE_URL", "https://api.minimax.io")

_MINIMAX_SUPPORTED_EXTS = {"mp3", "wav", "m4a"}


def _to_mp3(audio_bytes):
    """Convert audio bytes to mp3 using ffmpeg (handles webm/ogg/etc)."""
    import shutil
    ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
    with tempfile.NamedTemporaryFile(suffix=".input", delete=False) as src:
        src.write(audio_bytes)
        src_path = src.name
    dst_path = src_path + ".mp3"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", src_path, "-ar", "22050", "-ac", "1", "-b:a", "128k", dst_path],
            check=True, capture_output=True,
        )
        with open(dst_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(src_path)
        if os.path.exists(dst_path):
            os.unlink(dst_path)


def _auth_headers(json_body=False):
    h = {"Authorization": f"Bearer {os.environ.get('MINIMAX_API_KEY', '')}"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


# ── Voice clone (create / delete) ──────────────────────────────────────────────

def create_voice_clone(name, audio_bytes, content_type="audio/webm"):
    """
    Upload agent's voice sample to MiniMax and create a rapid voice clone.
    Returns voice_id (stored in users.elevenlabs_voice_id).
    Billing: $1.5 charged on first TTS generation with this voice.
    """
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key:
        raise RuntimeError("MINIMAX_API_KEY not configured")

    ext_map = {
        "audio/mp3": "mp3", "audio/mpeg": "mp3",
        "audio/wav": "wav", "audio/x-wav": "wav",
        "audio/m4a": "m4a", "audio/mp4": "m4a",
    }
    ext = ext_map.get(content_type.split(";")[0].strip())

    # MiniMax only accepts mp3/wav/m4a — convert anything else (webm, ogg, etc.)
    if ext not in _MINIMAX_SUPPORTED_EXTS:
        audio_bytes = _to_mp3(audio_bytes)
        ext = "mp3"
        content_type = "audio/mpeg"

    # Step 1 — upload audio
    upload_resp = requests.post(
        f"{_MINIMAX_BASE}/v1/files/upload",
        headers=_auth_headers(),
        files={"file": (f"voice_sample.{ext}", audio_bytes, content_type)},
        data={"purpose": "voice_clone"},
        timeout=60,
    )
    if not upload_resp.ok:
        raise RuntimeError(
            f"MiniMax upload failed ({upload_resp.status_code}): {upload_resp.text[:300]}"
        )
    up = upload_resp.json()
    if up.get("base_resp", {}).get("status_code", 0) != 0:
        raise RuntimeError(f"MiniMax upload error: {up['base_resp'].get('status_msg')}")
    file_id = up["file"]["file_id"]

    # Step 2 — create voice clone
    voice_id = f"tourit_{uuid.uuid4().hex[:16]}"
    model = os.environ.get("MINIMAX_TTS_MODEL", "speech-02-hd")
    clone_resp = requests.post(
        f"{_MINIMAX_BASE}/v1/voice_clone",
        headers=_auth_headers(json_body=True),
        json={
            "file_id": file_id,
            "voice_id": voice_id,
            "model": model,
            "text": "你好，我是您的专属经纪人，欢迎预约看房。",
        },
        timeout=90,
    )
    if not clone_resp.ok:
        raise RuntimeError(
            f"MiniMax voice clone failed ({clone_resp.status_code}): {clone_resp.text[:300]}"
        )
    cl = clone_resp.json()
    if cl.get("base_resp", {}).get("status_code", 0) != 0:
        raise RuntimeError(f"MiniMax clone error: {cl['base_resp'].get('status_msg')}")

    return cl.get("voice_id", voice_id)


def delete_voice(voice_id):
    """Delete a MiniMax cloned voice (best-effort, no hard failure)."""
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key or not voice_id:
        return
    try:
        requests.delete(
            f"{_MINIMAX_BASE}/v1/voices/{voice_id}",
            headers=_auth_headers(),
            timeout=10,
        )
    except Exception:
        pass


# ── MiniMax TTS ────────────────────────────────────────────────────────────────

def _minimax_tts(text, voice_id=None):
    """
    MiniMax T2A v2 sync HTTP.
    voice_id: cloned agent voice; falls back to MINIMAX_VOICE_ID preset if None.
    Returns MP3 bytes.
    """
    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key:
        raise RuntimeError("MINIMAX_API_KEY not configured")

    model  = os.environ.get("MINIMAX_TTS_MODEL", "speech-02-hd")
    preset = os.environ.get("MINIMAX_VOICE_ID", "male-qn-jingying")
    speed  = float(os.environ.get("MINIMAX_TTS_SPEED", "1.2"))

    resp = requests.post(
        f"{_MINIMAX_BASE}/v1/t2a_v2",
        headers=_auth_headers(json_body=True),
        json={
            "model": model,
            "text": text,
            "stream": False,
            "language_boost": "auto",
            "voice_setting": {
                "voice_id": voice_id or preset,
                "speed": speed,
                "vol": 1.0,
                "pitch": 0,
            },
            "audio_setting": {
                "audio_sample_rate": 32000,
                "bitrate": 128000,
                "format": "mp3",
                "channel": 1,
            },
        },
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"MiniMax TTS failed ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    if data.get("base_resp", {}).get("status_code", 0) != 0:
        raise RuntimeError(f"MiniMax TTS error: {data['base_resp'].get('status_msg')}")

    audio_hex = data.get("data", {}).get("audio", "")
    if not audio_hex:
        raise RuntimeError("MiniMax TTS returned no audio data")
    return bytes.fromhex(audio_hex)


# ── Public entry point ─────────────────────────────────────────────────────────

def generate_speech(text, voice_sample_path=None, fish_voice_id=None):
    """
    Generate Chinese speech for XHS video narration.

    Priority:
    1. MiniMax TTS with agent's cloned voice  (fish_voice_id = MiniMax voice_id)
    2. MiniMax TTS with preset Chinese voice  (no clone available)
    """
    return _minimax_tts(_normalize_for_tts(text), voice_id=fish_voice_id or None)
