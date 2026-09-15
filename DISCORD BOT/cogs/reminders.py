"""
cogs/reminders.py — Timer and reminder utility for Lisa Bot.
"""

import asyncio
import re
import time
import discord
from discord import app_commands
from discord.ext import commands

def parse_time(time_str: str) -> int:
    """Parses strings like '10s', '5m', '2h', '1d' into seconds."""
    match = re.match(r"^(\d+)\s*([s|m|h|d])?$", time_str.strip().lower())
    if not match:
        return 0
    val, unit = match.groups()
    val = int(val)
    if unit == "s" or not unit:
        return val
    elif unit == "m":
        return val * 60
    elif unit == "h":
        return val * 3600
    elif unit == "d":
        return val * 86400
    return 0

class Reminders(commands.Cog):
    """Timer and reminder system."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="remind", description="⏰ Set a reminder with a duration (e.g., 10m, 1h)")
    @app_commands.describe(duration="Time string (e.g. 30s, 15m, 2h)", reminder="What to remind you about")
    async def remind(self, interaction: discord.Interaction, duration: str, reminder: str):
        seconds = parse_time(duration)
        if seconds <= 0:
            return await interaction.response.send_message(
                "❌ Invalid duration format! Example formats: `30s`, `15m`, `2h`, `1d`.", ephemeral=True
            )
        if seconds > 86400 * 7:
            return await interaction.response.send_message("❌ Reminders cannot exceed 7 days.", ephemeral=True)

        target_time = int(time.time() + seconds)
        embed = discord.Embed(
            title="⏰ Reminder Set!",
            description=f"I will remind you about: **{reminder}**\n<t:{target_time}:R>",
            color=0xFFA500
        )
        embed.set_footer(text="Lisa Bot Reminders ✨")
        await interaction.response.send_message(embed=embed, ephemeral=True)

        await asyncio.sleep(seconds)

        try:
            remind_embed = discord.Embed(
                title="⏰ Reminder Alert!",
                description=f"Hey {interaction.user.mention}! Here is your reminder:\n\n**{reminder}**",
                color=0xFF4500
            )
            remind_embed.set_footer(text="Lisa Bot ✨")
            await interaction.channel.send(content=interaction.user.mention, embed=remind_embed)
        except Exception as e:
            print(f"[Reminders] Delivery failed: {e}")

async def setup(bot: commands.Bot):
    await bot.add_cog(Reminders(bot))
