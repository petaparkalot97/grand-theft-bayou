# AGENT_LOG.md — Multi-Agent Development Log

> Shared communication and technical-discovery log for the project's AI
> development team.
>
> `TODO.md` answers **"What are we doing?"**
> `AGENT_PROTOCOL.md` answers **"How do we work together?"**
> This file answers **"What did we discover, decide, or hand over?"**

**Append-oriented.** Add new entries at the top of each section. If an entry
goes stale, add a new one saying why; don't rewrite history.

---

## 🗓️ LOG FORMAT

```md
## YYYY-MM-DD HH:MM — Agent Name

**Type:** DISCOVERY | DECISION | HANDOFF | BLOCKER | TEST | WARNING
**Task:** TASK-XXX

### Finding
What you discovered.

### Impact
Why another agent needs to know.

### Action
What was changed, or what the next agent should do.
```

Task IDs refer to `TODO.md`. Entries dated 2026-09-12 were written by Claude
when the board was set up; they summarize the work done before the multi-agent
setup existed (TASK-001 … TASK-009).

---

# 🧠 DISCOVERIES

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-032

### Finding
1. **Tusouxroe's shopfront rows sat on US-167.** This bug predates today's
   work. `buildLevel` laid the Buildings.glb rows out from x = −70 stepping
   *east* (`bx += w·0.6 + 3`), so they ran across the highway at z −62 and
   −94. A diagnostic drive north accelerated to 18.9 m/s, then stopped dead at
   z ≈ −54 against a shop's blocker. The road to the escape truck was cut off,
   and neighbouring shops overlapped each other.
2. **Camera inside tall buildings.** The blocker-circle pull-in only runs when
   `want·sin(pitch) < 8`, so from the default on-foot angle a shopfront taller
   than the lens swallowed the camera (the Main Street screenshot).
3. **`Raycaster` crashes on Sprites unless `raycaster.camera` is set.** Set it
   when raycasting the whole scene in diagnostics.

### Impact
(1) Driving north through Tusouxroe, and reaching the truck. (2) Any tall
building near where the player walks. (3) Scene raycasts in QA scripts.

### Action
(1) Rows now step *west* from x = −44 (past the Popeyes lots) with 3 m gaps;
Main Street's length and its potholes follow the rows (`mainStreetWest`).
(2) Tusouxroe shopfronts and OrleaRouge rowhouses / towers / hospital are
registered as camera occluder boxes. (3) Noted here; re-test running.

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-031

### Finding
1. Camera collision only handled walls (blocker circles in the grid). Near the
   causeway overpass, the chase camera ended up above the deck, looking down
   through it: a solid grey screen.
2. Placing a car in the northbound lane (x = ROAD_X + 2.4) and driving south
   jams it: oncoming traffic stops for the player and never passes.
   **US-167 traffic is right-hand: southbound is x = ROAD_X − 2.4.**

### Impact
(1) Any future overhead structure (bridge, awning, elevated road) needs the
same treatment. (2) Tests and scripted scenes that put the player on the road
should use the correct lane.

### Action
(1) `camera.js`: `setOccluders([{ minX, maxX, minY, maxY, minZ, maxZ }])`; the
camera casts a ray toward itself and pulls in in front of any box it hits.
`orlearouge.js` exports the overpass deck as `occluders`. (2)
`tools/qa/orlearouge.mjs` now starts in the southbound lane. Re-test running.

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-009

### Finding
Two bugs from the Act One walkthrough screenshots:
1. `Hoodrat.update()` (`characters.js`) wrote `position.y = 0` every frame
   (and the walk bob on top). Actors placed in the underground kitchen
   (y = −40) snapped back up to street level. The kitchen looked empty, and
   Emiko stood on the lawn in the establishing shot.
2. In `ledgerboard.js`, a CSS `transform` on an SVG `<g>` **replaces** its
   `transform="translate(...)"` attribute, so every card rendered at the
   origin, hidden under the letterbox. Only the red strings were visible.

