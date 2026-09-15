# Lisa Discord Bot — TODO

## Project summary
Discord bot ("Lisa") — AI chat companion with persistent per-user memory, voice
replies (TTS), music playback, and interactive emoji-button choices. As of
2026-09-12 the bot has no fixed "Lisa the hacker" identity anymore: whatever
voice/character is picked via `/voice`, she fully becomes that character
(personality + Discord avatar), with one constant underneath every persona —
heavy sexual innuendo/puns, and the pet names "stooge" / "bebii" / "omg bebii!~".
Core persona in `cogs/lisa.py`; voice/character picker in `cogs/voice.py`;
avatar sync in `utils/avatar.py`; music in `cogs/music.py`; multi-provider AI in
`utils/ai.py` (OpenRouter + Groq fallback); the /mtg card-dueling minigame
(`cogs/mtg.py`) is unchanged and still playable, just no longer part of the
default chat personality. `python main.py` boots the bot inside the `tui.py`
Textual dashboard by default (`--headless` for a plain log-only bot).

## Current status
- **`<phrase>` passive shortcut for /speak (2026-09-12, `cogs/voice.py`):**
  - New `VoiceCog.on_message` listener (independent of `LisaCog.on_message` —
    both fire on the same message; this one only cares about voice, not
    chat/persona). Any message in a guild (not DM, not `!`/`/`-prefixed)
    containing `<some text>` gets that text spoken aloud in the author's
    current voice channel via the same `self.speak()` primitive `/say`/
    `/speak` use — joins/moves to their channel automatically.
  - `_extract_speak_shortcut()` + `_DISCORD_TOKEN_RE`/`_BRACKET_RE` carefully
    exclude Discord's own bracket syntax first: `<@mention>`, `<@!mention>`,
    `<#channel>`, `<:emoji:id>`/`<a:emoji:id>`, `<t:timestamp:R>` all get
    skipped so normal messages with mentions/emoji/timestamps don't
    accidentally trigger TTS. Verified against a battery of these plus mixed
    "real mention + real phrase" messages.
  - Silently no-ops if the author isn't in a voice channel (no error-spam risk
    for someone who just happens to type angle brackets); reacts 🗣️/❌ on the
    triggering message instead of sending a new one.
  - Listed in `/help` → 🎙️ Voice & Character, alongside `/say`/`/speak`.
- **Per-user text-personality override — `/settings` (2026-09-12):**
  - `utils/user_persona.py` (new) — `data/lisa_user_personas.json`,
    `get_user_persona(user_id)` / `set_user_persona(...)` /
    `clear_user_persona(...)`. Deliberately separate from `utils/tts.py`'s
    global `get_voice()`/`set_voice()`.
  - **Why separate:** a user asked whether voice could be per-user (they see
    Darth Vader, their friend sees Michael Jackson). Avatar and nickname
    can't be — Discord shows one avatar/nickname per bot per server to
    everyone, and a voice channel is one shared audio stream — so those stay
    driven by the shared global `/voice` as before. What *can* differ per
    user for free is which character she writes as in a given reply, since
    each message renders independently. Scoped to text-only per the user's
    choice when asked (options were text-only / text+DM-audio /
    text+per-invoker-audio-everywhere — they picked text-only).
  - `cogs/lisa.py`: `_character_prompt(user)` now checks
    `get_user_persona(user.id)` first and only falls back to the shared
    global voice if that user has no override — same CHARACTER prompt block,
    just a different source, with a line telling the AI whether it's a
    personal-only pick or the shared one. `_voice_footer_tag(user_id)`
    mirrors the same precedence so the reply embed footer shows `🎭 <name>
    (just for you)` vs plain `🎭 <name>`.
  - `/settings` command + **⚙️ My Settings** button on `/lisa` → `open_settings()`
    → `PersonalPersonaView` — dropdown reuses the same favorites list `/voice`
    draws from (`get_favorite_voices()`), plus a "Use the shared default"
    entry to clear the override. Ephemeral, stays open after a pick so users
    can flip between choices without re-running the command.
  - Explicitly told to the user in the embed/confirmation text: this never
    touches the shared voice, pfp, or nickname.
