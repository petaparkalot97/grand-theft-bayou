"""
cogs/voice.py — Lisa's voice controls.

Slash commands:
    /vc            Toggle Lisa in your voice channel (join + speak her replies).
                   Same as the 🎤 Voice button on /ditto.
    /say <text>    Make Lisa say one line out loud in your voice channel.
    /voice         Open the voice picker — search Fish Audio's whole library,
                   quick picks, paste an ID / fish.audio link, preview, reset.

Prefix commands (fast shortcuts):
    !voice         Favorites-only picker — dropdown of your saved faves.
    !random        Toggle random mode — every message Lisa outputs uses a
                   random voice from the favorites pool.
    /random        Same toggle as a slash command.
    /favorites     Public favorites picker — anyone can pick, nobody can
                   erase (the 💔 Unfave button is gone).
    /voice_search  Search Fish Audio's library — query as a slash option,
                   results in the same dropdown as /voice → 🔍 Search.

The picker is also reachable from the 🎙️ Voice model button on /ditto.

Picking a voice is a full character swap, not just a TTS change — LisaCog
reads the same data/lisa_voice.json to fully embody that character in chat
(see cogs/lisa.py `_character_prompt`). Every explicit pick here also tries to
sync the bot's per-server avatar to that character via
utils/avatar.py (data/character_avatars/, local file first then a Google
Image fallback) — this is the guild-only Member avatar/nick, not the bot's
global account identity, so it's throttled to a conservative once-per-5-min
rather than the much harsher global-avatar rate limit. Random mode leaves
the saved default avatar while this is on since it cannot
follow a per-message character.

`VoiceCog.speak(vc, text)` is the shared "say this in VC" primitive. It ducks
the music cog (pauses the track, resumes it from the same spot afterwards) so
Lisa can be heard over a song, and LisaCog._speak_reply() routes through it.
"""

import os
import re
import random
import asyncio
import json
import time
from io import BytesIO

import discord
from discord import app_commands
from discord.ext import commands

from utils.tts import (
    generate_speech, get_voice, set_voice, reset_voice,
    search_voices, get_voice_meta,
    get_favorite_voices, add_favorite_voice, remove_favorite_voice,
    toggle_random_faves, DEFAULT_FISH_VOICE_ID, has_configured_voice,
    record_voice_use, mark_voice_configured,
)
from utils.avatar import (
    apply_character_avatar, reset_avatar_to_default,
    find_local_avatar_path, default_avatar_path,
    ext_from_upload, save_avatar_image,
)

LISA_PINK = 0xFF1493
_ID_RE = re.compile(r"([0-9a-fA-F]{32})")
_EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF☀-➿⬀-⯿←-⇿️‍⃣]"
)
_JUNK = re.compile(r"<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|\[(?:REMEMBER|FLIRT)[^\]]*\]", re.I)

PREVIEW_LINE = "Omg bebii~ wait till you hear what I've got in store for you, stooge."

# <phrase> chat shortcut for /speak — any bracketed text in a normal message
# that ISN'T one of Discord's own tokens (mention, emoji, channel link,
# timestamp) gets spoken aloud in the author's voice channel. See
# VoiceCog.on_message / _speak_shortcut below.
_DISCORD_TOKEN_RE = re.compile(r"^(@[!&]?\d+|#\d+|a?:\w+:\d+|t:\d+(:[tTdDfFR])?)$")
_BRACKET_RE = re.compile(r"<([^<>]{1,300})>")


def _extract_speak_shortcut(content: str) -> str:
    """First bracketed phrase in `content` that isn't a Discord mention/emoji/
    channel-link/timestamp token, or '' if there isn't one."""
    for m in _BRACKET_RE.finditer(content or ""):
        inner = m.group(1).strip()
        if inner and not _DISCORD_TOKEN_RE.match(inner):
            return inner
    return ""


def _extract_auto_speak(content: str, config: dict) -> str:
    """Extract the configured auto-speak trigger from a normal message."""
    mode = config.get("mode", "brackets")
    trigger = (config.get("trigger") or "<>").strip()
    if mode == "prefix":
        return content[len(trigger):].strip()[:300] if trigger and content.startswith(trigger) else ""
    if len(trigger) >= 2:
        left, right = trigger[0], trigger[-1]
        match = re.search(re.escape(left) + r"([^" + re.escape(left + right) + r"]{1,300})" + re.escape(right), content)
        return match.group(1).strip() if match else ""
    return _extract_speak_shortcut(content)

# Hand-picked female voices (all verified live on Fish Audio).
CURATED = [
    {"id": "7e63bf5f79cc40b58383a1eae28f71c4", "title": "Anime Girl Voice — sassy, defiant (default)", "languages": ["en"], "tags": ["default"]},
    {"id": "3344305cb89642a18572ef2b1dc60fd6", "title": "Animated sitcom voice", "languages": ["en"], "tags": ["simpsons", "character"]},
    {"id": "1df12c4bb692423283fde2bdc7f84093", "title": "Cute Anime Girl", "languages": ["en"], "tags": ["popular"]},
    {"id": "a5119a363db04210a67016860dcd4fa0", "title": "Sassy Young Female", "languages": ["en"], "tags": ["young"]},
    {"id": "90aadfad7c33481ba60b4f1edbe0e6c4", "title": "Sassy Young Female (v2)", "languages": ["en"], "tags": ["young"]},
    {"id": "f88f4a28bb1d4cd7b34bc191b2202eb5", "title": "Lively Anime Girl", "languages": ["en"], "tags": ["character"]},
    {"id": "ca3007f96ae7499ab87d27ea3599956a", "title": "E-girl", "languages": ["en"], "tags": ["young"]},
    {"id": "b089032e45db460fb1934ece75a8c51d", "title": "Hot and Sexy Female", "languages": ["en"], "tags": ["hot"]},
    {"id": "42e70f5bc7b34a9e84abbbd6ec5572d0", "title": "Female voice - Sassy (calm narrator)", "languages": ["en"], "tags": ["narration"]},
]