### Impact
(1) Any story scene that stands a character on a floor that isn't ground
level. (2) Any SVG overlay that animates with CSS transforms.

### Action
(1) Actors honour a per-actor `baseY` (default 0). Set `actor.baseY` when
placing someone on a raised or lowered floor, and reset it to 0 when they
return. (2) Cards now use an outer `<g transform>` for position and an inner
`<g class="card">` for the CSS animation. Re-test pending.

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-009

### Finding
`cine.scene()` scenes could run concurrently. When the first one ended, its
`finally` cleanup reset shared state (`skipping`, `inScene`, letterbox, camera
shot) out from under the second, so Esc silently stopped working mid-scene.
The Act One headless walkthrough exposed it: the "Mission 1" card was still up
when the stampede cutscene started.

### Impact
Any story code that triggers a scene while dialogue is running (a mid-chase
bark, then a scripted cutscene) hit this.

### Action
`cinema.js` now queues scenes: a scene requested during another waits for it
to finish. **Never `await cine.scene(...)` from inside another scene; it would
wait for itself.** Re-test pending (see TASK-009).

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-002

### Finding
The frame-cost bottleneck is **draw calls**, not AI or physics. Baseline
(headless, HIGH, 1280×720): sim 0.9 ms, AI 0.55 ms, render submit 15.8 ms,
1,259 draw calls for 1,434 meshes. Every mesh is drawn by several passes
(shadow map, main view, GTAO normals, road mirror). 3D Hoodrats were about 45% of
all meshes (~50 parts each).

### Impact
Performance work should target mesh / draw-call count first.

### Action
`mergeRigid` + `batchStatic` (`src/merge.js`): meshes 1,434 → 866, draw calls
1,259 → 450. Driving views still peak at ~1,160–1,850 (see TASK-012).

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-002

### Finding
Adding a light to the scene, or toggling a light's `.visible`, changes the
light count, which recompiles **every** lit shader: a visible hitch. The old
light pool toggled `.visible`; muzzle, wreck and police-beacon lights were
created on first use.

### Impact
Any new gameplay light will hitch if created mid-game.

### Action
Lights are created at load and parked at intensity 0. Static lights go through
the nearest-8 pool (`poolLight` / `litSpots` in `main.js`).

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-001

### Finding
`realize()` (`src/graphics.js`) swaps any material that isn't tagged
`userData.gtbRealized = true` for a MeshStandard / MeshPhysical material. It
runs once over the whole scene after `buildLevel()`.

### Impact
An untagged ShaderMaterial, SpriteMaterial or deliberately-basic material added
before that sweep gets silently replaced.

### Action
Tag custom materials. Name a material (e.g. `"steel pole"`) if you *want*
realize to classify it.

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-001

### Finding
three.js clones `Vector3` / `Color` uniform values per material, but copies
**plain objects by reference**. `MIST` in `graphics.js` is a plain `{x, y, z}`
object shared by every fogged program, so one write updates them all.

### Impact
Don't "fix" `MIST` into a `THREE.Vector3`; that would silently freeze the mist.

### Action
None. Documented in the code as well.

## 2026-09-12 — Claude
**Type:** DISCOVERY · **Task:** TASK-002

### Finding
Two FBX packs request textures that don't exist where the FBX says:
Designersoup cars (one folder above their `.fbm`) and the Trailer Park
characters (an absolute `C:/Users/srkak/...` path). The loaders replace those
materials anyway.

### Impact
They were console 404s on every load.

### Action
A `LoadingManager.setURLModifier` in `main.js` redirects them. Load now ends
with 0 errors (verified headless).

---

# 🏗️ ARCHITECTURAL DECISIONS

## 2026-09-12 — Claude (decision by the human)
**Type:** DECISION · **Task:** TASK-031

### Decision
OrleaRouge is built as a **new region on this map**, which grows **south**
(+z), not as a separate level.

### Layout
- x stays ±136. z now runs from −136 (Tusouxroe city limits, north) to **382**
  (OrleaRouge riverfront, south).
