# Fish Audio API & Voice Generation

> **2026-09-17 correction:** the theory below — that the free tier
> (`s2.1-pro-free`) ignores custom voice cloning — does not match what's
> actually been observed. The account has never had Developer API credit,
> yet Chimi/Dixon/Greedo/Peta/Keseme/Sync all clone correctly on the free
> tier. The "generic voice" bug this doc was written about turned out to
> be a placeholder `TODO_...` `referenceId` in `src/voiceCast.js`, not a
> model-tier limitation. See `docs/VOICE_GENERATION.md`'s "Free vs. paid
> model" section for the current understanding. Keeping the rest of this
> doc for the Discord-bot background, which is still accurate.

This document explains the current state of the voiceover generation script (`tools/voiceover-gen.mjs`), why the generated voices sound "generic", and why we cannot use a Discord bot to automate the process for free.

## The Problem: Generic Voices
Currently, when you run the voice generation script, the characters (Kesem Nadia, Chimi, Dixon, etc.) do not sound like the custom voice models you created. Instead, they sound like generic preset voices.

**Why this happens:**
1. The script connects to the official Fish Audio Developer API (`api.fish.audio/v1/tts`) using your `.env` API key.
2. It requests the `s2.1-pro` model to clone your custom `reference_id` voices.
3. Because your API account has **0 Developer Credits**, the API rejects the request.
4. To prevent the script from crashing, our code automatically falls back to the free tier (`s2.1-pro-free`).
5. **The catch:** The free tier accepts the request, but it **strictly ignores custom voice cloning**. It uses your custom voice ID as a random seed to pick a generic preset voice instead.

*(Note: Platform Credits on the main website are completely separate from Developer API Credits).*

## Why We Can't Automate a Discord Bot
You mentioned that you previously used a Discord bot to generate custom voices for free. While that bot likely bypasses the developer paywall by reverse-engineering the website's internal API, **we cannot write a script to automate that bot.**

Here is why:
1. **Bot-to-Bot Restrictions:** Discord's API strictly prohibits bots from interacting with other bots. A Node.js script logging in with your `DISCORD_BOT_TOKEN` cannot trigger the Fish Audio bot's slash commands (e.g., `/tts`). The commands simply will not execute.
2. **Self-Botting is Banned:** The only way to trigger a bot's slash commands via a script is by using a "User Token" (logging in as a real human account). This is known as *self-botting*. Discord actively monitors for this and will permanently ban your Discord account if caught.

## The Solutions
Since we cannot safely automate the Discord bot, you have two options to get the correct voices into the game:

### Option 1: Add Developer Credits (Recommended)
This is the fastest and easiest method.
1. Go to [Fish Audio Developer Billing](https://fish.audio/app/developers).
2. Add a small balance (e.g., $5).
3. Open your terminal and run:
   ```bash
   node tools/voiceover-gen.mjs
   ```
4. The script will automatically use the `s2.1-pro` model, successfully clone your custom voices, and save the `.mp3` files directly into the game folder.

### Option 2: Generate Manually (Free)
If you do not want to pay for API credits, you can generate the lines manually.
1. Open the `assets/audio/voice/` folder to see which files were generated (e.g., `kesem_nadia_01.mp3`).
2. Go to the Fish Audio website and manually generate the text for each line using your custom voice models.
3. Download the audio files and replace the generic `.mp3` files in the `assets/audio/voice/` folder.
