"""
utils/user_persona.py — per-user chat PERSONALITY override.

Separate from utils/tts.py's global `get_voice()`/`set_voice()`, which drives
the actual TTS audio and the shared per-server avatar — those stay bot-wide by
necessity (Discord shows one avatar per bot
per server, and a voice channel is one shared audio stream, so none of that
can differ per listener).

What CAN differ per user, cheaply, is the character Lisa writes as when she's
replying to that specific person — each reply is its own message, rendered
independently. That's what this module stores: a user_id -> {reference_id,
title} map (data/lisa_user_personas.json), read by
`cogs/lisa.py::_character_prompt()` and set via `/settings`. The character
catalog reused here (id/title pairs) is the same one `/voice`'s favorites
list uses, just applied to text personality instead of audio/pfp.
"""

import os
import json
from typing import Optional

USER_PERSONA_FILE = os.path.join("data", "lisa_user_personas.json")


def _load() -> dict:
    if os.path.exists(USER_PERSONA_FILE):
        try:
            with open(USER_PERSONA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[user_persona] load error: {e}")
    return {}


def _save(data: dict):
    try:
        os.makedirs(os.path.dirname(USER_PERSONA_FILE) or ".", exist_ok=True)
        with open(USER_PERSONA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[user_persona] save error: {e}")


def get_user_persona(user_id) -> Optional[dict]:
    """{'reference_id', 'title'} for this user's personal character choice,
    or None if they haven't set one (caller should fall back to the shared
    global voice/character, or no character at all)."""
    entry = _load().get(str(user_id))
    if not entry or not entry.get("title"):
        return None
    return entry


def set_user_persona(user_id, reference_id: str, title: str) -> dict:
    data = _load()
    entry = {"reference_id": (reference_id or "").strip(), "title": (title or "").strip()[:120]}
    data[str(user_id)] = entry
    _save(data)
    return entry


def clear_user_persona(user_id) -> bool:
    """Revert this user to the shared default. Returns False if they had no
    override set."""
    data = _load()
    uid = str(user_id)
    if uid not in data:
        return False
    del data[uid]
    _save(data)
    return True
