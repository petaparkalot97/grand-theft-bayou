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

---

# 🔒 ACTIVE TASKS

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
  - **Part C:** Governor Bellefontaine and Mercer at the Chatboro Sheriff's
    Office, the observation platform with Solange, the montage + V.O., the
    threatening phone call, "MISSION UNLOCKED: WELCOME BACK TO DIXIE", and the
    final elevator cinematic.
- [ ] `TASK-017` (original scope) — **Act One's later beats**: the threatening phone call ("Your mother's house is very pretty"), Governor Bellefontaine's meeting with Mercer, the flood tunnel and the Nirbayou Nolantis descent. Needs TASK-009 and TASK-016.
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
- **Time of day:** read `worldTime` (`getCurrentTime()`, `isNight()`, `dusk`). Never keep a private timer; `state.dusk` is a copy for older code.
- **Weather:** read the blended multipliers (`weather.fogMultiplier`, `weather.grip`, …), not `weather.type`.
- **Money and guns:** cash is `state.cash`; the weapon slot is `state.weapon` / `state.ammo`, through `arsenal`. Drops go through `loot.dropFor(npc)` / `loot.dropAt()`.
- **New districts:** build them with `composer.js` in stage order (road → buildings → side streets → open areas → vegetation → landmark), and plan later pieces with `site()` first.
- **Popeyes:** only `POPEYES_LOCATIONS`. Nothing else calls `makePopeyes`.
- **Palette-atlas models** (Designersoup cars): nearest filtering, no mipmaps, `realize(…, { noDerive: true, keepPixelFilter: true })`, or the swatches bleed and glitter.

---

# 🧪 TESTING STATUS

**Last known test status:**
- Controls + gas cans (`tools/qa/controls.mjs`): **32/32** (re-run after TASK-034: all 5 cans reachable, 2 m on foot, driving past 2.8 m off, glow columns).
- World pass (`tools/qa/worldpass.mjs`): **7/7** (Popeyes, loot tables, a real kill, pickups, weapon slot, world time, weather).
- Lafourchette (`tools/qa/eastbank.mjs`): **9/9** (stage order, no building on a road, spawn zones, culling, frame time, walking and driving east).
- The buggy's flicker: before/after probe (parked speckle metric, 8-frame driven contact strip).
- Free roam (`tools/qa/gameplay.mjs`): **pass** (re-run after the map grew south).
- Prologue (`tools/qa/prologue.mjs`): **pass** (re-run; hands off to Act One).
- Act One (`tools/qa/actone.mjs`): **pass** (re-run; all 12 steps).
- Causeway + OrleaRouge (`tools/qa/orlearouge.mjs`): **pass** (2nd run, screenshots verified).

**Last tested by:** Claude (headless Chromium / SwiftShader)

**Last tested at:** 2026-09-13

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