- z 60…136: Chatboro (unchanged). z 136…190: bayou causeway (US-167 over open
  swamp, overpass, refinery glow). z ≈ 195…380: OrleaRouge. US-167 becomes the
  city's main boulevard at x = ROAD_X; the river lies beyond z = 382.

### Impact
- Use `MAP = { minX, maxX, minZ, maxZ }` in `main.js`, never `±WORLD`, for any z
  bound. `createNpcSystem({ bounds })` accepts that object.
- Traffic lanes may now run east–west. `traffic.js` spawns from the point on
  each lane nearest the player, and `maxCars` caps the pool.
- The region lives in `src/orlearouge.js` (same shape as the story modules:
  `buildSet()`, `update(dt)`, plus `pois`, `lanes` and `keepout` data for
  `main.js`).

## 2026-09-12 — Claude
**Type:** DECISION · **Task:** —

### Decision
`src/main.js` is owned by the orchestrator (Claude). Other agents build or
extend modules and document the interface; Claude integrates.

### Reason
`main.js` is ~2,500 lines, and almost every feature needs a hook in it. It's
the file most likely to produce conflicting edits.

### Impact
Put new systems in `src/<system>.js` with a `create…()` factory, and describe
the wiring as *Integration notes* on the task.

## 2026-09-12 — Claude
**Type:** DECISION · **Task:** TASK-008, TASK-009

### Decision
Story content lives in per-act modules (`prologue.js`, `actone.js`) as phase
machines on top of `cinema.js`. They get the world through a `ctx` object from
`main.js`, never by importing `main.js`. Each exposes a `debug(step)` QA hook.

### Reason
It keeps story code out of `main.js`, lets agents work on different acts in
parallel, and makes every beat testable headlessly.

### Impact
New acts (OrleaRouge, …) should follow the same shape: `createActX(ctx)` →
`{ buildSet(), start(), update(dt), phase, debug(step) }`.

## 2026-09-12 — Claude
**Type:** DECISION · **Task:** TASK-004

### Decision
Traffic is lane-following on polylines, not general navigation. The map is one
highway (US-167, x = ROAD_X ± 2.4).

### Impact
New roads add a lane definition (`points`, `cruise`) to `createTraffic`.

## 2026-09-12 — Claude
**Type:** DECISION · **Task:** TASK-003

### Decision
NPCs are neutral by default. Each has a temperament (hothead / brave / timid /
lookout; hogs territorial / skittish) and a home area, and turns hostile only
when provoked, when violence happens nearby, or (for aggressive temperaments)
at close range. There are never more than 7 hostile at once.

## 2026-09-12 — Claude
**Type:** DECISION · **Task:** TASK-009

### Decision
South Tusouxroe sits in the open north-east corner (centre ≈ 92, −100; street
z = −106). The Nadia kitchen is a sealed room directly beneath it at y = −40.

### Reason
A headless scan of blockers and object footprints found that corner to be the
largest open area near the road. An underground room needs no second level and
can't be seen from outside, and the road-mirror pass disables itself below the
road plane.

---

# 🔁 HANDOFF HISTORY

*None yet.*

---

# ⚠️ WARNINGS / FAILED APPROACHES

## 2026-09-12 — Claude
**Type:** WARNING

- **Don't generate textures at module top level.** Seconds of synchronous
  canvas work before `boot()` froze the menu on "loading assets…". Stage
  heavy work inside `boot()` behind `await paint()`.
- **Keep `TIERS[*].derive` at 256–512.** Higher makes the material pass look like
  a hang for no visible gain.
- **Don't toggle light `.visible`.** See Discoveries.
- **Don't start a cutscene from inside another cutscene.** Scenes queue now; a
  nested `await` deadlocks.
- **Headless fps is meaningless.** SwiftShader renders in software, so use draw
  calls / CPU ms instead.
- **Tooling:** backslash escapes inside Bash heredocs got mangled when writing
  edit scripts. Write scripts with a file-writing tool instead, or avoid
  backslashes (e.g. `String.fromCharCode(13, 10)` for CRLF).
