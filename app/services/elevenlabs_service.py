"""
Voice clone via Fish Audio (https://fish.audio).
TTS: Fish Audio if balance available, else edge-tts (Microsoft neural, free).
"""
import io
import os
import ormsgpack
import requests

_BASE = "https://api.fish.audio"


def _key():
    return os.environ.get("FISH_AUDIO_API_KEY", "")


def create_voice_clone(name, audio_bytes, content_type="audio/webm"):
    """Upload an audio sample and create a Fish Audio voice model. Returns model _id."""
    api_key = _key()
    if not api_key:
        raise RuntimeError("FISH_AUDIO_API_KEY not configured")

    resp = requests.post(
        f"{_BASE}/model",
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
    """Delete a Fish Audio voice model (best-effort)."""
    api_key = _key()
    if not api_key or not voice_id:
        return
    try:
        requests.delete(
            f"{_BASE}/model/{voice_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
    except Exception:
        pass


def _cosyvoice_tts(text, voice="longxiaochun"):
    """CosyVoice 2.0 via Aliyun DashScope — free quota, high-quality Mandarin."""
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY not configured")
    resp = requests.post(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audiox/generation",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-SSE": "disable",
        },
        json={
            "model": "cosyvoice-v2",
            "input": {"text": text},
            "parameters": {"voice": voice, "format": "mp3", "sample_rate": 22050},
        },
        timeout=60,
    )
    if not resp.ok:
        raise RuntimeError(f"CosyVoice TTS failed ({resp.status_code}): {resp.text[:300]}")
    # Response is binary MP3 when SSE disabled
    if resp.headers.get("Content-Type", "").startswith("audio/"):
        return resp.content
    import base64
    return base64.b64decode(resp.json()["output"]["audio"])


def generate_speech(voice_id, text):
    """Generate Chinese speech.
    Uses Fish Audio cloned voice if funded, else CosyVoice 2.0 preset voice.
    """
    fish_key = _key()

    if fish_key and voice_id:
        payload = ormsgpack.packb({
            "text": text,
            "reference_id": voice_id,
            "format": "mp3",
            "mp3_bitrate": 128,
            "normalize": True,
            "latency": "normal",
        })
        resp = requests.post(
            f"{_BASE}/v1/tts",
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
        # 402 = no balance → fall through to CosyVoice

    return _cosyvoice_tts(text)
