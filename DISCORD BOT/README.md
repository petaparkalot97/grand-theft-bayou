# Discord Chat & Voice Bot

A Discord bot with a configurable chat persona and voice features, including
persistent per-user memory, a live "flirt gauge", voice replies, music playback,
and a playable Magic: The Gathering mode.

## Run

```bash
pip install -r requirements.txt        # also needs ffmpeg on PATH
cp .env.example .env                    # fill in your keys
python main.py                          # headless
python tui.py                           # or: live terminal dashboard
```

## Features

| Command / entry | What it does |
|---|---|
| `/ditto` | Unified chat, memory, personal settings, speech, and setup control panel |
| `/tts` | Read this text channel aloud in your voice channel |
| `/auto-speak` | Speak messages using brackets or a configurable prefix (bracket triggers are removed after successful speech) |
| `/stop` | Stop music and Ditto's speech, clear queues, and leave the voice channel |
| `/vc`, `/say`, `/speak`, `/voice` | Join voice / speak a line / change the active voice |
| `/play` `/skip` `/queue` `/volume` `/effects` … | Music (yt-dlp + ffmpeg); ducks under voice playback |
| `/mtg` | Card search (Scryfall), decklists, and simplified duels vs the bot or a member |
| `/weather` `/remind` `/poll` `/convert` … | Utilities |

Persona, memory, flirt-gauge and voice logic live in the chat and voice cogs +
`cogs/voice.py`; AI provider fallback in `utils/ai.py`; TTS in `utils/tts.py`.
Working notes and history are in `TODO.md`.

## Config

All secrets in `.env` (gitignored). See `.env.example`. Runtime state
(`data/`) is gitignored too.