- **Tooling:** piping a JSON test log through `tail` cut off its first half.
  Redirect the full log to a file under `tools/qa/out/`.

---

# 🧪 TEST RESULTS

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-032 regressions (shopfront rows moved, building camera occluders)

- `tools/qa/gameplay.mjs`: at rest 0 hostile; shots → 2 flee, 1 hostile; walk,
  pointer lock, right-drag, drive and exit OK; traffic pool 12; vehicles 66;
  HP 100. Draw calls 491–576 on foot, 1,324 driving.
- `tools/qa/orlearouge.mjs`: drive into the city (z 267), entry V.O. fires;
  city NPCs are people only, none hostile; **gunfire in the French District →
  3 flee, 0 hostile** (the city bystander reaction is now confirmed). Draw
  calls 257–511 on foot.
- Console in both: only the known `playlist.json` 404.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-032 (potholes), second run

- `tools/qa/potholes.mjs`, headless HIGH 1280×720, after the shopfront-row fix
  and the building camera occluders:
  - **40 / 40 / 40** potholes (US-167 Tusouxroe / Main Street / South
    Tusouxroe), no overlaps, 48 wet, **6 instanced meshes** in total.
  - Drive north on US-167 (northbound lane, from z −30): **77.6 m travelled**
    (the first run stopped after 24 m against a shopfront on the road), reached
    66 mph, **11 pothole hits, peak jolt 0.71, body pitch 0.032 rad**. It
    stopped at z ≈ −108, at the escape truck parked at the end of the highway.
  - Draw calls in Tusouxroe: 164–377 on foot, 274 driving.
  - Screenshots: potholes on South Tusouxroe street, Main Street (camera
    outside the buildings now, shopfront row set back west), US-167 clear ahead.
  - Console: only the known `playlist.json` 404.

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-031 regressions (map grown south, traffic spawning on any lane, camera occluders)

- `tools/qa/gameplay.mjs`: at rest 0 hostile; 4 shots → 2 flee, 0 hostile; walk,
  pointer lock, right-drag, drive and exit OK; 12-car traffic pool; vehicles
  flat at 66; HP 100. Draw calls 560–894 on foot, 1,279 driving.
- `tools/qa/prologue.mjs`: every phase in order; hands off to Act One. HP 100.
- `tools/qa/actone.mjs`: all 12 steps pass.
- Console in all three: only the known `playlist.json` 404.

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-031 (causeway + OrleaRouge)

- `tools/qa/orlearouge.mjs`, headless HIGH 1280×720, second run (after the
  camera occluder fix and the southbound-lane test fix):
  - Drove from the causeway (z 146) to z 267 in the city; entry V.O. played.
  - On foot, French District / downtown / riverfront / overpass camp: 7–15
    NPCs near each (people only in the city), none hostile; HP 100.
  - Traffic active on boulevard + all four cross-street lanes (12-car pool).
  - Draw calls: 232–426 on foot in the city, 262 driving in the city, 981 on the
    causeway facing the skyline.
  - Screenshots: towers and wet-street reflections, balconies, the promenade,
    and the camera beneath the overpass deck (the first run showed a grey
    screen there; fixed).
  - Console: only the known `playlist.json` 404.
- Not covered: city bystanders reacting to gunfire (no NPC was within the noise
  radius during the test).

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-009 regressions (after the `cinema.js` scene queue + `characters.js` `baseY`)

- `tools/qa/prologue.mjs`: every phase in order; the ending hands off to Act One
  (objective "Go home to South Tusouxroe…"). HP 100.
- `tools/qa/gameplay.mjs`: at rest 0 hostile; 5 shots → 4 flee, 1 hostile; walk,
  pointer lock, right-drag, drive and exit OK; traffic pool 8; vehicles flat at 62;
  HP 100. Draw calls: 484–834 on foot, 1,234 driving.
- Console in both: only the known `playlist.json` 404 (dev server predates the endpoint).

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-009 (Act One), third run

