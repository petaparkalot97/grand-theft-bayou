# Generating voiceover lines

How cutscene dialogue gets turned into real spoken audio, and how to add
more of it. Read this before writing new dialogue in a cutscene, or if a
line is playing as a robotic browser voice instead of a real one.

## Workflow: dialogue → voice

The whole pipeline, start to finish:

1. **Write the line in code.** Dialogue lives inline in scene files as
   `c.say("WHO", "text")` — there's no separate dialogue data file.
2. **Map the speaker to a voice, once.** `src/voiceCast.js` is the *only*
   file the pipeline reads for this — a `WHO` → Fish Audio `referenceId`
   table. (Not `data/game-voices.json` — that belongs to an old, unused
   Python pipeline and nothing in the live game reads it.)
3. **Generate.** `node tools/voiceover-gen.mjs` scans `src/*.js` for every
   `c.say(...)` call, resolves each speaker via `src/voiceCast.js`, and
   calls the Fish Audio TTS API for any line not already in
   `assets/audio/voice/manifest.json`.
4. **Fish Audio renders it.** Which model you're on matters a lot here —
   see "Free vs. paid model" below. This is the step that can silently
   produce the wrong voice.
5. **Save + record.** The mp3 lands in `assets/audio/voice/`, and the
   `"WHO::exact line text"` → filename mapping is written to
   `manifest.json`.
6. **Commit both.** The mp3 and the updated `manifest.json` must be
   committed together — nothing else generates these at build/deploy time.
7. **Runtime playback.** `cinema.js`'s `playVoiceLine(who, text)` looks the
   line up in the manifest and plays the mp3. Missing entry → silent
   fallback to the browser's robotic `speechSynthesis` voice.

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
- See `FISH_AUDIO_EXPLANATION.md` (this folder) for background on Fish
  Audio's credit system and voice cloning.

## Free vs. paid model

The default model, `s2.1-pro-free`, is what this project actually uses —
the account has never had Fish Audio **Developer API credit**, so the
paid model (`s2.1-pro`) isn't usable here at all: every request fails
outright with an HTTP 402 (it does *not* silently fall back to the free
tier). Don't set `FISH_AUDIO_MODEL=s2.1-pro` unless credit has actually
been added at https://fish.audio/app/developers.

In practice the free tier clones every voice in `VOICE_CAST` fine —
Chimi, Dixon, Greedo, Peta, Keseme, and Sync were all generated this way
and sound correct. `FISH_AUDIO_EXPLANATION.md` documents an earlier
theory that the free tier ignores custom cloning and substitutes a
generic voice; that turned out not to be the actual cause of any bug
seen so far. (Keseme's "wrong voice" bug, for example, was a literal
`TODO_...` placeholder `referenceId` sitting in `VOICE_CAST` — nothing to
do with model tier.) If a voice does come out sounding generic, check the
`referenceId` in `VOICE_CAST` first before suspecting the model.

**Gotcha:** the on-disk filename/cache key is
`slug(who)-sha1(who::text::referenceId)` — the model is *not* part of the
hash. So a line already generated once stays cached under that key
forever unless you pass `--force` (scoped with `--character=`) — e.g.
after fixing a wrong `referenceId` in place rather than changing it to a
new value. Lines that are new to `manifest.json` (new text, or a
character whose `referenceId` just changed to a new value) don't need
`--force` — they're cache misses either way.

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

## Same character, different voice at a different story point

`c.say(who, text, seconds, voiceWho)` — the 4th argument — looks up
`voiceWho` in `VOICE_CAST` for the audio instead of `who`, while the
on-screen caption still shows `who`. Use this when a character's actual
voice changes partway through the story but their name on screen
shouldn't (as opposed to `" (V.O.)"`, which is for a narration-style
*display* tag and always resolves to the same voice as the base name).

Example — Keseme's voice in `missionClinic.js` before her surgery:
```js
await c.say("KESEME", "Chicken out? I've been waiting twenty-six years, Peta.", undefined, "KESEME_PRE_TRANSITION");
```
Displays `KESEME`, plays `KESEME_PRE_TRANSITION`'s voice. Add the
`voiceWho` key to `VOICE_CAST` like any other entry, generate/cache as
usual — `--character=` matches against either name. Once a character's
voice change is permanent going forward, drop back to calling `c.say`
with just `who` (3 args) so it plays their current standing voice.

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
Check `referenceId` in `src/voiceCast.js` first — the most common cause so
far has been a wrong or placeholder ID (e.g. a leftover `TODO_...` value,
or one character's ID accidentally shared with another), not the Fish
Audio model tier. See "Free vs. paid model" above and
`FISH_AUDIO_EXPLANATION.md` for the credits background.

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
