"""
cogs/help.py — /help and !help: an interactive command reference.

A category dropdown embed covering every command across every cog. Purely
static reference text — update CATEGORIES here whenever a command is added,
renamed, or removed elsewhere.
"""

import discord
from discord import app_commands
from discord.ext import commands

ACCENT_COLOR = 0xFF1493

CATEGORIES = {
    "chat": {
        "label": "Chat & Persona",
        "emoji": "💬",
        "blurb": "Talking to her, channels, unhinged mode.",
        "commands": [
            ("/ditto", "Opens the unified Ditto chat, memory, personal settings, voice, and setup panel."),
            ("/chat_here", "Toggle free chat ON/OFF for this channel. She always answers DMs and @mentions regardless of this setting."),
            ("/settings", "Pick a character just for how she talks to YOU — independent of the shared /voice, and invisible to everyone else. Doesn't touch her shared voice or pfp."),
            (",, <message>", "Prefix any message with `,,` to get that one reply in UNHINGED mode — maximum sass, theatrical monologuing."),
        ],
    },
    "voice": {
        "label": "Voice & Character",
        "emoji": "🎙️",
        "blurb": "Choose a voice and control how chat is spoken.",
        "commands": [
            ("/voice", "Open the voice picker — search, quick picks, shared favorites, preview, and reset."),
            ("!voice", "Quick favorites-only picker — same dropdown as /voice → Favorites, no need to open the full picker."),
            ("/favorites", "A public favorites picker — anyone can pick a saved voice, nobody can erase one."),
            ("/random  ·  !random", "Toggle random mode — a new favorite character every single message."),
            ("/voice_search <query>", "Search Fish Audio's entire voice library by description, e.g. \"deep british male\"."),
            ("/pfp", "Assign a profile picture to a character: pick one from the dropdown, then attach an image as your next message."),
            ("/vc", "Toggle voice replies in your voice channel."),
            ("/say <text>  ·  /speak <text>", "Speak one specific line in your voice channel."),
            ("/tts", "Toggle reading new messages from this text channel aloud."),
            ("/auto-speak", "Configure this channel's bracket/prefix trigger, deletion preference, and accessibility mode."),
            ("<phrase>", "Passive shortcut for /speak: wrap any text in angle brackets in a normal message and she'll say it out loud in your voice channel (you must already be in one), then remove the trigger message to keep chat tidy. Doesn't fire on Discord's own <@mention>/<#channel>/<:emoji:>/<t:timestamp> syntax."),
        ],
    },
    "music": {
        "label": "Music",
        "emoji": "🎵",
        "blurb": "Playback, queue, and nightcore effects.",
        "commands": [
            ("/play <song>", "Queue a song — a YouTube link or just search terms."),
            ("/skip", "Skip the current track."),
            ("/stop", "Stop playback and Ditto's speech, clear both queues, and leave the voice channel."),
            ("/pause  ·  /resume", "Pause or resume the current track."),
            ("/queue", "Show what's queued up."),
            ("/volume <0-200>", "Set playback volume."),
            ("/nowplaying", "Show the currently playing track."),
            ("/autoplay", "Toggle auto-queueing related tracks once the queue runs dry."),
            ("/effects", "Nightcore knobs — adjust pitch & tempo."),
        ],
    },
    "mtg": {
        "label": "Magic: The Gathering",
        "emoji": "🃏",
        "blurb": "Card search, deck building, and playable duels.",
        "commands": [
            ("/mtg", "Opens the MTG hub: 🔍 Search real cards, 📚 build a deck, 💜 duel the bot, or 🎯 challenge a member."),
        ],
    },
    "utility": {
        "label": "Utility",
        "emoji": "🛠️",
        "blurb": "Everyday odds and ends.",
        "commands": [
            ("/ping", "Check the bot's latency."),
            ("/avatar [user]", "Get a user's profile picture (yours if no one's specified)."),
            ("/serverinfo", "Show this server's stats and details."),
            ("/poll <question> <option1> <option2> [option3]", "Create a quick reaction-button poll."),
            ("/weather <city>", "Get the current weather for any city."),
            ("/remind <duration> <reminder>", "Set a reminder — e.g. `/remind 15m stretch break`."),
        ],
    },
}


def _home_embed() -> discord.Embed:
    lines = [f"{cat['emoji']} **{cat['label']}** — {cat['blurb']}" for cat in CATEGORIES.values()]
    embed = discord.Embed(
        title="📖 Help — Command Reference",
        description="Pick a category from the dropdown below to see its commands.\n\n" + "\n".join(lines),
        color=ACCENT_COLOR,
    )
    embed.set_footer(text="Most slash commands have a matching ! shortcut where noted above.")
    return embed


def _category_embed(key: str) -> discord.Embed:
    cat = CATEGORIES[key]
    embed = discord.Embed(
        title=f"{cat['emoji']} {cat['label']}",
        description=cat["blurb"],
        color=ACCENT_COLOR,
    )
    for name, desc in cat["commands"]:
        embed.add_field(name=name, value=desc, inline=False)
    embed.set_footer(text="Use the dropdown below to jump to another category.")
    return embed


class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=180)
        options = [discord.SelectOption(label="Home", value="home", emoji="🏠",
                                         description="Overview of every category")]
        for key, cat in CATEGORIES.items():
            options.append(discord.SelectOption(
                label=cat["label"], value=key, emoji=cat["emoji"], description=cat["blurb"][:100],
            ))
        select = discord.ui.Select(placeholder="Choose a category…", options=options)
        select.callback = self._picked
        self._select = select
        self.add_item(select)

    async def _picked(self, interaction: discord.Interaction):
        key = self._select.values[0]
        embed = _home_embed() if key == "home" else _category_embed(key)
        await interaction.response.edit_message(embed=embed, view=self)


class HelpCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="help", description="📖 Show an interactive list of everything the bot can do")
    async def help_slash(self, interaction: discord.Interaction):
        await interaction.response.send_message(embed=_home_embed(), view=HelpView(), ephemeral=True)

    @commands.command(name="help", help="📖 Show an interactive list of everything the bot can do")
    async def help_prefix(self, ctx: commands.Context):
        await ctx.send(embed=_home_embed(), view=HelpView())


async def setup(bot: commands.Bot):
    await bot.add_cog(HelpCog(bot))
    print("📖 HELP COG LOADED — /help · !help")