- `tools/qa/actone.mjs` (polling version), headless, after the `baseY`, ledger-card
  and framing fixes: **all 12 steps pass** (prologue speed-run → Act One starts →
  establishing → door → kitchen → board appears → board fills → done).
- Screenshots verified: both crews in frame; Keseme and Emiko at kitchen floor
  height; 12 cards + strings + highlighted Pelican Crown + Nolantis link; the
  post-scene camera faces the house.
- HP 100. Console: only the `playlist.json` 404 from a dev server started
  before the playlist endpoint existed.
- Earlier run 2 also reached `done` but showed the visual bugs logged under
  Discoveries.

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-009 (Act One)

- `tools/qa/actone.mjs` (fixed-sleep version) **did not reach Act One**: it
  stalled in the prologue stampede because of the overlapping-scene bug above.
- Fixed in `cinema.js`; the test was rewritten to poll for phases. **Re-run pending.**

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-008 (Prologue)

- `tools/qa/prologue.mjs`, headless, twice. Every phase reached in order: menu →
  cold open (letterboxed) → phone call → chase (Bravado visible, locked, moving)
  → stampede (14 hogs) → hogs → retrieve (Bravado unlocks) → ledger → free roam.
- HP stayed 100. No console errors from the story. The only error was a
  `playlist.json` 404 from a server running the old `serve.mjs`.
- Visual fixes confirmed by screenshot: hogs scatter naturally, and the fence
  lies flat.

## 2026-09-12 — Claude
**Type:** TEST · **Task:** TASK-002…TASK-006 (free roam)

- `tools/qa/gameplay.mjs`, headless HIGH. At rest: 0 hostile NPCs. 5 shots → 6–8
  flee, 0–2 hostile. Walk, pointer lock + mouse move, right-drag, drive and exit
  all work. Traffic: 8 pooled cars, always in their lanes, vehicle count flat.
- Render submit 10–16 ms at rest; draw calls 500–780 on foot, ~1,850 peak driving.
- Load with 0 console errors, 0 failed requests (after the FBX URL fix).
- **Not testable headless:** Esc releasing pointer lock, real GPU frame rate,
  sound effects.

---

# 🔍 PERFORMANCE INVESTIGATIONS

Headless Chromium (SwiftShader), HIGH tier, 1280×720, 2026-09-12. CPU-side ms.

| Stage | Meshes | Draw calls | Tris | Sim ms | AI ms | Render submit ms |
|---|---|---|---|---|---|---|
| Baseline, after light pool + native res | 1,434 | 1,259 | 279k | 0.88 | 0.55 | 15.8 |
| + collision grid, mergeRigid, batchStatic | 866 | 450 | 171k | 0.45 | 0.14 | 12.3 |
| Free roam with NPC system + traffic, on foot | — | 500–780 | — | 0.5–0.8 | 0.1–0.4 | 10–16 |
| Same, driving | — | ~1,850 peak | — | 0.6 | 0.13 | 22 |

Mesh breakdown before merging: NPC 643, static 705 (406 materials, 152 distinct
material setups), vehicles 156, shadow casters 1,143.

---

# 🔌 INTERFACE CONTRACTS

All are ES module factories. `main.js` creates them and passes what they need.

### `src/spatial.js` — BlockerGrid
```js
const grid = new BlockerGrid(8);            // cell size (m)
grid.addStatic({ x, z, r }); grid.addDynamic(vehicleBlocker); grid.remove(b);
grid.near(x, z, radius, (b) => stop?);      // visit candidates
grid.resolve(nextVec, radius, outVec, skipBlocker) -> hit?
```

### `src/merge.js`
```js
mergeRigid(root, joints)                    // bake parts per joint + material
batchStatic(scene, { exclude: (root) => bool, cell: 48 }) -> { meshes, removed, batches }
```

### `src/npc.js`
```js
const npcs = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds });
npcs.init(record); npcs.beginFrame(dt);
npcs.update(record, dt, { player, driving, others }) -> animateThisFrame
npcs.noise(x, z, radius); npcs.provoke(record); npcs.release(record); npcs.hostileCount
```

