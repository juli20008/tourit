"""
Voice clone + TTS via Fish Audio (https://fish.audio).
Keeps the same function signatures as the original ElevenLabs version.
"""
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


def generate_speech(voice_id, text):
    """Generate Chinese speech from text using the cloned voice. Returns MP3 bytes."""
    api_key = _key()
    if not api_key:
        raise RuntimeError("FISH_AUDIO_API_KEY not configured")

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
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/msgpack",
        },
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"Fish Audio TTS failed ({resp.status_code}): {resp.text[:300]}")
    return resp.content
