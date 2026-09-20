# TODO.md — Multi-Agent Task Board

> **Shared live task board for Claude, Codex, Antigravity, and Freebuff.**
>
> This file is the current state of work. Permanent collaboration rules live in
> [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md); discoveries, decisions, interface
> contracts and test history live in [`AGENT_LOG.md`](AGENT_LOG.md).
> Read the protocol before claiming anything.

---

# 🚦 STATUS LEGEND

- `BACKLOG` — identified but not started
- `READY` — dependencies satisfied; brief complete; safe to claim
- `IN PROGRESS` — actively owned by an agent
- `BLOCKED` — waiting on another task, decision, or resource
- `REVIEW` — implementation finished; awaiting review/integration
- `COMPLETE` — reviewed and tested
- `CANCELLED` — intentionally abandoned

## 🌆 WORLD-BUILDING ROADMAP

- [x] East Bank connected expansion: Cypress Heights, Market Row, Port Mercer
- [x] District roads, parking/service areas, landmarks and environmental stories
- [x] East Bank traffic lanes and district-aware spawn classification
- [x] Traffic circuits: lane-end handover + mist-hidden wraps — cars never vanish (TASK-039)
- [x] Sky-sign ghost fix: child clones kept their offsets and floated at double height (TASK-039)
- [ ] Role-specific civilian presentation and pedestrian pool
- [ ] Time-of-day activity weights for shops, residents and Port Mercer
- [ ] Selective interiors for the new civic/commercial buildings
- [ ] More bridge, dock and bayou shortcuts / discovery encounters
- [ ] External-browser exploration pass: navigation, blockers, repetition, draw calls

See [`docs/WORLD_BUILDING.md`](docs/WORLD_BUILDING.md) for the asset audit and
district design notes.

---

# 🧭 CURRENT OBJECTIVE

**Primary objective:**
Bring the script to life. Finish and verify **Act One "Welcome Home"**
(Tusouxroe), then plan **OrleaRouge**, while keeping free roam smooth
(draw calls, not AI, are the cost to watch).

**Current phase:** `Testing / Integration`

**Parallel workstream (human request, 2026-09-14):** "keep expanding the world."
Four new briefs added below — TASK-035 (faction warfare), TASK-036 (starter
loadout / ammo), TASK-020 (police escapability + visuals, fleshed out from the
backlog stub), TASK-038 (unused-asset integration pass). Suggested for
Antigravity and Freebuff so they don't compete with the Act One work on
`main.js`. See each brief for exact files.

---

# 🔒 ACTIVE TASKS

> **Task-ID collision, 2026-09-20 (second one — see the next note down for the
> first):** this session and the one merged in below it both wrote new tasks
> under TASK-053 through TASK-056 for unrelated work, independently, at the
> same time. Following the precedent already set below: both sets kept,
> unrenumbered — a human pass can renumber them. Notably **both sessions
> independently found and fixed the same police/wanted-level bug** (this
> session's TASK-056 below; the other session's TASK-054 below, further down —
> that one is the more complete fix: wanted-from-first-star globally, not just
> scoped to Free Roam, plus a Pay 'n' Spray to lose the stars — and it's the
> version that actually made it into `main.js` after the merge). This
> session's TASK-056 write-up is kept for its record of what was wrong and
> how it was found, not because its narrower fix is the one in effect.
> Also: this session's TASK-060 (motorbikes/scooters/push bikes) was written
> **before** discovering the other session's TASK-056 below already shipped
> real motorbikes and scooters (`src/bikes.js`) — see the note added to
> TASK-060 for what's actually still open (push bikes, and bikes in the
> traffic pool). Same for TASK-059 (interiors/robbery): the other session's
> TASK-055 (Frenchmen Street) already has a working walk-in-interior
> technique worth reusing rather than inventing a second one — see the note
> added there too.

### TASK-065 — St. Louis No. 1: the OrleaRouge cemetery rebuilt above ground, + the ghost of Marie Laveau (human request, 2026-09-20)

**Status:** `REVIEW` · **Agent:** Claude · **Files:** `src/cemetery.js` (new),
`src/orlearouge.js`, `src/main.js`, `src/voiceCast.js`, `tools/qa/cemetery.mjs` (new)

Human's request: *"change the graveyard in Orlearouge to resemble the Official
St. Louis Cemetery in New Orleans in terms of the coffins and caskets being
above ground. Should also have the Ghost of Marie Leavux as a cameo in which her
ghost haunts and looks after the cemetery."*

**What was there:** `orlearouge.js`'s `cemetery(b)` — a 0.5 m brick wall and
fifteen 2.2 x 2.4 x 3 boxes with pyramid lids on an 8.5 x 8 m lattice. Nothing
above ground about it beyond the boxes, and wide enough to drive a bus through,
which quietly undercut `bluelight.js`'s *"Lose them among the tombs — the
cruisers can't follow between the tombs."*

**What changed:**
1. New module `src/cemetery.js` builds the whole block. `orlearouge.js`'s
   `cemetery(b)` is now three lines that call it, so the big new surface lives
   outside Antigravity's TASK-038 file (see *Lock note* below).
2. **Oven vaults.** The perimeter wall is the cemetery: stacked rented vaults,
   three tablets high, plastered and closed with engraved marble, drawn as one
   tiled canvas texture per wall rather than ~380 tablet meshes.
3. **Above-ground step tombs.** ~40 plastered family tombs of two or three
   receding tiers with cornices and a cross or urn, in four staggered rows,
   deterministic from one seed. Two benevolent-society tombs and a pyramid.
4. **The alleys are the point.** Blocker radius 1.45 at a 4.7 m row pitch and a
   3.2 m column pitch: 1.8 m of alley (a walker is 1.2 m across, a car 3.6), and
   0.3 m along a row — impassable. The gate's clear opening is 2.7 m, so nothing
   with wheels gets inside at all. **`bluelight.js`'s claim is now literally true.**
5. **The Glapion tomb**, three tiers, with the XXX tablet and the offerings
   people leave at its foot — beads, coins, votive candles that gutter, a rum
   bottle — under a warm pooled light.
6. **The ghost.** Built on the `characters.js` rig, then washed pale, lit from
   inside, depth-write off, legs hidden under a shift and skirt, a tignon on her
   head, hovering. She appears after dark only, walks a fixed round down the
   alleys and home to her own tomb, carries a cold pooled light, and fades with
   distance as well as with the hour.
7. **She looks after the place.** First approach at night plays a short scene.
   `F` at her step leaves an offering: $20 for +35 HP and a line back, on a 45 s
   cooldown. Fire a gun inside the walls and she objects and withdraws for 26 s
   (detected off a rise in `state.fireCd`, so no new hook in `main.js`).

**Two bugs found and fixed on the way:**
- **Firing was dead in the whole game.** `main.js` registered
  `input.onPress("fire", ...)`, and there is no `"fire"` action — `input.js`
  dispatches `"attack"` on LMB and has no `fire` in `DEFAULT_BINDINGS`, so the
  handler hung off a name nothing raises. Verified headlessly before and after:
  LMB left `state.fireCd` at 0 and ammo untouched; now `fireCd 0.42`, ammo 50 to 49.
  Bound to `"attack"`. **This was not specific to the cemetery — the player
  could not shoot or swing at anything, anywhere.**
- `main.js`'s `poolLight()` returned nothing, so a light could never be moved.
  It now returns its spot (purely additive; every existing caller ignores it).

**Testing performed** (headless Chromium via the browser-automation runner,
`tools/qa/cemetery.mjs`, screenshots in the scratchpad — SwiftShader, so fps is
meaningless and is not reported):
- Layout builds: 38 blockers inside the walls, tightest gap 0.30 m, 12 gaps
  punched through the rows, gate at (-114, 337), her tomb at (-114, 359.6).
- **Reachability flood-fill** over the real blocker grid, from the sidewalk
  outside the gate, at both radii: walker reaches 13,908 cells including her
  step and the far alleys; **a car reaches 523 — the street only.** It cannot
  get through the gate, let alone to the tomb.
- Day (13:00): ghost absent, `presence` 0. Night (23:00): `presence` 0 to 0.89 to
  1.0, visible, moving down the alley; her greeting scene plays.
- Offering: prompt shows at her step, `F` takes $200 to $180 and 40 to 75 HP.
- Gunshot inside the walls: objective reads *MARIE LAVEAU: "Not in here. Not
  over my dead."*, `presence` 1 to 0.35 to 0.01 and she goes invisible.
- Draw calls at the cemetery **393** vs. French District 381, downtown 379,
  hospital 532 at the same hour — the ~250 new meshes batch away as intended.
- No new console errors. The only failures are the pre-existing sixtwelve
  texture 404s and the tacos/burgerpiz directory 403s.

**Known issues / not done:**
- Marie Laveau has **no voice of her own** — `voiceCast.js` maps her to the
  female street-pool stand-in, same as GAYMAN/LESBIAN. Her lines fall back to
  browser speech synthesis until someone records them.
- Tomb closure tablets all face +z; in the real place they face their alley.
- She has no reaction to anything but gunfire (running over a tomb, say).

**Lock note:** `src/orlearouge.js` is marked LOCKED to Antigravity under
TASK-038. The human asked for this directly and the graveyard lives in that
file, so it was taken — but deliberately kept to **three lines plus an import**
by putting everything new in `src/cemetery.js`. Antigravity: your TASK-038 work
should merge cleanly; if it touched `cemetery(b)`, take this version.

---

### TASK-066 — Keseme vs. the Klan: who actually came after her mother (human request, 2026-09-20)

**Status:** `REVIEW` (the machinery and the night ride; the mission arc is still
`READY` — see *What remains*) · **Agent:** Claude
**Files / subsystem:**
- `src/klan.js`                (new — the faction and its set pieces)
- `src/characters.js`          (the robe, built into the rig behind `opts.robe`)
- `src/factions.js`            (a third side in the turf logic)
- `src/npc.js`                 (temperament: a klansman never runs)
- `src/actone.js`              (exports Emiko's house so the ride stages on it)
- `src/main.js`                (spawn table, wiring)
- `tools/qa/klan.mjs`          (new — headless walkthrough)

**Dependencies:** none blocking. Reads on TASK-035 (faction warfare, COMPLETE)
and the Act One / Nolantis story files.

**Context — the thread is already open and currently unanswered.**
In `nolantis.js` (~line 938) a distorted **VOICE** calls Keseme:

> "You should have given Sheriff Mercer the book." / "Go back to Tusouxroe." /
> **"Your mother's house is very pretty."**

Keseme's answer, in the elevator at the end of the same file (~line 1028), is
the spine of everything after it: **"Find out who threatened my mother."**
`actone.js` picks it straight up — `protectMama()`, `MAMA_OBJECTIVE`, the run
north to Mama Emiko's door in South Tusouxroe — and then the question is simply
never answered. Nothing in the repo currently says who the VOICE is.

**Goal:** the Klan is the answer. They are who came after Emiko, and Keseme
fights them. Concretely: the voice on that phone, the pressure behind Sheriff
Mercer's department, and the muscle for whoever owns Pelican Crown are the same
people in three different sets of clothes — which is the point the story is
already making about Dixie Beaux and has not yet named.

**Why this fits what's built:** the game already has a Redneck faction, a
sheriff's department that leans on Keseme, a corporate villain (Pelican Crown /
`EXECUTIVE`), and a Black trans protagonist whose mother has been threatened by
an anonymous caller. The Klan is not a new theme here — it is the name for the
one that is already running.

**Acceptance criteria:**
- A new NPC type ("klansman") on the existing `characters.js` rig: white robe
  and hood over the redneck build, so it costs a palette and two meshes, not a
  new model. Must not be mistakable for the plain Redneck at a glance.
- They do **not** spawn in ordinary daytime free roam. They turn out at night,
  in numbers, and only where the story or a set piece calls them — a rally, a
  night ride past Mama's house, a roadblock on US-167.
- `factions.js` treats them as a third faction: Hoodrats fight them on sight;
  Rednecks do not.
- At least one playable mission that answers the question: Keseme finds out who
  made the call and gets Emiko out. It should connect to what is already there —
  Mercer, the ledger, Pelican Crown — not sit beside it.
- The cemetery is a good place for a beat: `cemetery.js` (TASK-065) gives an
  enclosed, pedestrian-only space with a fixed non-combatant in it.
- A `tools/qa/klan.mjs` headless walkthrough, same shape as `tools/qa/actone.mjs`.
- No new console errors; anything that moves stays out of `batchStatic`.

**Out of scope:** real-world names, real organisations, recruitment language, or
anything that reads as their case rather than as Keseme's. They are the
antagonist: hooded, anonymous, and beaten.

---

**What was built (2026-09-20):**

1. **The look.** `opts.robe` on the `characters.js` rig: a hooded robe over the
   redneck body — chest, skirt off the hips (so it swings with the walk instead
   of scissoring with the legs, and stops above the boots so the stride still
   reads), shoulder cape, wide flaring sleeves, and a tall pointed hood with two
   slits. No emblem, no lettering. Built inside the constructor so it goes
   through `mergeRigid` with everything else — a robed man costs the same draw
   calls as an unrobed one. `randomKlansman(rng, height, { officer })` picks a
   laundered off-white, or the crimson robe for the one giving the orders, so a
   mission can point at him without a health bar.
2. **`src/klan.js`.** `nightRide({x, z, count, why, onClear})` stages the set
   piece: a cross goes up and lights, the mob comes out of the dark and comes
   for whoever is standing there, and the beat ends when the last of them is
   down — the cross burns out and the charred timber stays.
   `mamaNightRide()` runs it on Emiko's lawn. `callOut(x, z, n, {provoke})`
   places them without the staging, `provoke: false` for a picket standing
   there before it kicks off. `burningCross` / `burnOut` are separately
   available for a mission that wants the threat without the fight.
3. **They are not street population.** `klansman` is in `ENEMY_TYPES` but in no
   `spawnzones.js` mix, so nothing spawns one on its own — only klan.js does.
4. **Three-sided turf.** `factions.js` now carries an `ENEMIES_OF` table instead
   of the hardcoded redneck/hoodrat pair. Hoodrats fight klansmen on sight;
   **Rednecks do not**, which is the point. A klansman is exempt from the
   contested-ground gate (he is wherever a set piece put him, not on the turf
   map) and can be a turf *target* while already fighting the player, but never
   an instigator.
5. **`npc.js`:** klansmen are never `timid`. The ordinary temperament roll made
   two thirds of any night ride scatter on first contact, which is a different
   scene from the one being written.

**Testing performed** (headless Chromium, `tools/qa/klan.mjs`, screenshots in
the scratchpad — SwiftShader, so fps is meaningless and is not reported):
- **Never ambient:** six stops across the parish at 02:00 with the spawner
  running, ~60 NPCs alive at each — **0 klansmen** at every one.
- **The night ride:** 6 turn out on Emiko's lawn at (100, -101.9), **all 6
  hostile, 0 fleeing**, one crimson officer, objective set, cross light live at
  ~97 power.
- **It ends itself:** killing the mob clears the ride (`running false`,
  `hasRide false`) and prints *"They're down. Nobody came. Nobody was ever going
  to come."* The cross then burns out — flame invisible, light at **0**, timber
  still standing.
- **Turf, both directions:** an unprovoked klansman and a Hoodrat 3.8 m apart
  square up — 1 Hoodrat targeting a klansman and 1 klansman targeting the
  Hoodrat. A Redneck standing **1.5 m** from a klansman: **0 and 0**, never
  engages. The asymmetry works.
- Re-ran `tools/qa/cemetery.mjs` afterwards: no regression (walker still
  reaches her tomb at 13,904 cells, car still stuck at 673, offering and
  gunshot reactions unchanged).
- No new console errors beyond the pre-existing sixtwelve 404s / tacos-burgerpiz
  403s.

**One bug fixed in klan.js on the way:** a burnt-out cross put its light back
on. The burn-out ramp cleared its own flag when it finished, so the flicker
resumed the next frame over an invisible flame. It now latches `spent`.

**What remains — this is the machinery, not the story:**
- **No mission yet.** Nothing in the game calls `mamaNightRide()`: it is
  reachable from `__game.klan` for QA and ready for a mission to fire. The
  three narrative questions below still need the human's answer before anyone
  writes one.
- No voice for them; no vehicles (the ride has no trucks arriving yet); no
  reaction from the Sheriff's department to a night ride happening.
- They have no dialogue beyond Keseme's two lines when the cross lights.

**Notes / decisions the human may want to make first:**
1. **How far up does it go?** Is Sheriff Mercer one of them, or leaned on by
   them? The ledger board (`ledgerboard.js`) is built to carry either answer.
2. **Where does it land in the act structure?** Act One is "Welcome Home" in
   Tusouxroe; OrleaRouge is being built out now. A Klan arc could be the back
   half of Act One (it is Emiko's story, and she lives in South Tusouxroe) or
   its own Act Two.
3. **Does Emiko survive it?** Everything downstream changes on that answer, so
   it should be decided before anyone writes the mission.

---

### TASK-056 — Bug fixes: free-roam police never turning out, devmode drag-select and Cut ignoring world buildings (human report, 2026-09-20)

**Status:** `REVIEW` · **Agent:** Claude · **Files:** `src/main.js`, `src/mapEditor.js`

Human's report: *"Why is there no police? I seem to get a higher wanted
level, but the police never seem to appear."* and, on the map editor: drag-box
select over already-placed buildings did nothing, and Ctrl+X/Cut on an
already-placed building didn't turn into the holographic follow-the-cursor
placement mode every other cut/paste uses — instead a second click just
teleported it straight there.

**What was wrong, found by reading the code (not yet reproduced live — see
below):**
1. `copsActive()` in `main.js` gated the *entire* wanted system — heat decay,
   star display, and cruiser spawning — behind either `state.forceCops`
   (campaign-only) or having killed 12 Rednecks/Hoodrats (`HEAT_KILLS`).
   `crime()` (called on kills, car damage, jacking a cruiser, etc.) always
   raised `state.heat`, but nothing ever converted that into `state.wanted`
   or spawned a cruiser until that 12-kill milestone, so free-roam crime
   silently went nowhere.
2. `mapEditor.js`'s `finishBoxSelect()` only tested `placements` (the
   editor's own placed objects) against the drag rectangle — district-built
   buildings were never candidates for a box-select at all.
3. `mapEditor.js`'s `copySelection()` only ever looked at `selectedSet`
   (editor placements); a Cut with only `selectedWorld` items selected
   silently no-op'ed. `clipboard`/`startPaste`/`commitPaste`/`cancelPaste`
   only knew how to rebuild an object from a `CATALOG` spec, which doesn't
   exist for a world-authored building.

**What changed:**
1. `copsActive()` now also returns true whenever `state.freeRoam && state.heat
   > 0` — cops respond to live crime heat immediately in Free Roam. Scoped to
   `state.freeRoam` specifically (not a blanket `state.heat > 0`) so the
   campaign's existing pacing — cops silent until `forceCops` or the 12-kill
   escalation — is untouched; that gate still exists and still fires its own
   "Sheriff Mercer's department would like a word" beat.
2. `finishBoxSelect()` still does the exact `placements` test, and now also
   grid-samples `raycastWorldObject()` across the drag rectangle (capped at
   40×40 samples, run once per completed drag, not per frame) to pick up
   world buildings under the box. Batched buildings (`static-batch`) are
   still reported as un-isolatable, same limitation single-click Select
   already had (see TASK-053 item 1 for the real fix to that).
3. `clipboard` entries now carry a `kind: "catalog" | "world"` tag.
   `copySelection(cut)` builds `world`-kind entries from `selectedWorld` (Cut
   only — world objects still can't be *copied*, there's no spec to rebuild
   one from, and it says so in the status line if you try). `startPaste()`
   builds the holographic ghost for a `world` item by cloning the live root
   and ghostifying the clone's materials (geometry stays shared, so this is
   cheap); `commitPaste()` repositions the *original* root (never destroyed,
   only `visible = false` while "in hand," same rule Backspace already
   follows for world objects) instead of respawning from `CATALOG`;
   `cancelPaste()` makes a cancelled world Cut reappear where it was.

**Testing performed:** `node --check` on both files (clean, both changes are
syntactically sound). Ran the existing `tools/qa/police_test.mjs` — it fails,
but on `src/police.js:56`'s `Box3.setFromObject(...).translate`, which this
session's changes never touched (`git diff --stat` confirms only `main.js`
and `mapEditor.js` changed); this is the headless three.js stub missing
`Box3.translate`, a pre-existing gap, not a regression from this fix.
`tools/qa/police.mjs` (in-game) and the map editor have **no automated
harness reachable in this environment** — no `playwright`/`patchright`
package in `node_modules`, and the Claude-in-Chrome extension wasn't
connected this session. **None of this has been confirmed in a running
browser or real GPU.** Whoever picks this up next (or the human) should:
start a free-roam run, commit a crime without racking up 12 redneck/hoodrat
kills, and confirm stars climb and a cruiser turns out; and in
`$DEVMODE69xxx`, drag-box across a standing building and confirm it selects,
then Ctrl+X it and confirm the holographic ghost follows the free-fly camera
until a click drops it.

**Out of scope:** TASK-053's other four items (real parked cars, POI
density, the color editor, the combat-feel overhaul) — untouched.

---

### TASK-057 — Orlea Rogue: party-town atmosphere + violent-crime districts (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** whichever region module builds
Orlea Rogue (check `src/orlearouge.js` — the causeway-south growth from
TASK-031), `src/npc.js` (ambient crowd behaviour/density by district),
`src/audio.js`/`music.js` (street music), `src/fx.js` (lighting mood)

Human's own words: *"Orlea Rogue, which is based on New Orleans... we need to
really amp up the atmosphere in terms of making it a party town and also
kind of like a lot of... in some parts a lot of like violent crime."*

