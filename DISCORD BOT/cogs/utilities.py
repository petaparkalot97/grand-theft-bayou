"""
cogs/utilities.py — General utility commands (ping, avatar, serverinfo, poll).
"""

import discord
from discord import app_commands
from discord.ext import commands

class Utilities(commands.Cog):
    """General utilities and information commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="ping", description="🏓 Check bot latency")
    async def ping(self, interaction: discord.Interaction):
        latency = round(self.bot.latency * 1000)
        embed = discord.Embed(
            title="🏓 Pong!",
            description=f"Bot latency is **{latency}ms**",
            color=0x3498DB
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @app_commands.command(name="avatar", description="🖼️ Get a user's profile avatar")
    @app_commands.describe(user="User whose avatar you want to view")
    async def avatar(self, interaction: discord.Interaction, user: discord.Member = None):
        user = user or interaction.user
        embed = discord.Embed(
            title=f"🖼️ Avatar for {user.display_name}",
            color=0x9B59B6
        )
        embed.set_image(url=user.display_avatar.url)
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="serverinfo", description="📊 Show server stats and details")
    async def serverinfo(self, interaction: discord.Interaction):
        guild = interaction.guild
        if not guild:
            return await interaction.response.send_message("❌ This command must be used in a server.", ephemeral=True)

        embed = discord.Embed(
            title=f"📊 {guild.name}",
            color=0x2ECC71
        )
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)

        embed.add_field(name="Owner", value=guild.owner.mention if guild.owner else "Unknown", inline=True)
        embed.add_field(name="Members", value=str(guild.member_count), inline=True)
        embed.add_field(name="Channels", value=str(len(guild.channels)), inline=True)
        embed.add_field(name="Roles", value=str(len(guild.roles)), inline=True)
        embed.add_field(name="Created At", value=f"<t:{int(guild.created_at.timestamp())}:D>", inline=True)

        embed.set_footer(text=f"Server ID: {guild.id} | Lisa Bot ✨")
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="poll", description="📊 Create a quick community poll with reaction choices")
    @app_commands.describe(question="The question to ask", option1="Choice 1", option2="Choice 2", option3="Choice 3 (optional)")
    async def poll(self, interaction: discord.Interaction, question: str, option1: str, option2: str, option3: str = None):
        options = [("1️⃣", option1), ("2️⃣", option2)]
        if option3:
            options.append(("3️⃣", option3))

        desc = f"**{question}**\n\n"
        for emoji, opt in options:
            desc += f"{emoji} {opt}\n"

        embed = discord.Embed(
            title="📊 Community Poll",
            description=desc,
            color=0x3498DB
        )
        embed.set_footer(text=f"Poll created by {interaction.user.display_name} ✨")
        
        await interaction.response.send_message(embed=embed)
        msg = await interaction.original_response()

        for emoji, _ in options:
            await msg.add_reaction(emoji)

async def setup(bot: commands.Bot):
    await bot.add_cog(Utilities(bot))
