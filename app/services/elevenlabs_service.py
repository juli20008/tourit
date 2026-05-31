"""
TTS pipeline:
1. CosyVoice 2.0 zero-shot clone  — agent's recorded voice + DashScope (primary)
2. Fish Audio cloned voice         — if agent has Fish Audio voice_id with balance
3. CosyVoice 2.0 preset voice      — fallback if no voice sample available
"""
import base64
import io
import os
import ormsgpack
import requests

_FISH_BASE = "https://api.fish.audio"


# ── Fish Audio voice clone (create / delete only — TTS is secondary) ──────────

def create_voice_clone(name, audio_bytes, content_type="audio/webm"):
    """Upload audio to Fish Audio and return model _id (used as backup TTS)."""
    api_key = os.environ.get("FISH_AUDIO_API_KEY", "")
    if not api_key:
        raise RuntimeError("FISH_AUDIO_API_KEY not configured")
    resp = requests.post(
        f"{_FISH_BASE}/model",
        headers={"Authorization": f"Bearer {api_key}"},
        data={
            "title": name,
            "visibility": "private",
            "type": "tts",
            "train_mode": "fast",
            "enhance_audio_quality": "true",
        },
        files={"voices": ("voice_sample.webm", audio_bytes, content_type)},
        timeout=90,
    )
    if not resp.ok:
        raise RuntimeError(f"Fish Audio clone failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["_id"]


def delete_voice(voice_id):
    api_key = os.environ.get("FISH_AUDIO_API_KEY", "")
    if not api_key or not voice_id:
        return
    try:
        requests.delete(
            f"{_FISH_BASE}/model/{voice_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
    except Exception:
        pass


# ── CosyVoice 2.0 (primary TTS) ───────────────────────────────────────────────

def _cosyvoice_tts(text, voice_sample_path=None, preset_voice="longxiaochun"):
    """
    CosyVoice 2.0 TTS via DashScope.
    - voice_sample_path: path to agent's recorded MP3/WAV → zero-shot voice clone
    - preset_voice: used only when no voice sample is provided
    """
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY not configured")

    input_data = {"text": text}
    params = {"format": "mp3", "sample_rate": 22050}

    if voice_sample_path and os.path.exists(voice_sample_path):
        with open(voice_sample_path, "rb") as f:
            input_data["prompt_audio"] = base64.b64encode(f.read()).decode()
        # Zero-shot clone — no preset voice needed
    else:
        params["voice"] = preset_voice

    resp = requests.post(
        "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text2audiox/generation",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-SSE": "disable",
        },
        json={"model": os.environ.get("DASHSCOPE_TTS_MODEL", "cosyvoice-v1"), "input": input_data, "parameters": params},
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"CosyVoice TTS failed ({resp.status_code}): {resp.text[:300]}")
    if resp.headers.get("Content-Type", "").startswith("audio/"):
        return resp.content
    return base64.b64decode(resp.json()["output"]["audio"])


# ── Public entry point ─────────────────────────────────────────────────────────

def generate_speech(text, voice_sample_path=None, fish_voice_id=None):
    """
    Generate Chinese speech for XHS video narration.

    Priority:
    1. CosyVoice 2.0 zero-shot clone  (agent's voice sample → best quality)
    2. Fish Audio cloned voice         (if fish_voice_id set and account has balance)
    3. CosyVoice 2.0 preset voice      (no sample available)
    """
    # 1. CosyVoice zero-shot — agent's own voice
    if voice_sample_path and os.path.exists(voice_sample_path):
        return _cosyvoice_tts(text, voice_sample_path=voice_sample_path)

    # 2. Fish Audio cloned voice (backup)
    fish_key = os.environ.get("FISH_AUDIO_API_KEY", "")
    if fish_key and fish_voice_id:
        payload = ormsgpack.packb({
            "text": text,
            "reference_id": fish_voice_id,
            "format": "mp3",
            "mp3_bitrate": 128,
            "normalize": True,
            "latency": "normal",
        })
        resp = requests.post(
            f"{_FISH_BASE}/v1/tts",
            data=payload,
            headers={
                "Authorization": f"Bearer {fish_key}",
                "Content-Type": "application/msgpack",
            },
            timeout=120,
        )
        if resp.ok:
            return resp.content
        if resp.status_code != 402:
            raise RuntimeError(f"Fish Audio TTS failed ({resp.status_code}): {resp.text[:300]}")

    # 3. CosyVoice preset voice
    return _cosyvoice_tts(text)
