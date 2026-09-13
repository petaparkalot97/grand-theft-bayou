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

---

# 🧭 CURRENT OBJECTIVE

**Primary objective:**
Bring the script to life. Finish and verify **Act One "Welcome Home"**
(Tusouxroe), then plan **OrleaRouge**, while keeping free roam smooth
(draw calls, not AI, are the cost to watch).

**Current phase:** `Testing / Integration`

---

# 🔒 ACTIVE TASKS

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
**Status:** `READY` · **Agent:** `UNASSIGNED` (suggested: **Antigravity**, or the human)
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
**Status:** `READY` · **Agent:** `UNASSIGNED` (suggested: **Codex**)
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
**Status:** `READY` · **Agent:** `UNASSIGNED` (suggested: **Codex**)
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
**Status:** `READY` · **Agent:** `UNASSIGNED` (suggested: **Freebuff**)
**Files / subsystem:** `tools/characters.html`
**Dependencies:** none
**Context:** `makeHoodrat` gained `skin / top / denim / hair / headwear
(band|none|hat) / beard / curly` and palette-object crews (AGENT_LOG →
Interface contracts). The viewer only knows red/blue crews.
**Acceptance criteria:** controls for those options, plus presets for the cast
(Keseme, Mally, Bubba, Mercer, deputy, Emiko: see the `CAST` values in
`src/prologue.js` and `populate()` in `src/actone.js`); the page loads with no
console errors.

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
- [ ] `TASK-017` — **Act One's later beats**: the threatening phone call ("Your mother's house is very pretty"), Governor Bellefontaine's meeting with Mercer, the flood tunnel and the Nirbayou Nolantis descent. Needs TASK-009 and TASK-016.
- [ ] `TASK-019` — **Weakest surfaces**: the stylised Popeyes, trailers and water towers are plain boxes. Needs their builders moved out of `main.js` into `src/landmarks.js` first (Claude). Suggested: Antigravity.
- [ ] `TASK-020` — **Police**: make the Sheriff escapable (give-up timer) and tune `HEAT_KILLS`, spawn count and ram damage. Move the sheriff code out of `main.js` into `src/police.js` first (Claude).
- [ ] `TASK-021` — **Minimap / waypoint arrow** (new `src/minimap.js`; Claude hooks it up). Story objectives already have world positions. Suggested: Codex.
- [ ] `TASK-022` — **Check the taco stand's draw cost** (`Tacos.glb` was ~358 meshes) now that batching exists; swap for a stylised stand if it's still heavy.
- [ ] `TASK-023` — **Torch sprites read as carved poles**; a bigger flame frame or a 3D torch. Suggested: Freebuff.
- [ ] `TASK-024` — **Tune car handling** and enemy aggro while driving.
- [ ] `TASK-025` — **Airboat** for the bayou stretches (the cover art has one).
- [ ] `TASK-026` — **Drive the escape truck out** instead of an instant win.
- [ ] `TASK-027` — **Radio stations** on top of the soundtrack folder.
- [ ] `TASK-028` — **Tune mist, beams and headlight brightness on a real GPU.** After TASK-010.
- [ ] `TASK-029` — **Traffic headlights**: share the player's spotlight rig with the nearest oncoming car.
- [ ] `TASK-030` — **Wire unused set dressing**: the Trailer_Park.fbx scene and the Tacos / Pizzeria props.

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
Claude extraction ──→ TASK-019 (landmarks.js), TASK-020 (police.js)
TASK-011, TASK-018, TASK-021 — independent
```

---

# 👥 AGENT OWNERSHIP

| Agent | Current task | Files / subsystems | Status |
|---|---|---|---|
| Claude | TASK-009; orchestration, review, `main.js` integration | `src/actone.js`, `src/ledgerboard.js`, `src/cinema.js`, `src/prologue.js`, `src/main.js`, `tools/qa/actone.mjs` | Active |
| Codex | — (suggested: TASK-011, then TASK-012) | — | Available |
| Antigravity | — (suggested: TASK-010) | — | Available |
| Freebuff | — (suggested: TASK-018) | — | Available |

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
| `src/merge.js` | — | TASK-011 | Available |
| `src/fx.js` | — | TASK-012 | Available |
| `src/traffic.js` | — | TASK-012 / TASK-014 | Available |
| `tools/characters.html` | — | TASK-018 | Available |
| `src/npc.js`, `src/camera.js`, `src/spatial.js`, `src/music.js`, `src/characters.js` | — | — | Available |
| `tools/qa/gameplay.mjs`, `tools/qa/prologue.mjs` | — | — | Available |

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

---

# 🚨 BLOCKERS / DECISIONS NEEDED

- **OrleaRouge placement (human).** The script's next region is a big city. Is
  it (a) a new region added to this map (the map would need to grow south), or
  (b) a separate level loaded when you take the highway south? This blocks TASK-016 / TASK-017.
- **Dev server restart (human).** A server started before `serve.mjs` gained
  the playlist endpoint 404s on `assets/music/playlist.json`. The game falls
  back to the theme; restart `start-game.cmd` to pick it up.
- Open design questions carried over: how weak should the police be (spawn
  distance, count, give-up timer)? Is the map scale right, or should the towns
  sit closer together?

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

---

# 🧪 TESTING STATUS

**Last known test status:**
- Free roam (`tools/qa/gameplay.mjs`): **pass** (re-run after the map grew south).
- Prologue (`tools/qa/prologue.mjs`): **pass** (re-run; hands off to Act One).
- Act One (`tools/qa/actone.mjs`): **pass** (re-run; all 12 steps).
- Causeway + OrleaRouge (`tools/qa/orlearouge.mjs`): **pass** (2nd run, screenshots verified).

**Last tested by:** Claude (headless Chromium / SwiftShader)

**Last tested at:** 2026-09-12

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
