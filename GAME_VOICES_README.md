# Grand Theft Bayou - Voice Generation Pipeline

This document explains how to use the standalone batch voice generator for Grand Theft Bayou. The pipeline extracts all dialogue from the game, connects to the Fish Audio API, and automatically integrates the MP3 files so the game can play them via the existing `say()` function.

## Architecture
```text
                 ┌─────────────────────┐
                 │ game-dialogue.json  │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ game-voices.json   │
                 │ character → voice  │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ generate-game-      │
                 │ voices.py           │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Fish Audio /v1/tts  │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ MP3 game assets     │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ Grand Theft Bayou   │
                 │ dialogue playback  │
                 └─────────────────────┘
```

## Setup

Set your Fish Audio API key as an environment variable, or place it in a `.env` file in the root directory:

```env
FISH_AUDIO_API=your_key_here
```

*Note: The script also accepts `FISH_AUDIO_API_KEY` or `FISH_API_KEY`.*

## Generate

To batch-generate all missing dialogue files:

```bash
python tools/generate-game-voices.py
```

*The script will automatically skip MP3s that have already been generated to save API credits and time.*

## Generate one character

To generate voices for a specific character only (e.g. `cop` or `keseme`):

```bash
python tools/generate-game-voices.py --character cop
```

## Generate a specific line

To test a single line by its ID:

```bash
python tools/generate-game-voices.py --id keseme_001
```

## Force regeneration

To overwrite existing MP3 files (useful if you updated a voice model):

```bash
python tools/generate-game-voices.py --force
```

## Add dialogue

The game's dialogue is automatically routed. To add new lines:
1. Use `await say(c, "CHARACTER_NAME", "Your text here.")` in any game `.js` file.
2. Run `node extract_dialogue.cjs` to extract the new dialogue into `data/game-dialogue.json` and generate new stable IDs.
3. Run `python tools/generate-game-voices.py` to generate the missing audio!

Alternatively, you can manually add objects to `data/game-dialogue.json`:
```json
{
  "id": "cop_001",
  "character": "COP",
  "text": "Freeze!"
}
```

## Add/change a voice

If you need to change a character's Voice ID or Model, modify `data/game-voices.json`:

```json
"keseme": {
  "voice_id": "f1b549768da341069e84d25c5b354d50",
  "voice_title": "Keseme Nadia",
  "model": "s2.1-pro"
}
```
*Note: We currently default to `s2.1-pro-free`. Ensure you have Developer API Credits loaded if you change the model to `s2.1-pro`.*