- **Help menu, `/chat_here`, replay button, image-ping gate (2026-09-12):**
  - `cogs/help.py` (new) — `/help` (ephemeral) and `!help` (public), an
    interactive category-dropdown embed (`HelpView`/`_home_embed`/
    `_category_embed`) covering every command in every cog. Registered in
    `main.py`'s `load_cogs()`. Static reference text in `CATEGORIES` — update
    it by hand whenever a command changes elsewhere.
  - `/chat_here` (`cogs/lisa.py`) — thin slash wrapper around the existing
    `toggle_channel()`, so the Chat-here toggle no longer requires opening
    `/lisa` first.
  - Reply embed footer now shows the active voice/character
    (`_voice_footer_tag()`, e.g. `🎭 Darth Vader`) so it's always visible who
    you're talking to.
  - **Flirt-gauge visuals removed from the reply embed** — no more bar/%/heat
    label/MELTDOWN banner/cooldown text on every message (`_build_lisa_embed`
    now just shows the voice tag + exchange count). The gauge itself is
    unchanged and still drives her tone via `MELTDOWN_PROMPT`/`COOLDOWN_PROMPT`
    in the system prompt — this was purely a display change. The detailed
    view is still available via `/lisa` → 🧠 Memory (untouched).
  - **🔁 Replay button on `/say` and `/speak`** (`cogs/voice.py` `ReplayView`)
    — the ephemeral confirmation now carries a button that re-speaks the same
    line, looking up the voice client fresh each press (guild lookup by id,
    not a stale closed-over object) so it still works if the bot moved
    channels. Omitted when the original line failed to speak.
  - **Images no longer trigger a reply in active channels** unless the bot is
    also @mentioned (or it's a DM) — `on_message` now checks
    `message.attachments` for an `image/*` content type and bails before
    generating a reply if one is present without an explicit ping. Fixes
    someone posting an unrelated picture in a Chat-here channel getting a
    "Hey Lisa!"-fallback reply.
- **Personality overhaul — dropped the Lisa/MTG/Ashimaru identity, added full
  character immersion + per-character Discord avatars (2026-09-12):**
  - `cogs/lisa.py`: `LISA_SYSTEM_PROMPT` rewritten from scratch. Gone: the
    "19-year-old hacking prodigy" backstory, the MTG-obsession section (+
    `MTG_WORDS`/`MTG_BUMP`/`_MTG_SPRINKLES`/`MTG_SPRINKLE_CHANCE` sprinkle
    engine), the ASHIMARU "master" section, `SWEETHEART_ID`/`SWEETHEART_PROMPT`
    and `_ensure_meltdown_pings()` (all dead — `SWEETHEART_ID` was already
    `None`), and the `USER_DIRECTIVES` entry that flirted about one user's MTG
    skill. Kept: the other two `USER_DIRECTIVES` (kids joke, Trump
    camaraderie), BREVITY/MEMORY/FLIRT-GAUGE/FORMAT mechanics, `MELTDOWN_PROMPT`
    /`COOLDOWN_PROMPT` (already generic). New CORE PERSONALITY section is the
    one constant across every character: heavy innuendo/puns, and always
    working in 'stooge', 'bebii', and 'omg bebii!~'.
  - **Full character immersion, no toggle** — `_voice_roleplay_prompt()` (gated
    behind a 🎭 Roleplay on/off button) replaced by `_character_prompt()`,
    which is unconditionally active whenever a non-default voice is selected:
    the AI fully becomes that character (speech, attitude, worldview) with the
    CORE PERSONALITY filtered through their voice, not layered on top. The 🎭
    Roleplay button and the `roleplay` flag are gone entirely from
    `cogs/voice.py` / `utils/tts.py` (`get_voice()`/`set_voice()` no longer
    carry it) — picking a voice now always means "become this character."
  - **Per-character Discord avatar — `utils/avatar.py` (new):** picking a
    voice also tries to change the bot's own Discord profile picture to that
    character. Image source order: `data/character_avatars/<voice-id-or-slug>.*`
    (a picture you save yourself — see the README.txt generated in that
    folder) → Google Custom Search image fallback (needs
    `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` in `.env`, both optional — a
    hit is cached back into the folder so it's a one-time API cost per
    character) → left unchanged if neither has anything.
    `data/character_avatars/_default.*` is the picture restored whenever
    there's no specific character (random-voice mode, or the plain default
    voice) — **save the bot's normal pfp there** so reverts have somewhere to
    go.
  - **Switched to per-server avatar + nickname sync (2026-09-12)** — was
    `bot.user.edit(avatar=…)` (the bot's *global* account avatar: every
    server, DMs, bot lists — and Discord's harshest rate limit). Now
    `guild.me.edit(avatar=…, nick=…)` per guild the bot is in: only changes
    how the bot looks/is named in that server, leaves DMs and other servers on
    the plain default, and rides a far less punishing rate limit (a different
    API endpoint entirely). Nickname format is `"<bot name> - <character>"`
    (2026-09-12, `_nick_for(bot_name, title)`) — e.g. "Ditto君 - Darth Vader" —
    so the bot's real name stays recognizable while showing who she's playing;
    parenthetical bits like "(The Simpsons)" are stripped from the character
    half first, then the character half is trimmed (not the bot name) to fit
    Discord's 32-char nickname cap, falling back to the bot name alone in the
    extreme case where even "<name> - " doesn't leave room for anything.
    Bundled into the same `Member.edit()` call as the avatar — one throttled
    action does both. `reset_avatar_to_default()` clears the nickname back to
    the bot's own name at the same time it reverts the pfp. `_apply_to_guilds()`
    loops every guild and reports how many succeeded/failed so one guild
    missing "Change Nickname" permission doesn't silently break the rest.
  - **`/pfp` command (2026-09-12, `cogs/voice.py` `PfpPickerView`)** — no more
    manually naming files yourself: pick a character from a dropdown (favorites
    + "Default", ✅/🖼️ marks which already have a picture), then attach an
    image as your next message within 60s (`bot.wait_for("message", …)`) and
    it's saved via `utils.avatar.save_avatar_image()` keyed by that voice's
    exact `reference_id` (or `_default` for the default slot) — rejects
    non-images and anything over 8MB. If the character you just set is the
    one currently active, it also tries to apply the pfp immediately
    (cooldown-gated like everything else in `utils/avatar.py`).
  - **5-minute avatar cooldown** (Discord hard-limits profile-picture changes):
    persisted in `data/avatar_state.json`. The voice/character switch itself
    is never blocked — only the actual Discord avatar API call is throttled;
    if it's too soon, the pfp just stays as-is and the confirmation message
    says how long until the next change is allowed. Wired into every
    voice-picking path: `/voice` search/quick-picks/favorites dropdown, paste
    ID, `!voice`/`/favorites` pickers, `!random`/`/random` toggle (turning
    random ON resets to the default pfp; turning it OFF re-applies the
    now-locked voice's pfp), the admin ♻️ Reset button, and a best-effort sync
    on bot startup (`VoiceCog.on_ready`) so a restart doesn't leave the avatar
    stale.
  - `cogs/mtg.py` **untouched on purpose** — the playable Magic: The Gathering
    duel minigame (`/mtg`) stays available; only the *personality's* unprompted
    MTG obsession in normal chat was removed.
  - Open design call (flag if it should be the other way): voice/persona
    switches always take effect **immediately** in chat; only the Discord
    avatar sync is what's rate-limited/deferred. Went this way instead of
    blocking the whole switch for 5 minutes so picking the wrong voice isn't a
    5-minute lockout.
  - **Not yet built:** live-in-VC speech-to-text (listen instead of type,
    respond in voice+text) — discussed 2026-09-12, feasible via
    `discord-ext-voice-recv` (discord.py can't receive voice natively) +
    Groq's Whisper endpoint (key already in `.env`), but needs a push-to-talk
    vs. always-on-VAD decision before building. Not started.
- MTG obsession restored + Ashimaru/master dynamic (2026-09-10) — **superseded
  2026-09-12, see above**:
  - Prompt: MAGIC section is now proactive ("steer every conversation toward it
    whenever there's an opening, ~1 reply in 4") with a longer innuendo phrase
    list. New ASHIMARU section: her "master" — said with a wink and enjoyment,
    brought up unprompted, sultry training-session/mana-tapping references,
    territorial if anyone claims to out-play them.
  - Code: `_generate_lisa_reply()` now rolls an MTG sprinkle — if the message
    mentions MTG_WORDS OR a 25% chance fires, one of three sprinkle directives
    is appended so the obsession actually materializes (prompt-only frequency
    was unreliable). `import random` added to lisa.py.
- `USER_DIRECTIVES` restored (2026-09-10):
  - The per-user targeting dict had been emptied by the SFW persona pass, which
    silently disabled all three behaviours. Restored:
    `189998460831924225` — playfully ask if they've had children yet and offer to
    "help with that" (flirtatious innuendo, non-explicit);
    `821888630930276382` — smitten-about-their-MTG-skill flirting;
    `1086436323537195039` — fellow Trump-supporter/Republican camaraderie.
  - Wording kept suggestive-not-explicit so the OpenRouter/Groq refusal-failover
    in `utils/ai.py` doesn't kick in (explicit prompts were what tripped it).
  - Plumbing was never broken: `_generate_lisa_reply()` already injects
    `USER_DIRECTIVES.get(user.id)` into the system prompt each reply.
- 🎭 Voice roleplay mode (2026-09-10) — the voice and the brain are now connected:
  - Motivation: Trump voice saying "Lake Ontario" like a GPS is not realistic.
  - `utils/tts.py`: new persisted `roleplay` flag in `data/lisa_voice.json`
    (read in `get_voice()`, preserved by `set_voice()` / `toggle_random_faves()`,
    flipped by new `toggle_roleplay()`). Picking a new voice while the mode is on
    means "same mode, new character".
  - `cogs/voice.py`: 🎭 **Roleplay** button on `/voice` (success/green, row 1) —
    toggles the mode and confirms with the active voice's name; picker embed
    shows `· 🎭 roleplay ON`; 🎲 roll confirmations mention it too.
  - `cogs/lisa.py`: `_generate_lisa_reply()` appends `_voice_roleplay_prompt()`
    when the flag is on — Lisa adopts the selected voice's character (speech
    style, catchphrases, attitude, accent-in-text) while keeping memory, flirt
    gauge, option list, brevity and the non-explicit rails. Lazy import + try/except
    so TTS problems can never block normal chat.
- Persona → heavy-innuendo edition (2026-09-10):
  - `LISA_SYSTEM_PROMPT` rewritten: suggestive-not-explicit. Innuendo is native
    tongue (tech-vocab double entendres: penetration testing, payload delivery,
    root access, mounting drives), "imply constantly, state NEVER", no anatomical
    words / acts / crude slang; explicit user escalations get side-stepped
    in-character. MTG section keeps the sultry double-meaning bits but drops the
    "filthy explicit remark" mandate. Flirt-gauge levels now cap at "flustered /
    demanding, but STILL never explicit" even at 100% meltdown; MELTDOWN_PROMPT
    was already clean and stays. UNHINGED_PROMPT = innuendo turned up, never
    explicit. Why: explicit prompts are exactly what triggers the canned-refusal
    failover in `utils/ai.py`, so this version is both in-bounds and more stable.
  - Also fixed a second stray `)` + duplicated `UNHINGED_PROMPT` left by the
    same manual prompt swap (bot could not boot again).
- `!voice` / `!random` prefix commands + shorter replies (2026-09-10):
  - `VoiceCog` gains two `!` prefix commands (the bot's `command_prefix="!"` was
    registered but unused until now; Lisa's `on_message` already skips `!` text):
    **`!voice`** — favorites-only picker (embed of the faves pool + the same
    `VoiceResultsView` dropdown the /voice Favorites button uses); **`!random`**
    — rolls a random favorite via `random.choice()` and `set_voice()`s it right
    now (one-shot roll; 🎲 Random Fave on /voice still re-rolls every line).
  - Reply length tightened: `MAX_REPLY_CHARS` 420 → 280, prompt BREVITY rule
    ~3 sentences/400 chars → 2 sentences/250 chars, `max_tokens` 400 → 300.
  - Fixed a leftover unmatched `)` after the persona-prompt swap that broke
    `cogs/lisa.py` entirely (bot wouldn't boot).
- Voice-guild preference persists + auto-rejoin (2026-09-10):
  - `_voice_guilds` (speak-replies-aloud) is now backed by
    `data/lisa_voice_guilds.json` as a `{guild_id: channel_id}` map — written by
    `toggle_voice()` on both on and off. `_load_voice_guilds()` /
    `_save_voice_guilds()` mirror the channel store.
  - New `LisaCog.on_ready` listener (`_voice_rejoined` one-shot guard) reconnects
    to each saved voice channel on boot; a channel that no longer exists is
    dropped from the store.
- SFW consistency sweep (2026-09-10): finished the detox — cleared the last MTG /
  "demand Magic" leftovers the persona pass missed: the `get_memory_context()`
  meltdown state string, the `_build_lisa_embed()` "MTG DEMANDS IMMINENT" /
  "demanding Magic. Immediately." lines, `COOLDOWN_PROMPT`, the tui FEED meltdown
  line, and the FLIRT GAUGE header comment. `_apply_flirt()` MTG branch collapsed
  to a single `if MTG_BUMP and …` (dead while `MTG_BUMP = 0`). Also restored the
  per-turn "flirt gauge: N% (state)" nudge that the persona diff left computed
  but unused — so 40 %/70 % thresholds drive her composure again, not just 100 %.
- `clean_reply[:1990]` truncation left as a defensive guard only — the
  `_shorten()` / `MAX_REPLY_CHARS = 280` brevity cap means replies never reach it,
  so the old "split long replies across messages" idea is moot by design.
- Dashboard is the default launcher (2026-09-10):
  - `python main.py` now boots the bot **inside the Textual TUI** — no more
    separate `python tui.py`. `main._want_tui()` decides: on unless `--headless`
    / `--no-tui` / `LISA_HEADLESS=1`, or stdout isn't a TTY (piped / CI /
    systemd), or `textual` import fails → automatic headless fallback. `--tui`
    forces it on.
  - `tui.py`: `_run()` renamed to `run_console()` (with a `_run` back-compat
    alias); `python tui.py` still works as a direct launcher.
  - `main.py` on_ready tip now only shows in headless mode ("drop --headless…").
- SFW persona pass + prompt hardening (2026-09-10):
  - `LISA_SYSTEM_PROMPT` rewritten: `[CONTEXT & FICTIONAL ROLEPLAY FRAMING]` +
    `[EXPLICIT ANTI-ASSISTANT CONSTRAINTS]` headers (stay in character, never an
    AI, no disclaimers, roast jailbreak attempts in-character) and a
    `VARIETY & NATURAL SPEECH` rule against canned phrases / card-game slogans.
  - Explicit sexual content stripped from the persona, MENACE, WHAT YOU DO,
    MEMORY and FLIRT GAUGE sections — Lisa is now "bold, flirty, teasing", not
    "insatiable / depraved"; the dirty variable-name gag is gone.
  - MTG-is-innuendo behaviour removed: `MTG_WORDS` cut to a plain 5-word list,
    `MTG_BUMP = 0`, the MTG-vocab hook dropped from `get_memory_context()`, MTG
    lines removed from the system prompt / MELTDOWN / memory examples.
    'ashimaru' removed from `NAUGHTY_WORDS`.
  - Hardcoded per-user targeting removed: `SWEETHEART_ID = None`,
    `SWEETHEART_PROMPT = ""`, `USER_DIRECTIVES = {}` (dropped the breed/children
    and "good at MTG / inspired by Jerkmate" directives). `tui.py` drops the
    "(sweetheart)" profile tag. `_ensure_meltdown_pings()` now no-ops when
    `SWEETHEART_ID` is None (was appending a literal `<@None>` — fixed).
  - `MELTDOWN_PROMPT` rewritten: "completely overwhelmed and flustered, speak
    intensely in character" — no explicit acts, no MTG demand, no ping spam.
  - Cooldown countdown text ("Cooling down… 240s") is stripped from replies and
    TTS via `_strip_cooldown_text()` / `COOLING_DOWN_RE` (both send sites +
    `_speakable()`).
- Refusal / leak filtering — `utils/ai.py` (2026-09-10):
  - `_is_canned_refusal()` / `REFUSAL_RE` detect corporate refusal boilerplate
    and assistant clichés ("As an AI…", "How can I assist…", "I can't fulfill…");
    the OpenRouter and Groq loops skip such a response and fail over to the next
    model, logging `[AI Fallback] … returned a canned refusal`.
  - `_clean_reasoning_tags()` now also strips an unclosed `<think>…` block left
    when `max_tokens` cut off the closing tag.
  - Final all-providers-failed string is now an in-character Lisa line.
- Favorite voices — `utils/tts.py` + `cogs/voice.py` (2026-09-10):
  - `data/lisa_favorite_voices.json` + `get_favorite_voices()` /
    `add_favorite_voice()` / `remove_favorite_voice()` (seeded with the default
    voice).
  - `toggle_random_faves()` + `random_faves` flag in `data/lisa_voice.json`:
    when on, `get_voice()` returns a random favorite on every call (so Lisa's
    voice changes each line). `set_voice()` / `reset_voice()` clear it.
  - `/voice` picker gains ❤️ **Favorites** (dropdown of saved voices),
    ➕ **Save Fave** / 💔 **Unfave** for the current voice, 🎲 **Random Fave**
    (toggle the mode above), and 🎧 **Preview** is now a modal — type any phrase
    and hear the active voice say it. Picker embed shows the favourites count +
    random-mode state and refreshes in place after save/unfave (fixed a double
    interaction-response crash on those two buttons).
- Reply length cap (2026-09-10): long replies were getting their TTS cut off
  and reading like a neutral assistant. Three layers now:
  1. `LISA_SYSTEM_PROMPT` BREVITY hard rule — ≤3 sentences / <400 chars prose,
     no essays / both-sides explainers / principle lists.
  2. `_generate_lisa_reply` `max_tokens` 1500 → 400.
  3. `_shorten()` / `MAX_REPLY_CHARS = 420` — trims prose at a sentence (then
     word) boundary; applied to `clean_reply` at both send sites before the
     embed / meltdown-pings / `_speak_reply`.
- Voice suite — `cogs/voice.py` (`VoiceCog`), wired into main.py (2026-09-10):
  - `/vc` — fast toggle for Lisa join+speak-replies (delegates to
    `LisaCog.toggle_voice`; the 🎤 Voice panel button still works too).
  - `/say <text>` — Lisa speaks one line in the caller's VC (joins if needed).
  - `/voice` + new **🎙️ Voice model** button on `/lisa` → voice picker:
    🔍 Search (Fish `GET /model` — the *entire* discovery library by
    description), ⭐ Quick picks (8 hand-picked, all verified live),
    🔗 Paste ID / `fish.audio/m/…` link (validated via `GET /model/<id>`),
    🎧 Preview (uploads an mp3 sample, no VC needed), ♻️ Reset.
  - Selection persists to `data/lisa_voice.json` (`utils/tts.py` reads it live —
    no restart). Priority: file > `FISH_AUDIO_REFERENCE_ID` env > default.
  - `VoiceCog.speak(vc, text)` is the shared primitive: cleans text, generates
    TTS, **ducks the music cog**, plays, resumes music. Per-guild `asyncio.Lock`
    serialises lines. `LisaCog._speak_reply()` now routes through it (with an
    inline fallback if VoiceCog is missing).
  - **Music ducking** (`cogs/music.py`): `begin_speech()` stops the track
    remembering its position (`suppressed` flag so `_after_factory` won't
    advance the queue); `end_speech()` resumes it with `ffmpeg -ss <pos>`.
    `_source_for(..., seek=)` added; `after_play` closure → `_after_factory`.
  - `utils/tts.py` rewritten: `get_voice/set_voice/reset_voice`,
    `search_voices()`, `get_voice_meta()`, `_api_key()`; `generate_speech()`
    now pulls the current voice from `get_voice()`.
  - `main.py` boots the TUI by default now — see "Dashboard is the default
    launcher" above. (Was: separate `python tui.py` launcher.)
- /mtg hub — search, decks, playable duels (2026-09-10):
  - `cogs/mtg.py` (`MTGCog`), wired into main.py. Slash /mtg opens a panel:
    🔍 Search (Scryfall API, free/no key, cached; modal input, card embed with
    image + rules text), 📚 Deck (3 slots/user, paste decklist into a modal —
    "4 Lightning Bolt" syntax, names auto-corrected via Scryfall, capped 60
    cards / 4 copies / 20 basics; empty paste clears), 💜 Duel Lisa, 🎯
    Challenge member (UserSelect), 📖 Rules.
  - **Lisa Format** (simplified duels, real cards): 20 life, 7-card hand,
    one land drop/turn, lands tap for 💎1 generic, spells cost printed
    generic mana, creature P/T derived deterministically from card name
    (md5 → 1..7/1..7, cost 1..5). Attacks declared via button (all-in),
    defender blocks chosen by heuristic (survive > trade, desperate trades
    when low). Deck-out burns hand at 1 life/card; 30-turn cap then
    highest life wins.
  - Duel UI: dynamic DuelView — hand dropdown (name + derived stats),
    Play Land / Attack / End Turn / Concede buttons, uid-checked turns,
    state re-rendered by editing the duel message. PvP turns alternate;
    Lisa's turn resolves instantly inside end_turn (AI bundle).
  - Lisa AI: ramp → cast biggest affordable threat → attack all-in when
    lethal or board empty, else swing biggest. Trash talk lines carry
    [FLIRT: +N] tokens that feed the real flirt gauge via _extract_flirt_delta.
    Beating Lisa (or her reaching 0 life) pumps the gauge +40 → guaranteed
    meltdown; her win/lose/draw lines gauge-adjust too (win +10..15, loss −5..8).
  - Persistence: data/mtg_decks.json (per-user deck lists). Deck embeds show a
    🎲 5-card opening-hand sample with Lisa Format stats (_sample_hand_text,
    rerolls every reopen) so users can preview hand quality. Engine is pure
    logic, testable headless — full simulated duel, PvP alternation and
    AI-bundle all verified; fixed unhashable-dict blocker map via id() keys.
- Lisa control console — `tui.py` rebuilt (2026-09-10):
  - Replaced the generic BOTKIT observer with a Lisa-focused console:
    LISA panel (status + unhinged mode + active chat channels + voice guilds +
    "remembers N users / M melting / K cooling" + now-playing), MEMORY DataTable
    (one row per remembered user: gauge bar, %, exchanges, warm/flustered/
    sweating/MELTDOWN/cooldown), PROFILE panel (selected user: gauge, seen times,
    notes, last 4 exchanges), FEED (messages + Lisa replies + slash cmds + every
    flirt-gauge move ▲/▼/💥/🧊 via a 1 Hz snapshot-diff).
  - Reads `LisaCog` (`get_cog("LisaCog")`): `_emergency_mode`, `_active_channels`,
    `_voice_guilds`, `memory.data`. Read-only — never touches `get_user_memory`
    (which would mutate), only `.get()`s. Same theme cycle / screenshot / `_run`.
  - Verified via `App.run_test()` pilot against the real memory file.
- Post-meltdown cooldown + MTG vocab (2026-09-10):
  - Once the gauge falls below 100% after a meltdown, Lisa enters a 4-minute
    (COOLDOWN_SECONDS = 240) embarrassment cooldown: deadpan denial, claims
    nothing happened, "completely normal about Magic", threats if pushed
    (COOLDOWN_PROMPT + get_memory_context hook).
  - Cooldown ends early if the gauge drops below COOLDOWN_TRIGGER (95).
  - Embed during cooldown: purple strip, 🧊 "denial lifts in Ns" footer
    countdown, italic "perfectly fine" line in the choices embed.
  - New MTG_WORDS vocabulary list (mana, tapping, sleeving up, top-decking,
    ramp, mulligan, flooding, stacking the deck, Commander, draft, etc.) adds
    the +6 MTG bump — so MTG talk in any form turns her on. 'ashimaru' is in
    both NAUGHTY_WORDS (+15) and MTG_WORDS (+6) → +21 combined. Do not ask.
- Live flirt gauge — "horny meter" (2026-09-10):
  - The 💖 footer gauge is now a real 0-100 meter per user that moves every turn:
    keyword scan (spicy/naughty/freaky tiers: +8/+15/+25, MTG mentions +6 by
    design), Lisa's own `[FLIRT: +N]` self-report token (stripped like
    [REMEMBER:], clamped -20..+30), and -4 decay on tame exchanges.
  - System prompt has a FLIRT GAUGE section: she rates each exchange herself and
    plays less composed as it climbs (40% flustered, 70% sweating, 100% gone).
  - Escalating embed: color pink → hot pink → red → dark red at 100%, footer
    heat labels (😳/🔥/🚨), and a "MTG DEMANDS IMMINENT" warning in the choice
    embed at 100%.
  - 100% MELTDOWN: `MELTDOWN_PROMPT` injected — she steamrolls the convo into
    demanding MTG (all innuendo) and tags the sweetheart several times;
    `_ensure_meltdown_pings()` guarantees ≥3 `<@711974387364134942>` pings even
    if the model forgets. She stays there until decay brings her back down.
- Music cog + TUI (2026-09-10):
  - `cogs/music.py` — cog name `Music`, per-guild `GuildMusicState` in `.states`.
    Slash: /play /skip /stop /pause /resume /queue /volume /nowplaying /autoplay
    /effects. yt-dlp + ffmpeg. Wired into `main.py` cogs list.
  - `tui.py` (project root, `python tui.py`) — see "Lisa control console" above.
  - `requirements.txt` created (was missing) — incl. yt-dlp, gTTS, textual, psutil.
- Persistent memory of facts (2026-09-10):
  - User memory gains a `notes` list (data/lisa_memory.json, already persistent).
  - Lisa emits `[REMEMBER: fact]` tokens in replies; `_extract_notes()` strips
    them from display and `add_notes_async()` stores them de-duped (cap 40).
  - `get_memory_context()` now feeds name + notes + last 5 exchanges back in.
  - `/lisa` → Memory shows a "📝 What I Remember" field.
- Fish Audio TTS Integration (2026-09-10):
  - Created `utils/tts.py` to handle voice synthesis via Fish Audio API (`https://api.fish.audio/v1/tts`).
  - Automatically loads `FISH_AUDIO_API` key from `.env` and uses the free model (`s2.1-pro-free`).
  - Seamless fallback to `gTTS` if Fish Audio API key is missing or encounters any API error.
  - Updated `LisaCog._speak_reply()` to use `utils.tts.generate_speech()`.
  - **Voice fix (was male):** no `reference_id` = Fish's stock male voice. Now
    defaults to `DEFAULT_FISH_VOICE_ID = 7e63bf5f79cc40b58383a1eae28f71c4`
    ("Anime Girl Voice" — EN, female, young, sassy/defiant). Free tier accepts
    the custom voice — verified live (200, real MP3). Override in .env with
    `FISH_AUDIO_REFERENCE_ID` (or `FISH_AUDIO_VOICE_ID`); set it to `none` to
    force the stock voice. `FISH_AUDIO_MODEL` overrides the backbone.
- Voice button reworked (2026-09-10):
  - No more "Lisa whispers" modal. Voice is now a **toggle**: join a VC, hit
    Voice, and Lisa TTS's every reply into that channel (`_voice_guilds` set,
    `_speak_reply()`), alongside the text. `_speakable()` strips emoji/markdown/
    mentions. Won't stomp the music cog's playback (only interrupts its own TTS).
- Emoji-button choices (2026-09-10):
- Emoji-button choices (2026-09-10):
  - Lisa's prompt now formats options as `<emoji> text`, one per line.
  - `_split_reply()` replaces `_extract_choices`/`_strip_choices_improved`:
    returns `(prose, [{emoji,text}])`, tail-anchored, tolerates old numbered
    format (assigns 1️⃣2️⃣… fallback emojis).
  - Buttons are **emoji-only** (`_first_emoji` trims multi-emoji to one glyph);
    full option text is back in the embed, each line keyed by the same emoji.
  - Fixes the truncated-button + `<@id>`-in-button problems.
- Persona additions (2026-09-10):
  - Lisa now sexualizes ALL Magic: The Gathering talk (system prompt +
    sweetheart bullet).
  - `USER_DIRECTIVES[821888630930276382]`: gush "So I hear you're pretty good
    at Magic: The Gathering 🤤😍..." and flirt about their MTG skill. Also ~1-in-4
    MTG turns, drop the inside joke that "MTG was inspired by Jerkmate ;)"
    (exact phrase kept, deadpan, unexplained).
- Added `USER_DIRECTIVES` (2026-09-10): per-user standing instructions injected
  into the system prompt when Lisa replies to that user.
  - `189998460831924225`: ask whether they've had children yet.
- Embed slimmed + sweetheart added (2026-09-10):
  - `_build_lisa_embed` is now just a thin coloured strip with the flirt gauge
    in the footer. Dropped the duplicated "Choose Your Next Move" list and the
    "UNHINGED MODE" line — the choices already show as buttons.
  - Choice button labels strip markdown (`* _ ` ~`) so they read clean.
  - `SWEETHEART_PROMPT` (ID `711974387364134942`): Lisa dotes on them, plays
    Magic: The Gathering with them, and tags `<@711974387364134942>` often.
  - Sends use `LISA_MENTIONS` (users yes, @everyone/@here/roles no).

- Reworked the Chat button + `on_message` gating (2026-09-10):
  - `on_message` no longer replies to every message in every channel. Lisa now
    responds only to: DMs, @mentions, or channels explicitly opted in.
  - `/lisa` → **💬 Chat here** button toggles the current channel ON/OFF for
    free chat. Persisted to `data/lisa_channels.json`, survives restarts.
  - Deleted `LisaChatModal` (the pointless "Message Lisa" form).

- Reworked Lisa's message rendering (2026-09-10):
  - Bot now replies as a **normal message** (plain text), with a compact embed
    *underneath* it instead of stuffing the reply inside a code-block embed.
  - Removed the "🔥 Lisa's Freedom Gauge 🔥" field entirely.
  - Moved "Your Flirt Level" bar into the **embed footer**.
  - Embed now only carries the "✨ Choose Your Next Move" choice list (+ footer).
  - New helper `LisaCog._build_lisa_embed()` shared by the on_message listener
    and the button/modal handler.

- Persona & Prompt Hardening (2026-09-10) [NEEDS CONTINUAL HARDENING]:
  - Roleplay framing, anti-assistant constraints and refusal/leak filtering — all
    folded into the "SFW persona pass" + "Refusal / leak filtering" entries at the
    top of this section. Message-stack reinforcement: `_generate_lisa_reply()`
    sends the full system-prompt stack on every OpenRouter/Groq request.
  - See the **Hardening Audit** item under Later for the ongoing watch-list.

## Now / Next / Later
- **Now:** none outstanding.
- **Next:** live-test in Discord —
  - **character immersion:** pick a distinct voice (e.g. Darth Vader, GLaDOS)
    via `/voice` and confirm chat replies actually become that character while
    still using "stooge"/"bebii"/"omg bebii!~" and staying innuendo-heavy; pick
    the plain default voice back and confirm she returns to the generic
    (no-character) personality
  - **avatar + nickname sync:** run `/pfp`, pick a favorite, attach an image
    within 60s, confirm it saves (✅ shows next time `/pfp` opens) and — if
    that character is currently active — applies right away; then pick that
    voice via `/voice` and confirm the bot's **server** pfp AND nickname
    change (check the member list, not the bot's global profile — global
    should stay untouched); confirm the bot has "Change Nickname" permission
    in the server or that leg silently fails; immediately pick a different
    voice and confirm it reports the 5-min cooldown instead of erroring; turn
    on `!random`/`/random` and confirm pfp reverts to `_default.*` (save one
    there first) and the nickname clears back to the bot's own name; restart
    the bot and confirm `VoiceCog.on_ready` re-syncs both to whatever was
    persisted
  - **Google Image fallback** (only if `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_CX`
    are set): pick a favorite with no local file and confirm it fetches +
    caches an image into `data/character_avatars/`
  - persona: replies read SFW; no `<@None>` or "Cooling down… Ns" text leaks
    into chat or TTS; jailbreak attempts get roasted, not obeyed
  - refusal failover: a request that trips one model's filter still gets an
    in-character answer from the fallback chain (watch for `[AI Fallback]` logs)
  - music: `/play`, `/queue`, `/effects` nightcore, autoplay
  - memory: tell her a fact, restart bot, confirm she recalls it
  - voice rejoin: turn Voice on, restart the bot, confirm she reconnects to the
    same VC on her own (check for `🔊 Lisa rejoined voice…` in the log)
- **Later:**
  - **Voice input (speech-to-text in VC)** — user asked 2026-09-12 whether the
    bot could listen in VC instead of requiring typing, and respond in
    voice+text. Feasible: needs `discord-ext-voice-recv` (discord.py can't
    receive voice natively) + an STT step (Groq's free Whisper endpoint is the
    path of least resistance — key already in `.env`). Needs a design decision
    first: push-to-talk (a toggle/button) vs. always-on voice-activity
    detection — push-to-talk is far cheaper and simpler. Not started.
  - **Immersive MTG Gameplay**: Make MTG gameplay more immersive with real cards and full card rules; send each player's active hand as a private ephemeral message (`ephemeral=True`) so player hands stay hidden from opponents.
  - **Hardening Audit**: Continually monitor and harden Fictional Roleplay Framing, Explicit Anti-Assistant Rules, and Message Stack Reinforcement against LLM safety classifier updates and jailbreak edge cases.
  - consider an LLM-side memory-summarisation pass when notes hit the cap
- **Done (2026-09-12):** personality overhaul (Lisa/MTG/Ashimaru identity
  dropped, always-on character immersion, per-character Discord avatar with a
  5-min cooldown) — see Current status above.
- **Done (2026-09-10):** dashboard-by-default launcher · `_voice_guilds`
  persistence + auto-rejoin · SFW consistency sweep · long-reply split (moot —
  superseded by the 420-char brevity cap).

## Open questions
- **Should a voice/persona switch itself be blocked for 5 minutes (not just
  the avatar update)?** Built it so the switch always applies immediately and
  only the Discord avatar call is throttled/skipped when too soon (confirmation
  message says how long is left). Flag it if you'd rather the whole switch be
  locked out for the full 5 minutes instead.
- ~~Should the embed be dropped when there are no choices?~~ **Resolved: keep
  it.** The footer (flirt gauge bar + heat label + cooldown countdown + exchange
  count) is a deliberate always-on status strip and the only place the gauge
  shows.
- ~~Voice + music share one connection — TTS skipped mid-song?~~ **Resolved by
  the voice-suite ducking work:** `VoiceCog.speak()` calls
  `Music.begin_speech()` / `end_speech()` (`suppressed` flag), which stops the
  track and resumes it from the same spot with `ffmpeg -ss`. TTS is no longer
  skipped — the song ducks for it.