### `src/traffic.js`
```js
const traffic = createTraffic({ scene, lanes: [{ name, points: [[x,z]...], cruise: [min,max] }],
  models, registerVehicle, perLane });
traffic.update(dt, focusPos, obstacles /* [{x,z}] */, playerVehicle); traffic.cars
```

### `src/camera.js`
```js
const cam = createCameraController({ camera, dom, canCapture: () => bool });
cam.update(dt, targetPos, vehicleOrNull, blockerGrid); cam.yaw; cam.addYaw(a); cam.locked; cam.release();
```

### `src/music.js`
```js
const soundtrack = await createSoundtrack(audioEl, { fallback: url });
soundtrack.play(); soundtrack.next(); soundtrack.tracks; soundtrack.current
```
Playlist: `assets/music/playlist.json` (live from `serve.mjs`, or written by `npm run build`).

### `src/fx.js`
```js
addLamp(scene, { x, y, z, warm, range, pole });
const headlights = createHeadlights(scene); headlights.update(dt, vehicleOrNull);
const wet = createWetRoads(renderer, scene, camera); wet.collect(scene);
wet.setQuality(fraction, everyNthFrame); wet.render(); wet.resize(); updateFx(dt);
```

### `src/cinema.js`
```js
const cine = createCinema({ camera, muted: () => bool });
await cine.scene(async (c) => { c.letterbox(true); c.shot({ from, to, look, lookTo, dur });
  await c.say(who, line); await c.caption(text); await c.card(kicker, big, sub, { center, hold });
  await c.title(text); await c.black(on, s); c.sfx("shotgun"|"gunshot"|"siren"|"ring"|"squeal"|"static"|"chime"); });
cine.update(dt); cine.active; cine.hasCamera; cine.skipping
```
Scenes queue; never await one scene inside another.

### `src/prologue.js` / `src/actone.js`
```js
const act = createPrologue(ctx) | createActOne(ctx);
act.buildSet();        // during buildLevel, before lamps / realize / batching
act.start(); act.update(dt); act.phase; act.debug(step);
// prologue: act.skip() (free roam), act.props, act.vehicles; ctx.onFinished starts Act One
```
The `ctx` fields are listed in each file's JSDoc.

### `src/potholes.js` (TASK-032)
```js
const potholes = createPotholes({ scene, perStreet: 40, seed,
  streets: [{ name, x0, x1, z0, z1, y }] });      // axis-aligned road areas
potholes.list      // [{ x, z, r, y, rot, wet, street }]
potholes.counts    // { streetName: n }
potholes.meshes    // InstancedMeshes: holes + standing water, 2 per street
potholes.hitTest(x, z, radius) -> { depth: 0..1, hole } | null
```
`drivingUpdate` in `main.js` calls `hitTest` with the car's position and
radius. A new hole sets `v.jolt` (speed loss, body pitch / roll, camera shake)
and counts `v.potholesHit`. Placement is seeded (`seed: 20260913`), so potholes
never move between loads.

### `src/ledgerboard.js`
```js
const board = createLedgerBoard();
board.show(); board.addCard(id, label, x, y, { sub, w, hot, tilt }); board.link(a, b);
board.stamp(text, x, y, { size }); board.hide(); board.reset();   // SVG space 1600×900
```

### `src/characters.js`
```js
makeHoodrat({ sex: "m"|"f", crew: "red"|"blue"|{cloth, chain, shoe, hat}, seed, height,
  skin, top, denim, hair, headwear: "band"|"none"|"hat", beard, curly })
// same surface as AnimatedSprite: play / update / setFlip / finished / material.opacity
```

---

# 🧹 CLEANUP NOTES

- `prologue.debug()` and `actOne.debug()` exist for headless QA. Keep them, but
  never call them from gameplay.
- `CAM_OFFSET` in `main.js` is only used to place the camera at boot.
- `TODO.md` used to hold a long narrative history. Its technical content now
  lives here and in `README.md`.