def _clean_for_tts(text: str) -> str:
    text = _JUNK.sub("", text or "")
    text = _EMOJI.sub("", text)
    text = re.sub(r"[*_`~#>|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _opt_desc(v: dict) -> str:
    bits = list(v.get("languages") or []) + list(v.get("tags") or [])[:3]
    return ", ".join(dict.fromkeys(bits))[:100] or "voice"


# ═══════════════════════════════════════════════════════════════════════
#  VOICE PICKER
# ═══════════════════════════════════════════════════════════════════════
class VoiceResultsView(discord.ui.View):
    """A dropdown of voice models; pick one to activate it or save it directly."""

    def __init__(self, results: list):
        super().__init__(timeout=180)
        self._results = [v for v in results if v.get("id")]
        self._page = 0
        self._page_size = 25
        self._selected_id = None
        self._selected_title = None
        self._select = None
        self._rebuild_select()

    def _rebuild_select(self):
        if self._select is not None:
            self.remove_item(self._select)
        options = []
        start = self._page * self._page_size
        for v in self._results[start:start + self._page_size]:
            options.append(discord.SelectOption(
                label=(v.get("title") or "Untitled")[:100],
                value=v["id"],
                description=_opt_desc(v),
            ))
        select = discord.ui.Select(placeholder="Pick a voice…", options=options,
                                   min_values=1, max_values=1)
        select.callback = self._picked
        self._select = select
        self.add_item(select)

    @discord.ui.button(label="Previous", style=discord.ButtonStyle.secondary, emoji="⬅️", row=2)
    async def previous_page(self, interaction: discord.Interaction, button):
        if self._page <= 0:
            return await interaction.response.send_message("Already on the first page.", ephemeral=True)
        self._page -= 1
        self._rebuild_select()
        await interaction.response.edit_message(view=self)

    @discord.ui.button(label="Next", style=discord.ButtonStyle.secondary, emoji="➡️", row=2)
    async def next_page(self, interaction: discord.Interaction, button):
        if (self._page + 1) * self._page_size >= len(self._results):
            return await interaction.response.send_message("Already on the last page.", ephemeral=True)
        self._page += 1
        self._rebuild_select()
        await interaction.response.edit_message(view=self)

    @discord.ui.button(label="Save Fave", style=discord.ButtonStyle.secondary, emoji="❤️", row=1)
    async def save_fave(self, interaction: discord.Interaction, _button):
        if not self._selected_id:
            return await interaction.response.send_message(
                "Pick a voice from the dropdown first, then save it here.", ephemeral=True,
            )
        added = add_favorite_voice(self._selected_id, self._selected_title)
        title = self._selected_title or "that voice"
        msg = (f"✅ Added **{title}** to the global favourites. ❤️" if added
               else f"ℹ️ **{title}** is already in the global favourites.")
        await interaction.response.send_message(msg, ephemeral=True)

    async def _picked(self, interaction: discord.Interaction):
        vid = self._select.values[0]
        title = next((o.label for o in self._select.options if o.value == vid), "voice")
        self._selected_id = vid
        self._selected_title = title
        saved = set_voice(vid, title)
        mark_voice_configured(interaction.user.id)
        # Keep the menu alive: the list stays up so more picks can be made
        # (by anyone, since these messages are public now).
        await interaction.response.edit_message(
            content=(f"✅ Now **{saved['title']}** — she's fully in character. "
                     "Pick again anytime — the list stays up."),
            view=self,
        )
        status = await apply_character_avatar(interaction.client, saved["reference_id"], saved["title"])
        # Public — the voice/character is shared bot-wide, not personal to whoever picked it.
        await interaction.followup.send(f"🖼️ {status}", ephemeral=False)


class VoiceSearchModal(discord.ui.Modal, title="🔍 Search Fish Audio voices"):
    query = discord.ui.TextInput(
        label="Describe the voice",
        placeholder="e.g. sassy young female · anime girl · deep british male",
        max_length=80,
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await search_voices(str(self.query.value), 20)
        if not results:
            return await interaction.followup.send(
                "❌ Nothing found (or no Fish Audio key set). Try other words, "
                "or use 🔗 Paste an ID.", ephemeral=True,
            )
        embed = discord.Embed(
            title=f"🔍 {len(results)} voices for “{self.query.value}”",
            description="\n".join(
                f"• **{r['title']}** — {_opt_desc(r)}  ·  {r['tasks']:,} uses"
                for r in results[:10]
            ),
            color=LISA_PINK,
        )
        await interaction.followup.send(embed=embed, view=VoiceResultsView(results), ephemeral=True)


class VoicePasteModal(discord.ui.Modal, title="🔗 Paste a voice ID or link"):
    ref = discord.ui.TextInput(
        label="Voice ID or fish.audio/m/… link",
        placeholder="7e63bf5f79cc40b58383a1eae28f71c4",
        max_length=200,
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        m = _ID_RE.search(str(self.ref.value))
        if not m:
            return await interaction.followup.send(
                "❌ I need a 32-character voice ID (or a fish.audio/m/<id> link).",
                ephemeral=True,
            )
        vid = m.group(1).lower()
        meta = await get_voice_meta(vid)
        if meta is None:
            # no key to validate, or genuinely unknown — save it anyway, warn
            saved = set_voice(vid, "custom voice")
            status = await apply_character_avatar(interaction.client, saved["reference_id"], saved["title"])
            # Public — this did change the shared voice/character, not just this user's view.
            return await interaction.followup.send(
                f"⚠️ Couldn't verify `{vid}` (no Fish key or unknown id) — saved anyway. "
                f"If TTS sounds wrong, it'll fall back to gTTS.\n🖼️ {status}", ephemeral=False,
            )
        saved = set_voice(vid, meta["title"])
        status = await apply_character_avatar(interaction.client, saved["reference_id"], saved["title"])
        await interaction.followup.send(
            f"✅ Now **{saved['title']}**  `{vid}`  ({', '.join(meta['languages']) or '?'})\n🖼️ {status}",
            ephemeral=False,
        )


class VoicePreviewModal(discord.ui.Modal, title="🎧 Preview voice"):
    phrase = discord.ui.TextInput(
        label="Type a phrase to preview",
        placeholder="e.g. Omg bebii, you would not believe the day I've had",
        default=PREVIEW_LINE,
        max_length=300,
        style=discord.TextStyle.paragraph,
    )

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        text = str(self.phrase.value).strip() or PREVIEW_LINE
        buf = await generate_speech(text)
        if not buf:
            return await interaction.followup.send(
                "❌ Voice preview generation failed.", ephemeral=True
            )
        buf.seek(0)
        v = get_voice()
        await interaction.followup.send(
            content=f"🎧 **{v['title']}**\n> *\"{text}\"*",
            file=discord.File(buf, "lisa-voice-preview.mp3"),
            ephemeral=True,
        )


class VoicePickerView(discord.ui.View):
    def __init__(self, cog: "VoiceCog"):
        super().__init__(timeout=240)
        self.cog = cog

    async def _refresh(self, interaction: discord.Interaction):
        await interaction.response.edit_message(embed=self.cog.picker_embed(), view=self)

    @discord.ui.button(label="Search", style=discord.ButtonStyle.primary, emoji="🔍", row=0)
    async def search(self, interaction: discord.Interaction, _b):
        await interaction.response.send_modal(VoiceSearchModal())

    @discord.ui.button(label="Quick picks", style=discord.ButtonStyle.secondary, emoji="⭐", row=0)
    async def quick(self, interaction: discord.Interaction, _b):
        await interaction.response.send_message(
            "⭐ Hand-picked voices:", view=VoiceResultsView(CURATED), ephemeral=True,
        )

    @discord.ui.button(label="Favorites", style=discord.ButtonStyle.secondary, emoji="❤️", row=0)
    async def favorites(self, interaction: discord.Interaction, _b):
        favs = get_favorite_voices()
        if not favs:
            return await interaction.response.send_message(
                "❤️ **No favorite voices saved yet!** Use **Save Fave** to add the current active voice.",
                ephemeral=True,
            )
        await interaction.response.send_message(
            f"❤️ **Global Favorite Voices ({len(favs)}):**\nPick one to activate it, or select one and press **Save Fave** to add another voice.",
            view=VoiceResultsView(favs),
            ephemeral=True,
        )

    @discord.ui.button(label="Paste ID", style=discord.ButtonStyle.secondary, emoji="🔗", row=0)
    async def paste(self, interaction: discord.Interaction, _b):
        await interaction.response.send_modal(VoicePasteModal())

    @discord.ui.button(label="Preview", style=discord.ButtonStyle.success, emoji="🎧", row=1)
    async def preview(self, interaction: discord.Interaction, _b):
        await interaction.response.send_modal(VoicePreviewModal())

    @discord.ui.button(label="Save Fave", style=discord.ButtonStyle.secondary, emoji="➕", row=1)
    async def save_fave(self, interaction: discord.Interaction, _b):
        v = get_voice()
        added = add_favorite_voice(v["reference_id"], v["title"])
        await interaction.response.edit_message(embed=self.cog.picker_embed(), view=self)
        msg = (f"✅ Added **{v['title']}** to your favorite voices! ❤️" if added
               else f"ℹ️ **{v['title']}** is already in your favorites list.")
        await interaction.followup.send(msg, ephemeral=True)

    @discord.ui.button(label="Random Fave", style=discord.ButtonStyle.secondary, emoji="🎲", row=1)
    async def random_fave(self, interaction: discord.Interaction, _b):
        on = toggle_random_faves()
        await interaction.response.edit_message(embed=self.cog.picker_embed(), view=self)
        # Public — random mode and its pfp effect are bot-wide, not personal.
        if on:
            status = await reset_avatar_to_default(interaction.client)
            await interaction.followup.send(
                "🎲 Random mode **ON** — a new character every time she speaks. "
                f"Pfp holds on the default while this is on.\n🖼️ {status}",
                ephemeral=False,
            )
        else:
            v = get_voice()
            status = await apply_character_avatar(interaction.client, v["reference_id"], v["title"])
            await interaction.followup.send(f"🎲 Random mode **OFF** — locked to **{v['title']}**.\n🖼️ {status}", ephemeral=False)

    @discord.ui.button(label="Reset", style=discord.ButtonStyle.danger, emoji="♻️", row=2)
    async def reset(self, interaction: discord.Interaction, _b):
        # The picker is public — don't let randoms wipe the voice config.
        if interaction.guild and not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message(
                "♻️ Admins only, stooge.", ephemeral=True,
            )
        reset_voice()
        await self._refresh(interaction)
        status = await reset_avatar_to_default(interaction.client)
        await interaction.followup.send(f"🖼️ {status}", ephemeral=False)


_DEFAULT_PFP_VALUE = "__default__"


class PfpPickerView(discord.ui.View):
    """Dropdown of favorite characters (+ the default pfp slot); picking one
    starts a 60s window to attach the image that becomes their pfp file."""

    def __init__(self):
        super().__init__(timeout=180)
        options = [
            discord.SelectOption(
                label="Default (no character / random mode)",
                value=_DEFAULT_PFP_VALUE,
                description="Shown when no specific character is active",
                emoji="✅" if default_avatar_path() else "🖼️",
            )
        ]
        for f in get_favorite_voices()[:24]:
            vid = f.get("id")
            if not vid:
                continue
            has = find_local_avatar_path(vid, f.get("title")) is not None
            options.append(discord.SelectOption(
                label=(f.get("title") or "Untitled")[:100],
                value=vid,
                description=vid[:100],
                emoji="✅" if has else "🖼️",
            ))
        select = discord.ui.Select(placeholder="Pick a character to set a pfp for…", options=options)
        select.callback = self._picked
        self._select = select
        self.add_item(select)

    async def _picked(self, interaction: discord.Interaction):
        vid = self._select.values[0]
        title = next((o.label for o in self._select.options if o.value == vid), "this character")
        await interaction.response.send_message(
            f"📸 Attach the image for **{title}** as your next message in this channel "
            "— you have 60 seconds.",
            ephemeral=True,
        )

        def check(m: discord.Message) -> bool:
            return (m.author.id == interaction.user.id
                    and m.channel.id == interaction.channel_id
                    and bool(m.attachments))

        try:
            msg = await interaction.client.wait_for("message", timeout=60, check=check)
        except asyncio.TimeoutError:
            return await interaction.followup.send("⌛ Timed out — run `/pfp` again.", ephemeral=True)

        att = msg.attachments[0]
        if not (att.content_type or "").startswith("image/"):
            return await interaction.followup.send("❌ That's not an image — nothing saved.", ephemeral=True)
        if att.size > 8 * 1024 * 1024:
            return await interaction.followup.send("❌ Too big (8MB max) — nothing saved.", ephemeral=True)

        data = await att.read()
        stem = "_default" if vid == _DEFAULT_PFP_VALUE else vid
        path = save_avatar_image(stem, data, ext_from_upload(att.content_type, att.filename))
        try:
            await msg.add_reaction("✅")
        except Exception:
            pass

        v = get_voice()
        if vid == _DEFAULT_PFP_VALUE:
            is_active = v.get("random_faves") or v["reference_id"] == DEFAULT_FISH_VOICE_ID
        else:
            is_active = not v.get("random_faves") and v["reference_id"] == vid
        status_line = ""
        if is_active:
            status = (await reset_avatar_to_default(interaction.client) if vid == _DEFAULT_PFP_VALUE
                       else await apply_character_avatar(interaction.client, vid, title))
            status_line = f"\n🖼️ That's the active one — {status}"
        # Public — the saved picture (and any immediate apply) is shared, not personal.
        await interaction.followup.send(
            f"✅ Saved pfp for **{title}** → `{os.path.basename(path)}`{status_line}",
            ephemeral=False,
        )


class ReplayView(discord.ui.View):
    """A 🔁 Replay button on /say and /speak's ephemeral confirmation — says
    the same line again without retyping the command. Looks up the voice
    client fresh each time in case it moved/disconnected in the meantime."""

    def __init__(self, cog: "VoiceCog", guild_id: int, text: str):
        super().__init__(timeout=600)
        self.cog = cog
        self.guild_id = guild_id
        self.text = text

    @discord.ui.button(label="Replay", style=discord.ButtonStyle.secondary, emoji="🔁")
    async def replay(self, interaction: discord.Interaction, _b):
        guild = self.cog.bot.get_guild(self.guild_id)
        vc = guild.voice_client if guild else None
        if not vc or not vc.is_connected():
            return await interaction.response.send_message(
                "❌ I'm not in a voice channel anymore — run the command again.", ephemeral=True,
            )
        await interaction.response.defer(ephemeral=True, thinking=True)
        ok = await self.cog.speak(vc, self.text)
        await interaction.followup.send(
            "🔁 Replayed." if ok else "❌ Couldn't replay that one.", ephemeral=True,
        )


class ConfigureView(discord.ui.View):
    """Small, discoverable front door for all speech settings."""
    def __init__(self, cog):
        super().__init__(timeout=300)
        self.cog = cog

    @discord.ui.button(label="Choose voice", style=discord.ButtonStyle.primary, emoji="🎙️")
    async def choose_voice(self, interaction, _button):
        await interaction.response.send_message(
            embed=self.cog.picker_embed(), view=VoicePickerView(self.cog), ephemeral=True
        )

    @discord.ui.button(label="Auto-speak", style=discord.ButtonStyle.secondary, emoji="🗣️")
    async def auto_speak(self, interaction, _button):
        await self.cog.auto_speak(interaction, True, "brackets", "<>")

    @discord.ui.button(label="Read chat aloud", style=discord.ButtonStyle.secondary, emoji="🔊")
    async def read_chat(self, interaction, _button):
        await self.cog.tts(interaction)

    @discord.ui.button(label="Voice replies", style=discord.ButtonStyle.secondary, emoji="💬")
    async def voice_replies(self, interaction, _button):
        chat = self.cog.bot.get_cog("LisaCog")
        if chat and hasattr(chat, "toggle_voice"):
            await chat.toggle_voice(interaction)


# ═══════════════════════════════════════════════════════════════════════
#  THE COG
# ═══════════════════════════════════════════════════════════════════════
class VoiceCog(commands.Cog):
    """Lisa's voice: join/leave, one-off lines, and the Fish Audio voice picker."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._locks = {}  # guild_id -> asyncio.Lock (serialise TTS lines per guild)
        self._avatar_synced = False
        self._tts_channels = self._load_json("data/tts_channels.json", {})
        self._auto_speak = self._load_json("data/auto_speak.json", {})
        self._channel_settings = self._load_json("data/ditto_channels.json", {})
        self._shortcut_cooldowns = {}
        self._shortcut_notices = set()
        self._speech_queues = {}
        self._speech_workers = {}
        self._stopped_guilds = set()

    @staticmethod
    def _load_json(path, default):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError, TypeError):
            return default

    @staticmethod
    def _save_json(path, value):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(value, f, indent=2)

    def _lock(self, guild_id: int) -> asyncio.Lock:
        return self._locks.setdefault(guild_id, asyncio.Lock())

    def _auto_config(self, guild_id: int) -> dict:
        """Return a backwards-compatible, normalized auto-speak config."""
        config = self._auto_speak.get(str(guild_id), {})
        return {
            "enabled": config.get("enabled", True),
            "mode": config.get("mode", "brackets"),
            "trigger": config.get("trigger", "<>"),
            # Existing servers get the new tidy-chat behavior by default.
            "delete_after_speak": config.get("delete_after_speak", True),
        }

    def _channel_config(self, guild_id: int, channel_id: int) -> dict:
        config = self._auto_config(guild_id)
        override = self._channel_settings.get(str(channel_id), {})
        config.update({k: v for k, v in override.items() if v is not None})
        # Accessibility mode always preserves the source message.
        if config.get("accessibility_mode"):
            config["delete_after_speak"] = False
        return config

    async def _temporary_notice(self, message: discord.Message, content: str):
        """Send a short-lived, non-mentioning hint without creating lasting spam."""
        try:
            await message.reply(content, mention_author=False, delete_after=8)
        except Exception:
            pass

    async def _cleanup_shortcut(self, message: discord.Message, delay: float = 2.0):
        await asyncio.sleep(delay)
        try:
            await message.delete()
        except Exception:
            pass

    @commands.Cog.listener()
    async def on_ready(self):
        """Best-effort: make the Discord avatar match whatever character/voice
        was persisted before a restart. Never blocks startup or raises."""
        if self._avatar_synced:
            return
        self._avatar_synced = True
        try:
            v = get_voice()
            if v.get("random_faves"):
                await reset_avatar_to_default(self.bot)
            else:
                await apply_character_avatar(self.bot, v["reference_id"], v["title"])
        except Exception as e:
            print(f"[voice] startup avatar sync failed: {e}")

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        """<phrase> anywhere in a message is a passive shortcut for /speak —
        say it out loud in the author's voice channel. Silently does nothing
        if they're not in one (no error spam for what might just be someone
        typing angle brackets, not asking for TTS). Successfully spoken
        bracket shortcuts are deleted afterwards to keep the channel tidy."""
        if message.author.bot or message.guild is None:
            return
        text = message.content.strip()
        if text.startswith("!") or text.startswith("/"):
            return
        guild_key = str(message.guild.id)
        # Angle brackets remain the backwards-compatible default. `/auto-speak`
        # can replace this with a prefix or disable it for a guild.
        config = self._channel_config(message.guild.id, message.channel.id)
        auto_phrase = _extract_auto_speak(message.content, config) if config["enabled"] else ""
        phrase = auto_phrase
        is_bracket_shortcut = bool(auto_phrase) and config["mode"] == "brackets"
        if not phrase and str(message.channel.id) in self._tts_channels.get(guild_key, []):
            phrase = _clean_for_tts(message.content)[:300]
        if not phrase:
            return

        vs = message.author.voice
        if not vs or not vs.channel:
            notice_key = (message.guild.id, message.author.id, "voice")
            if is_bracket_shortcut and notice_key not in self._shortcut_notices:
                self._shortcut_notices.add(notice_key)
                await self._temporary_notice(message, "🗣️ Join a voice channel first and I’ll say that out loud.")
            return

        now = time.monotonic()
        cooldown_key = (message.guild.id, message.author.id)
        remaining = 4.0 - (now - self._shortcut_cooldowns.get(cooldown_key, 0))
        if is_bracket_shortcut and remaining > 0:
            try:
                await message.add_reaction("⏳")
            except Exception:
                pass
            await self._temporary_notice(message, f"⏳ Give me {remaining:.1f}s before another voice request.")
            return
        if is_bracket_shortcut:
            self._shortcut_cooldowns[cooldown_key] = now

        bot_member = message.guild.me
        voice_permissions = vs.channel.permissions_for(bot_member) if bot_member else None
        missing = []
        if voice_permissions:
            if not voice_permissions.connect:
                missing.append("Connect")
            if not voice_permissions.speak:
                missing.append("Speak")
        if missing:
            notice_key = (message.guild.id, message.channel.id, "permissions", *missing)
            if notice_key not in self._shortcut_notices:
                self._shortcut_notices.add(notice_key)
                await self._temporary_notice(
                    message,
                    f"⚠️ I need **{', '.join(missing)}** permission(s) in **{vs.channel.name}** to speak."
                )
            return

        try:
            vc = message.guild.voice_client
            if not vc:
                vc = await vs.channel.connect()
            elif vc.channel.id != vs.channel.id:
                await vc.move_to(vs.channel)
        except Exception as e:
            print(f"[voice] <phrase> shortcut couldn't join voice: {e}")
            if is_bracket_shortcut:
                await self._temporary_notice(
                    message,
                    "⚠️ I couldn’t join your voice channel. Please check that I have **Connect** and **Speak** permissions."
                )
            return

        ok = await self.speak(vc, phrase)
        try:
            await message.add_reaction("🗣️" if ok else "❌")
        except Exception:
            pass
        if not ok:
            if not is_bracket_shortcut:
                return
            await self._temporary_notice(message, "❌ I couldn’t speak that right now. Try again in a moment.")
            return
        if is_bracket_shortcut and config["delete_after_speak"]:
            text_permissions = message.channel.permissions_for(bot_member) if bot_member else None
            if text_permissions and text_permissions.manage_messages:
                # A short delay makes the cleanup less surprising and gives
                # users a moment to see what triggered the voice request.
                asyncio.create_task(self._cleanup_shortcut(message))
            else:
                notice_key = (message.guild.id, message.channel.id, "manage_messages")
                if notice_key not in self._shortcut_notices:
                    self._shortcut_notices.add(notice_key)
                    await self._temporary_notice(
                        message,
                        "🗣️ I said that, but an admin needs to grant me **Manage Messages** "
                        "if you want bracket triggers removed automatically."
                    )

    # ── shared primitive: say `text` in `vc`, ducking the music cog ──────
    async def speak(self, vc: discord.VoiceClient, text: str) -> bool:
        """Queue a line for this guild and wait until it has finished."""
        if not vc or not vc.is_connected():
            return False
        loop = asyncio.get_running_loop()
        self._stopped_guilds.discard(vc.guild.id)
        queue = self._speech_queues.setdefault(vc.guild.id, asyncio.Queue())
        result = loop.create_future()
        await queue.put((vc, text, result))
        worker = self._speech_workers.get(vc.guild.id)
        if worker is None or worker.done():
            worker = asyncio.create_task(self._speech_worker(vc.guild.id))
            self._speech_workers[vc.guild.id] = worker
        return await result

    async def _speech_worker(self, guild_id: int):
        queue = self._speech_queues[guild_id]
        while not queue.empty():
            vc, text, result = await queue.get()
            try:
                ok = await self._speak_now(vc, text)
                if guild_id in self._stopped_guilds:
                    ok = False
                if not result.done():
                    result.set_result(ok)
            except Exception as e:
                print(f"[voice] queued speech failed: {e}")
                if not result.done():
                    result.set_result(False)
            finally:
                queue.task_done()

    async def _speak_now(self, vc: discord.VoiceClient, text: str) -> bool:
        if not vc or not vc.is_connected():
            return False
        spoken = _clean_for_tts(text)[:600]
        if not spoken:
            return False

        audio = await generate_speech(spoken)
        if not audio:
            return False
        audio.seek(0)
        voice = get_voice()
        if record_voice_use(voice.get("reference_id"), voice.get("title")):
            print(f"[voice] auto-favorited frequently used voice: {voice.get('title')}")

        guild = vc.guild
        music = self.bot.get_cog("Music")

        async with self._lock(guild.id):
            ducked = False
            if music is not None and hasattr(music, "begin_speech"):
                try:
                    ducked = await music.begin_speech(guild)
                except Exception as e:
                    print(f"[voice] begin_speech failed: {e}")

            if vc.is_playing():          # a stray line of our own — cut it
                vc.stop()
                await asyncio.sleep(0.1)

            done = asyncio.Event()

            def _after(err=None):
                if err:
                    print(f"[voice] TTS playback error: {err}")
                try:
                    self.bot.loop.call_soon_threadsafe(done.set)
                except Exception:
                    done.set()

            try:
                vc.play(discord.FFmpegPCMAudio(audio, pipe=True), after=_after)
            except Exception as e:
                print(f"[voice] TTS play failed: {e}")
                if ducked:
                    await music.end_speech(guild)
                return False

            try:
                await asyncio.wait_for(done.wait(), timeout=90)
            except asyncio.TimeoutError:
                pass

            if ducked:
                await music.end_speech(guild)
        return True

    async def stop_speech(self, guild: discord.Guild) -> int:
        """Stop the current line and cancel queued lines for a guild."""
        vc = guild.voice_client if guild else None
        if guild:
            self._stopped_guilds.add(guild.id)
        if vc and vc.is_playing():
            vc.stop()
        queue = self._speech_queues.get(guild.id) if guild else None
        cleared = 0
        if queue:
            while not queue.empty():
                _vc, _text, result = queue.get_nowait()
                queue.task_done()
                cleared += 1
                if not result.done():
                    result.set_result(False)
        return cleared

    def picker_embed(self) -> discord.Embed:
        v = get_voice()
        favs = get_favorite_voices()
        rnd = "  ·  🎲 random mode ON" if v.get("random_faves") else ""
        return discord.Embed(
            title="🎙️ Voice & character",
            description=(
                f"**Now:** {v['title']}{rnd}\n`{v['reference_id']}`  ·  model `{v['model']}`\n\n"
                "Picking a voice fully changes her personality too — she becomes that "
                "character (speech, attitude, everything) until you pick another.\n\n"
                "🔍 **Search** — Fish Audio's entire library by description\n"
                "⭐ **Quick picks** — hand-picked female voices\n"
                f"❤️ **Favorites ({len(favs)})** — your saved favorite voices list\n"
                "🔗 **Paste ID** — a voice id or a `fish.audio/m/…` link\n"
                "🎧 **Preview** — type custom text to hear the voice out loud\n"
                "➕ **Save Fave** — add current voice to your favorites list\n"
                "🎲 **Random Fave** — a new character every line (pfp holds on default)\n"
                "⌨️ **Shortcuts:** `!voice` picker · `!random` / `/random` toggle random mode · `/voice_search` find\n"
                "♻️ **Reset** — back to the default, no character"
            ),
            color=LISA_PINK,
        )

    async def open_picker(self, interaction: discord.Interaction):
        # Public on purpose: the picker is a shared control panel. Destructive
        # buttons (♻️ Reset) gate on admin; picking voices is open to all.
        await interaction.response.send_message(
            embed=self.picker_embed(), view=VoicePickerView(self), ephemeral=False,
        )

    async def show_config(self, interaction: discord.Interaction):
        config = self._auto_config(interaction.guild.id) if interaction.guild else {}
        auto_status = "off" if config and not config["enabled"] else "on"
        auto_detail = (
            f"{auto_status} · {config.get('mode', 'brackets')} · `{config.get('trigger', '<>')}` · "
            f"delete: {'on' if config.get('delete_after_speak', True) else 'off'}"
            if config else "server-only"
        )
        tts_channels = self._tts_channels.get(str(interaction.guild.id), []) if interaction.guild else []
        embed = discord.Embed(
            title="⚙️ Speech settings",
            description=(
                "Use this panel to set up speech without needing to remember several commands.\n\n"
                "🎙️ **Choose voice** — pick from the shared favorites or search for another voice.\n"
                "💬 **Voice replies** — read the bot's replies in your voice channel.\n"
                "🔊 **Read chat aloud** — read messages from this text channel as they arrive.\n"
                "🗣️ **Auto-speak** — speak messages wrapped in `<>`; bracket triggers are cleaned up automatically."
            ), color=LISA_PINK,
        )
        embed.add_field(name="Current auto-speak", value=auto_detail, inline=False)
        embed.add_field(
            name="Chat reading",
            value=f"on in {len(tts_channels)} channel(s)" if tts_channels else "off",
            inline=True,
        )
        embed.set_footer(text="Use /auto-speak to change the trigger or deletion preference.")
        await interaction.response.send_message(embed=embed, view=ConfigureView(self), ephemeral=True)

    async def auto_speak(
        self, interaction: discord.Interaction, enabled: bool, mode: str, trigger: str,
        delete_messages: bool = None, accessibility_mode: bool = None,
    ):
        if interaction.guild is None:
            return await interaction.response.send_message("❌ Servers only.", ephemeral=True)
        key = str(interaction.guild.id)
        if enabled:
            trigger = trigger.strip()[:4] or "<>"
            selected_mode = mode if mode in ("brackets", "prefix") else "brackets"
            current = self._channel_config(interaction.guild.id, interaction.channel_id)
            selected_delete = current["delete_after_speak"] if delete_messages is None else bool(delete_messages)
            self._auto_speak[key] = {
                "enabled": True,
                "mode": selected_mode,
                "trigger": trigger,
                "delete_after_speak": selected_delete,
            }
            if accessibility_mode is not None or delete_messages is not None:
                self._channel_settings[str(interaction.channel_id)] = {
                    "delete_after_speak": selected_delete,
                    "accessibility_mode": bool(accessibility_mode) if accessibility_mode is not None else current.get("accessibility_mode", False),
                }
                self._save_json("data/ditto_channels.json", self._channel_settings)
            self._save_json("data/auto_speak.json", self._auto_speak)
            cleanup = (
                "Bracket messages will be removed after successful speech."
                if selected_mode == "brackets" and selected_delete
                else "Bracket messages will be kept."
            )
            return await interaction.response.send_message(
                f"🗣️ **Auto-speak on.** Messages using `{trigger}` will be spoken in your voice channel. "
                f"{cleanup} Use `/auto-speak` again with **enabled: false** to turn it off.", ephemeral=True
            )
        self._auto_speak[key] = {"enabled": False}
        self._save_json("data/auto_speak.json", self._auto_speak)
        await interaction.response.send_message("🔇 **Auto-speak off.**", ephemeral=True)

    @app_commands.command(name="auto-speak", description="🗣️ Speak selected chat messages automatically")
    @app_commands.describe(
        enabled="Turn auto-speak on or off",
        mode="Use brackets or a prefix",
        trigger="Bracket pair or prefix, such as <> or !say ",
        delete_messages="Remove bracket-trigger messages after successful speech",
        accessibility_mode="Keep source messages visible for accessibility and moderation",
    )
    @app_commands.choices(mode=[
        app_commands.Choice(name="Brackets", value="brackets"),
        app_commands.Choice(name="Prefix", value="prefix"),
    ])
    async def auto_speak_cmd(
        self, interaction: discord.Interaction, enabled: bool = True,
        mode: app_commands.Choice[str] = None, trigger: str = "<>",
        delete_messages: bool = None, accessibility_mode: bool = None,
    ):
        await self.auto_speak(
            interaction, enabled, mode.value if mode else "brackets", trigger,
            delete_messages, accessibility_mode,
        )

    @app_commands.command(name="tts", description="🔊 Toggle reading this text channel aloud in your voice channel")
    async def tts(self, interaction: discord.Interaction):
        if interaction.guild is None:
            return await interaction.response.send_message("❌ Servers only.", ephemeral=True)
        voice = interaction.user.voice
        if not voice or not voice.channel:
            return await interaction.response.send_message("❌ Join a voice channel first.", ephemeral=True)
        bot_member = interaction.guild.me
        permissions = voice.channel.permissions_for(bot_member) if bot_member else None
        missing = []
        if permissions:
            if not permissions.connect:
                missing.append("Connect")
            if not permissions.speak:
                missing.append("Speak")
        if missing:
            return await interaction.response.send_message(
                f"⚠️ I need **{', '.join(missing)}** permission(s) in **{voice.channel.name}** first.",
                ephemeral=True,
            )
        key = str(interaction.guild.id)
        channels = set(self._tts_channels.get(key, []))
        cid = str(interaction.channel_id)
        if cid in channels:
            channels.remove(cid)
            status = "🔇 **Chat reading off** for this channel."
        else:
            try:
                vc = interaction.guild.voice_client
                if not vc:
                    await voice.channel.connect()
                elif vc.channel.id != voice.channel.id:
                    await vc.move_to(voice.channel)
            except Exception as e:
                return await interaction.response.send_message(f"❌ Couldn't join voice: {e}", ephemeral=True)
            channels.add(cid)
            status = "🔊 **Chat reading on.** New messages in this channel will be spoken aloud."
        self._tts_channels[key] = sorted(channels)
        self._save_json("data/tts_channels.json", self._tts_channels)
        await interaction.response.send_message(status, ephemeral=True)

    # ── /vc ─────────────────────────────────────────────────────────────
    @app_commands.command(
        name="vc",
        description="🎤 Toggle voice replies in your voice channel",
    )
    async def vc(self, interaction: discord.Interaction):
        lisa = self.bot.get_cog("LisaCog")
        if lisa is None or not hasattr(lisa, "toggle_voice"):
            return await interaction.response.send_message(
                "❌ Chat cog isn't loaded — voice toggle unavailable.", ephemeral=True,
            )
        await lisa.toggle_voice(interaction)

    # ── /say ────────────────────────────────────────────────────────────
    @app_commands.command(
        name="say", description="🗣️ Speak one line in your voice channel",
    )
    @app_commands.describe(text="What to say")
    async def say(self, interaction: discord.Interaction, text: str):
        if interaction.guild is None:
            return await interaction.response.send_message("❌ Servers only.", ephemeral=True)
        if not has_configured_voice(interaction.user.id):
            embed = discord.Embed(
                title="🎙️ Choose your voice first",
                description=("You haven't selected a voice yet. Pick one from the shared favorites below, "
                             "then run `/speak` again. This choice is shared by the server."),
                color=LISA_PINK,
            )
            return await interaction.response.send_message(
                embed=embed, view=VoiceResultsView(get_favorite_voices()), ephemeral=True
            )
        vs = interaction.user.voice
        if not vs or not vs.channel:
            return await interaction.response.send_message(
                "❌ Join a voice channel first, stooge.", ephemeral=True,
            )
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            vc = interaction.guild.voice_client
            if not vc:
                vc = await vs.channel.connect()
            elif vc.channel.id != vs.channel.id:
                await vc.move_to(vs.channel)
        except Exception as e:
            return await interaction.followup.send(f"❌ Couldn't join voice: {e}", ephemeral=True)

        ok = await self.speak(vc, text)
        kwargs = {"view": ReplayView(self, interaction.guild.id, text)} if ok else {}
        await interaction.followup.send(
            "🗣️ Said it." if ok else "❌ Couldn't speak that one.", ephemeral=True, **kwargs,
        )

    # ── /speak ──────────────────────────────────────────────────────────
    @app_commands.command(
        name="speak", description="🗣️ Speak what you type in your voice channel",
    )
    @app_commands.describe(text="What to say out loud")
    async def speak_cmd(self, interaction: discord.Interaction, text: str):
        if interaction.guild is None:
            return await interaction.response.send_message("❌ Servers only.", ephemeral=True)
        if not has_configured_voice(interaction.user.id):
            embed = discord.Embed(
                title="🎙️ Choose your voice first",
                description=("You haven't selected a voice yet. Pick one from the shared favorites below, "
                             "then run `/speak` again. This choice is shared by the server."),
                color=LISA_PINK,
            )
            return await interaction.response.send_message(
                embed=embed, view=VoiceResultsView(get_favorite_voices()), ephemeral=True
            )
        vs = interaction.user.voice
        if not vs or not vs.channel:
            return await interaction.response.send_message(
                "❌ Join a voice channel first, stooge.", ephemeral=True,
            )
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            vc = interaction.guild.voice_client
            if not vc:
                vc = await vs.channel.connect()
            elif vc.channel.id != vs.channel.id:
                await vc.move_to(vs.channel)
        except Exception as e:
            return await interaction.followup.send(f"❌ Couldn't join voice: {e}", ephemeral=True)

        ok = await self.speak(vc, text)
        kwargs = {"view": ReplayView(self, interaction.guild.id, text)} if ok else {}
        await interaction.followup.send(
            f"🗣️ Spoke: *\"{text[:100]}\"*" if ok else "❌ Couldn't speak that one.", ephemeral=True, **kwargs,
        )

    # ── /voice ──────────────────────────────────────────────────────────
    @app_commands.command(name="voice", description="🎙️ Change the active voice")
    async def voice(self, interaction: discord.Interaction):
        await self.open_picker(interaction)

    # ── /pfp — assign a profile picture to a character ───────────────────
    @app_commands.command(
        name="pfp",
        description="🖼️ Pick a favorite character and attach the picture to use as her pfp for it",
    )
    async def pfp(self, interaction: discord.Interaction):
        favs = get_favorite_voices()
        if not favs:
            return await interaction.response.send_message(
                "❤️ **No favorite voices saved yet!** Use `/voice` → **Save Fave** first.",
                ephemeral=True,
            )
        embed = discord.Embed(
            title="🖼️ Character Profile Pictures",
            description=(
                "Pick a character below, then attach an image as your next message "
                "(60s window) — that becomes her Discord pfp whenever that character "
                "is active.\n\n✅ = already has a saved picture · 🖼️ = none yet"
            ),
            color=LISA_PINK,
        )
        await interaction.response.send_message(embed=embed, view=PfpPickerView(), ephemeral=True)

    # ── /favorites — public favorites picker (no destructive buttons) ───
    @app_commands.command(
        name="favorites",
        description="❤️ Browse Lisa's favorite voices and switch her voice",
    )
    async def favorites(self, interaction: discord.Interaction):
        favs = get_favorite_voices()
        if not favs:
            return await interaction.response.send_message(
                "❤️ **No favorite voices saved yet!** Use `/voice` → **Save Fave** "
                "to build the pool.",
                ephemeral=True,
            )
        v = get_voice()
        rnd = "  ·  🎲 random mode ON" if v.get("random_faves") else ""
        lines = []
        for i, f in enumerate(favs[:10], 1):
            mark = " ← *current*" if f.get("id") == v["reference_id"] else ""
            lines.append(f"**{i}.** {f.get('title') or 'Untitled'}{mark}")
        more = (f"\n*…and {len(favs) - 10} more in the dropdown below*"
                if len(favs) > 10 else "")
        embed = discord.Embed(
            title="❤️ Lisa's Favorite Voices",
            description=(
                f"**Now:** {v['title']}{rnd}\n\n" + "\n".join(lines) + more +
                "\n\nPick from the dropdown to switch — anyone can pick, "
                "nobody can erase. 🎲 `/random` toggles random mode."
            ),
            color=LISA_PINK,
        )
        await interaction.response.send_message(embed=embed, view=VoiceResultsView(favs))

    # ── !voice — favorites-only quick picker ────────────────────────────
    @commands.command(name="voice", help="🎙️ Pick Lisa's voice from your favorites")
    async def voice_prefix(self, ctx: commands.Context):
        favs = get_favorite_voices()
        if not favs:
            return await ctx.send(
                "❤️ **No favorite voices saved yet!** Open `/voice` and hit **Save Fave** "
                "to build your pool first."
            )
        v = get_voice()
        rnd = "  ·  🎲 random mode ON" if v.get("random_faves") else ""
        lines = []
        for i, f in enumerate(favs[:10], 1):
            mark = " ← *current*" if f.get("id") == v["reference_id"] else ""
            lines.append(f"**{i}.** {f.get('title') or 'Untitled'}{mark}")
        more = (f"\n*…and {len(favs) - 10} more in the dropdown below*"
                if len(favs) > 10 else "")
        embed = discord.Embed(
            title="🎙️ Voice Picker — Favorites",
            description=(
                f"**Now:** {v['title']}{rnd}\n\n" + "\n".join(lines) + more +
                "\n\nPick from the dropdown to switch instantly. 🎲 `!random` toggles random mode."
            ),
            color=LISA_PINK,
        )
        await ctx.send(embed=embed, view=VoiceResultsView(favs))

    # ── shared random-mode toggle (used by !random AND /random) ─────────
    async def _toggle_random_mode(self) -> str:
        """Flip random-faves mode: every message gets a random character from
        the favorites pool (a new personality each line, not just a new
        voice). Returns the confirmation message, including pfp status."""
        on = toggle_random_faves()
        if on:
            favs = get_favorite_voices()
            pick = random.choice(favs)
            status = await reset_avatar_to_default(self.bot)
            return (
                f"🎲 **Random mode ON** — every message now gets a random character "
                f"from your pool of {len(favs)} faves. Pfp holds on the default while "
                f"this is on.\n"
                f"First roll: **{pick.get('title') or 'Unknown'}**  ·  "
                f"run `!random` / `/random` again to turn it off.\n"
                f"🖼️ {status}"
            )
        v = get_voice()
        status = await apply_character_avatar(self.bot, v["reference_id"], v["title"])
        return f"🎲 **Random mode OFF** — locked to **{v['title']}**.\n🖼️ {status}"

    # ── !random — toggle random-voice-every-message mode ────────────────
    @commands.command(name="random", help="🎲 Toggle random voice mode — a random fave every message")
    async def random_prefix(self, ctx: commands.Context):
        async with ctx.typing():
            await ctx.send(await self._toggle_random_mode())

    # ── /random — the same toggle, as a slash command ───────────────────
    @app_commands.command(name="random", description="🎲 Toggle random voice mode — a random fave every message")
    async def random_slash(self, interaction: discord.Interaction):
        await interaction.response.defer()
        await interaction.followup.send(await self._toggle_random_mode())

    # ── /voice_search — search Fish Audio straight from the slash bar ────
    @app_commands.command(
        name="voice_search",
        description="🔍 Search Fish Audio's whole voice library by description",
    )
    @app_commands.describe(query="Describe the voice — e.g. sassy young female, anime girl, deep british male")
    async def voice_search(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer(ephemeral=True, thinking=True)
        results = await search_voices(query, 20)
        if not results:
            return await interaction.followup.send(
                "❌ Nothing found (or no Fish Audio key set). Try other words, "
                "or use `/voice` → 🔗 Paste an ID.",
                ephemeral=True,
            )
        embed = discord.Embed(
            title=f"🔍 {len(results)} voices for “{query}”",
            description="\n".join(
                f"• **{r['title']}** — {_opt_desc(r)}  ·  {r['tasks']:,} uses"
                for r in results[:10]
            ),
            color=LISA_PINK,
        )
        await interaction.followup.send(
            embed=embed, view=VoiceResultsView(results), ephemeral=True
        )


async def setup(bot: commands.Bot):
    await bot.add_cog(VoiceCog(bot))
    print("🎙️ VOICE COG LOADED — /vc /say /voice /random /voice_search · !voice !random + ducking 🔊")
