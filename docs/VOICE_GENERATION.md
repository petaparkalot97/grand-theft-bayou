# Generating voiceover lines

How cutscene dialogue gets turned into real spoken audio, and how to add
more of it. Read this before writing new dialogue in a cutscene, or if a
line is playing as a robotic browser voice instead of a real one.

## How it works

Dialogue isn't stored in a separate data file — it's written directly in the
scene code, as calls like:

```js
await c.say("KESEME", "Everybody tells you Dixie Beaux is poor.");
```

(`c.say(who, text, seconds?)` inside a `cine.scene(async (c) => { ... })`
block — see `src/cinema.js`, or any existing chapter file such as
`src/actone.js` or `src/greedoCampaign.js` for real examples.)

`tools/voiceover-gen.mjs` scans every file in `src/*.js` for those `c.say(...)`
calls (and the `say(c, "WHO", "text")` helper a few scene files define),
looks up each speaker's voice in `src/voiceCast.js`, sends the line to the
Fish Audio TTS API, and saves the result as an mp3 in
`assets/audio/voice/`, recording the mapping in
`assets/audio/voice/manifest.json` (key: `"WHO::the exact line text"` →
filename).

At runtime, `cinema.js`'s `playVoiceLine(who, text)` looks that key up in the
manifest and plays the real mp3 if it finds one. **If it doesn't find one,
it silently falls back to the browser's built-in `speechSynthesis` voice —
the "robotic" voice you might have heard.** That almost always means the
line was never run through the generator, not that anything is broken.

## Requirements

- A Fish Audio API key in `.env` at the repo root (gitignored, never
  committed): `FISH_AUDIO_API_KEY=...`
- Optional: `FISH_AUDIO_MODEL` in `.env` to override the default TTS model
  (`s2.1-pro-free`).
- See `FISH_AUDIO_EXPLANATION.md` at the repo root for background on Fish
  Audio's credit system and voice cloning — as of 2026-09-17 cloning is
  confirmed working (verified with a live test line, listened to by the
  human).

## Adding a new line to an existing character

1. Write the line as `c.say("WHO", "the line")` in whatever scene file it
   belongs to. `WHO` must match (case-insensitively) a key already in
   `VOICE_CAST` in `src/voiceCast.js` — see the next section if it's a new
   character.
2. Preview what the generator will do, without spending any API calls or
   touching any files:
   ```
   node tools/voiceover-gen.mjs --dry-run
   ```
   Look for your new line under `[GEN]`. If it shows under `[FORCE]` or
   doesn't show at all, see Troubleshooting below.
3. Generate for real:
   ```
   node tools/voiceover-gen.mjs
   ```
   or `npm run voiceover` (same thing). Check the summary at the end:
   `Generated: N, Cached: N, Failed: 0`. A run is safe to repeat — anything
   already generated is skipped, so this never re-spends API calls on old
   lines.
4. Commit the new mp3(s) **and** the updated `manifest.json`. This is not
   optional: nothing in the build/deploy pipeline generates these files —
   `assets/audio/voice/` is committed like any other static asset, and if a
   new file isn't pushed, the live game will 404 on it and fall back to the
   robot voice for that line, even though it worked locally.

## Adding a brand-new character's voice

1. Get a Fish Audio voice `reference_id` for them — either your own cloned
   voice, or a stock voice from Fish Audio's library (copy its ID from
   fish.audio).
2. Add an entry to `VOICE_CAST` in `src/voiceCast.js`:
   ```js
   NEWCHARACTER: { referenceId: "the-fish-audio-reference-id", label: "New Character" },
   ```
   The key is matched case-insensitively against whatever string you pass as
   `who` in `c.say(who, ...)`, with a trailing `" (V.O.)"` stripped
   automatically (so `"KESEME (V.O.)"` and `"KESEME"` share a voice). Add
   every alias a character might be called under (see how `KESEME` /
   `KESEM` / `NADIA` all point at the same entry).
3. Run the generator as above.

**If you don't add an entry:** `resolveVoice()` falls back to matching
`POLICE`/`COP`/`DISPATCH`/`LOUDSPEAKER` or `RADIO`/`HOST` by substring, and
failing that, picks a **random** voice from a small shared pool
(`STREET_NPC_VOICE_IDS`) — fine for one-off unnamed NPCs, bad for a named
character who'll get a different-sounding voice on every line. Always add a
real entry for anyone who speaks more than once.

## Command-line flags

| Flag | What it does |
|---|---|
| (none) | Generate every missing line, skip everything already cached. Safe to run repeatedly. |
| `--dry-run` | Print what would be generated/skipped. No API calls, no files written. Always run this first when you're not sure what's missing. |
| `--force` | Regenerate every matched line even if already cached. Combine with `--character=`/`--line=` — running it bare regenerates the *entire* game's dialogue and is almost never what you want. |
| `--character=WHO` | Only lines spoken by `WHO` (case-insensitive exact match, e.g. `--character=KESEME`). |
| `--line=SUBSTRING` | Only lines whose text contains `SUBSTRING` (case-insensitive). |

Flags combine — e.g. `node tools/voiceover-gen.mjs --force --character=KESEME`
regenerates only Keseme's lines.

## Troubleshooting

**A line plays as a robot voice in-game.**
It's missing from the manifest. Run `--dry-run` and search the output for
the exact line text — if it shows under `[GEN]`, it's simply never been
generated; run the generator for real and commit the result. If it doesn't
show up under `[GEN]` *or* `[FORCE]` at all, the line text in the manifest
key won't match — check for a typo, extra whitespace, or a smart-quote vs.
straight-quote mismatch between the dialogue call and what you expect.

**Console prints `skipped (no voice cast yet in src/voiceCast.js): ...`**
That speaker has a `referenceId` starting with `"TODO"` in `VOICE_CAST` — a
placeholder left for someone to fill in with a real Fish Audio reference ID.
Paste the real ID over the `TODO...` value and re-run.

**`FISH_AUDIO_API_KEY is not set` and the script aborts.**
Add it to `.env` at the repo root (see Requirements above). The script reads
both `.env` and the real environment; either works.

**A character's voice sounds generic / not like their actual cloned voice.**
This was a real, separate problem — see `FISH_AUDIO_EXPLANATION.md` — tied to
Fish Audio Developer Credits. Confirmed no longer an issue as of 2026-09-17,
but if it recurs, that doc is the place to start.

**Old, unused mp3 files are piling up in `assets/audio/voice/`.**
Filenames are content-hashed (`slug(who)-sha1(who::text::referenceId).mp3`),
so editing a line's text, or changing a character's `referenceId` in
`voiceCast.js`, produces a brand-new file — the old one is orphaned (still on
disk, no longer referenced by `manifest.json`) rather than deleted
automatically. Harmless to leave, but if you want to clean up: any `.mp3` in
that folder whose filename doesn't appear as a value anywhere in
`manifest.json` is safe to delete. Don't delete anything that *is*
referenced, even if the filename looks unfamiliar.

**Dialogue cuts off, or the next line starts before the audio finishes.**
This was a real bug, already fixed (`src/cinema.js`'s `say()` now holds a
line on screen for at least the real audio clip's duration, not just a
text-length guess). If you see it again, that's the function to check first.
