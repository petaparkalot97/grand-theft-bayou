"""
utils/avatar.py — character profile-picture sync.

When the active voice/character changes, the bot's look should follow it: a
picture of that character. This updates the bot's per-server avatar via
`Member.edit(avatar=...)`; the persona/voice switch itself is never blocked,
and this optional Discord API call is throttled and best-effort.

Image source priority:
  1. data/character_avatars/<slug or voice-id>.<ext> — a picture you saved
     yourself. Exact voice-id match wins over the title slug.
  2. Google Custom Search (image search) as a fallback, if
     GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX are set in .env. A hit is cached
     into data/character_avatars/ so it's a one-time API cost per character —
     replace the cached file any time if the auto-picked image is wrong.
  3. Neither — the avatar is left as-is.

data/character_avatars/_default.<ext> is the picture used when there's no
specific character (random-voice mode, or the baseline non-character voice);
"""

import os
import re
import json
import time
import urllib.parse
from typing import Optional

import aiohttp

AVATAR_DIR = os.path.join("data", "character_avatars")
STATE_FILE = os.path.join("data", "avatar_state.json")

# Discord's real limit is fuzzy/undocumented for accounts; 5 minutes is the
# user-requested, conservative floor between avatar changes.
AVATAR_COOLDOWN_SECONDS = 300

_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
_README = (
    "Drop character pictures here to use them as the bot's Discord avatar.\n\n"
    "Naming: <voice-id>.png (exact Fish Audio voice id) or <slugified-title>.png\n"
    "(lowercase, spaces/punctuation -> underscores, e.g. 'Darth Vader' -> darth_vader.png).\n"
    "A file named _default.png is used whenever there's no specific character\n"
    "(random-voice mode, or the plain default voice) — save the bot's normal\n"
    "profile picture here so it can revert to it.\n\n"
    "Files the bot auto-downloads via Google Image search land here too, named\n"
    "by the slugified title — replace one any time if the auto-pick is wrong.\n"
)


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", (name or "").lower()).strip("_")
    return s or "unknown"


def _ensure_dir():
    os.makedirs(AVATAR_DIR, exist_ok=True)
    readme = os.path.join(AVATAR_DIR, "README.txt")
    if not os.path.exists(readme):
        try:
            with open(readme, "w", encoding="utf-8") as f:
                f.write(_README)
        except Exception:
            pass


def _load_state() -> dict:
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        print(f"[avatar] state load error: {e}")
    return {}


def _save_state(state: dict):
    try:
        os.makedirs(os.path.dirname(STATE_FILE) or ".", exist_ok=True)
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"[avatar] state save error: {e}")


def seconds_until_avatar_change_allowed() -> int:
    """0 = the bot may change its Discord avatar right now."""
    last = _load_state().get("last_change_ts", 0)
    remaining = AVATAR_COOLDOWN_SECONDS - (time.time() - last)
    return max(0, int(remaining))


def _mark_avatar_changed():
    state = _load_state()
    state["last_change_ts"] = time.time()
    _save_state(state)


def _cooldown_text() -> str:
    remaining = seconds_until_avatar_change_allowed()
    mins, secs = divmod(remaining, 60)
    return f"pfp on cooldown — next change in {mins}m{secs:02d}s"


def find_local_avatar_path(reference_id: str, title: str) -> Optional[str]:
    """A manually-saved (or previously cached) image for this character."""
    _ensure_dir()
    candidates = []
    if reference_id:
        candidates.append(reference_id.strip())
    if title:
        candidates.append(_slug(title))
    for stem in candidates:
        for ext in _EXTS:
            p = os.path.join(AVATAR_DIR, f"{stem}{ext}")
            if os.path.exists(p):
                return p
    return None


def default_avatar_path() -> Optional[str]:
    _ensure_dir()
    for ext in _EXTS:
        p = os.path.join(AVATAR_DIR, f"_default{ext}")
        if os.path.exists(p):
            return p
    return None


_CONTENT_TYPE_EXT = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
    "image/webp": ".webp", "image/gif": ".gif",
}


def ext_from_upload(content_type: Optional[str], filename: str = "") -> str:
    """Best-guess file extension for an uploaded image (Discord attachment)."""
    ext = _CONTENT_TYPE_EXT.get((content_type or "").split(";")[0].strip().lower())
    if ext:
        return ext
    fext = os.path.splitext(filename or "")[1].lower()
    return fext if fext in _EXTS else ".png"


