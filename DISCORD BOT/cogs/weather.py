"""
cogs/weather.py — Free weather data via Open-Meteo API.
"""

import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

WEATHER_MAP = {
    0:  ("☀️", "Clear sky",       0x31CFFF),
    1:  ("🌤️", "Mainly clear",    0x88BFD0),
    2:  ("⛅",  "Partly cloudy",   0x93B3BD),
    3:  ("☁️",  "Overcast",        0xA9B8BD),
    45: ("🌫️", "Fog",             0x7B8689),
    48: ("🌫️", "Rime fog",        0x7B8689),
    51: ("🌦️", "Light drizzle",   0x8784DA),
    53: ("🌦️", "Drizzle",         0x6B68C5),
    55: ("🌧️", "Heavy drizzle",   0x504BF3),
    61: ("🌧️", "Slight rain",     0x504BF3),
    63: ("🌧️", "Rain",            0x3A35D0),
    65: ("🌧️", "Heavy rain",      0x0900FF),
    71: ("❄️",  "Slight snow",    0xB4D4E4),
    73: ("❄️",  "Snow",           0xA0C8D8),
    75: ("❄️",  "Heavy snow",     0x8CBCCC),
    95: ("⚡",  "Thunderstorm",    0x6B4A88),
}
_DEFAULT = ("❓", "Unknown", 0x808080)

class Weather(commands.Cog):
    """Weather forecasts for Lisa Bot."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="weather", description="🌤️ Get current weather for any city")
    @app_commands.describe(location="City name (e.g. London, Tokyo, Sydney)")
    async def weather(self, interaction: discord.Interaction, location: str):
        await interaction.response.defer()

        try:
            async with aiohttp.ClientSession() as session:
                geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json"
                async with session.get(geo_url) as resp:
                    if resp.status != 200:
                        return await interaction.followup.send("❌ Could not connect to weather service.")
                    geo_data = await resp.json()

                if not geo_data.get("results"):
                    return await interaction.followup.send(f"❌ Could not find city **{location}**.")

                loc = geo_data["results"][0]
                lat, lon = loc["latitude"], loc["longitude"]
                city = loc["name"]
                country = loc.get("country", "")

                weather_url = (
                    f"https://api.open-meteo.com/v1/forecast"
                    f"?latitude={lat}&longitude={lon}"
                    f"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day"
                    f"&timezone=auto"
                )
                async with session.get(weather_url) as resp:
                    if resp.status != 200:
                        return await interaction.followup.send("❌ Weather data retrieval failed.")
                    data = await resp.json()

                current = data.get("current", {})
                temp_c = current.get("temperature_2m", 0)
                temp_f = round(temp_c * 9/5 + 32, 1)
                humidity = current.get("relative_humidity_2m", 0)
                wind_kph = current.get("wind_speed_10m", 0)
                wmo_code = current.get("weather_code", 0)
                is_day = current.get("is_day", 1)

                emoji, label, colour = WEATHER_MAP.get(wmo_code, _DEFAULT)

                embed = discord.Embed(
                    title=f"{'☀️' if is_day else '🌙'} Weather in {city}, {country}",
                    description=(
                        f"**Condition:** {emoji} {label}\n"
                        f"**Temperature:** {temp_c}°C ({temp_f}°F)\n"
                        f"**Humidity:** {humidity}%\n"
                        f"**Wind Speed:** {wind_kph} km/h"
                    ),
                    color=colour
                )
                embed.set_footer(text="Powered by Open-Meteo | Lisa Bot ✨")
                await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Weather error: {e}")

async def setup(bot: commands.Bot):
    await bot.add_cog(Weather(bot))