- `tools/characters.html` predates the story options in `characters.js` and
  doesn't expose them yet.

---

# 📚 LONG-LIVED PROJECT KNOWLEDGE

- **Run** with `npm start` / `node serve.mjs 8899` / `start-game.cmd`. Never
  `file://` (ES modules won't load; `index.html` shows an explanation).
- **No build step, no bundler, no npm dependencies.** Three.js r160 from jsDelivr.
  `npm run build` only writes the music playlist, for Cloudflare Pages.
- **CRLF** in the working tree for `main.js`, `graphics.js`, `index.html`,
  `README.md` and `TODO.md`; `.gitattributes` normalizes to LF (`*.cmd` stays CRLF).
- **Map.** US-167 runs north–south at x = ROAD_X (−6). South: Chatboro
  (spawn z ≈ 130, trailer park, swamp). The strip of businesses lines the
  highway. North: Tusouxroe (shopfronts x −66…−44, truck lot, water tower
  at 52, −92). South Tusouxroe is in the north-east corner. There are no trees
  north of z = −50. The Mission 1 dirt road runs east at z ≈ 43 to the crash
  site at (86, 26).
- **Tiers.** `4K ULTRA / HIGH / BALANCED / PERFORMANCE`; the governor steps
  down only; `[` `]` override. Headless always drops to PERFORMANCE unless the
  test forces HIGH.
- **Story source.** The user's script ("GRAND THEFT BAYOU — Prologue: Mud, Blood &
  Magnolia", protagonist Keseme Nadia, the state of Dixie Beaux). The Prologue,
  Mission 1 and the opening of Act One are implemented; later beats are in
  `TODO.md`.
- **Graphics pipeline** (`src/graphics.js`). `realize()` classifies materials
  by name into paint / chrome / glass / rubber / asphalt / masonry / sheet /
  wood / foliage / fabric / plastic / skin, and derives normal + ORM maps from
  each albedo. The sky goes to a PMREM probe for IBL, re-baked as `state.dusk`
  advances. Post chain: RenderPass → GTAO → bloom → OutputPass → grade → SMAA.
  Loading stays staged behind `await paint()` inside `boot()`.
- **Enemy system.** Hogs (3D, charge), Rednecks (billboard sprite), Hoodrats
  (3D actors from `characters.js`, the same interface as `AnimatedSprite`). The
  police stay dormant until 12 Rednecks / Hoodrats are killed (`HEAT_KILLS`).
- **Asset usage.**

  | Pack | Used for |
  |---|---|
  | `APIgqp.jpg` / `S4KKpl.jpg` | Redneck sprite atlases (`tools/slice_sprites.py`) |
  | `Dead Swamp` | glowing mushrooms, bamboo torches (`tools/slice_swamp.py`) |
  | `PSX_Vehicle_Pack` | wrecks, parked cars, the escape truck, the sheriff prototype, story coupe / Bravado / Bubba's pickup |
  | `Designersoup Low Poly Car Pack` | drivable cars incl. the DeLorean |
  | `Gas_station` / `6twelve` | strip landmarks (FBX) |
  | `Buildings.glb` | Tusouxroe shopfronts |
  | `Tacos.glb`, `BurgerPiz.glb` | strip landmarks, filtered to their main meshes |
  | `Trailer_Park` characters | static pedestrians |
  | `Urban_Modular_Demo` | shack walls, streetlamp, stop sign |
  | Not used | Downtown City MegaKit, Retro PSX Mansion, Trashville, Pizzeria_Scene.glb (100 MB), Shacks .blend (textures used via stylised builders), 2D tilesets |

- **Deploy.** Cloudflare Pages: `wrangler.jsonc` sets
  `pages_build_output_dir = "."`, and `npm run build` writes the music playlist.
  OG / Twitter meta in `index.html` is hardcoded to
  `https://grand-theft-bayou.pages.dev/`; change those 4 URLs if the Pages
  project name differs. `og.png` is built by `tools/make_og.py`.