def save_avatar_image(stem: str, data: bytes, ext: str = ".png") -> str:
    """Save raw image bytes as a character's avatar file. `stem` must be the
    exact voice reference_id (stable, matched first by find_local_avatar_path)
    or the literal "_default" for the fallback picture — never a hand-typed
    title, since titles get slugified elsewhere and a mismatch would silently
    save a file nothing ever looks up."""
    _ensure_dir()
    if ext not in _EXTS:
        ext = ".png"
    path = os.path.join(AVATAR_DIR, f"{stem}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    return path


async def fetch_google_image(query: str) -> Optional[bytes]:
    """Best-effort Google Custom Search image lookup. Needs
    GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX (a Programmable Search Engine with
    image search turned on). Returns None on any failure — always optional."""
    key = os.getenv("GOOGLE_SEARCH_API_KEY")
    cx = os.getenv("GOOGLE_SEARCH_CX")
    if not key or not cx or not query:
        return None
    params = {
        "key": key, "cx": cx, "q": query, "searchType": "image",
        "num": 5, "safe": "active",
    }
    url = "https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(params)
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
                if r.status != 200:
                    print(f"[avatar] Google image search HTTP {r.status}: {(await r.text())[:200]}")
                    return None
                data = await r.json()
            for item in data.get("items", []):
                link = item.get("link")
                if not link:
                    continue
                try:
                    async with s.get(link, timeout=aiohttp.ClientTimeout(total=15)) as img_r:
                        if img_r.status == 200:
                            content = await img_r.read()
                            if content:
                                return content
                except Exception:
                    continue
    except Exception as e:
        print(f"[avatar] Google image search error: {e}")
    return None


async def resolve_avatar_bytes(reference_id: str, title: str) -> Optional[bytes]:
    """Local folder first; Google fallback second (caching a hit to disk)."""
    local = find_local_avatar_path(reference_id, title)
    if local:
        try:
            with open(local, "rb") as f:
                return f.read()
        except Exception as e:
            print(f"[avatar] local read error: {e}")

    clean_title = re.sub(r"[\(\[].*?[\)\]]", "", title or "").strip()
    if not clean_title:
        return None
    image_bytes = await fetch_google_image(f"{clean_title} character portrait")
    if image_bytes:
        try:
            _ensure_dir()
            path = os.path.join(AVATAR_DIR, f"{_slug(title)}.png")
            with open(path, "wb") as f:
                f.write(image_bytes)
        except Exception as e:
            print(f"[avatar] cache write error: {e}")
    return image_bytes


async def _apply_to_guilds(bot, reason: str, **kwargs) -> str:
    """Apply avatar updates to the bot's own member in every guild."""
    if not kwargs:
        return "nothing to update"
    ok = failed = 0
    for guild in bot.guilds:
        try:
            await guild.me.edit(reason=reason[:512], **kwargs)
            ok += 1
        except Exception as e:
            failed += 1
            print(f"[avatar] server sync failed in guild {guild.id} ({guild.name}): {e}")
    _mark_avatar_changed()
    if ok and not failed:
        return f"pfp synced ({ok} server{'s' if ok != 1 else ''})"
    if ok:
        return f"synced in {ok}, failed in {failed} server(s)"
    return "server sync failed"


async def apply_character_avatar(bot, reference_id: str, title: str) -> str:
    """Best-effort per-server avatar sync for `title`, respecting
    the cooldown. Returns a short status string safe to tack onto a Discord
    confirmation message."""
    if seconds_until_avatar_change_allowed() > 0:
        return _cooldown_text()

    image_bytes = await resolve_avatar_bytes(reference_id, title)
    if not image_bytes:
        return "no saved/found image for this character — pfp unchanged"

    return await _apply_to_guilds(bot, f"Character: {title}", avatar=image_bytes)


async def reset_avatar_to_default(bot) -> str:
    """Revert to the saved default pfp — used for random-voice mode / no active character."""
    if seconds_until_avatar_change_allowed() > 0:
        return _cooldown_text()

    kwargs = {}
    path = default_avatar_path()
    if path:
        try:
            with open(path, "rb") as f:
                kwargs["avatar"] = f.read()
        except Exception as e:
            print(f"[avatar] default read error: {e}")
    return await _apply_to_guilds(bot, "Reset to default", **kwargs)
