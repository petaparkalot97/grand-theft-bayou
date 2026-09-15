"""
main.py — Discord bot entry point.
Dedicated chat and utility Discord bot.

Run with:
    python main.py                 # boots the bot + the live TUI dashboard
    python main.py --headless      # plain log-only bot, no dashboard
    BOT_HEADLESS=1 python main.py  # same, via env var

The dashboard is on by default when stdout is an interactive terminal; when
output is piped/redirected or the `textual` package is missing it falls back
to headless automatically.
"""

import os
import sys
import asyncio
import discord
from discord.ext import commands
from dotenv import load_dotenv

# Load credentials from .env
load_dotenv(override=True)

# Ensure local ffmpeg binary (if downloaded by build script) is in PATH
if os.path.exists("./ffmpeg") or os.path.exists("ffmpeg"):
    os.environ["PATH"] = os.path.abspath(".") + os.pathsep + os.environ.get("PATH", "")

# Configure bot intents
intents = discord.Intents.default()
intents.message_content = True   # Required for reading chat messages in active channels & DMs
intents.members = True           # Required for member info
intents.presences = True         # Required for status features
intents.voice_states = True      # Required for voice TTS whisper

bot = commands.Bot(
    command_prefix="!",
    intents=intents,
    help_command=None
)

# Set once in main(); the on_ready tip reads it.
_HEADLESS = False


def _want_tui() -> bool:
    """The dashboard is the default; opt out with --headless / --no-tui /
    BOT_HEADLESS=1 (legacy LISA_HEADLESS is also accepted), or automatically when stdout isn't a real terminal."""
    argv = sys.argv[1:]
    if "--tui" in argv or "--dashboard" in argv:
        return True
    if "--headless" in argv or "--no-tui" in argv:
        return False
    if os.getenv("LISA_HEADLESS", "").strip().lower() in ("1", "true", "yes", "on"):
        return False
    try:
        return sys.stdin.isatty() and sys.stdout.isatty()
    except Exception:
        return False

async def _start_health_server():
    port = os.getenv("PORT")
    if not port:
        return
    try:
        from aiohttp import web
        app = web.Application()
        async def health_handler(request):
            return web.json_response({"status": "online", "bot": str(bot.user)})
        app.router.add_get("/", health_handler)
        app.router.add_get("/health", health_handler)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", int(port))
        await site.start()
        print(f"🌐 HTTP health check server listening on port {port}")
    except Exception as e:
        print(f"⚠️ Could not start HTTP server on port {port}: {e}")

@bot.event
async def on_ready():
    print(f"==================================================")
    print(f"💖 {bot.user.name} is ONLINE! (ID: {bot.user.id})")
    print(f"📊 Connected to {len(bot.guilds)} server(s)")
    try:
        synced = await bot.tree.sync()
        print(f"✨ Synced {len(synced)} slash commands globally")
    except Exception as e:
        print(f"❌ Failed to sync slash commands: {e}")
    print(f"==================================================")
    await _start_health_server()
    if _HEADLESS:
        print(f"💡 Tip: drop --headless (run  python main.py) for the live dashboard.")

async def load_cogs():
    """Load all feature cogs."""
    cogs = [
        "cogs.lisa",
        "cogs.music",
        "cogs.voice",
        "cogs.weather",
        "cogs.reminders",
        "cogs.utilities",
        "cogs.mtg",
        "cogs.help",
    ]
    for cog in cogs:
        try:
            await bot.load_extension(cog)
            print(f"   ✓ Loaded {cog}")
        except Exception as e:
            print(f"   ❌ Failed to load {cog}: {e}")

async def main():
    global _HEADLESS
    token = os.getenv("DISCORD_BOT_TOKEN")
    if not token or token.startswith("<"):
        raise RuntimeError("❌ DISCORD_BOT_TOKEN is missing or invalid in .env")

    if _want_tui():
        try:
            from tui import run_console
        except ImportError as e:
            print(f"⚠️  Dashboard unavailable ({e}) — starting headless. "
                  f"Install `textual` or pass --headless to silence this.")
        else:
            await run_console()
            return

    _HEADLESS = True
    await _start_health_server()
    async with bot:
        await load_cogs()
        await bot.start(token)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Bot shutting down...")
