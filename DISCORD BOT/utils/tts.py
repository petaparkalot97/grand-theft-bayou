import os
import json
import asyncio
import urllib.parse
import aiohttp
import random
from io import BytesIO
from typing import Optional

# Fish Audio voice for Lisa. Without a reference_id the API uses its stock
# voice — which is male. This one is "Anime Girl Voice": English, female,
# young, "expressive and slightly defiant... clear and energetic... sassy".
# Change it live with /voice (or the Voice model button on /lisa); that writes
# data/lisa_voice.json. FISH_AUDIO_REFERENCE_ID in .env is a fallback default.
DEFAULT_FISH_VOICE_ID = "7e63bf5f79cc40b58383a1eae28f71c4"
DEFAULT_FISH_VOICE_TITLE = "Anime Girl Voice"
DEFAULT_FISH_MODEL = "s2.1-pro-free"

VOICE_FILE = os.path.join("data", "lisa_voice.json")
FAVORITES_FILE = os.path.join("data", "lisa_favorite_voices.json")
USAGE_FILE = os.path.join("data", "voice_usage.json")
USER_VOICE_FILE = os.path.join("data", "user_voice_setup.json")
_TTS_URL = "https://api.fish.audio/v1/tts"
_MODEL_URL = "https://api.fish.audio/model"


