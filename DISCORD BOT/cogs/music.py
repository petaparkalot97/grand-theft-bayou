"""
cogs/music.py — Lisa's DJ booth. YouTube playback via yt-dlp + ffmpeg.

Slash commands:
    /play <query>      Search YouTube (or paste a URL) and queue it
    /skip              Skip the current track
    /stop              Stop, clear the queue, leave the channel
    /pause  /resume    Toggle playback
    /queue             Show the queue
    /volume <0-200>    Set playback volume
    /nowplaying        Current track with a progress bar
    /autoplay          Toggle auto-queueing related tracks
    /effects           Nightcore-ish pitch / tempo knobs

The cog is named "Music" and keeps a per-guild `states` dict of
`GuildMusicState` objects — tui.py reads `.current`, `.queue`, `.volume`
and `.autoplay` off those for its NOW PLAYING panel, so don't rename them.
"""

import asyncio
import time
from collections import deque
from typing import Dict, Optional

import discord
from discord import app_commands
from discord.ext import commands

import yt_dlp

LISA_PINK = 0xFF1493

# ── yt-dlp / ffmpeg configuration ──────────────────────────
YTDL_OPTS = {
    "format": "bestaudio/best",
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
    "noplaylist": True,
}

FFMPEG_BEFORE = "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5"
FFMPEG_OPTS = "-vn -b:a 192k"

SILENCE_TIMEOUT = 300  # seconds alone / idle before Lisa leaves


class Track:
    """A single queued song."""

    __slots__ = ("title", "url", "duration", "thumbnail", "requester", "webpage_url")

    def __init__(self, data: dict, requester: discord.abc.User):
        self.title = data.get("title", "Unknown")
        self.url = data.get("url") or data.get("original_url") or ""
        self.duration = data.get("duration") or 0
        self.thumbnail = data.get("thumbnail", "")
        self.requester = requester
        self.webpage_url = data.get("webpage_url", "")

    @property
    def duration_str(self) -> str:
        if not self.duration:
            return "??:??"
        m, s = divmod(int(self.duration), 60)
        h, m = divmod(m, 60)
        return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


class GuildMusicState:
    """Per-guild music state — one per server."""

    def __init__(self):
        self.queue: "deque[Track]" = deque()
        self.current: Optional[Track] = None
        self.volume: float = 1.0
        self.autoplay: bool = False
        self.effects: Dict[str, float] = {"pitch": 1.0, "tempo": 1.0}
        self.text_channel_id: Optional[int] = None
        self.started_at: float = 0.0
        # ── ducking: music is intentionally stopped while Lisa speaks a line ──
        self.suppressed: bool = False
        self._resume_at: float = 0.0
        self._resume_track: Optional[Track] = None

    def clear(self):
        self.queue.clear()
        self.current = None
        self.suppressed = False
        self._resume_track = None