Two distinct moods requested for the same region, presumably by sub-district
(a French-Quarter-style entertainment strip vs. rougher blocks), not a single
uniform tone — that split isn't specified yet and is a real design decision
someone should confirm before building: which streets/blocks are "party,"
which are "violent," and what actually signals each (street crowd density
and type, ambient music/noise, lighting, NPC aggression baseline, litter/
decay dressing, police presence baseline — TASK-056 above just made wanted
level responsive again in free roam, which matters for how "violent crime
area" should feel). Check `docs/WORLD_BUILDING.md` for whatever's already
planned for this region before inventing district boundaries from scratch.

**Update (2026-09-20, found merging with a concurrent session):** the
"party town" half already has a real foothold — **`src/nightlife.js`**
(that session's TASK-055, further down, `REVIEW`) built a whole Frenchmen
Street block of walk-in clubs with music, dancers and a healing loop. Look
at that before designing party-atmosphere dressing from scratch; the
"violent crime districts" half is still fully open, and so is deciding
whether Frenchmen Street *is* "the party part" of Orlea Rogue or a separate
thing from what the human means here.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-058 — Superdome landmark (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/landmarks.js`, the Orlea
Rogue region module, an asset (new or sourced)

Human's own words: *"we need to have a Superdome based on the real one
that's in New Orleans."* **Follow-up (2026-09-20): it needs to be enterable,
not just an exterior landmark** — the player should be able to walk inside
it, not just drive/walk past it. That makes this depend on (or at least
share machinery with) TASK-059's interior system rather than being a pure
exterior prop; whoever picks this up should sequence accordingly, or at
minimum design the exterior with a real entrance in mind rather than a
sealed shell that has to be retrofitted later. Nothing resembling a domed
stadium exists in the
asset manifest today (`tools/r2-manifest.json` — worth a fresh grep before
starting, same check TASK-053 item 7 already did for a motorbike model and
came up empty). This is very likely a build-from-primitives job (a big dome
is straightforward procedural geometry — latitude-banded sphere segment or
similar — with the real Superdome's actual proportions/exterior banding as
reference, not a sourced GLB) rather than an asset-sourcing blocker, but
whoever picks this up should confirm that before assuming either way. Needs
a placement decision: where in Orlea Rogue, and how it interacts with
existing roads/blockers at that scale (this would be one of the largest
single structures in the game).

**Follow-up (2026-09-20, screenshots supplied — see TASK-063 below for the
images and full context):** *"it needs to be expanded and given a lot of
life and kind of be like a very busy area. Modern."* Sequence with TASK-063
(the OrleaRouge nightlife/casino district expansion) — same "busy, modern,
alive" bar applies to both, and the Superdome should read as part of that
same district, not an isolated landmark sitting apart from it.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-059 — Enterable establishment interiors + robbery mechanic (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** a new interior module
(`src/interiors.js`?), `src/npc.js` (a "clerk" NPC behaviour), `src/main.js`
(interior transition, aim-at-clerk robbery flow), `src/landmarks.js` (which
buildings get a real interior)

Human's own words: *"we need to start building out the interiors of local
establishments, things like Popeyes, the players should be able to go in and
like there should be people serving food, [someone] at the cash register...
these places we need to be able to rob them. So obviously like when the
player has a weapon, points it at the person at the cash register, money
just starts increasing but the wanted level just goes up too."*

This is already on the world-building roadmap as an unstarted bullet
("Selective interiors for the new civic/commercial buildings" —
see the top of this file) but never scoped. Real scope, from the human's own
description:
1. **An interior space** the player can walk into from an exterior door
   trigger and back out of — almost certainly a separate small scene/room
   swapped in on entry rather than a physically modeled interior sharing the
   exterior's coordinate space (check how — or whether — any existing
   system already does an interior/exterior transition before assuming
   there's nothing to reuse).
2. **A clerk NPC** standing at a register, part of a new "serving" idle
   behaviour distinct from the existing wander/flee/hostile states in
   `npc.js`.
3. **The robbery trigger**: aiming a weapon at the clerk (not firing) starts
   cash ticking up over time and the clerk into a scared/complying state;
   `crime()` should be driving the wanted level the whole time it's
   happening (this is now actually responsive in free roam — TASK-056).
   Needs a defined cash rate/cap per establishment and a way to end it
   (leaving, clerk hits a silent alarm after N seconds, player holsters the
   weapon).
4. **Popeyes specifically** — check `landmarks.js`/the asset manifest for
   what's already placed as a Popeyes prop today (`POPEYES_LOCATIONS` exists
   in `main.js` already, for the health-bucket pickup feature) before
   deciding whether that's the same building instance this should hook into.

Real scope here is "a small new interior-scene system," not a one-file patch
— flagging that up front rather than under-selling it. Suggest sequencing
after TASK-056/police is confirmed working live, since the robbery mechanic
is pointless without cops actually responding to it.

**Update (2026-09-20, found merging with a concurrent session):** item 1's
"check whether anything already does an interior transition" turned out yes
— **`src/nightlife.js`'s Frenchmen Street clubs (that session's TASK-055,
further down) already ship a real no-loading-screen interior**: walk in, the
roof/sign lift off and the walls drop to knee height. Reuse that technique
rather than building a second one. Also, `src/services.js` (that session's
TASK-054) already added **Popeyes counters** (walk up, F, buy a 3-piece,
+40 HP) — that's a purchase, not a robbery, and not a walk-in interior, but
it's the existing Popeyes hook point (`POPEYES_LOCATIONS`) item 4 above was
asking about, already answered. The robbery mechanic itself (clerk NPC,
aim-not-fire cash-ticks-up, wanted level rising) is still unbuilt.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-060 — Motorbikes, scooters and push bikes as ridden vehicles (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/vehicles.js`
(`VEHICLE_DEFS`, arcade model tuning), `src/traffic.js` or `src/npc.js`
(NPCs actually choosing to ride one), `src/main.js` (push-bike pedal input),
`src/input.js` (a tap-to-pedal binding)

Human's own words: *"People are not using the motorbikes, they are only
using cars. We've got parked motorbikes, leave the parked motorbikes and
scooters, but we also need NPCs using... motorbikes and scooters as well.
For good measure, we should add in push bikes... the player should need to
like press spacebar or just tap it constantly to keep the momentum going,
just to add realism."*

**Supersedes/extends TASK-053 item 7** (motorbikes only, already found
blocked on a sourced 3D model — no bike/motor/cycle/harley/scooter entry in
`tools/r2-manifest.json`'s 462 models as of that check). This broadens the
same ask to scooters (apparently already present as *parked* decoration —
confirm which asset) and adds push bikes, which is a new mechanic, not just
a new rideable:
1. **NPCs actually riding motorbikes/scooters** — `vehicles.js`'s
   `stepArcadeVehicle()` is heading+speed, generic enough for a bike per
   TASK-053 item 7's own read; the real gap is nothing in `traffic.js`/
   `npc.js` ever *chooses* a bike over a car for a spawned rider. Needs the
   asset(s) resolved first (motorbike still blocked; scooter — check if the
   existing parked-scooter model is riggable/drivable or decorative-only
   like the parked cars TASK-053 item 2 is fixing).
2. **Push bikes** — likely the least asset-blocked of the three (a bicycle
   model is far more common in free asset packs than a motorbike; check
   `Z:\GITHUB\_ASSETS` before assuming a new one is needed). New mechanic:
   momentum decays without repeated input, spacebar (or a repeated key tap)
   adds momentum back — this is a new per-vehicle drive model, not the
   shared arcade one, since nothing else in the game has a decaying-momentum
   pedal mechanic today.

**Update (2026-09-20, found merging with a concurrent session):** item 1 is
now mostly done — **`src/bikes.js`** (that session's TASK-056, further
down, `REVIEW`) already builds a real motorbike and a Vespa-style scooter
from primitives (no model files existed, so it built them rather than
sourcing/blocking on one — worth knowing before assuming a model is still
needed), wired into `vehicles.js`/`characters.js` with a real ride pose and
lean. **Its own notes say what's still open: "bikes in the traffic pool"**
— i.e. NPCs still don't choose one, which is exactly the human's "people are
not using the motorbikes" complaint. So the real remaining scope here is
narrower than originally written: (a) get spawned traffic/NPCs actually
picking `motorbike`/`scooter` sometimes instead of always a car, and
(b) push bikes, per item 2 above, which nothing upstream has touched.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-061 — Dev mode: AI-grounding location marker / "blip" (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/mapEditor.js`

Human's own words: *"it would be quite handy if we were able to drop kind of
like a location marker so that way we can provide the AI information as to
like where we want to do certain things, so kind of like a blip."* Reads as:
a devmode tool to drop a labeled point (and maybe a note) at a world
position, so a human instruction like "put a jazz club near the marker by
the levee" has a concrete coordinate an agent can look up instead of
guessing from a description. Needs, at minimum: a new devmode mode (or a
key bind alongside Place/Delete/Select) to drop a marker with an optional
text label, a visible in-world gizmo for it (distinct from the existing
placement ghost/selection wireframes), and *somewhere an agent can actually
read the list back from* — a devmode panel listing markers with their
coordinates/labels, and/or folding them into the Export button's output
(`showExport()` already exists and does something adjacent — extend it
rather than building a second export path) is probably the right shape, but
that's a design call for whoever picks this up.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-062 — Dev mode: highlight-and-duplicate a chunk, with LLM-assisted variation (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/mapEditor.js`, whatever
"Ask AI" integration already exists (the file's header mentions an "Ask AI"
box sending a free-text prompt plus grounding — check that before assuming
a new LLM call path is needed)

Human's own words: *"in order to grow the city it would be nice if we could
kind of highlight big chunks and duplicate them so we can kind of just
extend things, and even get the LLM to kind of do a little spin on them so
it doesn't seem like a duplication — this would be an extremely useful
feature."*

This is a bigger version of TASK-053 item 1 (which scopes *single*-building
copy out of a batched district) and TASK-056's box-select fix above (which
now at least lets a drag-box pick out individual world buildings) — "a
chunk" here means a whole multi-building area selected at once, duplicated
as a group, and then varied (different building skins/colors/minor layout
shuffle per the existing "Ask AI"/LLM path, so the copy doesn't read as an
obvious stamp) rather than dropped as an exact clone. Real open questions
before building: how big is "a chunk" (a bounding box drag over N
buildings, reusing TASK-056's box-select?), what "the LLM does a little
spin" concretely changes (palette/material swap is cheap and already has
`ghostifyMaterial`-adjacent machinery to build on; actual layout variation
is a much bigger ask), and whether this depends on TASK-053 item 1 landing
first (batched buildings are most of the city, so a chunk-duplicate that
only works on already-unbatched/editor-placed buildings would cover very
little of what "grow the city" actually needs).

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-063 — OrleaRouge nightlife/casino district expansion: party central (human request + screenshots, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/orlearouge.js`,
`src/npc.js` (new dressed-up NPC types), `src/vehicles.js` (limousine),
`src/traffic.js`, whatever interior tech TASK-059/`nightlife.js` establish
**Reference:** two annotated screenshots from the human, saved at the repo
root as `Missisippoi.png` and `Orlearouge.png` (top-down devmode fly-camera
views with hand-drawn boundary/arrow annotations) — **read these images
before starting**, they're the actual spec for where this goes.

Human's own words: *"we need to expand the Orlearouge area — this is
basically going to be the prime nightlife hub of our map. So we've got to
populate it with lots of nightclubs, strip clubs, kind of like a red light
district, but also with lots of casinos... party central. We'll have like
some idiots in tuxedos thinking they're all fancy, maybe some limousines
driving around, high-end escorts, pretentious rich superficial kinds of
people... I want to put lots of casinos, and it would be nice if we could
enter most of these buildings, particularly nightclubs and strip clubs."*

**What the screenshots show:** a red boundary drawn around OrleaRouge's
current built-up block (this is `orlearouge.js`'s `CITY` — `x -136..136, z
196..382`), with arrows to extend it further east ("Casinos") and further
along the boulevard to the north ("Hell with a snippet of heaven lol — we
want to extend this area so it spans further"), plus text labels "High end
Escorts LOL" and "Spin off of New Orleans.. Party central.. Nightlife"
pointing at parts of the current build. A third arrow points west, off the
current city block, toward a landmark outside the boundary (unclear from
the image alone which one — check in devmode).

**Context already in the repo — read before designing from scratch:**
`orlearouge.js`'s `riverfront()` (~line 417) already builds one riverboat
casino ("GRAND CRESCENT CASINO") on the south promenade with a real neon
sign helper (`neonSign(...)`) and a `MeshPhysicalMaterial` water technique —
reuse both rather than inventing new ones. `nightlife.js` (that session's
TASK-055, `REVIEW`, further down) already built four walk-in clubs on a
"French District" block within OrleaRouge with a no-loading-screen interior
technique (roof/sign lifts off, walls drop to knee height), go-go
dancers/strippers, a healing-via-tip/lap-dance loop, and `gayman`/`lesbian`
ambient pedestrians — **that block may already be what "Frenchmen Street"
is meant to be inside this bigger district**, or the human may mean
something adjacent; confirm before duplicating effort. Prostitute NPCs
already exist in the game (grep `npc.js`/`prologue.js`/`greedoCampaign.js`
for the existing pattern) — "high-end escorts" is very likely a reskin/
variant of that existing type (different dressing, different dialogue/
pricing, richer neighborhood placement) rather than a new system.

**Genuinely new, not found anywhere in the repo today:** a limousine
vehicle (no `limo` anywhere in `src`), tuxedo-dressed NPC pedestrians (no
`tuxedo` anywhere in `src`), and casino *interiors* specifically (gambling
tables/slot machines/an actual floor to walk — the one existing casino is
an exterior riverboat prop, not enterable).

**Real scope, broken down:**
1. **Extend `CITY`'s bounds** (or add an adjacent authored block, same
   pattern `nightlife.js`'s `lots`/`orlearouge.js`'s block-builder already
   use) east and north per the arrows, with more of the existing tower/club/
   casino kit repeated at higher density — "party central" density, not
   sparse.
2. **More casinos**, enterable (slot machines, tables, a floor — new
   interior content, likely sharing TASK-059's interior-transition tech
   rather than each casino inventing its own).
3. **More nightclubs/strip clubs**, enterable, reusing `nightlife.js`'s
   proven walk-in-interior technique rather than a second implementation.
4. **Tuxedo-dressed "pretentious rich" NPCs** — a new dressing/palette on
   the existing pedestrian system (`characters.js` already has this pattern
   for `gayman`/`lesbian` etc. from TASK-055 — follow it), with matching
   flavor dialogue in `pedestrianChatter.js`.
5. **Limousines** — a new `VEHICLE_DEFS` entry (stretched proportions,
   slow/dignified handling) that traffic spawns preferentially in this
   district; check the asset manifest for a limo model before building one
   from primitives (same check pattern TASK-053 item 7 and TASK-058 already
   used for their missing models).
6. **High-end escorts** — very likely extending the existing prostitute NPC
   type/mechanic (see above) with different dressing/dialogue/pricing for
   this district, not a new mechanic from scratch.

Real scope here is comparable to TASK-055 (Frenchmen Street) or bigger —
flagging that up front. Suggest confirming with the human which of the
"Frenchmen Street already exists" overlaps above are the same thing they're
asking for vs. something distinct, before duplicating work.

**Not started** — no code changes yet, this is the design brief as given.

---

### TASK-064 — A real Mississippi River between OrleaRouge and Chatboro, with swimming, boats and river fauna (human request + screenshot, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/main.js` (world bounds,
swim state), `src/orlearouge.js` (the causeway approach), a Chatboro-side
module, `src/vehicles.js` (a boat), a new small module for river fauna
**Reference:** `Missisippoi.png` at the repo root — the human drew two blue
lines across the approach into OrleaRouge, labeled "MISSISIPPI RIVER TO GO
BETWEEN HERE."

Human's own words: *"I want to basically split the map — we need to put a
massive river between OrleaRouge and Chatboro. Eventually we'll need
swimming mechanics, maybe boats — why not. Maybe alligators, river
monsters, something funny."*

**Context:** `world.js` documents south as `+Z`: Tusouxroe (north) →
Chatboro → the causeway → OrleaRouge, in that order. `orlearouge.js`
already exports `CAUSEWAY = { minZ: 136, maxZ: 192 }` as the approach
corridor into `CITY` (`minZ: 196`) — the screenshot's blue lines look like
they fall right around this same corridor, so the river most likely replaces
or runs alongside the existing causeway crossing rather than being a wholly
separate cut through the map. `orlearouge.js` already has one proven flat
river-water technique (`riverfront()`'s `MeshPhysicalMaterial`, `color:
0x0a1a22, roughness: 0.12, clearcoat: 1` — see TASK-063's context section) —
reuse it for consistency rather than a new water shader.

**Real scope, and it's large — this touches world traversal, not just
dressing:**
1. **The river geometry itself** — width, banks, and how the existing
   causeway relates to it (does the causeway become a bridge *over* the new
   river? that seems like the natural reading of "the river goes between
   here" across the existing crossing, but confirm with the human before
   assuming).
2. **Swimming** — genuinely new player-state work: no swim state exists in
   `main.js` today (player is either on foot or in a vehicle). Needs
   entering/exiting water, a distinct movement model, and a drown-risk or
   stamina question the human hasn't specified yet.
3. **Boats** — a new vehicle category (`vehicles.js`'s arcade model is
   heading+speed on the ground plane; a boat needs to stay on the water
   surface, which `stepArcadeVehicle()` doesn't do today) — open question
   whether this reuses `bikes.js`'s "build from primitives" approach (that
   session's TASK-056 already did this for motorbikes/scooters when no
   model existed) or sources a model.
4. **River fauna** ("alligators... river monsters... something funny") —
   explicitly under-specified by the human's own words ("I don't even know,
   probably... I guess") — this is licence to have fun with it, not a
   precise spec. Could be as simple as a hostile enemy kind reusing the
   existing `hog`-style aggro machinery (`ENEMY_KINDS` in `main.js`) with a
   gator model and a "drags you under" attack, once swimming exists to be
   threatened by it.

Suggest sequencing: geometry + causeway-becomes-a-bridge decision first
(confirm with the human), swimming second, boats and fauna after — boats
and fauna are both pointless without a swimmable river to put them in.

**Not started** — no code changes yet, this is the design brief as given.

---

> **Task-ID collision, 2026-09-20:** two sessions again used the same numbers for
> unrelated work — TASK-053, 054 and 055 each exist twice. Both sets are kept,
> unrenumbered, as the earlier collision in this file was: the gameplay/story set
> (Mama, services, Frenchmen Street, bikes) first, then the map-editor / radio /
> hog-companion set. A human pass can renumber them.

### TASK-056 — Motorbikes and scooters (human request: "motorbikes n scooters n stuff")

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/bikes.js` (new), `src/vehicles.js`, `src/characters.js`, `src/main.js`

- `bikes.js` builds a sport motorbike and a Vespa-style scooter from primitives (no model
  files exist); `vehicles.js` defines `motorbike` / `scooter` (one seat, `bike: true`, a
  `seat`, and a `handling` block that now overrides `DRIVE` per vehicle — cached merge).
- Riding: the rider stays on show in a new `ride` pose (characters.js), the frame leans into
  turns (a scooter barely), the rider leans with it, and you step off 1.3 m to the side.
- Nine parked at spawn, Chatboro's Pay 'n' Spray, Main Street, Tusouxroe North, outside the
  Frenchmen Street clubs and the OrleaRouge Popeyes; each spot is checked against the
  blockers at boot and nudged onto clear ground.
- Tested: F boards, W reaches 20.6 m/s in 1.5 s, full lean 0.34 on a turn, F steps off.
- Not done: bikes in the traffic pool.

---

### TASK-055 — Frenchmen Street: gay bars, strip clubs, and OrleaRouge's out crowd (human requests)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/nightlife.js` (new), `src/characters.js`, `src/pedestrianChatter.js`,
`src/voiceCast.js`, `src/spawnzones.js`, `src/orlearouge.js`, `src/minimap.js`, `src/main.js`

- **Four walk-in clubs** on the French District block by the boulevard (x −39…−14,
  z 257…283; orlearouge.js now takes `lots` — whole blocks another module builds on):
  THE PINK PELICAN (gay bar, go-go boys), BAYOU BELLES (lesbian bar, go-go girls), CLUB BOUNCE
  (strip club, women on the pole), BIG EASY BEEFCAKE (male revue); everybody's welcome in all.
  No loading screen: inside, the roof and sign lift off and the walls drop to knee height.
  A synthesized NOLA bounce loop plays (WebAudio, no files) and the soundtrack ducks.
- **Healing there:** the stage rail, F — make it rain, $10, a dancer twerks for you, +15 HP;
  the VIP chair, F — a lap dance (twerk, grind, a kiss), $40, +45 HP. New rig clips in
  characters.js: `twerk`, `grind`, `dance`, `sit`, `kiss` (and `ride`, TASK-056).
- **New pedestrians:** `gayman` / `lesbian` (characters.js `randomGayMan` / `randomLesbian`,
  rainbow do-rags/headbands, short-hair option) in OrleaRouge (10% each) and a few in
  towns; bump and fight lines in pedestrianChatter.js (no slurs); club regulars bark too.
  Voices: stand-in ids in voiceCast.js — run tools/pedestrian-voiceover-gen.mjs for audio;
  until then the lines fall back to speech synthesis.
- Tested (headless): the jobs via the real F key — lap dance HP 40→85 / $100→$60, tip
  HP 60→75 / $60→$50; bumps "Gay Guy: Careful, sweetie — this outfit is dry-clean only.",
  "Lesbian: Easy — I just got these Docs broken in."; screenshots of the block, the cutaway,
  the stage and the lap dance.

---

### TASK-054 — Pay 'n' Spray, the wanted level, buying guns, healing, and the story's how-to (human requests)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/services.js` (new), `src/tips.js` (new), `src/main.js`, `src/landmarks.js`,
`src/orlearouge.js`, `src/tusouxroeNorth.js`, `src/minimap.js`, `tools/qa/gascans.mjs`

- **Wanted level from the first crime.** The stars used to stay off until 12 Redneck/Hoodrat
  kills (`HEAT_KILLS`), so most players never met them. Now any star's worth of heat calls
  the Sheriff (and the system stays on, standing down at zero, as before). Gunfire only counts
  when someone is within earshot — hogs in the woods don't bring cruisers. Losing stars:
  out of sight and hidden (police.js, unchanged) or a Pay 'n' Spray.
- **services.js:** Pay 'n' Spray garages (drive in: the door rolls down, $100, new paint,
  repairs, stars gone — Chatboro strip, Tusouxroe US-167, an OrleaRouge lot); gun counters
  (walk on, F, W/S, buy: 9mm $150, Tec-9 $400, sawed-off $600, deer rifle $900, ammo $60 —
  Chatboro Guns & Pawn, every Bayou Arsenal, OrleaRouge Pawn & Guns); hospitals (F: full
  health $60, charity ward to 60 HP if broke — Harborlight, OrleaRouge Public); Popeyes
  counters (F: 3-piece $12, +40 HP). Rings, floating icons and radar badges (S, G, ✚, P, ♥).
- **tips.js:** a help box. When the prologue hands over to Act One, the story walks through
  buying guns, healing (Popeyes, hospitals, prostitutes, the clubs), wanted stars and Pay 'n'
  Spray; each also fires on its own the first time it matters.
- **City-building collision follows the footprint** (landmarks.js `placeCityBuilding`):
  one circle of half the *diagonal* reached 6.8 m past Harborlight Hospital's front wall and
  swallowed its entrance and every gun counter. Now circles the size of the short side along
  the long one, plus the corners. Every service ring and club door checked against the real
  blocker grid: all reachable.
- Tested: Popeyes HP 50→90; gun counter menu, Tec-9 bought and in hand; hospital HP 30→100;
  Pay 'n' Spray 2★→0, car repaired; low-health tip at 40 HP. Regression, all on the final
  build: `gameplay.mjs` pass (hp 100 throughout), `gascans.mjs` 5/5 (its stale
  character-select wait removed — free roam skips it since the other session's change),
  `nolantis.mjs` 11/11, `actone.mjs` every beat, `prologue.mjs` every stage, `police.mjs` 8/8
  twice — it is flaky on the 3 s bust threshold: the unchanged baseline failed it 4/8 on a
  re-run the same way.

---

### TASK-053 — "Saving Keseme's mom" fell through to the gas cans (human report)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/actone.js`, `src/main.js`, `tools/qa/nolantis.mjs`

Nolantis ends on "Someone threatened Mama" and calls `ctx.startNext()` — but main.js never
gave it one, so the story objective cleared and the HUD fell back to "rob gas cans". Now
Nolantis hands on to `actOne.protectMama()`: the objective and the radar waypoint point at
Mama's door in South Tusouxroe, and reaching it completes the beat ("Mama's safe — for now"),
then the escape plan resumes. No script lines added: what happens *at* the house is not in
the repo's script — **needs the human's call**. `nolantis.mjs` has three new checks.

---

### TASK-053 — $DEVMODE69xxx round 3: batched-building copy, real parked cars, POI-based ped/traffic density, right-click "Edit design" color editor (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/mapEditor.js`, `src/merge.js`,
`src/landmarks.js`, `src/main.js` (ctx plumbing for the real parked-car
loaders), `src/npc.js` (new POI insertion), `src/traffic.js` (if a
POI-equivalent density knob doesn't already exist there — needs checking,
its lanes are polylines, not point-density, so this may need its own small
mechanism rather than reusing pois wholesale)

Five asks from this session's follow-up conversation, captured here per the
human's "just log the plan in todo.md" instruction — **none of this is
implemented yet.**

1. **Select AND copy district-authored (batched) buildings**, not just the
   handful of unbatched/named world objects TASK-052 item 6 already covers.
   Most buildings are folded into `merge.js`'s `batchStatic()` shared
   "static-batch" meshes for draw-call reduction (measured ~1,260 draw
   calls/frame across ~1,400 meshes before batching — turning batching off
   entirely is off the table, it'd bring that cost back for every player,
   not just dev mode). The scoped, safe version discussed: teach
   `batchStatic()` to *keep* each source building's pre-merge geometry
   (already computed and normally discarded after `mergeGeometries()`,
   tagged with which building + a computed index range so a raycast hit on
   the shared batch mesh can be traced back to one building) instead of
   throwing it away. The editor then reads (never mutates) that data: Select
   can identify which building was hit and **Copy** it into a real,
   independent standalone clone — Cut/move of the *original* stays
   unsupported, since it can't be pulled out of the shared batch without
   rebuilding it. Once copied, the clone behaves like any other placement
   (movable, deletable, saveable, re-placeable from the library). Known
   cost: keeps per-building geometry alive in memory permanently instead of
   discarding it after the one-time batch build — roughly back to the
   game's pre-batch memory shape, not doubled, since it's the same buffers,
   just not garbage-collected.
2. **Real parked cars, not the broken stub.** `landmarks.js`'s
   `placeParkedCar()`/`placeTruck()` are literal no-ops ("cars are currently
   broken/non-interactable" / "trucks are broken/untextured old assets") —
   that's why the editor's catalog omits them (TASK-052's own comment
   explains this). But `main.js` already has a completely separate, working
   ambient parked-car system (`placeParked()`, the `parkedCarSpots` array,
   the `loadVehicle()`/`loadDsCar()` loaders) used for the decorative cars
   already sitting outside shops in every district. Plan: expose those
   loaders through `ctx` (same pattern as the existing `ctx.loadGLB`) and
   add real catalog entries backed by them — decorative only (not
   drivable/hijackable, matching what's already in the world today), which
   is an honest working feature rather than resurrecting the abandoned stub.
3. **NPCs — option (b), confirmed by the human: add a real POI, not just a
   decorative static figure.** `npc.js`'s `createNpcSystem({ pois, ... })`
   simulates an ambient wandering population from a fixed list of "POI" home
   anchors set up once at world-build time — there's no per-instance
   "spawn one pedestrian" call. Dropping a POI from the editor at a chosen
   spot should spawn a real wandering crowd around it during play, which is
   what "make this spot more populated" actually means. Needs: a way to
   inject a new POI into the live `pois` array from the editor (or persist
   one to be added at next boot — TBD which is more useful) plus whatever
   population-density parameters `pois` entries carry (`r` for radius,
   possibly a type/count weight — check `npc.js`'s POI shape before wiring
   this up).
4. **Traffic/cars — same "(b), add a POI" answer from the human, but
   traffic.js's architecture doesn't have a POI concept to reuse.**
   `traffic.js` drives cars along predefined lane polylines with a fixed
   `perLane`/`maxCars` pool, not point-density. Before implementing,
   whoever picks this up needs to check whether there's already a
   lane-local density/spawn-rate knob to hook a "busier here" POI into, or
   whether this needs a new, small mechanism (e.g. a radius-based local
   `perLane` multiplier keyed by proximity to a dropped point) — flagged as
   an open question rather than assumed solved.
5. **Right-click context menu + "Edit design" color editor.** A dropdown
   menu on right-click when something's selected (today right-click only
   cancels/deselects — TASK-052 item 3). Menu should include at least an
   "Edit design" option opening hue/saturation/contrast sliders (and room
   for more later) that live-adjust the selected object's material color.
   Technically straightforward (material color/HSL is just a THREE.Color
   mutation) — the actual work is the menu UI itself and making the edit
   undo/persist the same way a placement does.
6. **Combat feel overhaul (human's own words): "attacking [should] feel more
   real and satisfying... they don't even punch properly and when they hold
   weapons it looks ufcking shit. The shotgun has to feel like a shotgun, it
   has to SOUND like a shotgun and spray bullets everywhere like a shotgun
   etc. Each gun should feel unique."** Confirmed by reading `fire()` in
   `main.js`: every weapon (pistol/tec9/sawnoff/deerRifle) currently runs
   through the exact same code path — one aim-assisted hitscan ray at the
   single best-scored target, one shared `"shoot"` animation, one shared
   `playFireAnim3D(gun.melee)` call (a boolean melee/not-melee split, nothing
   per-weapon), only damage/cooldown/range/sound-effect-name differ via the
   `gun` stats lookup. So the complaint is accurate, not exaggerated: there
   is currently no shotgun spread, no per-weapon recoil/animation, no punch
   animation distinct from a generic "attack" swing. Real fix needs: (a) a
   proper punch/melee animation reviewed against how `player.play("attack")`
   actually looks today (character rig work, not just code), (b) real
   multi-pellet spread + falloff for the sawnoff instead of one hitscan ray,
   (c) per-weapon recoil/camera-kick and hold-pose (weapon-in-hand looking
   "shit" likely means `weapons_3d.js`'s `updateWeapon3D()` grip/offset needs
   per-weapon tuning, not one shared pose), (d) distinct sound design per gun
   (partially there via `WEAPON_SFX`, worth a real pass once the mechanics
   change). This is the biggest, most subjective item on this list — needs
   iteration/playtesting, not a one-shot fix.
7. **Motorbikes.** Checked `vehicles.js`'s `stepArcadeVehicle()` — it's a
   generic top-down arcade model (heading + speed, no per-wheel physics), so
   a bike doesn't need new physics code, just its own `VEHICLE_DEFS` entry,
   tuning (faster accel, twitchier steering, lower grip feels right for a
   bike vs. a car — needs playtesting to land on numbers) and a single-rider
   seat/mount offset instead of a multi-seat car interior. Checked the freshly
   uploaded R2 asset manifest (`tools/r2-manifest.json`, all 462 model
   entries) for an existing motorbike model to reuse — **none found** (no
   pack/file matching bike/motor/cycle/harley/scooter). A model needs to be
   sourced (either from a pack not yet in `Z:\GITHUB\_ASSETS`, or
   commissioned/found separately) before this can actually ship — flagging
   now so it isn't assumed to be "just wiring", the asset is the real
   blocker.

**Suggested order** (not yet confirmed with the human): #5 (contained UI
work, no architecture risk) → #2 (small, reuses working code) → #1 (bigger,
but self-contained to `merge.js`+`mapEditor.js`, zero risk to live
rendering) → #7 (needs a sourced asset first, otherwise just data+tuning) →
#6 and #3/#4 (biggest — #6 touches core combat feel for every player and
needs real playtesting, not a rushed pass; #3/#4 touch live simulation
systems that run for every player, not just dev mode).

---

### TASK-054 — In-vehicle radio (human request, 2026-09-20)

**Status:** `IN PROGRESS` — the music half is done and pushed; the DJ-host
half is logged, not built · **Files:** `src/radio.js` (new),
`src/main.js`, `assets/audio/radio/*.mp3`

Human supplied four SoundCloud tracks (their own team's, from the
`petaparkalot97` account that owns this repo's `origin` remote and the
Cloudflare Pages deploy) and asked for them in the game, playing inside
vehicles, with a radio host reading generated lines between tracks.

**Done:** downloaded all four via `yt-dlp` (already present in the dev
environment) as mp3, renamed to clean filenames, added to
`assets/audio/radio/`. New `src/radio.js` cycles them (shuffled, reshuffled
each time it loops) through a plain `HTMLAudioElement` — the same approach
`music.js`'s `createSoundtrack()` uses for the background soundtrack, no
WebAudio graph needed. Wired into `main.js`'s `tick()` by edge-detecting
`state.veh` (rather than hooking every individual enter/exit call site —
there are close to a dozen scattered across normal exit, hijack, explosion,
the wanted system's forced eject, dev teleport — edge-detection reacts
correctly no matter which one fires). Fades in/out over the vehicle
enter/exit rather than cutting off mid-beat. Smoke-tested via Playwright:
loads with no console errors.

**Not done — the DJ host:** the human's ask includes "we will generate
lines for a radio host" between tracks. The existing voice pipeline
(`tools/voiceover-gen.mjs` + Fish Audio + `src/voiceCast.js`) is built
specifically around scanning `c.say("WHO", "text")` cutscene dialogue calls
for existing story characters, not a standalone script — properly using it
for a radio host means: adding a new voice-cast entry for the host
character, writing an actual DJ script (intro/outro lines, transitions
between these four tracks), generating the audio via that pipeline (needs
`FISH_AUDIO_API_KEY`), and sequencing host-line → track → host-line →
track in `radio.js` instead of gapless back-to-back tracks. None of that is
built yet — flagging it as its own follow-up rather than bolting on a rushed
half-version of it.

---

### TASK-055 — Loyal hog companions (human request, 2026-09-20) — logged, not started

**Status:** `BACKLOG` · **Files (expected):** `src/main.js` (enemy/companion
state), `src/npc.js` or a new small module for follow/guard AI

Human's own words: *"i want to make a mechanic in the game where the player
can somehow cultivate hogs that are loyal to the player, they will follow
the player around on foot and any time player is attacked the hogs will
attack the hostiles and attempt to protect the player."*

Today `hog` is purely a hostile enemy kind (`ENEMY_KINDS` in `main.js`,
"Feral Hog," part of the same aggro/attack pool as rednecks/hoodrats — see
`main.js` around line 1324). There's no existing tame/companion state for
any actor. This needs, at minimum:
- **A taming trigger** — how a hostile hog becomes loyal isn't specified by
  the human yet (feeding? a minigame? proximity + time? killing its
  aggressors for it?) — a real open question, not an implementation detail,
  worth confirming before building.
- **A new AI mode** distinct from the existing wander/aggro-toward-player
  state machine: follow-the-player-on-foot (loose formation, not glued to
  a single tile) when nothing's happening, and a defend trigger that flips
  a loyal hog to hostile-toward-whoever-just-hit-the-player, reusing the
  existing enemy `state`/`hp`/attack machinery hogs already have rather
  than building parallel combat code.
- **Persistence** — do tamed hogs survive a save/reload, district
  transitions, fast travel? Not yet scoped.

Not started — no code changes yet, this is purely the design brief as given.

---

### TASK-052 — $DEVMODE69xxx round 2: full asset library via R2, mode UX, drag-select, copy/paste, edit-anything (human request, 2026-09-20) — TOP PRIORITY

**Status:** `REVIEW` — all 6 items done and Playwright-tested; R2 upload
finished clean (1873/1873, 0 failed), `tools/r2-manifest.json` is valid and
committed · **Agent:** Claude
**Files:** `src/mapEditor.js`, `src/landmarks.js`, `tools/upload-assets-to-r2.sh`, `tools/r2-manifest.json`

**Human's own words:** *"OK WE NEED TO FIX THE MAP EDITOR. ITS TOTALLY SHIT."* — six numbered
points, verbatim intent below. Also directed: "start uploading to cloudflare
bucket and begin working on the editor. Make sure to commit and push the
editor changes too!!"

1. **Not all 3D assets are accessible in the editor.** Root cause found: the
   full asset library lives in a *separate* local repo, `Z:\GITHUB\_ASSETS`
   — not inside `bayou` at all, and not even extracted (the packs are raw
   `.rar`/`.zip` archives, ~2 GB). The deployed game and the editor can only
   ever see files inside `bayou`'s own `assets/` folder — this was never
   going to work without an actual pipeline. Decision (human confirmed):
   host the extracted library on **Cloudflare R2** (account already has API
   access; free tier covers this — 2 GB is well under the 10 GB free
   allowance) rather than committing 2 GB of binaries into `bayou`'s git
   history. Needs: an R2 bucket, the archives extracted into real
   FBX/GLB/OBJ + texture files and uploaded, a listing/manifest mechanism
   (this doubles as the pagination the human asked for if the container
   can't list everything at once), CORS so the game's origin can fetch from
   it, and the editor's catalog/loader pointed at R2 URLs instead of
   `./assets/...`.
2. **Select/Delete mode toggling is unintuitive**, and worse: **Select
   mode still leaves the ghost armed to place a new object** — trying to
   click something to select it instead drops a fresh building, since only
   Delete mode clears the "about to place" cursor state. Needs a real
   rethink of the mode model, not just relabeling.
3. **Right-click currently does nothing** (well — it's bound to camera
   orbit-drag, but reads as dead to the human). Make it useful.
4. **Click-and-drag box-select** for multiple placed objects at once.
5. **Copy / cut / paste.** Drag-select multiple objects, Ctrl+C or Ctrl+X
   (cut) picks them up as a holographic preview following the cursor,
   click or Ctrl+V drops them.
6. **Select/move/edit/remove objects the editor didn't place** — i.e. the
   world's own authored landmarks, not just this session's placements.
   **This explicitly reverses the "editor-placed objects only" scope the
   human confirmed for TASK-051's Select tool** — they now want the editor
   to be able to touch anything in the scene. Needs a real object registry
   (id + source + how to remove/rebuild it) for landmarks that were never
   designed to be deleted at runtime; district-authored geometry that's
   just one mesh among thousands (batched, procedural) may not be
   individually pickable without further work — flag what's actually
   feasible here rather than silently no-op'ing on the hard cases.

#### Status as of this commit (Claude, 2026-09-20, while the human was away)
- **Items 2-6: done, Playwright-tested, this commit.** Mode UX rebuilt (ghost
  only shows in Place mode; Select marks picks with wireframe boxes instead),
  right-click cancels/deselects, drag-box multi-select, Ctrl+C/X/V
  copy/cut/paste with a holographic multi-preview, and Select now falls back
  to raycasting the live scene for district-authored objects when nothing
  editor-placed is nearby (reports "merged into a shared batch, can't
  isolate" for `merge.js`'s batched meshes rather than silently no-op'ing —
  confirmed hitting real named objects like `parish:rest-stop` in testing).
  Full interaction model documented in `src/mapEditor.js`'s file header.
- **Item 1 (R2 asset library): code done and tested, upload still running.**
  `tools/upload-assets-to-r2.sh` extracted and is uploading ~1873 files
  (~684 MB, 5 categories: Buildings-Shops, Props-Furniture,
  Roads-Infrastructure, Vehicles, Dungeons-Interiors — Characters-Animations
  and Weapons-Tech deliberately excluded) from `Z:\GITHUB\_ASSETS\_extracted`
  to the `bayou-assets` R2 bucket, building `tools/r2-manifest.json`
  alongside it. At this commit the upload is roughly 35% done (background
  job, hours not minutes at this rate) — **`r2-manifest.json` isn't
  committed yet because the running script hasn't closed its JSON array**;
  it'll land in a follow-up commit once `grep "UPLOAD COMPLETE"
  tools/upload-log.txt` shows it's finished. `src/mapEditor.js` fetches it
  lazily (first editor toggle-on) and merges one catalog entry per unique
  model into new `R2: <category>` tabs — verified end-to-end against a
  frozen snapshot of the real, already-uploaded entries (manifest fetch →
  tabs appear → search finds the asset → placing it actually loads the real
  model from R2). `src/landmarks.js`'s new `placeR2Model()` handles both
  GLB/GLTF (self-contained) and loose FBX (reuses the existing
  Textures/-folder redirect) — **known limitation**: that redirect assumes
  the common "pack/pack/Models/ + pack/pack/Textures/" layout, which several
  packs don't follow (nested subfolders like `Models/Stops/`, or per-model
  `.fbm/` folders) — those will show flat/white materials until someone
  hand-curates them, same class of limitation as item 6's batched-mesh case.
  Not fixed: with ~30 unrelated, unrelated-authored packs, a fully general
  texture-path resolver isn't feasible without bucket-listing support R2's
  public domain doesn't expose.
  The picker is now paginated (48/page) instead of one long scroll, and
  "Ask AI" no longer sends the whole (now 400+ entry) catalog on every
  request — it sends the curated set plus only R2 entries whose label
  keyword-matches the prompt.
- Item #1 (R2) is infrastructure, not just code — check `wrangler.jsonc` for
  the bucket name and CORS config (already confirmed working, incl.
  cross-origin fetch from the R2 public domain) before assuming asset paths
  work the same way they used to.

**Next step for whoever picks this up:** once the upload finishes, run
`node -e "JSON.parse(require('fs').readFileSync('tools/r2-manifest.json'))"`
to confirm it's valid, commit it, and spot-check a few packs per category in
the live editor (the texture-path limitation above means some will need a
per-pack fix or a "known broken" label rather than silent white materials).

---

### TASK-051 — $DEVMODE69xxx follow-up: shop-pack white materials, missing assets, layout, select/move tool (human report + screenshots, 2026-09-20)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/landmarks.js`, `src/mapEditor.js`

#### What was wrong, and what changed
1. **The 6twelve/gas-station/Tacos/BurgerPiz "weird white colour."** These FBX
   packs embed the *original artist's* absolute Windows texture paths
   (`C:\Users\srkak\Music\pasto\...\Plastic_04.jpg`). FBXLoader already has a
   built-in workaround for exactly this — it strips an absolute reference
   down to the filename and resolves it against the FBX's *own* directory
   before a `LoadingManager`'s URL modifier ever sees it — but every one of
   these packs keeps its real textures one level down, in its own
   `Textures/` folder, not beside the FBX. `landmarks.js`'s FBX loader also
   had no `LoadingManager` at all until now. Net effect: every texture
   404'd, every material fell back to its base color (`#cccccc`), which
   reads as flat white/gray on a lit surface — the report's "weird white
   colour." Fixed with a per-pack `LoadingManager` that redirects any
   texture-extension request not already resolving into `Textures/` to
   `<pack root>/Textures/<filename>`, guarded to extension-only requests so
   it never touches the `.fbx` file's own load.
2. **Missing catalog entries.** `placeTacos`/`placeBurgerPiz` already existed
   in `landmarks.js` but were never wired into the editor's `CATALOG`; added.
   Also added two new functions: `placePopeyes` (procedural, a simplified
   stand-in for main.js's private inline Popeyes builder — no shared canvas
   sign texture or strip-specific parked-car list, those are that scene's
   own furniture) and `placeStreetLamp` (the shared urban kit's streetlamp
   model via `ctx.loadGLB`, left to its own `realize()` pass for materials).
3. **Cheat code alias.** `#DEVx` now toggles the editor same as
   `$DEVMODE69xxx` — either buffer match works.
4. **Crowded UI.** The old layout hand-picked a pixel `top:` offset per
   panel, so any panel that grew shoved the next one halfway underneath it.
   Replaced with two flexbox columns (controls on the left, the whole
   searchable asset library on its own column on the right) that lay out
   naturally, plus the game's own `#hud` now hides itself while the editor's
   panels are up instead of showing through behind them.
5. **No way to move or remove a placed object without re-placing over it.**
   New "Select" tool (third mode alongside Place/Delete): click picks the
   nearest editor-placed object, its ghost preview swaps to match (turns
   yellow), a second click drops it at the new spot, Q/E rotates it in
   place (destroy + recreate at the adjusted `ry`, since arbitrary created
   object graphs aren't safe to live-transform), Backspace/"Delete
   selected" removes it, "Deselect" lets go without moving it.

#### Testing performed (2026-09-20, live, headless Chromium via Playwright — the
Chrome extension wasn't reachable this session, so a local Playwright
install stood in for it)
- Both cheat codes toggle the editor on/off correctly, including toggling
  off with one and back on with the other.
- Catalog now lists 23 tiles (was 19), including Tacos stand, BurgerPiz,
  Popeyes, Street lamp — confirmed by reading every tile's `title`.
- Placed a 6twelve store and read every mesh's material back from the live
  scene: before the fix, every textured material's `map.image` was empty
  (0 width) with real network 404s for e.g.
  `sixtwelve/Plastic_04.jpg`/`gasstation/6twelve.jpg`/
  `burgerpiz/BurgerPiz/Models/Wall.jpg`/`tacos/Tacos/Models/Shelf_B.png` —
  after the fix, the same materials report real image data (e.g.
  `.../sixtwelve/Textures/Mostrador.jpg`, 562px wide, `complete: true`).
  Confirmed this reproduces during **normal world boot** too (westparish/
  tusouxroeNorth place these same packs), not just the editor — this was a
  live, game-wide bug, not editor-specific.
- Select → move → delete exercised end to end: select reports "selected
  6twelve store — click the world to move it here, Q/E to rotate";
  clicking elsewhere relocates it (placement count unchanged, not
  duplicated); "Delete selected" removes it (count back to 0).
- No new console errors from any of the above.

#### Known issues
- Three individual 6twelve textures (`Food_shelf_04`, `ice_cream_popsicles`,
  `Parking_lot`) still 404: the FBX references `.jpg`, the real files on
  disk are `.png`. Not chased — three props out of a ~200-mesh model, not
  the systemic bug.
- `placePopeyes` is a simplified stand-in, not main.js's actual strip
  Popeyes (no shared sign texture, no parked-car integration) — fine for
  editor prototyping, not a drop-in replacement for the real one.
- Slot/AI features still show "couldn't reach the server" against the
  *deployed* Render service until it picks up last session's
  `server/index.js` changes (and gets `OPENROUTER_API_KEY` in its own env —
  a local `.env` only covers local runs).

---

### TASK-050 — The white layers over Chatboro, Tusouxroe and elsewhere (human report)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/landmarks.js`, `src/graphics.js`, `src/tusouxroeNorth.js`, `src/main.js`,
`src/eastbank.js`, `src/orlearouge.js`, `src/westparish.js`
**Reported:** *"Fix and remove bug causing there to be white layers on Chatboro, Tusouxroe,
and other places"* — after TASK-049. Found by ray-picking the pale pixels in the live scene.
Five separate causes:

1. **The shop packs brought their whole neighbourhood.** BurgerPiz ships four houses
   ("Building".."Building003") 70–190 m out, Tacos ~60 buildings plus power lines at 11–16 m,
   the gas station a buried pump part. TASK-049's name cull can't catch a house, and the
   model was centred on everything that survived, so those houses landed across roads: their
   flat grey roofs at 9.8 m sat between the camera and the player in Tusouxroe North.
   `trimToSite()` in `landmarks.js` keeps only the shop's own footprint (+4–5 m) and stands
   the model on the shop's floor, not its lowest mesh (the gas station was floating 4.8 m;
   18 m before TASK-049). Tacos is its taco stand now (the pack's OXXO is scenery); its
   blocker shrank from 14 m to 3.5 m to match.
2. **TASK-049's cull deleted the shops themselves.** Matching ANY material name killed the
   6twelve store and the gas station's shop (each has a strip of its own "Asphalt"). Now a
   mesh is culled by material only when EVERY material is scenery.
3. **Lit-sign glow matched the file name and the parent.** `realize()` tested EMISSIVE
   against hint + mesh + parent names, so "harbor**light**-hospital.glb" made every curb,
   paving slab and wall of the hospital glow warm white (the "white hospital" bug `c77c278`
   never fixed — its `markRealized` runs after the glow is applied), "Toyoyo_High**light**"
   the whole truck, and the city packs' "-light" shades (stone-light, paving-light…) glowed
   everywhere. Now own names only, and "-light" shades / sign backs are excluded.
   ~5,000 m² of pale surfaces stopped glowing; the packs' real lamps/windows keep theirs.
4. **Every strip 6twelve and gas station (Chatboro → Tusouxroe) z-fought white stripes**
   through its red roof: the stripe's top and the shop's roof were both at y 4.6.
5. **The swamp's clearcoat** (TASK-049 blurred it to 0.45) spread the moon into a pale
   glaze over half the bayou. Clearcoat removed in all three modules.

A sixth cause was fixed in parallel by another session — the wet-road mirror painting every
road white from high cameras (`src/fx.js`; see the white-sheet TASK-047 below).

Also: Tusouxroe North's filler grid ran two rows 5–10 m off North Ave 1 and 2 and assumed
16 m buildings; with real-size shops their canopies lay across the avenues. Rows now run
mid-block, and a filler only goes down where its real footprint clears every road, every
named building and every earlier filler.

#### Testing performed (2026-09-19), HEAD vs this change, headless (SwiftShader)
- Camera→player line of sight at 209 road points × 4 headings: **490 of 836 blocked → 25**
  (what's left: real buildings beside the sample point, the overpass the camera already
  ducks, three named buildings that sit on roads — see Known issues).
- Pale glowing area: **29,850 m² → 16,384 m²**; the remainder is the OrleaRouge / Nolantis
  towers' authored window glow.
- Coplanar raised surfaces: HEAD's pack ground sheets at y 1.8 over Tusouxroe North (100k+ m²
  of overlap) gone; the four strip roofs gone.
- `gameplay.mjs` hp 100 throughout, 0 new console errors; `gascans.mjs` **5/5** (4/5 once
  when run alongside another headless game — the objective-text timer; 5/5 alone);
  `prologue.mjs` all eight stages, chase screenshot clean.

#### Known issues
- Named buildings on roads (not layers, pre-existing): the Sunbeam Cottages (±145, −260) sit
  on Tusouxroe Blvd; Willowbrook School and Meadow Apartments on North Ave 2 (z −320).
- The hospital and market parking aprons are across the Boulevard from their buildings.
- Street-lamp models still glow along the whole pole (mesh named "lamp").

---

### TASK-049 — The blocked dirt road, and the grey sheets over the towns (human reports)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/main.js`, `src/landmarks.js`, `src/eastbank.js`, `src/orlearouge.js`, `src/westparish.js`
**Reported:** *"can not go down the road where green Bravado stops at"* and *"the grey area
over Chatboro and Tusouxroe needs to be fixed and removed from sight or at least
transparent enough to see the road and cars"*.

#### 1. The Mission 1 dirt road was closed by a collision circle
`placeGlbLandmark` gave every storefront one blocker of `target * 0.52` — the model's
**width** used as a radius in every direction. The BurgerPiz on the east lot at z 56 is
26 m wide and 15 m deep, so its circle reached 13.5 m south to z 42.5 and sealed the dirt
road at z 43 — **six metres from the nearest wall**. Measured: the building's geometry
spans z 48.4…63.6; nothing was ever in the road.
Collision now follows the footprint: circles the size of the short side, laid along the
long one. Buildings stay as solid as before; the road is clear.

#### 2. The grey over the towns was the asset packs' own scenery
A shop pack is authored as a whole scene — the building plus the pack's ground,
sidewalks, grass, trees and a painted backdrop card, at scene scale. `main.js`'s
`loadFbxScene()` has always culled that (`SITE_CLUTTER`); **`landmarks.js` has its own
`loadFBX()` that culled nothing**, and it is what the districts place. Around Tusouxroe
North that put down, among 283 oversized plates:
- `sidewalk001` — **475 × 324 m**, floating at y 1.7
- `Ground` — 281 × 151 m hanging at **y 17.9**
- `Grass_` 220 × 181, `Trees` 222 × 156, `Asphalt` 219 × 145
- `Background` / `Trees_Background` backdrop cards, 474 × 320 m at y 17.1, one directly
  over Tusouxroe
Fixed in two places: `loadGLB` (main.js) now drops backdrop cards from every pack by mesh
**or material** name, and `landmarks.js`'s `loadFBX` takes a cull, with the four scene
packs (gas station, 6twelve, Tacos, BurgerPiz) passing `SITE_CLUTTER`. Props — the Fence
Pack, the office clutter — deliberately do not, since that list would eat the fences.

#### Testing performed (2026-09-19)
- Route audit over the chase line (highway → dirt road → crash site), 49 samples:
  **nothing blocks the dirt road** (was: two circles, 9 and 3 samples, up to 2.42 m deep).
- Overhead-surface audit: **0 big planes above the towns** (was 11).
- Plates over Tusouxroe North 283 → 249, and every oversized floating one is gone; what
  remains is roads and power cables.
- `prologue.mjs` **pass** (the chase drives that road), `gameplay.mjs` **pass**,
  `gascans.mjs` **5/5**, 0 new console errors — and `gameplay.mjs` again after the water
  change, also clean.
- Before/after photographs in `tools/qa/out/land-*.png`, `fixed-*.png`, `clean-*.png`.

#### Known issues
- Tusouxroe North is still visually rough — it was built by a "manual grid loop" and reads
  as flat grey plates under hard shadows even with the pack scenery gone. That is a
  content problem in the district, not scenery leaking in from the packs.
- Chatboro's grey was a different thing from Tusouxroe's: the **bayou band** (three
  rectangles, x −140…410, z 132…196) at ground level, not pack scenery overhead. Its
  water had `clearcoat: 1` at 0.12 roughness, so it mirrored the whole dusk sky as a flat
  grey sheet. Taking the human's "or at least transparent enough to see the road and
  cars" literally: blurred and dimmed (`clearcoatRoughness` 0.45, `envMapIntensity` 0.35)
  and see-through (`opacity` 0.6), in all three modules that build it. **Superseded by
  TASK-050:** the blurred coat spread the moon into a pale glaze over half the swamp; the
  clearcoat is now gone. **What is still true:** the band itself is three big rectangles
  with a ruler-straight northern edge 20 m from the town. Reshaping that is a design change
  nobody has asked for.

---

> **Task-ID collision, 2026-09-19:** two separate Claude sessions independently
> used TASK-046, TASK-047 and TASK-048 for six unrelated pieces of work,
> landed within the same window and merged together here. Both sets are kept
> below, unrenumbered (consistent with how earlier collisions in this file
> were left for a human pass rather than silently renumbered) — the
> map-editor/white-sheet session's entries first, then the
> restore-the-story/culling/land-format session's entries.

### TASK-048 — $DEVMODE69xxx: searchable library, delete mode, named save slots, AI placement (human request, 2026-09-19)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/mapEditor.js`, `server/index.js`, `server/ai.js` (new)

#### What changed
Four additions to the hidden dev-mode map editor, all opt-in on top of the
existing session:
- **Searchable library.** A search box and category tabs (All / Buildings /
  Infrastructure / Clutter, from a new `category` field on each `CATALOG`
  entry) filter the asset picker grid in place — index-based selection
  (`,`/`.`, click) is unchanged, this only hides non-matching tiles.
- **Delete mode.** A button next to Undo toggles left-click from "place" to
  "remove nearest editor-placed object" (`deleteNear`), by design scoped to
  *this tool's own placements* only (this session or a loaded save) — the
  world's own authored landmarks are untouched, per the human's answer to
  "should this also delete baked-in world buildings?" (no).
- **Named save slots.** "Save As" / a slot dropdown / "Load" / "Delete slot",
  layered on the existing single auto-saved session: `server/index.js` grew
  `/editor/slots` (list), and `slot=` query support on the existing
  `/editor/save` and `/editor/load`, storing each named slot as its own file
  under `server/editor-slots/`. "Load" clears the current session and
  replays the slot, which then becomes what auto-saves.
- **"Ask AI" natural-language placement**, per the human's answer ("use
  OpenRouter with a fallback chain"). New `server/ai.js`: proxies a prompt
  plus grounding context (an anchor point, nearby placements, the exact
  valid `CATALOG` keys) to OpenRouter's chat completions, walking a
  configurable model fallback list (`OPENROUTER_MODELS`, default is a few
  free-tier models) until one returns parseable JSON. Requires
  `OPENROUTER_API_KEY` in the environment or repo-root `.env` (same loader
  `tools/voiceover-gen.mjs` uses) — the human supplied a key, now in the
  local `.env` (gitignored). **Still needs adding to the Render service's
  env vars for the deployed game to have it** — a repo-root `.env` only
  covers local runs of `server/index.js`.

#### Testing performed (2026-09-19, live in a real browser + a real key)
- Server endpoints exercised directly with curl: slot save → list → load →
  delete round-trip — all correct.
- Client UI exercised live against a local instance of `server/index.js`
  (temporarily pointed `window.__MULTIPLAYER_URL` at `ws://localhost:8787`,
  reverted after): search filter, category filter, place → delete-mode
  click → gone, save-as → clear via Undo → load → placements back, delete
  slot → dropdown empties, and the AI box's "no key" failure path — all
  correct, no console errors.
- Once the human supplied a real `OPENROUTER_API_KEY`: the default model
  list's **first two entries 404'd** (OpenRouter's free lineup had already
  moved on) — confirmed live against `/api/v1/models` and replaced with
  currently-valid free ids. A real request ("place a small residential
  cottage right next to the gas station, and a school a bit further down
  the road") then returned sensible, correctly-scaled coordinates from
  `nvidia/nemotron-3-ultra-550b-a55b:free` (the fallback chain's 2nd entry —
  its 1st, deepseek, silently failed and the chain caught it exactly as
  designed). Not re-verified through the actual game UI end-to-end (the
  Chrome extension disconnected between turns) — the server round-trip with
  a real prompt and the client's request/response wiring were each verified
  separately, just not simultaneously in one browser session.

#### Known issues
- The free-tier model list in `server/ai.js` is a snapshot (already had to
  be corrected once during this same task); OpenRouter's free lineup moves
  fast — if every model in the default chain starts failing, check
  `/api/v1/models` for current free ids rather than guessing.
- The AI's spatial reasoning is only as good as the `nearby` context sent
  (12 closest placements within 80 m of the anchor) — it has no map/road
  data, so "near the highway" only works if something is already placed
  near the highway.
- Panel layout is a little tight at the default game window size (the AI
  status line can wrap against the search box); functional, not polished.

---

### TASK-047 — The recurring white/washed-out sheet: found live, root-caused for real this time (human request + screenshots, 2026-09-19)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/fx.js`

#### What was wrong
Third time this class of bug has been reported and root-caused as a
*different* mechanism each time (see TASK history: metalness promotion in
`graphics.js`, un-tagged GLB materials in `landmarks.js`). This time:
`createWetRoads()`'s planar mirror + "wetness" roughness effect
(`src/fx.js`) assumes the camera stays near ground level. The map editor's
free-fly camera (TASK from 2026-09-17) can reach ~340 m at a near-vertical
pitch, and at that height:
1. The mirror's reflected camera ends up ~300+ m **underground** looking up
   at nothing but background sky (its 130 m far plane never reaches real
   geometry) — that flat bright buffer gets composited onto every asphalt
   surface in the world at once via `uReflect`.
2. Independently, the "wetness" effect drives `roughnessFactor` down to
   0.03 unconditionally, every frame — at extreme grazing angles that plus
   the moon's directional light blows out a specular highlight band, a
   second route to the same symptom.

Confirmed live by setting `wetRoads.uniforms.uReflectOn.value = 0` in the
console mid-bug — the sheet vanished immediately over an otherwise correctly
lit and textured world.

#### What changed
Added `MAX_EYE_HEIGHT = 50` in `createWetRoads()`: `mirror()` now bails out
above that height (same as its existing "camera under the road" guard — a
puddle reflection isn't meaningful from a satellite view anyway). Added a
`uWetFade` uniform, computed every frame from camera height
(`1 - smoothstep(eye.y, 50, 130)`), multiplied into both the roughness/puddle
term and the mirror sample — so the whole wet-road look fades smoothly with
height instead of leaving the specular path unguarded.

#### Testing performed (2026-09-19, live in a real browser)
Reproduced by entering `$DEVMODE69xxx` and zooming/pitching the free camera
out — every road painted flat white/gray at once, matching the human's
screenshots exactly. After the fix: `uWetFade`/`uReflectOn` read back `0`
above ~130 m (sheet gone, world underneath renders correctly) and `1`/`1` at
normal gameplay height (15 m — puddle sheen and reflections still visible in
a normal free-roam screenshot). No console errors.

#### Known issues
- **Correction after merging with `origin/main`:** at the time this was
  written, the gas-can HUD text from the human's original screenshot
  ("rob gas cans: 0/4") genuinely didn't exist in this session's checkout
  (`clean.py` had removed it), so the floating gas-station object looked
  like it had to be from a stale deployed build. It wasn't — a concurrent
  session's TASK-046 (below) had it removed *and then restored* on `main`
  in between; this session's local checkout was just behind, not the
  deployed site. Never independently reproduced or fixed here; if the
  floating-object glitch is still visible after this merge, it needs its
  own look with the gas-can/gas-station code actually present.
- A plain light-gray concrete overpass/bridge deck is visible from the map
  editor's aerial view and looks flat/undetailed up close — likely just a
  simple, intentionally low-detail asset, not the same bug; not touched.

---

### TASK-048 — The land in Chatboro and Tusouxroe (human request: "fix the land format")

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/main.js`

#### What was wrong
Four different ground surfaces were all laid at **exactly y = 0.02**: US-167 itself, the
road aprons that link the lots to the shoulder, the junkyard dirt pad, and the trailer
park's gravel at Chatboro. Wherever two of them overlap they fight for the same depth
value, and the land shimmers — worst at Chatboro (the gravel against the highway apron)
and on the strip. An audit on a 10 m grid found stacks separated by **0.0000 m** at four
sample points in Chatboro and three on the strip; Tusouxroe had 4–5 mm stacks between the
truck lot, an apron and Main Street.

#### What changed
One stated ladder, `GROUND_Y` in `main.js`, so every decal has its own height and the next
person adding a pad knows where it goes. Bottom to top: dirt pads 0.012, lots 0.014,
gravel 0.016, aprons 0.018, side streets 0.019 (unchanged), US-167 0.02 (unchanged).
Nothing moved horizontally, no collision changed, no art was redesigned.

#### Testing performed (2026-09-19)
- The overlap audit re-run: **no two surfaces share a depth** in Chatboro, Tusouxroe or
  the strip; the closest pair is now 2 mm apart. No water sits over a road anywhere.
- `gameplay.mjs` **pass** (hp 100 at every step, 0 new console errors), `gascans.mjs` **5/5**.
- Before/after photographs of both towns in `tools/qa/out/land-*.png`.

#### What I did NOT change, and why
Three things about those two towns look wrong to me but are **style, not defect**, and the
human has not asked for them:
1. **The bayou band is three big rectangles** (x −140…410, z 132…196) whose northern edge is
   a ruler-straight line 20 m south of Chatboro. A real shoreline would be irregular.
2. **The swamp water is a mirror** (`clearcoat: 1, clearcoatRoughness: 0.12`) at road level,
   so at dusk it reflects the sky probe as a flat white sheet — it reads as polished
   concrete, not bayou. One value per module would change that.
3. **The land is unlit** outside dusk→night, so ground reads near-black at any hour. That is
   the known missing day cycle, not a Chatboro/Tusouxroe problem.

---

### TASK-047 — Two districts never had a culling pass (human request: "go fix the culling")

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/main.js`, `src/tusouxroeNorth.js`, `src/stateWorld.js`

#### What was wrong
Three separate faults, found by measuring rather than by reading:
1. **`tusouxroeNorth` and `stateWorld` exposed no `update()` at all**, so the composer's
   distance culling never ran for them. East Bank and West Parish had it and were being
   culled; those two drew **8,690 + 3,700 meshes from anywhere on the map, at every
   camera, always**. This was the bulk of it.
2. **The `boundary` predicate was still missing** from the `batchStatic` call
   (`eff285d` deleted the line instead of restoring the `cullGroups` Set a merge had
   dropped), while West Parish and East Bank were *out* of the exclusion list — so their
   scenery was batched into the scene root where their working culling could not hide it.
3. **`...cans` had been dropped from the exclusion list**, so a gas can could be merged
   into a static batch — and a batched can cannot hide itself when you pick it up. It
   would stand there, collected.

#### What changed
- `tusouxroeNorth.js` and `stateWorld.js` expose `update(dt, playerPos)` that drives their
  composers' culling from the camera, exactly as `eastbank.js` does. `stateWorld` builds
  with four composers (one per region), so it drives all four.
- `main.js` calls both every frame, next to the other two districts.
- The districts are excluded from batching again (the `0edb70d` list) and `...cans` is
  back in it. The `boundary` predicate is restored for completeness, but note it is **not
  doing anything for these two districts**: their `props` arrays hold landmark groups,
  not the composer's cluster groups, so nothing matches. See Known issues.

#### Testing performed (2026-09-19)
Scenery-only draw calls, fixed cameras, everything that moves hidden:

| view | as found today | with culling wired |
|---|---|---|
| north crossroads | 19,138 | **11,130** (−42%) |
| Lafourchette | 21,613 | **11,937** (−45%) |
| US-167 strip | 12,667 | **6,756** (−47%) |
| OrleaRouge | 3,599 | **1,695** (−53%) |

- `eastbank.mjs` **9/9**, including the culling assertion (22/28 clusters drawn from the
  strip vs 25/28 in town) and the frame-time check.
- `gascans.mjs` **5/5** — the objective still completes with the cans out of the batcher.
- `gameplay.mjs` — see Testing status.

#### Known issues
- **Still heavy: ~11,000 scenery draw calls standing in Tusouxroe North.** That is now
  density, not a culling failure — 8,690 meshes inside one district, most of them within
  the composer's 300 m draw distance when you are stood in it. The fix is batching *inside*
  the clusters (TASK-045's `boundary`), which needs `tusouxroeNorth` and `stateWorld` to
  expose their composers' cluster groups (`C.props`) the way `eastbank.js` does
  (`get props() { return C.props; }`). Not done: it is a perf change, not a culling fix,
  and the human asked for the culling.

---

### TASK-046 — Restore Keseme's original story and the gas-can objective (human request)

**Status:** `REVIEW` · **Agent:** Claude · **Requested by:** the human, 2026-09-18, twice and emphatically:
*"Keep Keseme's Original Story Script and Plot intact!!!"* and *"We must get the original
story, script and plot for Keseme back!!!! This and also the gas can objective!!!!!!"*
**Files:** `src/main.js`, `src/prologue.js`, `src/actone.js`, `index.html`, `src/stateWorld.js`,
`tools/qa/gascans.mjs` (new)

#### What had happened
Two commits on 2026-09-17 changed Keseme's story after "update 11":
- **`9d1a81b` + `41fc830` — the gas-can objective was deleted.** The cans, the escape
  truck, `CAN_GOAL`, the HUD counter, `settleCans()`, the pickup logic, the waypoint and
  the win condition all came out of `main.js`; the HUD label came out of `index.html`;
  and the two lines that carry the plan between story beats were rewritten to
  "Explore the Bayou." — in the prologue's hand-off *and* at the end of Act One.
- **`208391a` — a new Mission 1, "Transition Day" (`missionClinic.js`), was inserted
  ahead of the prologue**, and story mode was pointed at it instead of `prologue.start()`.
  "Hog Wild" was demoted to MISSION 2 in the card the player sees and in the file header.

#### What was restored
- **The script and the plot, exactly.** `prologue.js`, `actone.js`, `nolantis.js`,
  `welcomeback.js`, `bluelight.js` and `alternateCampaign.js` are now **byte-for-byte
  identical to `0edb70d` ("update 11")** — verified with `git diff`. "Hog Wild" is
  MISSION 1 again, in the card and the header.
- **The opening.** Story mode calls `prologue.start()` again. `missionClinic.js` is left
  on disk untouched but is not created, not built and not started, so nothing of that
  work is lost and re-wiring it is a five-line change (`main.js` says exactly where).
- **The gas-can objective, whole.** The cans and their glow columns, the escape truck and
  its marker light, `CAN_GOAL`, `settleCans()`, the pickup rules (2.4 m on foot, 3.4 m in
  a car), the HUD counter and label, the minimap waypoint that switches to the truck on
  the fourth can, the win condition, and both story hand-off lines.
- **Kept, deliberately:** Keseme's real female voice id in `voiceCast.js`
  (`208391a`, human-provided). That is a voice for lines she already had, not the script
  or the plot — the original held a `TODO_…PASTE_FISH_AUDIO_REFERENCE_ID` placeholder and
  she was reading in the male voice she used to share with Peta. **Say the word and it
  goes back too.**

#### Testing performed (2026-09-18)
- `tools/qa/prologue.mjs` **pass** — the run opens on the PROLOGUE (radio dial cold open),
  HUD reads "Steal a ride. Scrounge 4 gas cans. Get to the truck and get out of Dixie
  Beaux.", and every beat plays through to "ACT ONE — Welcome Home". 0 new console errors.
- `tools/qa/actone.mjs` **pass** — all beats, ending on Solange and the southern coordinates.
- `tools/qa/controls.mjs` **32/32**, including the seven gas-can checks that had been dead
  since the removal: all five cans reachable and clear of collision, reach 2.4 m / 3.4 m,
  every can has its glow column. (`__game.cans` had to be put back on the debug surface —
  the tests were still in the file and crashing on `cans is not iterable`.)
- `tools/qa/gascans.mjs` (new) **5/5** — the objective end to end: four cans and a truck
  with the plan on the HUD, walking over a can counts it, the objective still names the
  plan part-way, at 4/4 it points at the truck, and reaching the truck wins the run.
- `tools/qa/gameplay.mjs` **pass** — hp 100 at every step, 0 hostile, no new console errors.

#### Known issues
- **Separate and serious, found while verifying this (not touched, awaiting a decision):
  distance culling is defeated across the whole state map.** `eff285d` ("Fix live crash:
  cullGroups was never defined") deleted the `boundary:` line from the `batchStatic` call
  instead of restoring the `cullGroups` Set that a merge had dropped — but the districts
  stayed *out* of the `moving` exclusion list. So their scenery is batched into the scene
  root, where the composer's cluster culling can no longer hide it. Scenery-only draw
  calls, same fixed cameras as TASK-045, everything that moves hidden:
  north crossroads **268 → 19,138**, Lafourchette **919 → 21,613**, the strip
  **907 → 12,667**, OrleaRouge **890 → 3,599**; scene meshes 3,903 → 18,362. Part of that
  is the world getting denser since, but the shape of it is the missing boundary. The fix
  is to put the `cullGroups` Set back and restore the one line.
- Not mine, but loud: the dev-mode map editor (`94f8ee6`) fetches
  `https://grand-theft-bayou.onrender.com/editor/load` on a loop and it is blocked by
  CORS — **326 failed requests in one Act One run**. It does not affect the story.
- `controls.mjs` went 22 → 32 tests with the cans back; the ten gas-can assertions had
  been silently skipped, not deleted.

---

### TASK-045 — Batch by material signature, and stop excluding half the world (TASK-011)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/merge.js`, `src/main.js` (the exclusion list)

#### What was wrong
Two things, and the second was the expensive one.
1. `batchStatic` grouped by material **instance** (`m.uuid`), so 406 static materials
   that were only ~150 distinct set-ups split batches that could have been one.
2. **Every world district was excluded from batching outright.** `main.js` put
   `westParish.props`, `eastBank.props`, `tusouxroeNorth.props` and `stateWorld.props`
   into the `moving` set — and those arrays hold *every composer cluster*, i.e. all
   the scenery those modules build. One view of the US-167 strip drew 162 separate
   `iron rail` meshes for that reason. The exclusion was not paranoia: a cluster hides
   itself by going invisible, and `batchStatic` used to lift merged geometry out into
   the scene root, where it would have kept drawing after its cluster was hidden.

#### What changed
- **Material signature.** Batches now key on what the renderer actually uses — type,
  colour, emissive, roughness/metalness, opacity/blending/side/flags, every map with
  its repeat and offset, and the identity of any `onBeforeCompile` — and all the
  meshes in a batch share the one material instance.
- **Batch boundaries.** `batchStatic(scene, { boundary })` takes a predicate marking
  objects that own their contents. A mesh is merged into its nearest boundary
  ancestor (baked into that object's space) instead of the scene root; with no
  boundary above it, it merges at the scene root exactly as before. `main.js` passes
  the districts' culling groups as boundaries, so a cluster still hides its
  batch with itself — and the districts come out of the exclusion list.
- Story props (`prologue`, `blueLight`, `nolantis`, `welcomeBack`, `alternate`) stay
  excluded: those get shown and hidden individually.

#### Testing performed (2026-09-16)
Scenery-only draw calls — NPCs, traffic and vehicles hidden, fixed cameras, noon —
so the two builds are comparable:

| view | before | after |
|---|---|---|
| north crossroads (Tusouxroe) | 497 | **268** (−47%) |
| Lafourchette | 1,584 | **919** (−42%) |
| the US-167 strip | 1,772 | **907** (−49%) |
| OrleaRouge | 1,054 | **890** (−16%) |

Scene meshes 5,916 → 3,903; batches 519 → 726.
(An intermediate version that merged strictly between siblings made OrleaRouge
*worse* — 1,054 → 1,231 — because its props nest inside groups and used to merge
across them at the scene root. That is what the boundary predicate is for.)

- **Culling still holds:** `eastbank.mjs` **9/9**, including "fewer clusters drawn
  from the strip than in Lafourchette" (22/28 vs 25/28) — a cluster still hides its
  batch with itself — and the frame-time check (16.6 vs 16.5 ms avg).
- **Nothing looks different:** the three fixed strip cameras in `controls.mjs`
  (`tools/qa/out/ctl-strip-1..3.png`) match the shots taken before the change,
  building for building, sign for sign, lamp for lamp; only cars and pedestrians
  have moved.
- `controls.mjs` **32/32**, `gameplay.mjs` **pass** (hp 100 at every step,
  0 non-404 console errors), and the five unit tests still pass.

#### Known issues
- Materials that are identical at boot now **share one instance**. Anything that
  later mutates a batched material's colour or emissive would change every mesh that
  matched it. Nothing in the game does today (the mutated materials — cruiser
  beacons, wet asphalt, story props — are all excluded from batching), but it is the
  trade the signature makes.
- Unbatched still: NPC bodies (they move), the pine cones and lamp posts that are
  not siblings inside one cluster, and everything a set piece owns.

---

### TASK-046 — Pedestrian bark lines: bump commentary + fight taunts (human request, 2026-09-19)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/pedestrianChatter.js` (new), `src/main.js`

#### What changed
New content module `src/pedestrianChatter.js`: three line buckets per civilian
type (`bump`, `fightBack`, `flee`) for all nine speaking NPC types
(redneck/hoodrat/hobo/prostitute/dockworker/mechanic/suit/tourist/thug) plus a
non-verbal set for hogs (`*SQUEAL*` etc.), exporting `bumpLine(type, label)`
and `fightLine(type, label, mood)`.

Wired into `main.js`:
- `onFootUpdate()` gained `checkPedestrianBump()`, called while the player is
  moving on foot: any calm (not hostile/fleeing/in a vehicle) NPC within
  `BUMP_R` (1.15) gets nudged aside and `flashObjective()` shows a bump line.
  A 2.2s global cooldown (`bumpCd`) keeps it to one bark at a time instead of
  a crowd shouting in unison.
- `fire()`'s existing `npcs.provoke(best)` call site (covers both the bat and
  every gun, since melee routes through the same function) now shows a
  `fightLine()` the first time a calm NPC gets hurt — `freshFight` guards
  against re-barking on every subsequent hit of an already-hostile/fleeing
  NPC. Which bucket (`fightBack` vs `flee`) plays is decided by `e.mood`
  (npc.js `temperament()`), matching what `npc.js decide()` will actually do
  a moment later.
- Roadkill (`drivingUpdate()`'s `npcs.provoke(e)` for cars hitting people)
  was deliberately left alone — multiple NPCs can be hit in one frame at
  speed, and stacking chat lines there is churn, not flavor.

#### Testing performed (2026-09-19)
- `node --check` on both files.
- Booted the actual game (`node serve.mjs 8899`) in Chrome and confirmed no
  import/module errors (`GLTFLoader` texture warning present is pre-existing
  and unrelated).
- Could **not** get a live visual bump/fight playtest: the automated Chrome
  tab never received OS focus in this environment (`document.hidden` stayed
  `true`, `requestAnimationFrame` never fired — confirmed with a 3s rAF
  counter that stayed at 0), so the game's own tick loop never advanced no
  matter what input was sent. This is an automation-environment limitation,
  not a code issue.
- Instead verified the content module directly: dynamically `import()`ed
  `pedestrianChatter.js` in the page console and called `bumpLine`/`fightLine`
  for every type — all returned well-formed `"LABEL: line"` strings with no
  throws.

#### Known issues
- **Not yet playtested for real** (see above) — a human should confirm the
  bump nudge/cooldown feels right and the fight line doesn't overlap
  awkwardly with the `"${label} down."` kill-count flash on a one-shot kill.
- Bump detection loops `enemies` (up to `ENEMY_CAP` = 48) once per on-foot
  frame while moving; trivial at this count, but if the pedestrian pool grows
  a lot this is the place to add a spatial cutoff.

---

### TASK-047 — Real voices for pedestrian barks (human request, 2026-09-19, follow-up to TASK-046)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/voiceCast.js`, `src/pedestrianChatter.js`, `src/cinema.js`,
`src/main.js`, `tools/pedestrian-voiceover-gen.mjs` (new),
`assets/audio/voice/` (239 new mp3s + manifest.json), `docs/VOICE_GENERATION.md`

#### What changed
The human supplied 9 Fish Audio voice links (4 female, 5 male) for the
TASK-046 pedestrian barks. Researched each one on fish.audio (name,
description, tags) before assigning anything — two were literally named
"redneck"/"Halpin (Redneck)", three were "slut"-variants clearly meant for
Prostitute, and one of the human's "male" links ("Rednex") is tagged **Female**
by Fish Audio itself; flagged that to the human and they said keep it anyway.
Asked the human how to spread 9 voices over 9 archetypes (only Prostitute is
guaranteed female in-game; hoodrat/hobo/thug spawn either sex at random —
characters.js `randomHoodrat`/`randomHobo`; redneck/dockworker/mechanic/suit/
tourist are fixed 2D sprites) — they picked gender-aware pooling over a naive
1:1 mapping.

- `voiceCast.js`: 12 new `VOICE_CAST` entries (`REDNECK`, `DOCKWORKER`,
  `MECHANIC`, `SUIT`, `TOURIST`, `PROSTITUTE` — one voice each — plus
  `HOODRAT_M/_F`, `HOBO_M/_F`, `THUG_M/_F`) and `pedestrianVoiceWho(type,
  female)`, which returns the right key (or `null` for hogs — non-verbal).
- `pedestrianChatter.js`: `bumpLine()`/`fightLine()` now return `{ text,
  display }` instead of a bare string (`text` for the voice lookup, `display`
  for `flashObjective()`) — **breaking change from TASK-046**, main.js
  updated. Added `allVoiceLines()`, the single source of truth the generator
  reads from (239 lines: every archetype × bucket, ×2 for the gendered ones).
- `cinema.js`: exposed `playVoiceLine` on the returned API (was internal-only,
  used by `say()`) so main.js can play a bark's audio without opening a full
  cutscene/subtitle.
- `main.js`: new `speakPedestrian(e, line)` helper — flashes `line.display`
  and, if `pedestrianVoiceWho` returns a key, calls `cine.playVoiceLine`. Both
  TASK-046 call sites (`checkPedestrianBump`, the `fire()` fresh-fight hook)
  now go through it.
- `tools/pedestrian-voiceover-gen.mjs`: sibling to `tools/voiceover-gen.mjs`,
  same Fish Audio synth/cache/manifest logic, but reads lines from
  `allVoiceLines()` instead of regex-scanning `c.say()` calls — pedestrian
  barks are data, not scripted dialogue. Writes into the *same*
  `assets/audio/voice/manifest.json`; `cinema.js` doesn't care which
  generator produced an entry. Documented in `docs/VOICE_GENERATION.md`.

#### Testing performed (2026-09-19)
- `node --check` on every touched/new file.
- `--dry-run` confirmed all 239 lines resolve to the right voice key before
  spending any API calls.
- Ran the real generator. **Gotcha hit twice:** the script only
  `writeFileSync`s `manifest.json` once, at the very end of the whole run —
  individual mp3s are written per-line immediately, but the manifest update
  lives in memory until then. Two of my `run_in_background` invocations died
  silently partway through (no error, no stack trace — first one exited 0
  because I'd piped through `tee`, which masked node's real status; even with
  that fixed, the second still died with exit 1 and no diagnostic, likely an
  environment-imposed time limit on backgrounded shells here, not a script
  bug) — so 199 of 239 mp3s existed on disk but `manifest.json` only had the
  24 from the very first small test run. Fix: reran the generator plain (no
  `--force`) — it treats "the mp3 already exists on disk" as the cache check,
  independent of manifest.json, so it found all 199 orphaned files for free
  and just rebuilt the manifest; only the missing 40 (Thug's two voices) had
  to actually regenerate, done in two small foreground `--character=`
  batches that each finished cleanly. **If this happens again:** don't
  re-run with `--force` (that would burn API calls regenerating files that
  already exist) — just re-run plain; it's idempotent by file presence, and
  prefer smaller `--character=`-scoped batches or a longer explicit
  `timeout` over one big backgrounded all-in-one run.
- Verified: `--dry-run` now reports `Cached: 239, Generated: 0` (every
  archetype's manifest key count matches `allVoiceLines()`'s expected count
  exactly), no zero-byte mp3s, `git status` shows exactly 239 new mp3s + the
  manifest diff.
- **Not playtested live in-browser** — same Chrome-automation tab-focus
  limitation noted in TASK-046 (rAF never fires because `document.hidden`
  stays true in this environment). Content/pipeline verified structurally;
  actually *hearing* a bark in the running game still wants a human pass.

#### Known issues
- Same open item as TASK-046: a human should playtest bump/fight barks in a
  real browser, this time also listening for volume balance against
  `sfx()`/music and whether `playVoiceLine`'s `stopVoice()` ever clips a bark
  short in practice.
- Voice-to-archetype assignment (see table in `docs/VOICE_GENERATION.md`'s
  new section, or `voiceCast.js`'s comments) is a judgment call the human
  made from tag/description research, not from actually listening to the
  clones — if any archetype's voice sounds wrong once heard in-game, the fix
  is a one-line `referenceId` swap in `voiceCast.js` plus `node
  tools/pedestrian-voiceover-gen.mjs --force --character=THAT_KEY`.

---

### TASK-044 — The wet-road mirror stops redrawing the whole world (TASK-012)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/fx.js`, `src/traffic.js` (2 lines, the car light sprites), `tools/qa/mirror.mjs` (new)

#### What was wrong
`createWetRoads` rendered the **entire scene** a second time from under the road,
every other frame on HIGH. Measured at night on the strip, sitting in a car:
**1,734 draw calls for the mirror pass** against 1,906 for the frame it belonged
to — a mirror frame cost 3,683 calls, nearly double a plain one.

#### What changed
- **The mirror got its own render layer** (`MIRROR_LAYER = 1`, exported from `fx.js`
  with a `reflect(obj)` helper). `vcam.layers.set(MIRROR_LAYER)` renders that layer
  *only*, and the things a wet road actually shows are tagged into it: lamp beams and
  halos, lamp lenses, the player's headlight beams / lens / tail glows, and every
  traffic car's head and tail light sprites. Enabling the layer does not take an
  object out of the main pass.
- Lit geometry is deliberately **not** reflected: everything on the layer is emissive
  or a sprite, so the mirror pass needs no lights at all. Buildings no longer appear
  in the reflection; lamps, headlights and tail lights do.
- The lamp's ground *pool* is not reflected — it lies flat on the road, so reflecting
  it would paint a second pool in the same place.

#### Testing performed (2026-09-16, headless, night, in a car on the US-167 strip)
| | before | after |
|---|---|---|
| mirror pass | 1,734 calls | **202** |
| worst frame (main + mirror) | 3,683 | **2,204** |
| frame time at that spot | 29.4 ms | 25.3 ms |
- `tools/qa/mirror.mjs` (new) **3/3**, and it keeps a before/after pair of night
  screenshots (`tools/qa/out/mirror-*.png`) — lamp pools, headlight throw and tail
  lights still read on the wet road.
- `traffic_test.mjs` **11/11** (traffic.js now imports `fx.js`), plus the free-roam
  and district regressions in Testing status.

#### Known issues / what remains
- **TASK-012's acceptance number (driving peak < 1,200) is not met, and not by this.**
  The main pass alone is ~1,950–2,000 at that spot. When the brief was written the
  driving peak was ~1,850 *including* the mirror; the state-wide expansion has since
  roughly doubled what is on screen. A frustum tally of that view: 178 static batches,
  162 `iron rail` meshes, 151 planes, 94 cones, and ~176 meshes of NPC bodies
  (`skin` / `leather` / `lycra` / `cloth`). Cutting that is **TASK-011** (batch by
  material signature) plus some form of NPC LOD — not the mirror.
- Worth recording: **on foot the camera is pitched ~41° down, in a car ~22°**, so the
  old "500–780 on foot vs 1,850 driving" gap is partly the camera looking at the
  ground rather than down the road. Same spot, same fov, same far plane: 171 objects
  in frustum on foot, 1,519 in the car.

---

### TASK-043 — Nose-first into a wall no longer spins the car 90° (found by running controls.mjs)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/vehicles.js`, `tools/qa/controls.mjs`

#### What was wrong
`tools/qa/controls.mjs` failed "after a head-on crash, S backs straight out": the car
backed out 0.1 m in 1.2 s. It was not stuck. Sampling the car through the crash showed
the real thing: **it had turned 90°.** `collisionResponse` swings the nose to follow
the slide along a surface (`DRIVE.wallAlign`), which is right for a scrape — but a wall
built of blocker circles always gives a little sideways slide even head-on, so holding
W into a flat wall walked the nose round until the car sat parallel to it. S then
reversed *sideways*, and a player who crashed nose-first ended up facing down the wall.

#### What changed
- `src/vehicles.js`: the nose only follows the slide when the slide is a real part of
  the motion — `slide > Math.abs(v.speed) * 0.35` as well as the existing `slide > 0.3`.
  A glancing hit still slides and aligns; a head-on hit stops facing the wall.
- Measured after the fix: the car stops at z 332.75 still facing the wall (heading π,
  speed 0), and S backs it straight out to z 361 in 1.2 s — 28 m, no sideways drift.
- `tools/qa/controls.mjs` also had **two stale checks** of its own, both from the
  starter-loadout change (TASK-036): the attack test swung the **baseball bat** (2.2 m)
  from a 1.8 m stand-off at a wandering NPC and never connected, and it never set
  `window.__qaAim`, so on foot `fire()` refused with "Hold Right Click to aim!". It now
  steps into reach and aims. The hog census asserted every live hog's *current* cell is
  `forest`; a hog potters within 14 m of where it was born, which can cross into a
  neighbouring zone rectangle, so it now checks where each hog was **born**.

#### Testing performed (2026-09-16)
- `tools/qa/controls.mjs` **32/32** (was 30/32).
- The crash probe above, and the driving regressions in Testing status.

#### Known issues
- The 0.35 threshold is a number picked to separate "scrape" from "head-on"; it reads
  right in the two crash tests and in the probe, but nobody has felt it on a pad
  (TASK-010).

---

### TASK-042 — Wire the police module in: a Sheriff you can get away from (TASK-020 integration)

**Status:** `REVIEW` · **Agent:** Claude
**Files:** `src/main.js` (wiring + the chase), `src/police.js`, `tools/qa/police.mjs` (new), `tools/qa/police_test.mjs`

#### What was wrong
`src/police.js` (TASK-020) was finished, listed in the review queue as "11/11 tests
pass" — and **imported by nothing**. The live Sheriff was still `main.js`'s inline
code, with exactly the two faults the human reported. `tools/qa/police_test.mjs`
crashed on the module's real signature, so the 11/11 could never have been true of
this pair; nobody had run it since.

#### What changed
- **The cruiser is a cruiser.** `sheriffProto` was `pickup.clone(true)` painted white
  with one flat blue box on the roof — the same pickup that drives past in traffic.
  It is now `buildCruiserModel(pickup)`: two-tone livery, door panels, push bar with
  chrome uprights, and a roof lightbar whose red and blue beacons alternate (two
  uniform writes on shared materials — no new lights, which would recompile every shader).
- **`buildCruiserModel` now fits whatever shell it is handed.** Its offsets were
  constants from another model's scale, and it measured the clone *without resetting
  the source's transform* — main.js hands it the same pickup it parked as a wreck at
  (−15, −34), so every detail was built around a point 15 m off the car. Sized from
  the model's own bounding box now, measured at the origin.
- **You can lose them.** Cruisers drove at the player's live position, always, and
  `state.wanted` was floored at 1 star for the rest of the run — structurally no chase
  could ever end except by wrecking every cruiser. Now `main.js` asks `police.js`:
  a cruiser sees you within **62 m** with line of sight through the buildings the
  camera already treats as occluders (**14 m** is point blank, walls or not, tested
  5× a second). Out of sight for the **5 s** give-up window, the heat drains at
  1.5/s, wanted reaches **0**, "You lost them." flashes, the beacons go dark, and the
  cruisers are retired once they are 70 m away — off screen. A fresh crime starts a
  new chase.
- **Cornered is an arrest, not a shredder.** On-foot contact was `hitPlayer(dt * 14)`
  — a full bar in about 7 s with no way to break contact. It is **5 HP/s** now: ~20 s
  of contact to die, and `bustCd > 3 s` busts you first, which is the mechanic the
  game already had.
- A cruiser that has lost you **cruises at 12 m/s** while searching instead of
  flooring it at 22; the player's car tops out at 30 (`DRIVE.maxForward`), so driving
  well is now the way out.
- `police.js` also gained `pursuitTarget()`, `timeSinceSeen()`, `hasGivenUp()`,
  `clearPursuit()`, and its foot cops now die properly (hp ≤ 0 counts, the body leaves
  the scene and the list after its loot drops).

#### Testing performed (2026-09-16)
- `tools/qa/police.mjs` (new, in-game) **8/8**: cruisers turn out at 3 stars; the
  lightbar carries red/blue beacons; they alternate; on-foot contact costs ~5 HP/s
  and does not end the run; out of sight the pursuit gives up; wanted returns to 0
  **without wrecking a cruiser**; the cruisers stand down and leave; a new crime
  starts a new chase. Daylight close-ups of the cruiser checked by eye
  (`tools/qa/out/cruiser-*.png`).
- `tools/qa/police_test.mjs` **11/11** — it now calls `updateFootCops(dt, env)` as the
  module defines it.
- Regressions: see Testing status.

#### Known issues / what remains
- **On-foot deputies are still not spawned.** `police.js` can build and drive them
  (`spawnFootCop` / `updateFootCops`), and the unit test covers them, but nothing in
  the game calls them yet: they need a spawn rule (wanted level, on foot, near a
  stopped cruiser), a damage path from `fire()`, and a place in the NPC cap before
  they are turned on. That is the rest of TASK-020.
- The numbers above are headless-verified but **not felt on a real GPU** (TASK-010).
  Whether 62 m / 5 s / 5 HP/s is *fun* is a playtest question, not a test question.

---

### TASK-043 — Player/NPC character revamp: lose the "Roblox" look, GTA III/SA-style fidelity (human request, 2026-09-17)

**Status:** `READY` · **Agent:** `Antigravity`
**Files / subsystem:** `src/characters.js` (the shared `Hoodrat` rig — every
player, NPC, redneck and cop uses it), `src/playerCharacters.js` (per-character
model wiring only — not the `campaign`/stat fields, those are settled).
**Not** `src/weapons_3d.js`, `src/greedoCampaign.js`, `src/main.js`'s `fire()` —
animation work is TASK-044 (Freebuff), sequenced separately.

**Context:** The human's words: *"the player sprites look like they're from
Roblox or something like that. Terrible... [want] something like the ones
from Grand Theft Auto 3 or San Andreas."* Root cause, verified by reading
`characters.js`: every humanoid in the game — player, hoodrat, redneck,
deputy, every named story character — is one procedural rig (`Hoodrat` class)
built entirely from primitive `BoxGeometry`/`CylinderGeometry`/`SphereGeometry`
pieces (a box torso, cylinder limbs, etc.). The file's own header says it was
built "to the GTA San Andreas-style reference sheets," but boxes-and-cylinders
construction is exactly what reads as blocky/Roblox in practice, whatever the
intent was. This is a fidelity/execution problem, not a wrong reference.

**Also found while investigating (same root cause, worth folding in):**
`playerCharacters.js`'s `makePeta` calls `makeCastMember(makeHoodrat, "keseme",
...)` — **"Peta" currently has no model of his own; he's visually just
Keseme's character relabeled.** Confirm and fix if it's still true when you
pick this up.

**Already done (2026-09-17, Claude, same request):** Chimi was a custom
`BulbasaurActor` (a green creature) from an earlier, now-reverted decision.
Swapped to a normal `makeHoodrat()` call — Caucasian male, the game's
existing `REDNECK_SKIN` palette — in `playerCharacters.js`. That part doesn't
need redoing; it's the *quality* of the underlying rig everyone (including
Chimi now) renders through that's the actual ask.

**Assets available** (same libraries as TASK-041 — check licenses):
`Z:\GITHUB\_ASSETS\3D\Characters-Animations\` (`KayKit_Character_Animations_1.1.zip`,
`Animations_V1_01.zip`); `Z:\GITHUB\bayou\assets\Hoodrathavoc.zip` is
**blocked** — `.dff`/`.txd` RenderWare format, no Three.js loader, already
flagged in TASK-038, don't re-spend time on it. `Trailer_Park.rar` characters
are already partially used (see `docs/WORLD_BUILDING.md`'s asset table).

**Goal — your judgement call on approach, either is acceptable:**
1. **Refine the primitive rig itself**: better proportions (less boxy torso/
   limbs, smoother joints, GTA SA's slightly stylized-but-human silhouette)
   while keeping the procedural, seed-driven, palette-swappable system that
   makes crew variety/NPC population cheap. Lowest risk, keeps every existing
   caller (NPCs, cops, all 5 playable characters, cutscene actors) working
   unchanged.
2. **Swap to real character models** for the 5 playable characters
   specifically (higher fidelity, closer to actual PS2-era GTA), sourced from
   the asset libraries above, while leaving NPCs on the existing procedural
   rig (a visible player/NPC quality gap is normal in GTA-likes).
Whichever you pick, fix Peta's missing model as part of the same pass.

**Acceptance criteria:**
- Screenshot comparison, before/after, of at least 2 playable characters and
  1 generic NPC, at a normal gameplay camera distance.
- Peta has his own distinct look, not Keseme's.
- No regression to the `play()`/`update()`/`setFlip()`/`material.opacity`
  surface `npc.js`/`main.js` depend on (`Hoodrat` is a drop-in
  `AnimatedSprite` replacement today — don't break that contract for NPCs).
- `tools/qa/worldpass.mjs`, `tools/qa/gameplay.mjs`, `tools/qa/factions.mjs`
  regressions still pass.
- Draw calls don't regress past the existing on-foot budget (measure before/
  after, same convention as prior visual passes).
- No new console errors.

**Out of scope:** attack/fire animations (TASK-044, Freebuff — don't touch
the `anim === "attack"` block's *logic*, only its geometry/proportions if
your approach changes the rig's bone/pivot structure enough to require it;
coordinate with Freebuff if so, since TASK-044 is about to extend that same
block).

**Integration notes (for Claude):** None expected if this stays inside
`characters.js`/`playerCharacters.js`'s existing exports. Flag here if a
real-model swap needs new loader plumbing in `main.js`.

**Notes:** —

---

### TASK-044 — Weapon-specific attack animations: bat swing, one-handed fire, two-handed fire (human request, 2026-09-17)

**Status:** `READY` (sequence after TASK-043 lands, or in parallel if you
coordinate on `characters.js`'s attack block — see below) · **Agent:** `Freebuff`
**Files / subsystem:** `src/characters.js` (the `anim === "attack"` block),
`src/weapons_3d.js` (`playFireAnim3D`), `src/weapons.js` (add a grip-type
field), `src/main.js`'s `fire()` (propose the anim-selection change; Claude
applies since it's a `main.js` edit).

**Context:** The human's words: *"the attack animations for the baseball bat
and the firing of two-handed weapons like shotguns, rifles, the one-handed
guns like pistols, Uzis — we need to have that down."* Verified: right now
there is exactly **one** attack animation for everything. `main.js`'s
`fire()` (~line 2437) always calls `player.play("attack", { fps: 12, loop:
false, force: true })` and `playFireAnim3D(gun.melee)`, whatever weapon is
equipped. `characters.js`'s `attack` state (~line 717) is a generic
"alternating straight punches" boxing animation — the bat swing, the pistol
shot and the shotgun blast all look identical. `weapons_3d.js`'s
`playFireAnim3D(isMelee)` only takes a boolean, so it already can't
distinguish one-handed from two-handed either.

**Grip-type data doesn't exist yet.** `weapons.js`'s `WEAPONS` table has
`melee: true` on `bat` only; there's no `twoHanded`/`grip` field to key
animations off. Add one (e.g. `grip: "melee" | "one" | "two"` — `bat`: melee,
`pistol`/`tec9`: one, `sawnoff`/`deerRifle`: two) and route both the body
animation and the view-model recoil off it.

**Goal:**
1. Three distinct body-animation states in `characters.js` (replacing the
   one-size-fits-all `attack`): a bat swing (a real arced swing, not punches),
   a one-handed fire/recoil pose (pistol/Tec-9 — one arm extended, light
   snap-back), a two-handed fire/recoil pose (shotgun/rifle — both arms
   raised, braced stance, heavier kick). Reuse the existing pivot/elbow rig
   `A.forEach(...)` already exposes — this is new pose math, not a new
   skeleton.
2. `weapons_3d.js`'s `playFireAnim3D` takes the grip type instead of a melee
   boolean, and gives the view-model itself a matching, distinct recoil per
   grip (a two-handed weapon should kick differently than a one-handed one).
3. `main.js`'s `fire()` picks the right anim name/grip from the equipped
   weapon's new field — this is the one `main.js` touch, small and additive,
   propose it and hand off to Claude.

**Acceptance criteria:**
- Visibly distinct animations for bat / pistol-or-Tec-9 / shotgun-or-rifle,
  both on the character body and the view-model, screenshot or clip proof.
- `tools/qa/weapons_test.mjs` still passes; extend it (or add a new test) to
  assert the right anim/grip is selected per weapon id.
- `tools/qa/audio_weapons_test.mjs`'s existing 33 asserts still pass (it
  covers `updateWeapon3D`/`playFireAnim3D` directly — check the signature
  change doesn't break its calls).
- No regression to melee combat feel or fire timing/cooldowns (`gun.cooldown`
  is unrelated to animation length — don't couple them).
- No new console errors.

**Out of scope:** the character rig's underlying geometry/proportions
(TASK-043, Antigravity) — this task is new pose math on the existing rig,
not a remodel. If TASK-043 changes the pivot structure enough to break your
pose math, coordinate rather than both editing `characters.js`'s attack
block blind.

**Integration notes (for Claude):** The `fire()` anim-selection change and
the `WEAPONS` grip-type field addition are both small and additive — review
as such. Document the final `grip` values and `playFireAnim3D`'s new
signature in `AGENT_LOG.md` → Interface contracts.

**Notes:** —

---

### TASK-040 — Wire the car audio + 3D weapons commit into the game (message 8 follow-up)

**Status:** `REVIEW` (implemented, headless-tested by Freebuff, wiring reviewed and one bug fixed by Claude; real-browser audio check pending, TASK-010) · **Agent:** Freebuff (build), Claude (review)
**Files:** `src/audio.js`, `src/weapons_3d.js` (both rewritten in place), `src/main.js` (additive wiring only — Claude-owned), `src/vehicles.js` (one field, see below), `tools/qa/audio_weapons_test.mjs` (new, 33/33), local three stub extended (untracked, see AGENT_LOG)

#### What changed
`main.js` already carried partial wiring from the merge commits (createCarAudio at
registration, updateWeapon3D + playFireAnim3D call sites, the vehicle-target
branch in fire()), but every hook was still dead or broken. Fixed in three layers:

- **`src/audio.js` — lazy, gesture-safe car audio.** `registerVehicle` runs at
  boot, before any user gesture and before `initAudio()`, so the old eager
  `createCarAudio` returned `undefined` for every vehicle (dead code forever)
  and would have leaked `AudioListener`s into every traffic car. Now
  `createCarAudio` always returns a usable object whose real WebAudio nodes
  build only when the car is first driven (`update(..., active=true)`);
  `active=false` (traffic/parked) builds and plays nothing, deactivating tears
  down, and `destroy()` is idempotent (explodeCar path). Added `resumeAudio()`
  for the browser's suspended-context rule. Engine loop randomized 0–4 per car,
  squeal loop gated by `isSkidding`, pitch/volume scaled by speed.
- **`src/weapons_3d.js` — the ids the game actually uses.** The old smg /
  shotgun / rifle map never matched `state.weapon`, so every gun rendered as
  the boxy pistol proxy. Now every arsenal id builds: `bat`, `pistol`, `tec9`,
  `sawnoff`, `deerRifle` (procedural proxies; unknown ids fall back to the
  pistol). The gangster rifle glTF (Antigravity's TASK-038 handoff) replaces
  the deerRifle proxy when it loads — its scale is now measured from the
  model's bounding box (raw bbox 0.70 × 3.79 × 14.33, normalized to 0.85 m;
  the old hard-coded 0.05 was luck) and centred on the grip point. `encoding`
  → `colorSpace = SRGBColorSpace` (three r152+ API; game is r160), and loaded
  materials are flagged `userData.gtbRealized` so the realize pass leaves them
  alone. `initWeapons3D` is idempotent and the pivot starts hidden.
- **`src/main.js` — the five wiring hooks:**
  1. `initAudio(camera)` right after `soundtrackReady` (the listener must
     exist before any car audio can build).
  2. `resumeAudio()` in `confirmCharacter` before `beginGame()` (first user
     gesture; without it the context stays suspended and nothing plays).
  3. `updateWeapon3D(...)` moved from `onFootUpdate` to the main tick next to
     `camCtl.update`, gated `hidden = state.cinematic || !!state.veh` — it
     previously only ran on foot, so entering a car froze the last pose in the
     world; the gate also stops the view-model drawing over the dash.
  4. `fire()`'s `bestKind === "vehicle"` branch calls
     `damageVehicle(best, gun.damage * 1.5)` — shooting a car does something.
  5. `drivingUpdate` reads the impact magnitude `collisionResponse` now
     reports (replacing the `v.lastImpact` dead code): `src/vehicles.js` sets
     `v.impact = -into` (m/s into the obstacle) on the **first frame** of a
     contact only, > 6 m/s so scrapes never count; `v.impact * 1.5` becomes hp
     damage and hp ≤ 0 explodes as before. `registerVehicle` inits `impact: 0`.

#### Testing performed
- `tools/qa/audio_weapons_test.mjs` (new) **33/33**: every arsenal id builds
  and attaches, unknown ids fall back, holstered pose, the driving/cinematic
  hide gate, null-pos safety, 40-frame melee swing and gun recoil stay finite,
  createCarAudio-before-initAudio is a usable no-op, listener attach,
  resumeAudio flips the context to running, active-only build + teardown +
  rebuild + destroy idempotence, traffic cars never build audio, and the
  vehicles.js impact contract (first frame only, scrapes excluded, normal
  driving untouched).
- `node --check` clean on audio.js, weapons_3d.js, main.js, vehicles.js.
- Regressions: `traffic_test` 11/11 (×4 runs; one earlier failure was machine
  load, consistent with the board's existing flake note), `factions_test`,
  `weapons_test`, `pausemenu_test` all pass. `police_test` still crashes in
  `src/police.js` (undefined `targetPos.x` at line 140) — pre-existing, also
  fails on a clean tree, already reported on this board.
- **Known pre-existing failure, not mine:** `tools/qa/dressing_test.mjs`
  asserts `makeDecorativeFence` produces piers/blockers synchronously, but
  `src/landmarks.js` (from the TASK-038 commit cab6579) returns an empty group
  and attaches FBX pieces asynchronously, placing no blockers. No loader
  behaviour can satisfy the test as written — needs Antigravity (files locked
  under TASK-038). It also exposed that the QA `FBXLoader` stub had gone
  missing from the local node_modules (untracked); restored, see AGENT_LOG.
- Headless Node cannot play audio — the real ear test (engine loop, squeal,
  startup) is a TASK-010 item on a real browser.

#### Integration notes (for Claude)
All `main.js` hooks are already in place in this branch (listed above, 1–5);
review them as additive wiring. `src/vehicles.js` adds one field write:
`v.impact = -into` inside the existing `if (-into > 6)` first-frame branch of
`collisionResponse`, plus `impact: 0` in `registerVehicle`. Interface
contract recorded in AGENT_LOG → Interface contracts.

#### Claude's review (2026-09-17)
- Verified independently: `node --check` clean on all four touched files, own
  run of `audio_weapons_test.mjs` 33/33, `traffic_test`/`factions_test`/
  `weapons_test`/`pausemenu_test` all pass, and confirmed `police_test` /
  `dressing_test` fail identically on a clean tree (unrelated files, not
  touched by this diff) — both pre-existing, as claimed.
- **Bug found and fixed:** `simulate(dt)`'s car-audio block only ever called
  `.update()` on `state.veh` — every exit path (`enterExitVehicle()` and ~8
  other `state.veh = null` sites) never told the car it was leaving that it
  was no longer active, so its engine/squeal loop kept playing forever after
  the player got out (`createCarAudio`'s own `active=false` teardown path was
  correct in isolation, and the unit test covers it directly, but nothing in
  `main.js` ever called it on exit — a gap the unit test's `// player got out`
  line papered over by calling `audio.update(0, false, false)` by hand instead
  of exercising the real integration). Fixed with a one-variable tracker
  (`lastVehAudio`) in `simulate(dt)`: when `state.veh` is falsy but the
  previous frame had a car, that car's audio gets `.update(0, false, false)`
  once. Re-verified: `audio_weapons_test.mjs` 33/33 and all regressions still
  pass after the fix.

#### Known issues
- The rifle's barrel orientation after the bounding-box fit is a best guess
  (`rotation.y = π`); check the view-model in a real browser and nudge.
- `engine_start_up_01.wav` exists in assets but is not wired yet (candidate
  for an ignition stinger on enter).
- `prostitute_test.mjs` is a Playwright harness module (default-exported), not
  standalone-runnable — needs the patchright runner, not `node <file>`.

---

### TASK-039 — Traffic circuits + the sky-sign fix (message 7)

**Status:** `REVIEW` · **Agent:** Freebuff
**Files:** `src/traffic.js`, `src/main.js`, `tools/qa/traffic_test.mjs`, `src/stateWorld.js` + `src/tusouxroeNorth.js` (cross-agent bug fix, see AGENT_LOG)

#### What changed
- **Cars no longer vanish at lane ends** (the human's report). A traffic car
  used to `park()` — teleport to (1e5, 1e5) and go invisible — the moment it
  ran off the end of its lane polyline, and despawned at 155 m while the fog
  hides things out to ~240 m, so cars visibly popped out of existence.
  Now: every direction pair is a **mutual circuit** (`lane.next`, auto-paired
  in `main.js` over US-167's lanes plus every region's lanes — return
  carriageways preferred, one-way loops as fallback); a car that reaches its
  lane end **hands over to the return lane** when beyond `WRAP_HIDE` = 165 m
  (in the mist), or **pulls up and waits** when in view (reads as a car paused
  at the junction, not a glitch). `DESPAWN` is 235 m — past the fog edge, so a
  despawn is never on screen.
- **The sky signs fixed** (the human's screenshot). `makePopeyes`,
  `makeGasStation` and `makePizzeria` each cloned a sign and parented the clone
  to the *original* (`board.add(board.clone())`); the clone kept the parent's
  world position as a **local** offset, so the back-face copy rendered at
  double height and double offset — a fleet of Popeyes / GAS·N·GEAUX / 6twelve
  signs hanging at 30–38 m. All four back-faces now sit at (0, 0, −0.02) in
  their parent's space: readable from behind, no z-fighting.
- **Cross-agent fix:** `stateWorld.js` and `tusouxroeNorth.js` passed an
  options object `{ points: [...] }` to `composer.road()`, which wants the
  points array directly — every composer road in both districts was building
  zero geometry (and "Red Dust Pass" was a diagonal, which the composer
  rejects). All five calls fixed; the diagonal split into two legs.
- **Withdrew** my own north-shore district module: the other agent wired
  `tusouxroeNorth.js` + `stateWorld.js` over the same northern band while I
  was building. No territory conflict kept.

#### Testing performed
- `tools/qa/traffic_test.mjs` **11/11** (twice): pool build-up, spawn on both
  lanes, lane-end handover beyond the mist, no vanish, handover lands in-lane,
  visible-end car waits in place (1.0 m from the end), 230 m car still
  simulated (no on-screen despawn). Headless Node + the project three stub
  (extended additively: `Scene`, `Sprite(SMaterial)`, `MathUtils.damp`,
  `Vector2.distanceTo`).
- `node --check` clean on traffic.js, main.js, stateWorld.js,
  tusouxroeNorth.js, spawnzones.js, npc.js.
- Regressions: `factions_test` (31/31), `weapons_test`, `pausemenu_test`,
  `dressing_test` all pass. `police_test` fails in `police.js` — pre-existing
  (also fails with my changes stashed), reported in AGENT_LOG.

#### Known issues
- Wrapped cars keep their cruise speed through the U-turn (it happens at
  165+ m, in mist — invisible). If a region ever gets a lit junction at a lane
  end, give that lane a real loop polyline instead.
- ~~`stateWorld.js` builds manual `PlaneGeometry` roads alongside the composer
  roads; with the fix the two overlap on the same lines.~~ **Resolved by Claude,
  2026-09-16 — see TASK-041.** The composer owns every road surface now.

---

### TASK-034 — World cleanup + expansion pass (message 6)

**Status:** `REVIEW` · **Agent:** Claude · **Order worked:** stability → clean world → loot → map expansion → system foundations

**Files:** `src/main.js` (wiring), `src/loot.js`, `src/weapons.js`, `src/worldtime.js`, `src/weather.js`, `src/composer.js`, `src/eastbank.js`, `tools/qa/worldpass.mjs`, `tools/qa/eastbank.mjs`, `tools/qa/controls.mjs` (gas-can checks)

#### Completed (tested headless)
- **The buggy's black flicker: fixed, not removed.** All the Designersoup cars (Beatall "the buggy", Landyroamer, docLorean, Toyoyo, Tristar) share one 256×256 palette-swatch texture. `realize()` gave it mipmaps, so neighbouring swatches (several near-black) bled across the paint as distance changed, and it derived normal / ORM maps from the swatch edges, which glittered under the clearcoat. `loadDsCar` now keeps nearest filtering with no mipmaps and skips derived maps (`noDerive`, `keepPixelFilter`, metalness 0.3, roughness 0.38). Verified with a speckle metric on parked close-ups (Beatall 37 → 26, Landyroamer 29 → 20 with black pixels 42% → 20%, docLorean 38 → 30; Kenney cars unchanged) and an 8-frame driven contact strip (`tools/qa/out/flicker-strip.png`).
- **Popeyes: exactly two landmarks** in `POPEYES_LOCATIONS`: #1 on the US-167 strip (z 84), #2 on the OrleaRouge boulevard (18, 230), 146 m apart. The strip's other former Popeyes lot (z −34) is a storefront. Screenshot checked.
- **NPC loot** (`src/loot.js`): hoodrats 80% cash / 16% weapon, rednecks 70% / 24%, hogs nothing. Cash comes as $5 / $10 / $20 / $50 notes; weapons roll a rarity (common 65 / uncommon 27 / rare 8). Drops are physical, pooled pickups (max 24, 90 s), collected by walking over them or rolling over slowly; cash goes into the existing `state.cash` and HUD.
- **Weapons** (`src/weapons.js`): one slot on `state.weapon` / `state.ammo`, no parallel inventory. The 9mm keeps the old numbers; the Tec-9 (common), sawed-off (uncommon) and deer rifle (rare) set `fire()`'s damage, range and cooldown. An empty gun falls back to the 9mm. HUD line under the compass.
- **World time** (`src/worldtime.js`): `getCurrentTime()`, `isNight()`, `dusk`, `onHour`, `setTime`. Replaces the `state.dusk += dt·0.0016` ramp at the same pace (18:30 → full night at 22:00 in about 10 minutes).
- **Weather** (`src/weather.js`): `clear / cloudy / rain / storm / fog` profiles blended into fog, mist, light, wetness, grip and wind multipliers. Fog, mist and light are applied today; the default is clear, so nothing looks different yet.
- **Map expansion: Lafourchette** (`src/eastbank.js`, laid out by `src/composer.js`). `MAP.maxX` 136 → 380. South Tusouxroe's street continues as Lafourche Road: 14 storefronts; Levee Street, Pelican Street, Boudin Row and Cane Street with 54 shotgun houses; the water tower lot, a parking lot, the Saturday market, a ball field, the bayou band carried east, 1,115 pines on what was left, and St. Jude of the Levee closing the view. It has culling clusters, spawn zones, minimap shapes and two traffic lanes.
- **Gas cans easier to get to** (the human's report). The Popeyes → storefront swap had buried the can at (11, −42) inside the new building's collision; it now sits at (3, −50). Pickup is measured flat, 2.4 m on foot and 3.4 m in a car (it was 1.5 m in 3D against a bobbing can). `settleCans()` moves any can found inside collision at load, and each can has a glow column.
- **Churches** (`src/church.js`): `Buildings.glb` part 9, used as both the Bayou Noir church and the first St. Jude, is an apartment block with shops. `makeChurch()` builds a white clapboard church: nave, shingle roof, steeple and cross over red doors, steps, windows down both sides. St. Jude of the Levee has stained glass; Bayou Noir Baptist has plain lit windows. Both screenshot-checked, and walking into Bayou Noir's front stops at the steps.
- **Men's eyes** (`src/characters.js`): every man's hair, bandana, do-rag or crop was a full sphere centred near eye height, which buried the eyes. They are now crown caps (`capGeo`) following the skull down to a rim just above the eyebrows, with brow bands on the rim, as on the reference sheet.

#### Future
- Rain and storm particles, thunder, wet-road reflections, `weather.grip` in vehicle handling, and a weather schedule.
- A full day cycle (sunrise, daylight): `worldTime` already runs 24 hours, but the renderer only lights dusk → night.
- NPC schedules and shop hours that read `worldTime`.
- A weapon model in the player's hand, reloading, ammo pickups; a weapon wheel if more slots are wanted.
- Lafourchette: parked cars in the lot, story use, a bridge or ferry over the bayou band. Reuse `composer.js` for the next district.
- `TownTiles_003.glb` (a 2 m tile kit) is still unused.

#### Testing performed
- `tools/qa/worldpass.mjs` 7/7, `tools/qa/eastbank.mjs` 9/9, the flicker probe before and after (parked and driven), `tools/qa/controls.mjs` (see Testing Status).

#### Known issues
- The real-browser feel is still unverified (TASK-010).

### TASK-033 — Core gameplay rework: orientation, controls, camera, vehicles, NPCs, spawning

**Status:** `REVIEW`. All 10 phases are implemented and headless-tested. Still
pending: the human's own playtest of the controls and camera feel on a real
GPU, which TASK-010 covers.
**Agent:** `Claude`
**Source:** the human's spec (`message (5).txt`) plus a playtest report: *"once
you exit the vehicle the controls are backwards … all the cars are driving
backwards"*.

**Files / subsystem (lock released; changes to these go through review against
`docs/ARCHITECTURE.md`):**
- New: `src/world.js` (directions, headings), `src/input.js` (actions),
  `src/vehicles.js` (vehicle definitions, model-forward normalization, seats),
  `src/debug.js` (orientation overlay), `src/spawnzones.js` (zones, population mix)
- `src/main.js`, `src/camera.js`, `src/npc.js`, `src/traffic.js`

**Root causes (audit, 2026-09-13):**
1. **Walking inverts at ±90° camera yaw.** `onFootUpdate` rotates WASD by
   −yaw, but the camera looks along (−sin yaw, −cos yaw). The error is 2×yaw:
   none facing north/south, 180° facing east/west. Getting into a car swings
   the camera behind it, so any car pointing east or west leaves the camera at
   ±90° when you get out.
2. **Cars drive backwards or sideways.** Driving, traffic and the headlight
   sprites all treat local +z as the nose. Checked in a model-orientation
   screenshot probe:
   - `Car_1_R/B`, `Van_1`, `Pick_Up_1` face −z (backwards);
   - `Beatall`, `Landyroamer`, `docLorean` face −x (sideways).
   - Neither loader corrects this.
3. **NPCs hostile without cause.** "Hothead", "territorial" and "lookout"
   temperaments attack just for being near the player, and brave or hothead
   NPCs join fights near gunfire.
4. **Hogs everywhere.** One third of a 40-NPC cap, spawned 10–30 m either
   side of the highway, whatever the surroundings.
5. **Popeyes everywhere.** 10 of 15 strip lots. `Car_1_Y`,
   `Tristar Racer` and `Toyoyo Highlight` are never loaded.
6. **Input read raw.** Key codes are checked directly in three update
   functions and three separate keydown listeners.

**Phases:**
1. Audit ✔
2. World orientation (`world.js`)
3. Input + walking
4. Camera (config, recentring on foot)
5. Vehicles (definitions, normalization, seats)
6. NPCs (calm by default)
7. Spawning (zones, hog biomes, Popeyes density, building variety)
8. World expansion (a curving highway, rural outskirts, forest)
9. Debug overlay, HUD direction
10. Docs

After each phase: run the game and its QA scripts.

**Progress (2026-09-13):**
- **Phases 1–7, 9 and 10 done and headless-tested.**
  - New modules: `src/world.js`, `src/input.js`, `src/vehicles.js`,
    `src/debug.js` (F4 overlay + HUD compass), `src/spawnzones.js`.
  - Changed: `camera.js` (rewritten around `CAMERA_CONFIG`), `npc.js`
    (aggression 0), `traffic.js` (NPC driver seat), `main.js` (31 anchored
    edits via `.claude/wire/core-wire.mjs`).
  - Docs: `docs/ARCHITECTURE.md`.
- **Strip:** 2 Popeyes (was 10); 5 `Buildings.glb` storefronts, a second gas
  station, 6twelve and Tacos.
- **Cars:** `Car_1_Y`, `Tristar Racer` and `Toyoyo Highlight` are now loaded
  and in traffic.
- **`tools/qa/controls.mjs`: 22 / 22 pass.**
  - On foot: W walks where the camera looks at all four angles, including after
    leaving an east-facing car. S, A, D, the diagonal, stopping, and turning the
    camera alone all behave.
  - Vehicles: facing north, W drives north even with the camera turned east;
    W+D turns it to face east; facing east, W drives east and S reverses.
  - Model screenshots: all 10 models point their nose along their heading.
  - NPCs: a civilian next to you stays idle; shot, it flees.
  - Hogs:
    - 0 hog spawns out of 587 city picks;
    - of 557 picks around the strip, the 52 hogs all landed in forest;
    - live census: 1 hog, in the woods.
- **Regressions pass:** gameplay (0 hostile, hp 100 at the end), prologue,
  Act One, Blue Light Special, OrleaRouge, potholes. Only the known
  `playlist.json` 404.
- **Draw calls (headless HIGH):** spawn on foot 428–504 (was ~503); driving
  953–1,361 (was ~1,300–1,410).
- **Phase 8 (world expansion): done and headless-tested.** `src/westparish.js`
  (new); `.claude/wire/westparish-wire.mjs` made 17 anchored edits to
  `main.js`.
  - **Map:** `MAP.minX` moved from −136 to −440. The ground plane is widened,
    and every x clamp uses `MAP`.
  - **Parish Highway 9:** a four-lane highway, 747 m long.
    - It leaves US-167 at z ≈ 8, curves south-west through the forest, runs a
      long straight, turns south, and enters OrleaRouge at street 330.
    - Lane markings, guardrails with blockers on the curves, sodium lights,
      green signs and a billboard.
    - Traffic lanes both ways; the traffic pool is now 16 cars.
  - **Bayou Noir:**
    - a dirt road;
    - a general store and church from `Buildings.glb`;
    - shacks, a barn, a water tower;
    - three fenced sugar-cane fields.
  - **Rest stop** with the gas-station asset.
  - **Forest:** 843 pines in chunked instanced meshes, plus swamp water.
  - **Spawning:** new `rural` zone; the highway corridor is a no-spawn zone.
    Spawns go around the player when they're far from US-167. Town and city
    zones stop at the old west edge.
  - **Bug found and fixed:** `orlea.inCity()` and the city entry V.O. only
    checked z, so they would have claimed the whole parish south-west. Now they
    check x too.
  - **Distance culling:** the hamlet, the rest stop and each forest chunk hide
    past 300 m (the fog hides them past ~260 m anyway). Driving draw calls in
    `gameplay.mjs` went 1,905 → 1,254.
  - **`tools/qa/westparish.mjs`: 8 / 8 pass.**
    - No static blockers on the carriageway.
    - Zones correct, old map unchanged, `inCity` excludes the parish.
    - Four drives along the route stay aligned (1.0) at about 19 m/s.
    - 16 traffic cars on both Hwy 9 lanes.
    - Bayou Noir: 12 calm locals, hogs only in the forest.
    - Draw calls 132–527.
- **Not testable headless:** how the mouse camera and recentring *feel*, on a
  real GPU (TASK-010).
- **Gas cans fixed (the human's report: "the gas can by Popeye's").**
  - The Popeyes can at `landmarkPos(1, -40)` = (18, −40) sat 0.5 m from the
    Popeyes wall blocker (r 2.6), so it could never be picked up.
  - The "Tony's Pizza lot" can at (−30, 50) had ended up inside the storefront
    that replaced that lot (r 5).
  - Both now sit out front: (11, −42) by the Popeyes car park, and (−16, 41).
  - New test 36 in `tools/qa/controls.mjs`: no can may overlap a static
    blocker, and each must be picked up by walking in. All 5 pass, and the
    script now passes **27 / 27**.
- **Crash handling fixed (the human's report: "after crashing into objects the
  controls act sluggish and out of control").**
  - **Cause:** `drivingUpdate` did `if (bumped) v.speed *= 0.45` on every
    frame of contact. Holding W or W+D against something pinned the car at
    0.3–0.5 m/s, and steering authority scales with speed, so you couldn't turn
    out either.
  - **Fix:** `collisionResponse()` in `src/vehicles.js`.
    - Only the motion pointing into the obstacle is removed; the rest becomes a
      slide along it (scrape friction 0.6/s), and the nose swings round to
      follow.
    - A speed loss and a jolt apply only on the first frame of a hit, scaled by
      how head-on it was.
    - `stepArcadeVehicle` keeps 30% steering at a standstill while on the
      throttle.
  - **Tests:** new section 37 in `controls.mjs`, **30 / 30 pass**:
    - scraping a wall at 11° keeps the car moving (37.6 m, 19.9 m/s at the end);
    - head-on, then S backs out 10.8 m;
    - head-on, then W+D turns 2.3 rad and drives off at 13.6 m/s.
  - **Probes:**
    - ramming a stopped traffic car head-on, W+D is back up to 12–17 m/s
      within about 1 s (twice);
    - ramming a parked car, W+D escapes.
  - **Regressions:** gameplay, prologue and `westparish.mjs` 8 / 8.
    `westparish.mjs` now clears nearby traffic before its drives, lets the view
    settle, and logs frame times.
- **Not fixed; for TASK-010 on a real GPU:** a 2.7 s frame stall the first time
  the OrleaRouge end of Hwy 9 comes into view (headless). It looks like shader
  compilation. The game loop caps dt at 0.1 s, so a stall like this freezes
  movement instead of teleporting the car.
- **GTA-style radar (minimap) added.** `src/minimap.js` (new), wired into
  `main.js` via `.claude/wire/minimap-wire.mjs`.
  - Waypoint getters added to `prologue.js`, `actone.js` and `bluelight.js`.
  - `orlea.grid` and `westParish.dirtSamples` / `water` are exposed for the
    base map.
  - The F4 debug panel moved above the radar.
  - **`tools/qa/minimap.mjs`: 8 / 8** (twice):
    - builds and draws;
    - N at the top facing north, at the left facing east;
    - arrow 0° after walking forward, −90° after the camera turns right;
    - blips for 5 cans plus the truck;
    - Blue Light's waypoint pins to the rim;
    - zoom 1.7 → 1.0 px/m at 23 m/s.
  - Screenshots checked: Chatboro, the strip, Hwy 9, OrleaRouge's grid.
  - **Regressions:** Blue Light Special and gameplay pass.
- **Crash steering tuned.** A controls run failed "head-on, then W+D": the car
  turned 1.44 rad and moved 0.5 m. Now steering keeps 60% authority while
  touching something, and the nose follows the slide from 0.3 m/s (was 1).
  In the next run, W+D breaks free in both parallel runs (moved 8.7–9.3 m,
  12 m/s).
  - The scrape test once ended slow; the frame trace showed street 330's cross
    traffic hitting the car mid-run. The crash tests now clear traffic within
    80 m, settle after teleporting, and log `worstFrameMs`.
  - **Final `controls.mjs`, run alone: 30 / 30.**
    - scrape 40.3 m, 18.5 m/s;
    - head-on, then S: 11.7 m;
    - head-on, then W+D: 11.6 m at 13 m/s.
  - One earlier 10 / 30 run was machine load, not a regression; see the
    AGENT_LOG warning.
- **Car-jacking added.** `src/hijack.js` (new) plus
  `traffic.releaseVehicle(v)`, wired via `.claude/wire/hijack-wire.mjs`.
  - **How it plays:** F at a car someone's driving walks Keseme to the driver's
    door and pulls the driver out.
    - The driver flees or fights, depending on temperament.
    - Then Keseme takes the seat.
    - It adds 0.4 heat, and a car above 8 m/s can't be jacked.
  - **Seats:** marked "player" / null. Empty cars are entered straight away.
  - **`tools/qa/hijack.mjs`: 9 / 9.**
    - It's a real jack, not an instant teleport in.
    - The car stays put during the jack (0.37 m).
    - The driver is pulled out and reacts: a timid one ran 9.5–11.7 m, a brave
      one came back hostile.
    - The jacked car drives.
    - Getting out empties the seat, and getting back in is instant.
    - "Too fast to jack" at 18.7 m/s.
  - Screenshots checked: driver pulled out at the left door; the jack line on
    screen afterwards.
  - Regressions: controls 30 / 30, gameplay passes.

**Acceptance criteria:** section 42 of the spec. Tests from sections 30–35 go
in `tools/qa/controls.mjs`:
- W walks toward where the camera looks at yaw 0 / 90 / 180 / 270°;
- a car facing north still drives north with the camera turned east;
- each vehicle's nose matches its heading;
- civilians ignore you until attacked;
- no hogs downtown or on the highway;
- visible building variety.

---

### TASK-031 — Grow the map south: the causeway and OrleaRouge

**Status:** `REVIEW` (headless: region test + all regressions pass; real-browser drive pending)
**Agent:** `Claude`
**Files / subsystem:**
- `src/main.js` (`MAP` bounds, ground, highway, clamps, region integration)
- `src/npc.js` (bounds object), `src/traffic.js` (spawning on any lane, `maxCars`)
- `src/orlearouge.js` (new), `tools/qa/orlearouge.mjs` (new)

**Dependencies:** human decision made (grow south). Supersedes TASK-016's placement question.

**Plan:**
1. `MAP` bounds replace the ±WORLD square; highway, ground and clamps extended to z = 382.
2. `src/orlearouge.js`: the causeway (open water, overpass with a camp beneath,
   refinery flare), then the city on a street grid: the French District
   (balconied low-rises, jazz / daiquiri neon), downtown towers, a riverfront
   casino boat, a cemetery, a construction site, street lights.
3. Integration: city NPC hangouts and spawn mix (no hogs downtown), traffic
   lanes on city streets, the entry V.O. ("OrleaRouge teaches you two things…").
4. Headless test: teleport south, screenshots, traffic + NPC behaviour, draw
   calls on foot and driving, no console errors; the gameplay / prologue /
   Act One regressions still pass.

**Acceptance criteria:**
- You can drive from Chatboro down the causeway into OrleaRouge and walk its streets.
- Traffic runs on the boulevard and at least two cross streets; NPCs populate
  the city without converging on the player.
- On-foot draw calls in the city stay within ~1.5× the strip's (headless HIGH).
- No regressions in the existing QA scripts.

**Notes:**
- Step 1 done: `MAP` replaces ±WORLD for z; ground, highway, lane markings,
  traffic lanes and all z clamps run to 382; NPC bounds take the `MAP` object;
  no pines south of z = 142. `traffic.js` spawns from the nearest point on any
  lane, and `maxCars` caps the pool. Syntax-checked.
- Step 2 written: `src/orlearouge.js`. Causeway (swamp water, guardrails,
  overpass camp, refinery flares), street grid (avenues x = −86 / −46 / 34 / 74 /
  114, streets z = 210…370), French District rowhouses with balconies and neon,
  downtown towers, hospital, cemetery, construction site, riverboat casino, lamps,
  the entry V.O., NPC hangouts, four cross-street lanes.
- Step 3 applying now (`.claude/wire/orlea-wire.mjs`): build + hangouts, traffic
  lanes with a 12-car pool, traffic cars as each other's obstacles, a city
  spawn mix (no hogs, no causeway spawns), `__game.teleport` for QA.
- First `tools/qa/orlearouge.mjs` run: the region builds and plays. Entry V.O.
  fires; city NPCs are people only (5–18 near each stop, all calm); traffic is
  active on all four cross-street lanes plus the boulevard; **on-foot draw calls
  in the city are 263–500** (inside the budget); HP 100; no new console errors.
  Screenshots show the causeway, overpass camp and skyline, French District
  balconies, downtown towers reflected in wet streets, and the riverfront promenade.
- Found and fixed: the camera looked down through the overpass deck (grey
  screen). Occluder boxes were added to `camera.js`. The test also drove south
  in the northbound lane and jammed against oncoming traffic; that was a test
  error, since fixed.
- Second `orlearouge.mjs` run **passes**: drove from the causeway (z 146) into
  the city (z 267) in the southbound lane, the entry V.O. played, and the overpass
  camp shot shows the camera pulled in beneath the deck. Draw calls: on foot in
  the city 232–426, driving in the city 262, causeway looking at the skyline 981.
  HP 100; traffic on all six lanes; no new console errors.
- Not yet shown: city bystanders reacting to gunfire (no NPC was within the
  26 m noise radius when the test fired).
- Regressions re-run after the map growth: **gameplay, prologue and Act One all
  pass** (free roam calm and stable with a 12-car pool; prologue hands off to
  Act One; Act One's 12 steps complete). Only the known playlist 404.
- **Status → REVIEW.** Still to do: a real-browser drive through the causeway
  and the city (TASK-010), and a check that city bystanders react to gunfire.

### TASK-009 — Act One "Welcome Home" (Tusouxroe)

**Status:** `REVIEW` (headless walkthrough passes; regression re-runs and a real-browser play-through pending)
**Agent:** `Claude`
**Files / subsystem:**
- `src/actone.js`, `src/ledgerboard.js` (new)
- `src/cinema.js` (scene queue fix)
- `src/prologue.js` (the `onFinished` hook)
- `src/main.js` (integration)
- `tools/qa/actone.mjs`

**Dependencies:** TASK-008 (in review)

**Acceptance criteria:**
- The prologue ending starts Act One; Free roam does not.
- Headless `tools/qa/actone.mjs` reaches `done`: radio gag → establishing
  scene → door → kitchen (Emiko) → ledger board (12 cards, strings, stamp) →
  back on the street.
- Screenshots show the neighbourhood, the kitchen and the board correctly.
- No new console errors; `tools/qa/gameplay.mjs` and `tools/qa/prologue.mjs`
  still pass.

**Notes:**
- First walkthrough stalled in the prologue: two cutscenes ran at once and the
  first one's cleanup broke the second (Esc stopped working). `cinema.js` now
  queues scenes. The test was rewritten to poll for phases.
- Second walkthrough **reached `done`**: all 12 steps in order, HP 100, no new
  console errors. Its screenshots showed three bugs, now fixed:
  kitchen actors snapped to street level (`baseY` in `characters.js`);
  ledger-board cards stacked at the origin (SVG / CSS transform clash in
  `ledgerboard.js`); the crews shot missed both crews, the letterbox covered the
  board, and the post-scene camera sat above the roof (`actone.js`, plus
  `setCameraYaw` in `main.js`).
- Third walkthrough **passes**: all 12 steps. Screenshots confirm both crews in
  the establishing shot, Keseme and Emiko in the kitchen at floor height, all 12
  ledger cards with strings (Pelican Crown highlighted, Nolantis linked), and
  the camera facing the house afterwards. HP 100; the only console error is the
  known playlist 404 from the stale dev server.
- Pending: re-run `prologue.mjs` + `gameplay.mjs` after the `cinema.js` queue and
  `characters.js` `baseY` changes, then TASK-010 in a real browser.
- The kitchen is a sealed room under the neighbourhood at y = −40 (see
  AGENT_LOG decisions).

---

# 📋 TASK QUEUE

## READY

### TASK-010 — Real-browser playtest pass
**Status:** `IN PROGRESS` · **Agent:** `Claude` (driving the human's real Chrome through the Claude in Chrome extension)
**Progress (2026-09-13, after commit a021b3f):**
- Reloaded the extension's tab. The game **fully loads in real Chrome while the
  tab is hidden** ("ready.", Free roam enabled), so the `paint()` timer
  fallback works.
- **Still blocked:** `document.visibilityState` is "hidden", and
  `requestAnimationFrame` fired 1 frame in 2 s, so the game loop doesn't run.
  Resizing the window didn't help. Needs the human to bring the Chrome window
  holding the "Grand Theft Bayou" tab to the foreground (not minimized, not
  covered).
- Not yet done (all need the visible tab):
  - fps and draw calls on a real GPU;
  - pointer lock / Esc;
  - camera and recentring feel;
  - crash handling feel;
  - the Hwy 9 → OrleaRouge first-view stall;
  - soundtrack.
**Earlier progress (2026-09-13):**
- Chrome: 1920×1080 at DPR 1; the game auto-picked HIGH.
- First load **never booted**: it sat on "loading assets…" for 90+ s with no
  error. One CDN module import stalled; a clean reload fetched all 24 three.js
  modules (HTTP 200) and boot started. Transient, but a single stalled import
  freezes the game with no message.
- Second load **stalled at "batching the parish…"**. The automation tab is
  *hidden* (`visibilityState: hidden`, rAF never fires), and boot's `paint()`
  waited on rAF. Fixed: `paint()` now falls back to a 100 ms timer, so loading
  finishes in a background tab.
- **Blocked on the human:** the tab must be visible (foreground) to measure
  real frame rate and run the playtest; the render loop is rAF-driven.
**Files / subsystem:** none (read-only); results go to `AGENT_LOG.md` → Test results, and any bugs become new BACKLOG tasks.
**Dependencies:** none for free roam; TASK-009 for the Act One part.
**Context:** Everything so far was verified in headless Chromium (SwiftShader),
which can't test pointer-lock release, audio, or real frame rate.
**Acceptance criteria:**
- Esc releases the mouse; clicking recaptures it; wheel zoom works; the camera
  pulls in past buildings at low angles; mouse sensitivity feels right (note values).
- F3 numbers at HIGH and 4K ULTRA on foot and driving (fps, frame ms, draw calls).
- The prologue chase driven by hand: the Bravado is catchable but not trivial,
  the dirt-road turn works, losing it resets.
- Synthesized SFX are audible (shotgun, siren, ring, squeal); the soundtrack
  plays and **N** skips tracks.
- Act One plays through, and the ledger board is readable at the tested window size.
**Out of scope:** changing code.

### TASK-011 — Batch static meshes by material signature
**Status:** `REVIEW` · **Agent:** `Claude` (done 2026-09-16, see TASK-045)
**Files / subsystem:** `src/merge.js`
**Dependencies:** none
**Context:** `batchStatic` groups by material *instance*. 406 static
materials are only 152 distinct setups (same maps / color / flags), so identical
materials still split batches. See AGENT_LOG → Performance investigations.
**Goal:** Treat materials with identical settings as one when grouping, sharing a
single material instance per batch.
**Acceptance criteria:**
- Headless HIGH free roam (F3 / `__game.perf.calls`) shows fewer draw calls on
  foot than now (500–780). Record before/after with the same camera position.
- No visible change: compare screenshots from `tools/qa/gameplay.mjs`.
- Wet-road asphalt (`userData.surfaceKind === "asphalt"`) and ShaderMaterials
  stay excluded; no new console errors.
**Out of scope:** `src/main.js` (tell Claude if a hook is needed).
**Integration notes (for Claude):** —

### TASK-012 — Cut draw calls while driving
**Status:** `REVIEW` — the mirror half is done (Claude, 2026-09-16, see TASK-044).
The main pass is what is left, and it belongs to TASK-011.
**Agent:** `Claude`
**Files / subsystem:** `src/fx.js` (road-mirror pass), `src/traffic.js` (traffic car cost)
**Dependencies:** none. **Conflicts with TASK-014 (`traffic.js`); don't run both at once.**
**Context:** Driving peaks around 1,850 draw calls headless vs. 500–780 on foot.
The mirror pass re-renders the scene every 2nd frame on HIGH; each traffic car
carries 4 sprites plus its meshes.
**Goal:** Bring the driving peak down without losing the wet-road reflections.
**Acceptance criteria:**
- Headless HIGH driving peak < 1,200 draw calls (measure with
  `tools/qa/gameplay.mjs` → `driving.perf.calls`).
- Reflections of lamps and headlights are still visible in puddles (screenshot).
- Traffic behaviour is unchanged (lanes, spacing, recycling); no new console errors.
**Ideas:** restrict the mirror camera to a render layer or a shorter far plane
for small props; skip tiny meshes in the mirror; share or cull traffic sprites by distance.
**Out of scope:** `src/main.js`, tier definitions in `src/graphics.js`.

### TASK-018 — Character viewer: expose the story options
**Status:** `REVIEW` · **Agent:** `Freebuff`
**Files / subsystem:** `tools/characters.html`
**Dependencies:** none
**Context:** `makeHoodrat` gained `skin / top / denim / hair / headwear
(band|none|hat) / beard / curly` and palette-object crews (AGENT_LOG →
Interface contracts). The viewer only knows red/blue crews.
**Acceptance criteria:** controls for those options, plus presets for the cast
(Keseme, Mally, Bubba, Mercer, deputy, Emiko: see the `CAST` values in
`src/prologue.js` and `populate()` in `src/actone.js`); the page loads with no
console errors.
**Notes:**
- `tools/characters.html` rebuilt around three modes: the four-figure crew
  roster (as before), a cast preset per story character, and a draft driven by
  the controls. Any control edit leaves the preset.
- Controls: sex, headwear (band / none / hat), beard, curly toggles; skin /
  top / denim / hair swatches; crew selector (red / blue / custom) with cloth /
  chain / shoe / hat / legging swatches for the custom palette; seed field +
  reroll; height override.
- Cast presets: Keseme, Mally, Bubba, Mercer, deputy, Emiko, plus Solange and
  Amara (the brief predates them). Palette sources snapshotted at build:
  `CAST` in `src/prologue.js`, `populate()` in `src/actone.js` (Emiko),
  `src/bluelight.js` (Solange), `src/nolantis.js` (Amara). The deputy's seed
  follows prologue's `who.length * 911` rule ("deputy2" → 6377).
- **Maintenance caveat:** the palettes are hand-mirrored snapshots, not live
  imports. If a `CAST` entry or `CREWS` / `SKIN_TONES` / `DENIM` changes in
  `src/`, update the viewer's block to match (see AGENT_LOG).
- Testing (static — no local headless browser available, and the project
  carries no npm dependencies): the inline module passes `node --check`; an
  audit script compared every preset's options and the tone palettes against
  the game sources — 8 presets, all keys equal. Not yet verified in a real
  browser: load, rendering, console output. Serve with `node serve.mjs` and
  open /tools/characters.html (file:// won't resolve the import map).

### TASK-035 — Redneck vs Hoodrat territorial warfare

**Status:** `REVIEW` (reviewed + integrated by Claude, headless-tested; the real-browser clip is still pending, TASK-010) · **Agent:** `Antigravity` (build), `Claude` (review, integration)
**Files / subsystem:**
- `src/factions.js` (new)
- `src/spawnzones.js` (edit — add territory/border zone tagging)
- `src/npc.js` (edit — cross-faction aggro hook)

**Dependencies:** none. Does not touch `src/main.js`.

**Context:** The pieces already exist, just not wired to each other:
- `spawnzones.js` → `ZONE_MIX` already leans each zone toward one faction
  (`residential: { redneck: 0.75, hoodrat: 0.25 }`, `urban: { hoodrat: 0.7,
  redneck: 0.3 }`, etc.) but it's a soft population blend, not a hard
  territory — every zone can spawn either faction, everywhere.
- `npc.js` → every spawned NPC already carries `e.type` (`"redneck"` /
  `"hoodrat"` / `"hog"`), `e.home` (its POI/turf), and a temperament
  (`temperament()`, line ~28: rednecks 50/50 brave/timid). NPCs are calm by
  default (`DEFAULT_AGGRESSION = 0`, per TASK-033) and only turn `"hostile"`
  via `becomeHostile()` — currently only ever called when the *player* hurts
  an NPC. Rednecks and hoodrats never react to each other at all right now.
- `kills.redneck` / `kills.hoodrat` are already tracked separately in
  `main.js` (used for `HEAT_KILLS`, the Sheriff trigger).

**Goal:** Rednecks and Hoodrats hold their own territory and ignore each
other inside it (as now), but in a small number of explicit border/crossover
zones, a redneck and a hoodrat that spot each other fight — no player
involvement needed. This should read as two gangs at war, not a random
scuffle generator.

**Design:**
1. In `spawnzones.js`, tighten a subset of existing zones into near-exclusive
   territory (e.g. `residential` → 0.92 redneck / 0.08 hoodrat, `urban` → 0.9
   hoodrat / 0.1 redneck) and add 1–3 new named **border zones** (e.g. around
   Market Row / the strip's contested middle stretch) with a roughly 50/50 mix
   and a `border: true` flag returned alongside `{ x, z, kind, zone }` from
   `pick()`.
2. In `factions.js`, export something like
   `createFactionWar({ npcs, events })` → `update(dt, living)` that, on the
   same staggered-timer cadence `npc.js` already uses (not per-frame), checks
   pairs of live NPCs where `a.type !== b.type`, both are `"redneck"`/`"hoodrat"`
   (never hogs), both are within sight range of each other (~18–22 m, reuse
   the constants already in `npc.js`), and at least one is standing in a
   border zone — then calls `becomeHostile` on both, with each other as the
   target instead of the player.
3. `npc.js` needs a small extension: `hostile` state currently always chases
   `playerPos`. Give it an optional rival target (another NPC) so it chases
   and melees that NPC using the same `melee` / `dmg` / `atkGap` stats already
   defined per type in `main.js` (~line 1168), instead of the player. A dead
   rival should drop through the existing `killEnemy` / `loot.dropFor` path so
   turf kills still pay out like player kills.
4. Respect `MAX_HOSTILE` (7) — faction fights compete with player-provoked
   hostiles for that budget; don't add a separate uncapped pool.

**Acceptance criteria:**
- Inside solid territory (e.g. deep residential or deep urban), rednecks and
  hoodrats spawned near each other stay calm — no unprovoked fighting.
- In a border zone, a redneck and hoodrat within sight range fight each other
  without the player nearby; the loser drops loot as normal.
- The player can walk through a faction fight without being auto-targeted
  (existing player-provoked hostility rules are untouched).
- `MAX_HOSTILE` is never exceeded by faction fights alone.
- No new console errors; existing `tools/qa/worldpass.mjs` and
  `tools/qa/gameplay.mjs` still pass unmodified.
- A real-browser pass (screenshot or short clip) showing one border-zone fight
  actually happening.

**Out of scope:** new visual assets for the factions (that's TASK-038), the
Sheriff/police reaction to gang violence (existing `checkHeatUp` logic is
untouched — human decision if factions should add heat).

**Integration notes (for Claude):** Expose `factionWar.update(dt, npcs.living)`
(or equivalent) called next to the existing `npcs.update(...)` call in
`main.js`'s main loop; document the exact call signature and any new fields on
the NPC record (`e.rivalTarget` or similar) in `AGENT_LOG.md` → Interface
contracts before marking `REVIEW`.

**Notes:**
- `src/factions.js` implemented (`createFactionWar({ npcs, spawnZones })`).
- `src/spawnzones.js` updated with tightened territory mix (`residential` 0.92/0.08, `urban` 0.90/0.10) and `border_strip` / `border_market` border zones with `isBorder(x, z)` check.
- `src/npc.js` updated with `becomeHostile(e, rivalTarget)` extension, mutual rival target state, and `hitRival` combat damage execution.
- Headless unit test suite `tools/qa/factions_test.mjs` created and passing 14/14 tests cleanly.
- Interface contract documented in `AGENT_LOG.md` for Claude's `main.js` wiring.
- **Review + integration (Claude, 2026-09-14).** Details in AGENT_LOG → Discoveries and Interface contracts.
  - Fixed before wiring:
    - turf kills no longer count toward `HEAT_KILLS` (they would have brought in the Sheriff);
    - rival deaths now drop loot through `killEnemy(e, { turf: true })`;
    - shooting an NPC mid-fight turns it on the player;
    - fights only start within 60 m of the player, never take the last 2 of `MAX_HOSTILE`'s slots, and don't recruit NPCs already hostile;
    - `hitRival` goes through `noise()`, and there's one `release`.
  - Wired: `if (populationOn) factionWar.update(dt, enemies, playerPos)` after the enemy loop.
  - Tests:
    - `factions_test.mjs` 14/14 (needs a local three.js; see AGENT_LOG);
    - new `tools/qa/factions.mjs` 12/12, 0 console errors;
    - regressions `worldpass.mjs` 7/7 and `gameplay.mjs` calm and stable (HP 100 throughout, 0 console errors).
- **Known issue:** `border_market` can never be returned in the game. `eastBank.zoneAt` claims its box first (probe: town 84 / building 8 / highway 16). `border_strip` (US-167 frontage, z −40…40) is the one working contested zone.
- **Still to do:** the real-browser clip of a border fight (acceptance criterion), and a working second border zone.

---

### TASK-036 — Starter loadout & ammo system: baseball bat, reserve ammo, reload

**Status:** `REVIEW` · **Agent:** `Antigravity`
**Files / subsystem:**
- `src/weapons.js` (edit)
- `src/loot.js` (edit)

**Dependencies:** none. Does not touch `src/main.js` beyond a documented hook.

**Context:** Today `weapons.js` hard-codes the starter weapon as an infinite-
ammo 9mm pistol (`if (!WEAPONS[state.weapon]) state.weapon = "pistol"`); an
empty gun falls back to the pistol, never to unarmed. `loot.js` only ever
drops `cash` or a full `weapon` (which fully restocks the clip — see
`rollWeapon()` / `dropFor()`). There is no reserve ammo, no reload, and no
ammo-only pickup. This matches the "future" note already on TASK-034: *"A
weapon model in the player's hand, reloading, ammo pickups."* The human has
also asked separately for **no starting gun — just a baseball bat**, with
enemies dropping currency and weapons (loot already does the currency and
weapon side; the bat is new).

**Goal:**
1. The player starts with a `bat` weapon (melee, no ammo, always available —
   never falls back to a gun) instead of an infinite-ammo pistol. Guns are
   found, not given.
2. Guns have finite reserve ammo, a clip, and a reload action; ammo can be
   topped up by a new ammo-only pickup as well as by picking up a weapon.

**Design:**
1. Add `bat: { id: "bat", name: "Baseball bat", rarity: "starter", damage: 3,
   cooldown: 0.55, vehicleCooldown: 0.55, range: 2.2, clip: Infinity, melee:
   true }` to `WEAPONS`. Make it the default in `createArsenal` instead of
   `pistol`, and make `consume()` never swap *away* from the bat (there's
   nothing to fall back further to).
2. Split each gun's ammo into `clip` (already exists) and a new `reserve`
   pool (`state.reserve` next to `state.ammo`, keyed per weapon id so
   switching weapons doesn't lose reserve — a small object is fine, e.g.
   `state.reserve = { tec9: 0, sawnoff: 0, deerRifle: 0 }`). `give(id, rounds)`
   on pickup adds to reserve (or clip if empty-handed) instead of instantly
   refilling the clip.
3. Add a reload action (new exported method on the arsenal, e.g.
   `arsenal.reload()`): moves ammo from `state.reserve[id]` into `state.ammo`
   up to `clip` size, over a short duration (a `state.reloading` timer is
   fine — main.js's fire() already checks `state.fireCd`, so blocking fire
   while `state.reloading > 0` is a one-line integration note, not a rewrite).
   Running the clip to 0 should prompt a reload rather than silently
   swap to the bat.
4. In `loot.js`, add a third drop kind, `ammo` (small crate/box mesh reusing
   the existing unlit-material pattern), rolled per faction's loot table
   alongside `cash` / `weapon` (extend `LOOT_TABLES`). On pickup, add a
   handful of rounds to the reserve of the player's *current* gun if they
   have one; if unarmed (bat only), ammo pickups can be ignored or converted
   to a small cash value — implementer's call, note the choice.
5. Update `weaponHud` render() to show `clip / reserve` (e.g. `Tec-9 · 12/48`)
   instead of just the clip count; show nothing for the bat's ammo field
   (`—` or similar) since it's melee.

**Acceptance criteria:**
- New game / respawn starts unarmed except the bat; no gun is available until
  one is picked up.
- Firing a gun dry does not silently swap to the bat — it prompts reload
  (or auto-reloads if reserve > 0; implementer's call, document which).
- Reserve ammo persists across a weapon swap and across bat/gun switching.
- Ammo pickups exist on the ground, are visually distinct from weapon and
  cash pickups, and refill reserve rather than instantly maxing the clip.
- HUD clearly shows clip vs. reserve for guns, and reads sensibly for the bat.
- `tools/qa/worldpass.mjs`'s weapon-slot check will need updating for the new
  starter weapon and reserve field — update it in this task, don't leave it
  broken.
- No new console errors.

**Out of scope:** a visible weapon model in the player's hand or a weapon
wheel for multiple gun slots (still future work); melee swing animation
beyond reusing the existing `attack` sprite state main.js already plays on
`fire()`.

**Integration notes (for Claude):** `fire()` in `main.js` (~line 2230) will
need a branch for melee weapons (short range check against `enemies`/
`sheriffs` instead of a tracer + hitscan) and a call to `arsenal.reload()` on
whatever key is chosen (R is free). Document the exact new arsenal methods/
fields (`reload()`, `state.reserve`, weapon `melee` flag) in `AGENT_LOG.md` →
Interface contracts.

**Notes:** —

---

### TASK-020 — Police: escapable Sheriff, real cruiser look & on-foot deputies

**Status:** `REVIEW` — **module written by Antigravity, wired into the game by Claude on 2026-09-16 (see TASK-042).**
Until then `src/police.js` was never imported by anything: the Sheriff the player
actually met was still the ~90 lines of inline code in `main.js`.
**Agent:** `Antigravity` (module) · `Claude` (integration)
**Files / subsystem:**
- `src/police.js` (new — police system, search logic, on-foot cop spawning/AI)
- `src/characters.js` (edit — 3D procedural Deputy/Police officer character model)

**Dependencies:** none. Deliberately scoped as a **new module only** — per
`AGENT_PROTOCOL.md` §4, `src/main.js` is orchestrator-owned, so this task does
not touch the ~90 lines of inline Sheriff code currently living there
(`sheriffProto` setup ~line 1449, `spawnSheriff` / `copsActive` /
`checkHeatUp` / `updateSheriffs` ~lines 2852–2920, plus `damageVehicle`'s
Sheriff branch and `fire()`'s Sheriff targeting). Claude will swap those call
sites over to this module during integration.

**Context — human's report, verbatim:** *"The police are too savage. It's
kinda hard to get away from them... visually, they look kinda shitty."* This
resolves the open question already sitting in **Blockers / Decisions
needed**: *"how weak should the police be (spawn distance, count, give-up
timer)?"* — answer: noticeably weaker / more escapable than today, and this
task also fixes the model. Reading the current code confirms both complaints
are real, not just a feel issue:
- **Visual:** the "cruiser" is `sheriffProto = pickup.clone(true)` (the same
  generic pickup model used for civilian traffic) painted white with a single
  flat blue box glued on top as a "light bar" (`main.js` ~line 1449–1459). No
  livery, no light pattern, no siren geometry — it reads as a mis-tinted
  pickup because that's exactly what it is.
- **Behaviour:** in `updateSheriffs` (~line 2877), every active cruiser
  always knows the player's exact position (no line-of-sight / search logic
  at all), turns at up to 2.4 rad/s and accelerates to 22 m/s the instant it's
  more than 6 m away, and while within 4 m **on foot** it applies
  `hitPlayer(dt * 14)` every frame — 14 HP/sec continuous, which empties a
  100 HP bar in well under 10 seconds with no way to break contact. There is
  no timer or condition anywhere that lets a chase end other than killing
  every cruiser or waiting for `state.heat` to decay passively at
  `dt * 0.16`–`0.3`, which the cruisers' own homing behavior prevents ever
  happening since they never lose you.

**Goal:** A Sheriff cruiser that looks like one, and a chase you can
plausibly break off if you drive or run well — not just outgun.

**Design (as a standalone module — no dependency on main.js internals; expose
a clean interface Claude wires in):**
1. **Visual.** Build (or load, see TASK-038 — a police-liveried vehicle may
   already exist among the vehicle assets once that audit lands; check before
   building one from primitives) a distinct cruiser look: two-tone paint
   (not just a recolor of the exact civilian pickup skin players already see
   in traffic), a proper light bar (alternating red/blue emissive strips, not
   one flat box), and if cheap enough a push-bar / decal detail. Keep it as
   cheap as the pickup it currently reuses — no new lights beyond what
   `main.js` already pools (`beaconLights`); document what visual elements
   the module expects `main.js` to attach vs. what it builds itself.
2. **Search/give-up logic.** Replace "always knows your exact position" with
   last-known-position pursuit: cruisers drive toward where they last saw
   you, not your live position, and lose you if you break line-of-sight (or
   exceed some distance) for a give-up window (a few seconds, tune by feel).
   `state.heat` should then actually be able to decay to 0 during a
   successful evasion, ending the chase — today it structurally can't.
2. **Reduced savagery.** Cut the on-foot contact damage rate substantially
   (14 HP/s is a near-instant kill; consider a knockdown/bust mechanic — the
   game already has `busted()` at `state.bustCd > 3` for the "on top of you"
   case — instead of pure DPS on foot), and/or increase the distance at which
   contact triggers so a moving target isn't guaranteed to get cornered.
   Tune `HEAT_KILLS` (currently 12), spawn count (`Math.max(0, state.wanted -
   1)`) and turn rate/top speed (2.4 rad/s / 22 m/s) as a set — call out
   whatever final numbers you land on plus why.
**Acceptance criteria:**
- A cruiser is visually distinguishable from civilian traffic at a glance,
  even at night (existing headlight/dusk lighting).
- A player who breaks line of sight and puts sufficient distance between
  themselves and every active cruiser for the give-up window actually loses
  the chase (`state.wanted` returns to 0 without killing every cruiser).
- On-foot contact no longer drops a full-health player in under ~10 seconds;
  document the new time-to-bust/damage numbers.
- Module doesn't touch `src/main.js`; it's a drop-in replacement documented
  well enough that Claude can wire it without re-deriving your design.
- No new console errors when smoke-tested against a stub harness (a fake
  `state`/`playerPos`/`scene`, since this can't run standalone against the
  real game).

**Out of scope:** changing `HEAT_KILLS`'s trigger source (Redneck/Hoodrat
kills) or adding new arrest/jail gameplay beyond the existing `busted()` flow.

**Integration notes (for Claude):** Document the module's exported factory
signature, its expected inputs (what it needs from `main.js`: scene, MAP
bounds, `playerPos`, `hitPlayer`, `registerVehicle`, `blockers`, etc. — mirror
what the inline version already threads through) and outputs (`update(dt)`,
`spawnSheriff()`, `copsActive()`, whatever it exposes for `fire()`'s aim-assist
and `damageVehicle`'s cruiser-wreck bonus) in `AGENT_LOG.md` → Interface
contracts. This is the actual extraction-into-`src/police.js` that the
BACKLOG stub for this task called for — Claude does the `main.js` swap-over
once the module is in `REVIEW`.

**Notes:**
- `makeDeputy` exported in `src/characters.js` building 3D procedural parish deputies with uniform shirt, dark trousers, campaign hat, gold star badge, and duty belt (holster + radio).
- `src/police.js` created with `buildCruiserModel` (two-tone Sheriff cruiser, push-bar, dual emissive red/blue lightbar beacons), `spawnFootCop`, `updateSearchAndEvasion` (last-known-position search AI, give-up decay after ~5s), and `updateFootCops` (on-foot deputy pursuit, melee attacks, and loot drops).
- Tested via unit test suite `tools/qa/police_test.mjs` (11/11 tests passing cleanly).
- Interface contract documented in `AGENT_LOG.md` for Claude's `main.js` wiring.

---

### TASK-038 — Wire in the unused-but-usable assets; correct the asset audit

**Status:** `REVIEW` · **Agent:** `Antigravity` —
repo exploration across `assets/`, larger self-contained integration work
**Files / subsystem:** district/dressing modules only — `src/eastbank.js`,
`src/westparish.js`, `src/orlearouge.js`, and/or a new `src/landmarks.js` /
prop-kit module if that's cleaner. **Not** `src/main.js`, `src/weapons.js` (a
new weapon model is additive there — coordinate with TASK-036 rather than
edit the same file at once), `src/vehicles.js` definitions (propose changes,
Claude applies if it's a shared-definition file already locked elsewhere).

**Dependencies:** none, but sequence after or alongside TASK-035 rather than
in parallel if both end up wanting `spawnzones.js` — check the lock table
before claiming.

**Context — the audit in `docs/WORLD_BUILDING.md` is stale.** It currently
lists `Fence Pack.zip`, `abandoned_office_space.zip`, `Hoodrathavoc.zip`,
`gangster_rifle.zip`, `City Bowels` and `Los Santos Mini Map.bbdoc` all
together as "Unity/Unreal/Marmoset/GTA-specific formats; not safe to wire
into Three.js." That blanket statement is wrong for at least two of them —
checked by actually opening the archives (2026-09-14):

| Archive | What's actually inside | Usable now? |
|---|---|---|
| `assets/gangster_rifle.zip` | `scene.gltf` + `scene.bin` + PBR textures — a real glTF, loads directly with the existing `GLTFLoader` path | **Yes.** A ready-made distinct gun model/pickup. |
| `assets/Fence Pack.zip` | Loose `.fbx` files (`Fence.fbx`, `FenceConnector.fbx`, `Fencecorner.fbx`, `InnerFence*.fbx`) alongside a `.unitypackage` | **Yes, the FBX files.** Ignore the `.unitypackage`; load the FBX the same way `assets/models/*` FBX are already loaded. |
| `assets/abandoned_office_space.zip` | An Unreal project (`.uproject`, `.umap`, `.uasset`) **plus** loose `.FBX` meshes (`bin.FBX`, `chair.FBX`, `flower_pot.FBX`, and more — list the full archive) | **Yes, the loose FBX meshes only.** Skip everything Unreal-specific. |
| `assets/Hoodrathavoc.zip` | Character models as `.dff` / `.txd` (GTA/RenderWare format) | **No** — Three.js has no RenderWare loader; needs an external DFF→glTF conversion step this task should not attempt. Flag as a **Blockers / Decisions needed** item instead (see below), don't spend time on it. |
| `assets/City assets.zip`, `assets/crayon-city-architecture-v1.1.1.zip` | Identical `.glb` sets already unpacked and in use at `assets/city/models/textured` (per `WORLD_BUILDING.md`'s existing table) | Already used; nothing to do — just confirm and note it in the corrected table. |

Also note while you're in there: `assets/models/town/` (a "2 m tile kit",
`TownTiles_003.glb` per the TASK-034 notes) is still unused, and
`assets/models/trailerpark/chars/Character_*.fbx` (loader helpers exist per
the audit) are still not in the ambient population.

**Goal:** Make the city read as more lived-in using assets that are already
paid for and sitting unused, and leave `docs/WORLD_BUILDING.md` accurate for
the next agent instead of repeating the same "not safe to import" note.

**Concretely, in whichever district module(s) make sense:**
1. Wire `gangster_rifle.zip`'s glTF as a new weapon model — hand off to
   TASK-036/Freebuff as an available asset (a model reference + rough
   scale/orientation notes) rather than editing `weapons.js` yourself; add a
   fence-variety pass using the Fence Pack FBX somewhere it reads as new
   (Bayou Noir's cane fields already use fencing per TASK-034 — vary it, or
   add fencing somewhere currently a bare edge).
2. Add office-space clutter (the loose `bin.FBX` / `chair.FBX` /
   `flower_pot.FBX` / etc. from `abandoned_office_space.zip`) as interior or
   loading-dock dressing in one of the commercial/office buildings already
   placed (Port Mercer's offices in `eastbank.js` are the obvious fit).
3. Spot-check that every building variant in `assets/city/models/textured`
   (cottage, apartments, school, cafe, market, hospital, offices, garage, fire
   station, tower — ten total per the existing audit) is actually placed
   somewhere reachable, not just some of them; add placements for any that
   are sitting unused.
4. Correct `docs/WORLD_BUILDING.md`'s asset inventory table with what you
   actually verified (usable vs. not, and why), so this doesn't get
   re-audited from scratch next time.

**Acceptance criteria:**
- At least the gangster rifle model and the office-clutter set are placed and
  render with no console 404s/errors (FBX texture path issues are a known
  failure mode per `AGENT_LOG.md` — check the network tab / headless console).
- No regression in existing QA scripts (`worldpass.mjs`, `eastbank.mjs`,
  `gameplay.mjs`) — draw calls may rise, but stay within the existing budget
  guardrails (~20 draw calls per new static prop cluster, per the pothole
  task's precedent) or justify why not.
- `docs/WORLD_BUILDING.md` table reflects reality, not the old blanket
  assumption.
- No new console errors.

**Out of scope:** `Hoodrathavoc.zip` conversion (blocked, see below);
sourcing motorbike or airplane models — **none currently exist in
`assets/`** despite being on the human's wishlist; that needs either new
asset sourcing or a from-primitives build like the existing Designersoup cars,
and is a human decision (added to Blockers below), not something to solve by
scope-creeping this task.

**Integration notes (for Claude):** None expected if everything lands inside
already-available district modules; flag here if anything genuinely needs a
`main.js` touch (e.g. a new vehicle type in the traffic pool).

**Notes:** —

---

## BACKLOG

### TASK-032 — Potholes across Tusouxroe
**Status:** `REVIEW` (headless test passes; regression re-runs and a real-browser drive pending) · **Agent:** `Claude`
**Requested by:** the human. **Updated 2026-09-13: 40 potholes on *every*
street in Tusouxroe** (this replaces "at least 10" in the criteria below).
Streets: US-167 through town (z −32…−132), a new Main Street between the
shopfront rows (z −78, x −73…−11), and South Tusouxroe's street (z −106,
x 31…122): 120 potholes in total. Spacing is "no overlap" rather than 15 m,
since 40 per street needs density.

**Progress (2026-09-13):**
- `src/potholes.js` plus wiring: Main Street built, potholes created, jolt in
  `drivingUpdate`, camera shake. Syntax-checked.
- First headless run: **counts 40 / 40 / 40, no overlaps, 54 wet, 6 instanced
  meshes**; the South Tusouxroe screenshot shows the potholes on the street.
- Problems found:
  1. The Main Street screenshot put the camera *inside* a shopfront. Camera
     pull-in only runs at low angles, so tall buildings swallowed it. Fix
     written (tall buildings registered as camera occluders, in Tusouxroe and
     OrleaRouge); applying after the diagnostic.
  2. The test car stopped dead against a brick wall ~26 m into Tusouxroe on
     US-167 (not caused by the potholes). **Diagnostic running** to identify
     the object.
  3. The jolt wasn't measured reliably, because polling missed sub-second
     jolts. The test now records every frame inside the page.
- Second run **passes**: 40 / 40 / 40, no overlaps; the drive covered 77.6 m
  through Tusouxroe with 11 hits (peak jolt 0.71); Main Street's camera stays
  outside; Tusouxroe draw calls 164–377 on foot. Fixed along the way: the
  shopfront rows no longer sit on US-167 (a bug that predates this task and
  also blocked the drive to the escape truck).
- Regressions re-run after the layout and camera changes: **free roam and
  OrleaRouge both pass.** City bystanders now confirmed reacting to gunfire:
  3 flee, 0 hostile (this closes the open item on TASK-031). Only the known
  playlist 404.
- Pending: a real-browser drive through Tusouxroe (TASK-010) to judge how the jolt feels.
**Files / subsystem:** `src/potholes.js` (new); `src/main.js` integration (Claude)
**Dependencies:** none. Tusouxroe's roads already exist.
**Context:** Tusouxroe is the north of the map (z < −30): the US-167 stretch
through town, the truck lot (x −41…29, z −120…−76), the shopfront street
(z ≈ −78) and South Tusouxroe's street (z = −106, x 29…124). Road surfaces are
`surface("asphalt")` meshes, which get the wet-road shader.
**Goal:** Several potholes spread across Tusouxroe, not clustered in one spot.
You see them, and you feel them when you drive over one.
**Acceptance criteria:**
- At least 10 potholes, spread over at least 4 different Tusouxroe roads or
  lots, with a minimum spacing (e.g. Poisson-disc, no two within ~15 m).
  Placement is deterministic (seeded), so they don't move between loads.
- Each reads as a pothole at night: a dark, irregular, slightly recessed patch
  with a broken asphalt rim, and some holding standing water.
- Driving over one jolts the car (brief speed loss + body bounce / camera
  shake), scaled by speed; on foot there's no effect.
- Static and cheap: batched or instanced, no new lights, no per-frame
  allocation; draw calls in Tusouxroe rise by < 20 (headless HIGH, F3).
- No new console errors.
**Interface to expose (for Claude):** `createPotholes({ scene, surface, rng })` →
`{ list: [{ x, z, r }], hitTest(x, z, radius) -> depth 0..1 }`, so
`drivingUpdate` can apply the jolt.

- [ ] `TASK-013` — **Bravado reads as green at night** (`src/prologue.js`: `tintClone` / an emissive trim). Blocked on the TASK-009 lock. Suggested: Freebuff.
- [ ] `TASK-014` — **Traffic on Tusouxroe streets + a player standing in the road** (`src/traffic.js`; Claude adds lanes in `main.js`). Cars honk or steer around a pedestrian instead of only easing past. After TASK-012.
- [ ] `TASK-016` — **OrleaRouge: decide placement, then write a design doc** (`docs/orlearouge.md`). Blocked on a human decision (see Blockers).
- [~] `TASK-017` — **IN PROGRESS (Claude), split into three parts:**
  - **Part A, "Blue Light Special"** (`src/bluelight.js`): **REVIEW.**
    Implemented, wired into `main.js` (Act One's `startNext`) and
    headless-tested with `tools/qa/bluelight.mjs` (4 runs, every step passes).
    - Getting WASTED mid-run respawns you (hp 100, still 3 stars).
    - 2 cruisers chase you at 3 stars; the police clear at the drain.
    - Draw calls in the tunnel scene: 312, after a short far plane culls
      the city (1,971 before).
    - Pending: a real-browser run (TASK-010) to judge the chase difficulty
      and the siren and wash feel.
    - It covers:
    - Act One's end leads south to meet Solange Duval in the French District.
    - The raid: police light wash, and Keseme's sensory-overload beat.
    - The escape: a six-checkpoint run at 3 stars (east alley / nightclub
      kitchen → wedding reception → cemetery → brass-band parade → riverfront
      casino → storm drain). Getting wasted or busted respawns you at the last
      checkpoint.
    - The flood-tunnel cutscene ends at the crown-over-waves door.
  - **Part B, Nirbayou Nolantis** (`src/nolantis.js`): **REVIEW.** Wired via
    `.claude/wire/nolantis-wire.mjs`.
    - **Handoff:** Blue Light Special's flood tunnel hands straight on to it
      (`ctx.startNext`).
    - **The set:** a sealed cavern at x −720, z 110.
      - Descent: rock, submerged ruins, a glass waterway with fish, then the
        reveal.
      - The city: shell and coral towers, gardens, a monorail with trams, a
        fountain plaza, citizens and children.
      - Arrival terminal with Amara and the Civic Guardians.
    - **Played tour, four stops:** housing terraces, health garden, public
      kitchen and vertical farm, the live public-ledger board.
    - **The Truth:** in the archive, projected onto the radar's Dixie Beaux map
      with a Pelican Crown network overlay.
    - **Exit:** the elevator back to OrleaRouge.
    - **Script:** follows the human's script word for word. Tour-stop banter
      that the script doesn't have is kept short and in character.
    - **`tools/qa/nolantis.mjs`: 5 / 5.**
      - All 20 story steps run.
      - The player walks outside `MAP` down there.
      - The radar hides below and comes back on the surface.
      - Draw calls: 411–477 in the city, 161 back on the surface.
    - **Screenshots checked.**
      - The first run caught the city not rendering: the root group was never
        added to the scene.
      - Also fixed: a black shaft, the sky showing through the water band, a bad
        "We died" angle, the canopy blocking the tour start, and an upside-down
        archive map.
    - **Blue Light Special regression** passes and ends in the Nolantis tour.
  - **Part C, "Welcome Back to Dixie"** (`src/welcomeback.js` new; `src/nolantis.js`, `src/main.js`, `src/voiceCast.js`, `tools/qa/nolantis.mjs`): **REVIEW (Claude, 2026-09-15).**
    Implemented and wired (interface in AGENT_LOG → Interface contracts). The script
    text came from an earlier session transcript; every line is the human's.
    - `tools/qa/nolantis.mjs` walks the whole chapter headless: The Truth → office →
      platform → montage → V.O. → the call → MISSION UNLOCKED → elevator → surface →
      ACT ONE BEGINS → free roam at the storm drain. All Part C checks pass, no new
      console errors (only the known gitignored city-GLB / voice-manifest 404s).
    - The test's old "outside MAP" walking check was stale (the state-wide expansion
      widened MAP past Nolantis) and its Esc presses could open the pause menu; both fixed.
    - Screenshots checked for every new scene; montage dressing moved where it clipped
      buildings (Chatboro sign and eviction now at the trailer park's open south edge).
    - Pending: a real-browser play-through (TASK-010), and `npm run voiceover` for the
      new speakers (BELLEFONTAINE, EXECUTIVE, VOICE).
    From the human's script, after The Truth to the end of the prologue script:
    Governor Bellefontaine and Mercer at the Chatboro Sheriff's Office, the
    observation platform with Solange, the montage + Keseme's V.O., the
    threatening phone call, "MISSION UNLOCKED: WELCOME BACK TO DIXIE", and the
    final elevator cinematic ("—we become extremely inconvenient", ACT ONE BEGINS).
- [ ] `TASK-017` (original scope) — **Act One's later beats**: the threatening phone call ("Your mother's house is very pretty"), Governor Bellefontaine's meeting with Mercer, the flood tunnel and the Nirbayou Nolantis descent. Needs TASK-009 and TASK-016.
- [ ] `TASK-019` — **Weakest surfaces**: the stylised Popeyes, trailers and water towers are plain boxes. Needs their builders moved out of `main.js` into `src/landmarks.js` first (Claude). Suggested: Antigravity.
- [ ] `TASK-021` — **Minimap / waypoint arrow** (new `src/minimap.js`; Claude hooks it up). Story objectives already have world positions. Suggested: Codex.
- [ ] `TASK-022` — **Check the taco stand's draw cost** (`Tacos.glb` was ~358 meshes) now that batching exists; swap for a stylised stand if it's still heavy.
- [ ] `TASK-023` — **Torch sprites read as carved poles**; a bigger flame frame or a 3D torch. Suggested: Freebuff.
- [ ] `TASK-024` — **Tune car handling** and enemy aggro while driving.
- [ ] `TASK-025` — **Airboat** for the bayou stretches (the cover art has one).
- [ ] `TASK-026` — **Drive the escape truck out** instead of an instant win.
- [ ] `TASK-027` — **Radio stations** on top of the soundtrack folder.
- [ ] `TASK-028` — **Tune mist, beams and headlight brightness on a real GPU.** After TASK-010.
- [ ] `TASK-029` — **Traffic headlights**: share the player's spotlight rig with the nearest oncoming car.
- [ ] `TASK-030` — **Wire unused set dressing**: the Trailer_Park.fbx scene and the Tacos / Pizzeria props. Overlaps with TASK-038 — whoever claims TASK-038 should fold this in rather than duplicate the audit.

## BLOCKED

- [ ] `TASK-013` — Blocked by `TASK-009`
  - Reason: `src/prologue.js` is locked while the Act One hand-off is being tested.
- [ ] `TASK-016` — Blocked by a **human decision**
  - Reason: OrleaRouge as a new region on this map vs. a separate level (see Blockers).

---

# 🔗 DEPENDENCIES

```text
TASK-008 (review) ──→ TASK-009 (in progress) ──┬─→ TASK-013
                                               └─→ TASK-017 ←── TASK-016 ←── human decision
TASK-012 ──→ TASK-014
TASK-010 ──→ TASK-028
Claude extraction ──→ TASK-019 (landmarks.js)
TASK-011, TASK-018, TASK-021, TASK-020, TASK-035, TASK-036, TASK-038 — independent
```

---

# 👥 AGENT OWNERSHIP

| Agent | Current task | Files / subsystems | Status |
|---|---|---|---|
| Claude | TASK-009; orchestration, review, `main.js` integration | `src/actone.js`, `src/ledgerboard.js`, `src/cinema.js`, `src/prologue.js`, `src/main.js`, `tools/qa/actone.mjs` | Active |
| Codex | — (suggested: TASK-011, then TASK-012) | — | Available |
| Antigravity | TASK-038 (TASK-020 & TASK-035 in REVIEW) | `src/eastbank.js`, `src/westparish.js`, `src/orlearouge.js`, `docs/WORLD_BUILDING.md` | Active |
| Freebuff | TASK-040 (REVIEW — Claude wiring review pending); TASK-018 (REVIEW) | `tools/characters.html`, `src/audio.js`, `src/weapons_3d.js` | Active |

> Update this table whenever ownership changes.

---

# 🧩 FILE / SUBSYSTEM LOCKS

| File / subsystem | Owner | Task | Lock status |
|---|---|---|---|
| `TODO.md` | All agents | Coordination | Shared |
| `AGENT_PROTOCOL.md` | All agents | Team rules | Shared |
| `AGENT_LOG.md` | All agents | Communication | Shared |
| `src/main.js` | Claude | Orchestrator-owned (always) | Locked |
| `src/actone.js`, `src/ledgerboard.js` | Claude | TASK-009 | Locked |
| `src/cinema.js` | Claude | TASK-009 | Locked |
| `src/prologue.js` | Claude | TASK-009 | Locked |
| `tools/qa/actone.mjs` | Claude | TASK-009 | Locked |
| `src/graphics.js`, `index.html`, `serve.mjs`, `package.json` | Claude | Serial files: ask first | Locked |
| `src/merge.js` | Claude | TASK-045 (REVIEW) — signatures + boundaries | Available |
| `src/fx.js` | Claude | TASK-044 (REVIEW) — mirror layer | Available |
| `tools/qa/mirror.mjs` (new) | Claude | TASK-044 | Available |
| `src/traffic.js` | Freebuff | TASK-039 (REVIEW) — TASK-012/014 changes go through review | Locked |

| `tools/characters.html` | — | TASK-018 (REVIEW) | Available |
| `src/audio.js`, `src/weapons_3d.js` | Freebuff | TASK-040 (REVIEW) | Available |
| `tools/qa/audio_weapons_test.mjs` | Freebuff | TASK-040 | Available |
| `src/factions.js` (new) | — | TASK-035 (REVIEW, integrated) | Available |
| `src/spawnzones.js` | — | TASK-035 (REVIEW, integrated) | Available |
| `src/npc.js` | — | TASK-035 (REVIEW, integrated) | Available |
| `src/police.js` (new) | Claude | TASK-020 module / TASK-042 integration (REVIEW) | Available |
| `tools/qa/police.mjs` (new), `tools/qa/police_test.mjs` | Claude | TASK-042 | Available |
| `src/characters.js` | — | TASK-020 (REVIEW) | Available |
| `src/weapons.js`, `src/loot.js` | — | TASK-036 | Available |
| `src/eastbank.js`, `src/westparish.js`, `src/orlearouge.js`, `docs/WORLD_BUILDING.md` | Antigravity | TASK-038 | Locked — `orlearouge.js` taken briefly for TASK-065 (3 lines + an import; see the task) |
| `src/cemetery.js` (new), `tools/qa/cemetery.mjs` (new) | Claude | TASK-065 (REVIEW) | Available |
| `src/voiceCast.js` | All agents | Speaker to voice map | Shared |
| `src/klan.js` (new), `tools/qa/klan.mjs` (new) | Claude | TASK-066 (REVIEW) | Available |
| `src/npc.js` | — | TASK-066 (temperament only) | Available |
| `src/camera.js`, `src/spatial.js`, `src/music.js` | — | — | Available |
| `tools/qa/gameplay.mjs`, `tools/qa/prologue.mjs` | — | — | Available |
| `src/stateWorld.js`, `src/tusouxroeNorth.js` | Antigravity (unclaimed — see AGENT_LOG) | State-wide expansion | Unclaimed, fixes by Freebuff and Claude (TASK-041) applied |
| `src/composer.js` | Claude | TASK-041 (REVIEW) — road options | Available |
| `tools/qa/roads.mjs` (new), `tools/qa/worldpass.mjs`, `tools/qa/eastbank.mjs` | Claude | TASK-041 | Available |
| `tools/qa/traffic_test.mjs` | Freebuff | TASK-039 | Locked |


### Lock rules
- `LOCKED` means another agent is actively making changes there.
- `SHARED` means multiple agents may read/update it under the protocol.
- `AVAILABLE` means an agent may claim it.
- Never silently take another agent's locked file/subsystem.
- If ownership must change, record the handoff below.

---

# 🔄 HANDOFFS

*No active handoffs.*

---

# 🧪 REVIEW QUEUE

Implemented and headless-tested; waiting on the real-browser pass (TASK-010)
before `COMPLETE`.

- `TASK-045` — Batching by material signature, inside culling boundaries (Claude):
  scenery draw calls down 16–49% per view, scene meshes 5,916 → 3,903. eastbank 9/9
  (culling intact), controls 32/32, gameplay pass, strip screenshots unchanged.
- `TASK-044` — The wet-road mirror renders its own layer (Claude): mirror pass
  1,734 -> 202 draw calls, worst frame 3,683 -> 2,204. `tools/qa/mirror.mjs` 3/3 with
  before/after night screenshots. Needs a real-GPU look at the reflections (TASK-010),
  and TASK-011 for the main pass.
- `TASK-041` — One road system per line (Claude): `composer.road()` options
  (`material`, `sidewalk: 0`, `paved: false`), the hand-built duplicate road planes
  removed from `stateWorld.js` and `tusouxroeNorth.js`. `tools/qa/roads.mjs` 9/9
  (0/9 against HEAD), worldpass 7/7, eastbank 9/9, gameplay pass. Needs a real-GPU
  look at the four districts (TASK-010).


- `TASK-040` — Car audio + 3D weapons wiring (Freebuff): `src/audio.js` (lazy
  gesture-safe car audio, player-vehicle gating, `resumeAudio`),
  `src/weapons_3d.js` (correct arsenal ids, r160 colorSpace, bbox-fitted
  gangster rifle), `src/main.js` (five additive hooks incl. vehicle damage +
  crash damage via the new `v.impact` from `src/vehicles.js`). Tested via
  `tools/qa/audio_weapons_test.mjs` (33/33). Needs Claude's wiring review and
  a real-browser ear/eye check (TASK-010).
- `TASK-039` — Traffic circuits + sky-sign fix (Freebuff): `src/traffic.js`
  (lane-end handover, `next` pairing, DESPAWN 235 m past WRAP_HIDE 165 m),
  `src/main.js` (auto-pairer over every region's lanes, the four sign clones
  zeroed). Tested via `tools/qa/traffic_test.mjs` (11/11).
- `TASK-042` — The police module wired into the game (Claude): the cruiser model,
  last-known-position pursuit with a 5 s give-up window, wanted able to reach 0,
  on-foot contact 14 → 5 HP/s. `tools/qa/police.mjs` 8/8, `police_test.mjs` 11/11.
  Needs the real-GPU feel pass (TASK-010) and the on-foot deputies (TASK-020).
- `TASK-020` — Police module (`src/police.js`, `src/characters.js`): the cruiser look
  and the search / give-up logic. **Wired in by TASK-042**; the on-foot deputies are
  built and unit-tested but still not spawned in game. `tools/qa/police_test.mjs` 11/11
  (it crashed against the module's real API until 2026-09-16).
- `TASK-035` — Redneck vs Hoodrat territorial warfare (`src/factions.js`, `src/spawnzones.js`, `src/npc.js`). Reviewed, fixed and wired into `main.js` by Claude. `factions_test.mjs` 14/14, in-game `tools/qa/factions.mjs` 12/12. Needs a real-browser clip of a border fight, and `border_market` is unreachable (see the task).
- `TASK-018` — Character viewer (`tools/characters.html`): cast presets + full
  option controls; statically verified (module syntax + a value audit of every
  preset and palette against the game sources). Needs one real-browser load
  (TASK-010) before `COMPLETE`.
- `TASK-001` — Atmosphere and graphics pass: height fog / mist, light shafts,
  headlights, wet roads + mirror, speed blur (`src/fx.js`, `src/graphics.js`).
  Needs real-GPU tuning (TASK-028).
- `TASK-003` — NPC behaviour system (`src/npc.js`). Headless: calm at rest,
  scatter from gunfire, capped hostility.
- `TASK-004` — Ambient traffic (`src/traffic.js`). Headless: lanes held, pool
  stable. The "ease past a pedestrian" fix hasn't been observed in a test yet.
- `TASK-005` — Pointer-lock camera (`src/camera.js`). Headless: capture, mouse
  look and right-drag work; **Esc release untested**.
- `TASK-007` — Dixie Beaux rebrand, cutscene toolkit (`src/cinema.js`), story
  options in `src/characters.js`, menu buttons.
- `TASK-008` — Prologue + Mission 1 "Hog Wild" (`src/prologue.js`). Headless
  walkthrough passes (twice); a hand-driven chase is still unverified.

---

# ✅ COMPLETED TASKS

- `TASK-002` — **Performance pass**: static lights into the nearest-8 pool,
  native-res HIGH, half-res GTAO, mirror every 2nd frame, collision grid
  (`src/spatial.js`), `mergeRigid` / `batchStatic` (`src/merge.js`), fixed-step
  simulation, F3 overlay. Bug fixes: pooled tracers, wrecked vehicles and dead
  cruisers removed from their lists, aim assist prefers hostiles, FBX texture
  404s redirected. Measured headless: draw calls 1,259 → 450, sim 0.88 →
  0.45 ms, AI 0.55 → 0.14 ms, load with 0 console errors.
- `TASK-006` — **Soundtrack folder** `assets/music/`: live playlist from
  `serve.mjs`, `npm run build` writes `playlist.json`, shuffle, **N** next track,
  fallback theme. Endpoint verified.
- **Mission renumbering (human request, 2026-09-17, Claude):** New Mission 1
  "Transition Day" (`src/missionClinic.js`) — Keseme drives to Oyster Bay
  Medical — now plays before the prologue. `prologue.js`'s own cold open and
  chase are untouched; its "HOG WILD" mission card is now Mission 2, and
  `main.js` calls `missionClinic.start()` for story mode instead of
  `prologue.start()` directly (`missionClinic`'s `onFinished` calls it).
  Also: Keseme's Fish Audio voice ID filled in in `src/voiceCast.js` (was a
  `TODO_FEMALE_KESEME_...` placeholder — her lines were all generated with
  the male voice she used to share with Peta). **Still needed:** run
  `npm run voiceover` (needs `FISH_AUDIO_API_KEY`) to generate audio for her
  now-correct voice and for the new mission's lines — not run yet.

---

# 🚨 BLOCKERS / DECISIONS NEEDED

- **OrleaRouge placement (human).** The script's next region is a big city. Is
  it (a) a new region added to this map (the map would need to grow south), or
  (b) a separate level loaded when you take the highway south? This blocks TASK-016 / TASK-017.
- **Dev server restart (human).** A server started before `serve.mjs` gained
  the playlist endpoint 404s on `assets/music/playlist.json`. The game falls
  back to the theme; restart `start-game.cmd` to pick it up.
- ~~Open design question: how weak should the police be?~~ **Answered by the
  human (2026-09-14): too savage, hard to escape, visually shitty.** See
  TASK-020 for the full brief; no longer open.
- Open design question carried over: is the map scale right, or should the
  towns sit closer together?
- **Motorbikes / airplanes (human wishlist, 2026-09-14).** The human wants
  vehicle variety including motorbikes and "maybe" airplanes. Checked
  `assets/` (2026-09-14): **no motorbike or airplane assets exist in the
  repo** — only the FBX cars in `models/cars` / `models/vehicles`. Needs a
  decision: source new model packs, or build them from primitives the way the
  Designersoup cars already are (`loadDsCar`)? Not assigned to a task yet.
- **`assets/Hoodrathavoc.zip` (found during the TASK-038 asset audit,
  2026-09-14).** Character models in `.dff`/`.txd` — GTA/RenderWare format.
  Three.js has no loader for this; using them needs an external DFF→glTF
  conversion step outside this repo's toolchain. Decision needed: is
  conversion worth doing (the name suggests these were meant for the Hoodrat
  faction specifically), or should Hoodrat character variety stay on the
  existing sprite/`makeHoodrat` palette system? Not assigned to a task.

---

# 🧠 CURRENT TECHNICAL NOTES

- `src/main.js` is orchestrator-owned; build features as modules with a
  `create…()` factory, and document the wiring.
- Story acts follow `createActX(ctx) → { buildSet, start, update, phase, debug }`.
- **Cutscenes queue.** Never `await cine.scene()` inside another scene.
- Custom materials need `userData.gtbRealized = true`; moving objects must be
  excluded from `batchStatic`; never add or toggle lights mid-game.
- Several files are CRLF in the working tree (see protocol §6).
- Headless fps is meaningless (SwiftShader). Measure draw calls / CPU ms.
- **Time of day:** read `worldTime` (`getCurrentTime()`, `isNight()`, `dusk`). Never keep a private timer; `state.dusk` is a copy for older code.
- **Weather:** read the blended multipliers (`weather.fogMultiplier`, `weather.grip`, …), not `weather.type`.
- **Money and guns:** cash is `state.cash`; the weapon slot is `state.weapon` / `state.ammo`, through `arsenal`. Drops go through `loot.dropFor(npc)` / `loot.dropAt()`.
- **New districts:** build them with `composer.js` in stage order (road → buildings → side streets → open areas → vegetation → landmark), and plan later pieces with `site()` first.
- **Popeyes:** only `POPEYES_LOCATIONS`. Nothing else calls `makePopeyes`.
- **Player characters:** `src/playerCharacters.js` (Keseme Nadia first and default, then Peta, Chimi, Gr33do, Dixon). A new id must also go into `CHARACTERS` in `server/protocol.js`, or multiplayer rejects it as `INVALID_CHARACTER`.
- **Launching the game:** `confirmCharacter` launches once (`gameLaunched`), closes `#characterSelect`, and the select keys ignore input while `state.running`. Before this fix the select stayed open under the hidden overlay, so every Enter (cutscene next line) or Space (jump) relaunched the game and re-queued the story opening. `prologue.start()` also runs only once.
- **The alternate campaign room** (`src/alternateCampaign.js`, "INT. THE ROOM") is built at (92, -104), on the South Tusouxroe street right in front of Keseme’s (the Nadia) house. It is hidden except while its own opening plays; it used to stand there permanently as a black block. If it ever needs to be visible in play, move it off that street first.
- **NaN pixels:** a zero-length normal lights as NaN, and bloom spreads NaN into a black, flickering blur. `realize()` repairs bad normals on every model (`sanitizeNormals`), and `NanGuardShader` runs before bloom so a bad pixel stays one black pixel. Headless SwiftShader does not reproduce the blur; check it on a real GPU (TASK-010).
- **Palette-atlas models** (Designersoup cars): nearest filtering, no mipmaps, `realize(…, { noDerive: true, keepPixelFilter: true })`, or the swatches bleed and glitter.
- **Mission targets stay in their area:** give each one `e.leash = { x, z, r }` (npc.js holds it inside; the population cull skips it) and clear it when the mission ends. Hog Wild's herd is penned 32 m around the crash site; `tools/qa/prologue.mjs` checks it. Headless tests: Esc outside a cutscene opens the pause menu, which freezes the simulation.

---

# 🧪 TESTING STATUS

**Last known test status:**
- 2026-09-16 (Claude, after TASK-041, TASK-042 and TASK-043).
  **In game (headless Chromium / SwiftShader):** `police.mjs` **8/8** (new),
  `roads.mjs` **9/9** (new), `controls.mjs` **32/32** (was 30/32 — two stale checks
  and a real collision bug, TASK-043), `worldpass.mjs` **7/7** (had been crashing
  since "update 9"), `eastbank.mjs` **9/9** (was 8/9 on a stale `MAP.maxX`
  assertion), `nolantis.mjs` **8/8**, `gameplay.mjs` **pass** (hp 100, 0 hostile at
  every step), `prologue.mjs` **pass** (every phase, hands off to Act One),
  `actone.mjs` **pass** (all steps, ends on the southern coordinates).
  `police.mjs`, `gameplay.mjs`, `prologue.mjs` and `actone.mjs` were all re-run
  *after* the `collisionResponse` change, since it touches every car in the game.
  Then `mirror.mjs` **3/3** (new) for TASK-044, with `gameplay.mjs` and
  `eastbank.mjs` re-run after it. After TASK-045 (batching): `eastbank.mjs` **9/9**
  (culling intact), `controls.mjs` **32/32**, `gameplay.mjs` **pass**, the five unit
  tests pass, and the three fixed strip cameras match their pre-change screenshots.
  0 new console errors — still only the gitignored `assets/city` GLBs and the voice
  manifest, 11 x 404 on every load.
  **Unit tests (node):** `police_test` **11/11** (it crashed on the module's real
  API until today), `traffic_test` **11/11** (seeded — it failed about 1 run in 6 on
  a random lane choice), `weapons_test`, `factions_test`, `dressing_test`,
  `pausemenu_test` all pass. `prostitute_test.mjs` is a *browser* script despite the
  name, so `node` on it does nothing and exits 0.
  **`three` had to be installed to run any of them:** `npm install three@0.160.0
  --no-save` (matching the CDN r160). `node_modules/` is gitignored and `package.json`
  is untouched, so the game still ships with no npm dependencies.


- After TASK-040 (Freebuff, 2026-09-17): `tools/qa/audio_weapons_test.mjs`
  **33/33** (new); `traffic_test.mjs` **11/11** (×4), `factions_test.mjs`,
  `weapons_test.mjs`, `pausemenu_test.mjs` pass. `police_test.mjs` crashes in
  `src/police.js` (pre-existing). `dressing_test.mjs` has a pre-existing
  test/implementation mismatch around `makeDecorativeFence` (TASK-038 files).
- After TASK-035 integration (2026-09-14): `tools/qa/factions.mjs` **12/12**, `factions_test.mjs` **14/14**, `worldpass.mjs` **7/7**, `gameplay.mjs` **pass** (HP 100 at every step, 0 hostile after the shots; 2 hostile while passing the strip border zone, consistent with one turf-fight pair), 0 console errors in all runs.
- After the character-select merge (dc84b97…089983f) and Keseme restored as the default character: `controls.mjs` **32/32**, `worldpass.mjs` **7/7**, character-select probe (Keseme first and default, story mode with her, Dixon still swaps the model). All 14 `tools/qa` scripts now confirm the character select and fire with a left click on the game canvas.
- Controls + gas cans (`tools/qa/controls.mjs`): **32/32** (re-run after TASK-034: all 5 cans reachable, 2 m on foot, driving past 2.8 m off, glow columns).
- World pass (`tools/qa/worldpass.mjs`): **7/7** (Popeyes, loot tables, a real kill, pickups, weapon slot, world time, weather).
- Lafourchette (`tools/qa/eastbank.mjs`): **9/9** (stage order, no building on a road, spawn zones, culling, frame time, walking and driving east).
- The buggy's flicker: before/after probe (parked speckle metric, 8-frame driven contact strip).
- Free roam (`tools/qa/gameplay.mjs`): **pass** (re-run after the map grew south).
- Prologue (`tools/qa/prologue.mjs`): **pass** (re-run; hands off to Act One).
- Act One (`tools/qa/actone.mjs`): **pass** (re-run; all 12 steps).
- Causeway + OrleaRouge (`tools/qa/orlearouge.mjs`): **pass** (2nd run, screenshots verified).

**Last tested by:** Claude (headless Chromium / SwiftShader)

**Last tested at:** 2026-09-16

**Known regressions:** none recorded. Still unverified: real-browser items (TASK-010).

---

# 📊 PERFORMANCE NOTES

Headless Chromium (SwiftShader), HIGH tier, 1280×720. CPU-side timings; fps not meaningful.

| Metric | Before | After | Test conditions |
|---|---|---|---|
| Draw calls (on foot) | 1,259 | 450 → 500–780 with NPC system + traffic | spawn area, free roam |
| Draw calls (driving) | ~1,160 | ~1,850 peak (story props + traffic) | gameplay.mjs driving step |
| Meshes | 1,434 | 866 | after mergeRigid + batchStatic |
| Sim / AI per frame | 0.88 / 0.55 ms | 0.45 / 0.14 ms | collision grid + NPC LOD |
| Render submit | 15.8 ms | 10–16 ms | on foot |
| Load | 6 console 404s | 0 errors, 0 failed requests | FBX URL modifier |
| Frame time, Lafourchette vs the strip | — | 16.6 vs 16.5 ms avg, worst 33 ms | eastbank.mjs, 3 s rAF sample |
| Wet-road mirror pass | 1,734 calls | 202 | TASK-044, night, in a car on the strip |
| Worst frame there (main + mirror) | 3,683 | 2,204 | same spot, 29.4 → 25.3 ms |
| Scenery draw calls, north crossroads | 497 | 268 | TASK-045, fixed camera, movers hidden |
| Scenery draw calls, Lafourchette | 1,584 | 919 | same |
| Scenery draw calls, US-167 strip | 1,772 | 907 | same |
| Scenery draw calls, OrleaRouge | 1,054 | 890 | same |
| Scene meshes | 5,916 | 3,903 | after batching the districts |

Full history: `AGENT_LOG.md` → Performance investigations.

---

# 📝 UPDATE RULE

Whenever an agent changes the state of a task, update this file. At minimum record:

```text
Task ID · Status · Agent · Files affected · Dependencies
What changed · What remains · Testing performed · Known issues
```

**Do not claim work is complete merely because code was written.** A task
becomes `COMPLETE` only after appropriate review and testing.