def get_favorite_voices() -> list:
    """Load favorite voices list from data/lisa_favorite_voices.json."""
    if os.path.exists(FAVORITES_FILE):
        try:
            with open(FAVORITES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            print(f"[TTS] error loading favorite voices: {e}")
    # Default initial favorites
    return [
        {"id": DEFAULT_FISH_VOICE_ID, "title": DEFAULT_FISH_VOICE_TITLE, "languages": ["en"], "tags": ["default", "fave"]}
    ]


def add_favorite_voice(reference_id: str, title: str = None) -> bool:
    """Add a voice to the favorites list."""
    if not reference_id:
        return False
    favs = get_favorite_voices()
    rid = reference_id.strip()
    for f in favs:
        if f.get("id") == rid:
            return False
    favs.append({
        "id": rid,
        "title": (title or "Custom Voice").strip()[:100],
        "languages": ["en"],
        "tags": ["favorite"]
    })
    try:
        os.makedirs(os.path.dirname(FAVORITES_FILE) or ".", exist_ok=True)
        with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
            json.dump(favs, f, indent=2)
        return True
    except Exception as e:
        print(f"[TTS] error saving favorite voice: {e}")
        return False


def remove_favorite_voice(reference_id: str) -> bool:
    """Remove a voice from the favorites list."""
    if not reference_id:
        return False
    favs = get_favorite_voices()
    rid = reference_id.strip()
    new_favs = [f for f in favs if f.get("id") != rid]
    if len(new_favs) == len(favs):
        return False
    try:
        os.makedirs(os.path.dirname(FAVORITES_FILE) or ".", exist_ok=True)
        with open(FAVORITES_FILE, "w", encoding="utf-8") as f:
            json.dump(new_favs, f, indent=2)
        return True
    except Exception as e:
        print(f"[TTS] error removing favorite voice: {e}")
        return False


def _api_key() -> Optional[str]:
    key = (
        os.getenv("FISH_AUDIO_API")
        or os.getenv("FISH_AUDIO_API_KEY")
        or os.getenv("FISH_API_KEY")
    )
    return key.strip() if key else None


def get_voice() -> dict:
    """The voice to use right now: {'reference_id', 'title', 'model',
    'random_faves'}. data/lisa_voice.json wins; then env; then the baked-in
    default. Whatever this returns IS the active character — full personality
    immersion, not just the TTS voice (see cogs/lisa.py `_character_prompt`)."""
    ref = title = model = None
    random_faves = False
    try:
        if os.path.exists(VOICE_FILE):
            with open(VOICE_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
            ref = (d.get("reference_id") or "").strip() or None
            title = d.get("title") or None
            model = (d.get("model") or "").strip() or None
            random_faves = bool(d.get("random_faves", False))
    except Exception as e:
        print(f"[TTS] voice file read error: {e}")

    if random_faves:
        favs = get_favorite_voices()
        if favs:
            chosen = random.choice(favs)
            return {
                "reference_id": chosen.get("id") or DEFAULT_FISH_VOICE_ID,
                "title": f"🎲 {chosen.get('title') or 'Random Fave'}",
                "model": model or DEFAULT_FISH_MODEL,
                "random_faves": True,
            }

    if not ref:
        ref = (
            os.getenv("FISH_AUDIO_REFERENCE_ID")
            or os.getenv("FISH_AUDIO_VOICE_ID")
            or DEFAULT_FISH_VOICE_ID
        ).strip()
        title = title or DEFAULT_FISH_VOICE_TITLE
    if not model:
        model = os.getenv("FISH_AUDIO_MODEL", DEFAULT_FISH_MODEL).strip()
    return {"reference_id": ref, "title": title or "custom voice", "model": model,
            "random_faves": False}


def set_voice(reference_id: str, title: str = None, model: str = None) -> dict:
    """Persist the active voice/character to data/lisa_voice.json. Returns the
    new setting."""
    cur = get_voice()
    data = {
        "reference_id": (reference_id or "").strip() or DEFAULT_FISH_VOICE_ID,
        "title": (title or cur.get("title") or "custom voice").strip()[:120],
        "model": (model or cur.get("model") or DEFAULT_FISH_MODEL).strip(),
        "random_faves": False,
        "voice_configured": True,
    }
    try:
        os.makedirs(os.path.dirname(VOICE_FILE) or ".", exist_ok=True)
        with open(VOICE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[TTS] voice file write error: {e}")
    return data


def has_configured_voice(user_id=None) -> bool:
    """Return True once a user has explicitly selected a voice."""
    if user_id is not None:
        try:
            if os.path.exists(USER_VOICE_FILE):
                with open(USER_VOICE_FILE, "r", encoding="utf-8") as f:
                    return str(user_id) in json.load(f)
        except Exception:
            pass
        return False
    try:
        if os.path.exists(VOICE_FILE):
            with open(VOICE_FILE, "r", encoding="utf-8") as f:
                return bool(json.load(f).get("voice_configured", True))
    except Exception:
        pass
    return False


def mark_voice_configured(user_id) -> None:
    configured = {}
    try:
        if os.path.exists(USER_VOICE_FILE):
            with open(USER_VOICE_FILE, "r", encoding="utf-8") as f:
                configured = json.load(f)
    except Exception:
        configured = {}
    configured[str(user_id)] = True
    try:
        os.makedirs(os.path.dirname(USER_VOICE_FILE) or ".", exist_ok=True)
        with open(USER_VOICE_FILE, "w", encoding="utf-8") as f:
            json.dump(configured, f, indent=2)
    except Exception as e:
        print(f"[TTS] user setup save error: {e}")


def record_voice_use(reference_id: str, title: str = "custom voice", threshold: int = 10) -> bool:
    """Count a voice use and auto-favorite it at the threshold.

    Returns True only when this call newly adds the voice to favorites.
    """
    rid = (reference_id or "").strip()
    if not rid:
        return False
    counts = {}
    try:
        if os.path.exists(USAGE_FILE):
            with open(USAGE_FILE, "r", encoding="utf-8") as f:
                counts = json.load(f)
    except Exception:
        counts = {}
    counts[rid] = int(counts.get(rid, 0)) + 1
    try:
        os.makedirs(os.path.dirname(USAGE_FILE) or ".", exist_ok=True)
        with open(USAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(counts, f, indent=2)
    except Exception as e:
        print(f"[TTS] usage save error: {e}")
    if counts[rid] < threshold or any(f.get("id") == rid for f in get_favorite_voices()):
        return False
    return add_favorite_voice(rid, title)


def toggle_random_faves() -> bool:
    """Toggle random faves mode on/off. While ON, every message can be a
    different favorite character (get_voice() re-rolls each call); the
    Discord avatar stays on the saved default (see utils/avatar.py) since it
    can't follow a per-message character."""
    cur_ref = None
    cur_title = None
    cur_model = None
    state = False
    try:
        if os.path.exists(VOICE_FILE):
            with open(VOICE_FILE, "r", encoding="utf-8") as f:
                d = json.load(f)
            cur_ref = d.get("reference_id")
            cur_title = d.get("title")
            cur_model = d.get("model")
            state = bool(d.get("random_faves", False))
    except Exception:
        pass

    new_state = not state
    data = {
        "reference_id": (cur_ref or DEFAULT_FISH_VOICE_ID),
        "title": (cur_title or DEFAULT_FISH_VOICE_TITLE),
        "model": (cur_model or DEFAULT_FISH_MODEL),
        "random_faves": new_state,
    }
    try:
        os.makedirs(os.path.dirname(VOICE_FILE) or ".", exist_ok=True)
        with open(VOICE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[TTS] voice file write error: {e}")
    return new_state


def reset_voice() -> dict:
    """Factory reset: default voice, random mode off."""
    return set_voice(DEFAULT_FISH_VOICE_ID, DEFAULT_FISH_VOICE_TITLE, DEFAULT_FISH_MODEL)


async def search_voices(query: str = "", limit: int = 20) -> list:
    """Search Fish Audio's model library. Returns
    [{'id','title','languages','tags','tasks'}], most-used first."""
    key = _api_key()
    if not key:
        return []
    params = {"page_size": max(1, min(25, int(limit))), "sort_by": "task_count"}
    if query and query.strip():
        params["title"] = query.strip()
    url = _MODEL_URL + "?" + urllib.parse.urlencode(params)
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                url,
                headers={"Authorization": f"Bearer {key}"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if r.status != 200:
                    print(f"[TTS] voice search HTTP {r.status}: {(await r.text())[:150]}")
                    return []
                data = await r.json()
    except Exception as e:
        print(f"[TTS] voice search error: {e}")
        return []

    out = []
    for it in data.get("items", []):
        vid = it.get("_id")
        if not vid:
            continue
        out.append({
            "id": vid,
            "title": (it.get("title") or "Untitled")[:100],
            "languages": it.get("languages") or [],
            "tags": it.get("tags") or [],
            "tasks": it.get("task_count") or 0,
        })
    return out


async def get_voice_meta(reference_id: str) -> Optional[dict]:
    """Validate a voice id via GET /model/<id>. None if it doesn't exist / no key."""
    key = _api_key()
    rid = (reference_id or "").strip()
    if not key or not rid:
        return None
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"{_MODEL_URL}/{rid}",
                headers={"Authorization": f"Bearer {key}"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as r:
                if r.status != 200:
                    return None
                d = await r.json()
                return {
                    "id": d.get("_id") or rid,
                    "title": d.get("title") or "voice",
                    "languages": d.get("languages") or [],
                    "tags": d.get("tags") or [],
                }
    except Exception:
        return None


async def generate_speech(text: str) -> Optional[BytesIO]:
    """TTS `text` → an MP3 BytesIO. Fish Audio if a key is set, else gTTS.
    Falls back to gTTS on any Fish error so Lisa never goes silent."""
    if not text or not text.strip():
        return None

    key = _api_key()
    if key:
        voice = get_voice()
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "model": voice["model"],
        }
        payload = {"text": text, "format": "mp3", "latency": "normal"}
        rid = voice["reference_id"]
        if rid and rid.lower() not in ("none", "off", "default"):
            payload["reference_id"] = rid

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    _TTS_URL, json=payload, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as resp:
                    if resp.status == 200:
                        audio = await resp.read()
                        if audio:
                            return BytesIO(audio)
                    else:
                        print(f"[Fish Audio TTS] HTTP {resp.status}: {(await resp.text())[:200]}")
        except Exception as e:
            print(f"[Fish Audio TTS] error: {e}")
        print("[Fish Audio TTS] falling back to gTTS…")

    try:
        from gtts import gTTS

        def _render():
            buf = BytesIO()
            gTTS(text=text, lang="en", tld="com.au").write_to_fp(buf)
            buf.seek(0)
            return buf

        return await asyncio.to_thread(_render)
    except Exception as e:
        print(f"[TTS Fallback] gTTS failed: {e}")
        return None