class Music(commands.Cog):
    """YouTube-powered music playback for Lisa."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.ytdl = yt_dlp.YoutubeDL(YTDL_OPTS)
        self.states: Dict[int, GuildMusicState] = {}

    def get_state(self, guild_id: int) -> GuildMusicState:
        if guild_id not in self.states:
            self.states[guild_id] = GuildMusicState()
        return self.states[guild_id]

    # ── helpers ─────────────────────────────────────────
    async def _join_voice(self, interaction: discord.Interaction) -> Optional[discord.VoiceClient]:
        if not interaction.user.voice or not interaction.user.voice.channel:
            await interaction.followup.send(
                "❌ Get in a voice channel first, stooge.", ephemeral=True
            )
            return None

        channel = interaction.user.voice.channel
        vc = interaction.guild.voice_client
        if vc:
            if vc.channel != channel:
                await vc.move_to(channel)
        else:
            vc = await channel.connect()
        return vc

    async def _extract_info(self, query: str) -> Optional[dict]:
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(
                None, lambda: self.ytdl.extract_info(query, download=False)
            )
        except Exception as e:
            print(f"[Music] yt-dlp extract failed: {e}")
            return None

    def _source_for(self, state: GuildMusicState, track: Track,
                    seek: float = 0.0) -> discord.AudioSource:
        opts = FFMPEG_OPTS
        pitch = state.effects.get("pitch", 1.0)
        tempo = state.effects.get("tempo", 1.0)
        if pitch != 1.0 or tempo != 1.0:
            # asetrate changes pitch+speed; atempo compensates speed back
            opts += (
                f' -af "asetrate=48000*{pitch},aresample=48000,atempo={tempo}"'
            )
        before = FFMPEG_BEFORE
        if seek and seek > 0:
            before = f"-ss {seek:.2f} " + before
        source = discord.FFmpegPCMAudio(
            track.url, before_options=before, options=opts
        )
        return discord.PCMVolumeTransformer(source, volume=state.volume)

    def _after_factory(self, guild: discord.Guild):
        def _after(error):
            if error:
                print(f"[Music] Playback error: {error}")
            st = self.states.get(guild.id)
            if st and st.suppressed:
                return  # a TTS line stopped playback; end_speech() will resume it
            asyncio.run_coroutine_threadsafe(self._play_next(guild), self.bot.loop)
        return _after

    # ── ducking API — called by the voice cog when Lisa is about to speak ──
    async def begin_speech(self, guild: discord.Guild) -> bool:
        """Pause the current track (remembering its position) so a spoken line
        can play on the shared voice connection. Returns True if it ducked."""
        state = self.states.get(guild.id)
        vc = guild.voice_client
        if not (state and state.current and vc and vc.is_playing() and not state.suppressed):
            return False
        elapsed = max(0.0, time.time() - state.started_at)
        if state.current.duration:
            elapsed = min(elapsed, max(0.0, state.current.duration - 1))
        state.suppressed = True
        state._resume_at = elapsed
        state._resume_track = state.current
        vc.stop()
        await asyncio.sleep(0.15)  # let the player thread tear down before reuse
        return True

    async def end_speech(self, guild: discord.Guild):
        """Resume the track begin_speech() paused, from where it left off."""
        state = self.states.get(guild.id)
        vc = guild.voice_client
        if not (state and state.suppressed):
            return
        state.suppressed = False
        track, state._resume_track = state._resume_track, None
        # bail if the user hit stop/skip, the track advanced, or we left VC
        if not (track and vc and vc.is_connected() and state.current is track):
            return
        if vc.is_playing():
            return
        seek = state._resume_at
        try:
            vc.play(self._source_for(state, track, seek=seek),
                    after=self._after_factory(guild))
            state.started_at = time.time() - seek
        except Exception as e:
            print(f"[Music] resume-after-speech failed: {e}")
            asyncio.run_coroutine_threadsafe(self._play_next(guild), self.bot.loop)

    async def _play_next(self, guild: discord.Guild):
        state = self.get_state(guild.id)
        vc = guild.voice_client
        if not vc:
            return

        if state.queue:
            track = state.queue.popleft()
        elif state.autoplay and state.current:
            info = await self._extract_info(f"ytsearch3:{state.current.title} mix")
            entries = (info or {}).get("entries") or []
            picked = next(
                (e for e in entries if e and e.get("title") != state.current.title),
                None,
            )
            if not picked:
                state.current = None
                return
            track = Track(picked, guild.me)
        else:
            state.current = None
            await asyncio.sleep(SILENCE_TIMEOUT)
            if guild.voice_client and not guild.voice_client.is_playing():
                await guild.voice_client.disconnect()
            return

        state.current = track
        state.started_at = time.time()
        state.suppressed = False

        try:
            vc.play(self._source_for(state, track), after=self._after_factory(guild))
        except Exception as e:
            print(f"[Music] play() failed: {e}")
            asyncio.run_coroutine_threadsafe(self._play_next(guild), self.bot.loop)
            return

        if state.text_channel_id:
            chan = guild.get_channel(state.text_channel_id)
            if chan:
                embed = discord.Embed(
                    title="🎵 Lisa's spinning",
                    description=f"**[{track.title}]({track.webpage_url or track.url})**",
                    color=LISA_PINK,
                )
                embed.add_field(name="Length", value=track.duration_str, inline=True)
                embed.add_field(
                    name="Requested by", value=getattr(track.requester, "mention", "—"), inline=True
                )
                if track.thumbnail:
                    embed.set_thumbnail(url=track.thumbnail)
                try:
                    await chan.send(embed=embed)
                except discord.HTTPException:
                    pass

    # ── /play ───────────────────────────────────────────
    @app_commands.command(name="play", description="🎵 Queue a song from YouTube")
    @app_commands.describe(query="Song name or a YouTube/SoundCloud/etc. URL")
    async def play(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer()
        vc = await self._join_voice(interaction)
        if not vc:
            return

        state = self.get_state(interaction.guild.id)
        state.text_channel_id = interaction.channel.id

        info = await self._extract_info(query)
        entries = (info or {}).get("entries", [info] if info else [])
        entries = [e for e in entries if e]
        if not entries:
            return await interaction.followup.send("❌ Found nothing. Try different words.")

        track = Track(entries[0], interaction.user)
        state.queue.append(track)

        if not vc.is_playing() and not vc.is_paused():
            await self._play_next(interaction.guild)
            await interaction.followup.send(f"▶️ **Now playing:** {track.title}")
        else:
            await interaction.followup.send(
                f"📋 **Queued** (#{len(state.queue)}): **{track.title}** — {track.duration_str}"
            )

    # ── /skip ───────────────────────────────────────────
    @app_commands.command(name="skip", description="⏭️ Skip the current track")
    async def skip(self, interaction: discord.Interaction):
        vc = interaction.guild.voice_client
        if not vc or not (vc.is_playing() or vc.is_paused()):
            return await interaction.response.send_message("❌ Nothing playing.", ephemeral=True)
        vc.stop()
        await interaction.response.send_message("⏭️ Skipped.")

    # ── /stop ───────────────────────────────────────────
    @app_commands.command(name="stop", description="⏹️ Stop, clear the queue, and leave")
    async def stop(self, interaction: discord.Interaction):
        vc = interaction.guild.voice_client
        self.get_state(interaction.guild.id).clear()
        voice = interaction.client.get_cog("VoiceCog")
        speech_cleared = await voice.stop_speech(interaction.guild) if voice else 0
        if vc:
            vc.stop()
            await vc.disconnect()
        suffix = f" Cleared {speech_cleared} queued speech line(s)." if speech_cleared else ""
        await interaction.response.send_message(f"⏹️ Booth's closed. Bye.{suffix}")

    # ── /pause · /resume ────────────────────────────────
    @app_commands.command(name="pause", description="⏸️ Pause playback")
    async def pause(self, interaction: discord.Interaction):
        vc = interaction.guild.voice_client
        if vc and vc.is_playing():
            vc.pause()
            await interaction.response.send_message("⏸️ Paused.")
        else:
            await interaction.response.send_message("❌ Nothing to pause.", ephemeral=True)

    @app_commands.command(name="resume", description="▶️ Resume playback")
    async def resume(self, interaction: discord.Interaction):
        vc = interaction.guild.voice_client
        if vc and vc.is_paused():
            vc.resume()
            await interaction.response.send_message("▶️ Resumed.")
        else:
            await interaction.response.send_message("❌ Nothing to resume.", ephemeral=True)

    # ── /queue ──────────────────────────────────────────
    @app_commands.command(name="queue", description="📋 Show the music queue")
    async def queue(self, interaction: discord.Interaction):
        state = self.get_state(interaction.guild.id)
        embed = discord.Embed(title="🎵 Lisa's Queue", color=LISA_PINK)

        if state.current:
            embed.add_field(
                name="▶️ Now Playing",
                value=f"**[{state.current.title}]({state.current.webpage_url})** — {state.current.duration_str}",
                inline=False,
            )
        if state.queue:
            lines = []
            for i, track in enumerate(list(state.queue)[:10], 1):
                lines.append(f"`{i}.` **{track.title}** — {track.duration_str}")
            extra = len(state.queue) - 10
            if extra > 0:
                lines.append(f"*… and {extra} more*")
            embed.add_field(name="📋 Up Next", value="\n".join(lines), inline=False)
        elif not state.current:
            embed.description = "Queue's empty. `/play` something."

        embed.set_footer(
            text=f"Volume {int(state.volume * 100)}% · Autoplay {'ON' if state.autoplay else 'OFF'}"
        )
        await interaction.response.send_message(embed=embed)

    # ── /volume ─────────────────────────────────────────
    @app_commands.command(name="volume", description="🔊 Set playback volume (0-200)")
    @app_commands.describe(level="0 = mute, 100 = normal, 200 = double")
    async def volume(self, interaction: discord.Interaction, level: int):
        level = max(0, min(200, level))
        state = self.get_state(interaction.guild.id)
        state.volume = level / 100
        vc = interaction.guild.voice_client
        if vc and vc.source and hasattr(vc.source, "volume"):
            vc.source.volume = state.volume
        await interaction.response.send_message(f"🔊 Volume → **{level}%**")

    # ── /nowplaying ─────────────────────────────────────
    @app_commands.command(name="nowplaying", description="🎶 Show the current track")
    async def nowplaying(self, interaction: discord.Interaction):
        state = self.get_state(interaction.guild.id)
        if not state.current:
            return await interaction.response.send_message("❌ Nothing playing.", ephemeral=True)

        track = state.current
        vc = interaction.guild.voice_client
        progress = ""
        if vc and track.duration:
            elapsed = int(time.time() - state.started_at)
            elapsed = max(0, min(elapsed, int(track.duration)))
            bar_len = 20
            pos = int(bar_len * elapsed / track.duration) if track.duration else 0
            bar = "▬" * pos + "🔘" + "▬" * (bar_len - pos - 1)
            progress = f"\n`{bar}` `{elapsed // 60}:{elapsed % 60:02d} / {track.duration_str}`"

        embed = discord.Embed(
            title="🎵 Now Playing",
            description=f"**[{track.title}]({track.webpage_url})**{progress}",
            color=LISA_PINK,
        )
        if track.thumbnail:
            embed.set_thumbnail(url=track.thumbnail)
        embed.set_footer(text=f"Requested by {getattr(track.requester, 'display_name', '—')}")
        await interaction.response.send_message(embed=embed)

    # ── /autoplay ───────────────────────────────────────
    @app_commands.command(name="autoplay", description="🪄 Toggle auto-queueing related tracks")
    async def autoplay(self, interaction: discord.Interaction):
        state = self.get_state(interaction.guild.id)
        state.autoplay = not state.autoplay
        await interaction.response.send_message(
            f"🪄 Autoplay **{'ON' if state.autoplay else 'OFF'}**"
        )

    # ── /effects ────────────────────────────────────────
    @app_commands.command(name="effects", description="🎛️ Nightcore knobs — pitch & tempo")
    @app_commands.describe(
        pitch="0.5 low · 1.0 normal · 1.25 nightcore · 2.0 chipmunk",
        tempo="0.5 half · 1.0 normal · 2.0 double",
    )
    async def effects(
        self,
        interaction: discord.Interaction,
        pitch: Optional[float] = None,
        tempo: Optional[float] = None,
    ):
        state = self.get_state(interaction.guild.id)
        changed = []
        if pitch is not None:
            state.effects["pitch"] = max(0.25, min(4.0, pitch))
            changed.append(f"pitch → {state.effects['pitch']:.2f}x")
        if tempo is not None:
            state.effects["tempo"] = max(0.5, min(4.0, tempo))
            changed.append(f"tempo → {state.effects['tempo']:.2f}x")

        if not changed:
            return await interaction.response.send_message(
                f"🎛️ pitch **{state.effects['pitch']:.2f}x** · tempo **{state.effects['tempo']:.2f}x**\n"
                "*Takes effect on the next track.*",
                ephemeral=True,
            )
        await interaction.response.send_message(
            "🎛️ " + " · ".join(changed) + "  *(applies to the next track)*"
        )

    # ── cleanup ─────────────────────────────────────────
    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        if member.id != self.bot.user.id:
            return
        if after.channel is None and before.channel is not None:
            st = self.states.get(before.channel.guild.id)
            if st:
                st.clear()


async def setup(bot: commands.Bot):
    await bot.add_cog(Music(bot))
    print("🎵 MUSIC COG LOADED — Lisa's DJ booth is open 🎧")
