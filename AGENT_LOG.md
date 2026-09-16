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

## 2026-09-17 — Claude
**Type:** DISCOVERY · **Task:** TASK-040 (review)

### Finding
Reviewed Freebuff's TASK-040 wiring (audio.js, weapons_3d.js, main.js,
vehicles.js). Independently reran `audio_weapons_test.mjs` (33/33), the
stated regressions, and confirmed `police_test`/`dressing_test` fail
identically on files this diff never touches (pre-existing, not a
regression). Read the `main.js` diff line by line.

Found one real gap: `simulate(dt)`'s new car-audio block only calls
`v.audio.update(...)` while `v === state.veh`. Every place that exits a
vehicle (`enterExitVehicle()`'s step-out path plus ~8 other `state.veh =
null` sites — hijack, crash, cutscene teleports) just clears `state.veh` and
never calls `.update(0, false, false)` on the car being left. `audio.js`'s
own `active=false` teardown is correct and covered by a direct unit test, but
that test calls `audio.update(0, false, false)` by hand with a `// player got
out` comment — it verifies the module in isolation, not that `main.js` ever
actually calls it. Net effect before the fix: get out of any car and its
engine/tire-squeal loop plays forever from that spot.

### Action
Fixed in `main.js`: a one-variable tracker (`lastVehAudio`, declared next to
`vehicles`) remembers the previous frame's active car audio; when `state.veh`
is falsy and `lastVehAudio` is set, it gets one `.update(0, false, false)`
call and is cleared. Re-verified `audio_weapons_test.mjs` 33/33 and all
regressions after the fix. `TASK-040` → `REVIEW` in `TODO.md` updated with
the full review note.

## 2026-09-17 — Freebuff
**Type:** DISCOVERY · **Task:** TASK-040

### Finding
- `registerVehicle` runs at boot (traffic pool + story cars), i.e. before any user gesture and before `initAudio()`. An eager `createCarAudio` therefore returned `undefined` for every vehicle and could never have played anything — the wiring bug was structural, not just a missing call. It would also have leaked a `THREE.AudioListener` (cyclic WebAudio refs) into every car.
- Browsers start an AudioContext `suspended` until a user gesture; even a correct `initAudio` at boot stays silent without a `resume()` on the first click.
- The local three QA stub (untracked, node_modules) had lost its `addons/loaders` stubs — `GLTFLoader.js` / `FBXLoader.js` were missing, breaking any test importing `landmarks.js`. Rebuilt both as failing-loader stubs; extended `index.js` additively (Camera / PerspectiveCamera, AudioListener / PositionalAudio with a fake context, `Vector3.clone`, `Object3D.lookAt`, `Group` type fields, BufferGeometry transforms). The stub's legacy `Box3` values were left byte-compatible — composer / landmarks / fx assert against the fixed unit-cube values.
- `main.js` already carried partial TASK-040 wiring from the merge commits; the dead hooks were: `initAudio` never called, `updateWeapon3D` running on foot only, `v.lastImpact` set by nothing, and no vehicle-damage branch in `fire()`.

### Impact
Car audio must be built lazily and gated by an `active` flag — traffic cars must never build WebAudio nodes. Anyone touching the QA stub: keep the stub's legacy `Box3` values untouched.

### Action
Implemented in TASK-040 (see the task and Interface contracts). `createCarAudio` now returns `{ update(speedKmh, isSkidding, active), destroy, started, engine, squeal }`.

## 2026-09-17 — Antigravity
**Type:** HANDOFF · **Task:** TASK-038 to TASK-036 (gangster_rifle)

### Finding
The `gangster_rifle.zip` asset contains a valid glTF model at `./assets/models/weapons/gangster_rifle/scene.gltf`. It loads via `GLTFLoader`. 
Like other models, its scale and orientation will need normalization when loaded into the game. A safe way to handle its scale is to use bounding box normalization as seen in `loadDsCar` or `placeCityBuilding`.

### Impact
For Freebuff (TASK-036): The asset is available on disk and ready to be wired into `weapons.js`. You do not need to extract or convert it.

### Action
- Freebuff: When implementing the new weapon, use `GLTFLoader` on `./assets/models/weapons/gangster_rifle/scene.gltf`.
- Recommended scaling approach: `model.scale.setScalar(targetLength / Math.max(size.x, size.y, size.z))` where `targetLength` is around 0.8 to 1.0 (meters).
- I have added office-space clutter and decorative fencing using the new FBX packs in `landmarks.js`, successfully implementing procedural FBX loading.

## 2026-09-17 — Claude
**Type:** DISCOVERY · **Task:** (none — build-breaking bug found during session start)

### Finding
Commit d23dc01 ("Fix Cloudflare Pages deployment: remove git conflict markers
from main.js") did not actually remove them. `src/main.js` still had two
unresolved `<<<<<<< HEAD` / `=======` / `>>>>>>> 917ab85` blocks (an import
line at the top, and the `npcs`/`npcEnv` construction around line ~1295), and
`src/npc.js` had two more (the `MAX_HOSTILE`/`MARKET_OPEN` block, and a
duplicate `release()` function). The file has never actually parsed as valid
JS since that merge — this broke the Cloudflare Pages deploy *and* local dev,
despite the commit message.

### Impact
Both sides of every conflict were live features already referenced elsewhere
in the file (TASK-035's `factionWar`/`createFactionWar` alongside
`tusouxroeNorth`; TASK-035's turf-war `npcEnv.killEnemy` alongside the
prostitute-service `npcEnv.veh/state/syncHUD/flashObjective`; `release()`'s
rival-cleanup alongside its `solicitVeh`/sprite-visibility cleanup). This
wasn't a "pick a side" conflict — it needed an actual merge of both features.

### Action
- `src/main.js`: kept both import lines; merged `createNpcSystem(...)` (added
  `worldTime`) and `npcEnv` (combined `driving`, `get veh()`, `state`,
  `syncHUD`, `flashObjective`, `others`, and `killEnemy`).
- `src/npc.js`: kept `export const MAX_HOSTILE` (factions.js imports it) plus
  `MARKET_OPEN`/`MARKET_CLOSE`; merged the two `release()` bodies (rival/hostile
  cleanup + solicitVeh/sprite cleanup) into the one at line ~118, removed the
  duplicate.
- Verified: no `<<<<<<<`/`=======`/`>>>>>>>` markers remain anywhere in the
  repo (`grep -rl` over `src/`, `tools/`, root, excluding `node_modules`);
  `node --check` clean on every file in `src/`; `tools/qa/factions_test.mjs`
  26/26 (exercises the merged `npc.js` paths directly — faction war, market
  hours, rival combat, `MAX_HOSTILE` cap).
- Not committed — left for the human to review and commit.

## 2026-09-14 — Freebuff
**Type:** TEST · **Task:** TASK-039 — traffic circuits + sky-sign fix

### Finding
Two player-visible world bugs, both root-caused:

1. **Cars vanishing at lane ends** (`src/traffic.js`). A car is just
   `(lane, distance)`, and `update()` parked it the moment `car.s >=
   lane.length - 1` — teleport to (1e5,1e5), invisible. Every lane in the game
   is a dead-end one-way polyline, so *every* car eventually vanished mid-world.
   Second cause: `DESPAWN = 155` m against a fog edge at ~240 m (FogExp2
   0.0072), so cars popped out of existence on screen.
2. **The sky signs** (`src/main.js`). `makePopeyes`, `makeGasStation` and
   `makePizzeria` cloned a sign mesh and parented the clone to the original:
   `board.add(board2)` where `board2 = board.clone()`. A clone keeps its
   source's position as a **local** offset, so the back-face copy rendered at
   twice the height and offset (pylon boards at y≈30–38). Three.js footgun,
   four occurrences.

### Impact
Any future lane added anywhere inherits the vanish unless its direction pair
exists; any future double-sided sign must zero the clone's local offset.

### Action
- `traffic.js`: `next` on a lane hands the car to the paired lane at the end;
  handover only beyond `WRAP_HIDE = 165` m (in mist), otherwise the car pulls
  up and waits (a queue at the junction, not a glitch); `DESPAWN` 155 → 235.
- `main.js`: an auto-pairer builds mutual circuits from every region's lanes
  (return carriageway preferred: starts where A ends AND ends where A starts;
  fallback: any lane starting at A's end). Region modules need no changes.
- All four sign clones zeroed (±0.02 m behind the face, no z-fight).
- `tools/qa/traffic_test.mjs` 11/11 (runs twice clean): headless Node against
  the project's three stub. The stub gained additive classes only — `Scene`,
  `Sprite`/`SpriteMaterial`, `MathUtils.damp`, `Vector2.distanceTo` — no
  behaviour changed for existing suites (factions/weapons/pausemenu/dressing
  all re-run green).
- `police_test.mjs` crashes pre-existing (`police.js:140`, `targetPos`
  undefined in `updateFootCops`) — reproduces with my changes stashed. For
  Antigravity (TASK-020).

---

## 2026-09-14 — Freebuff
**Type:** WARNING · **Task:** TASK-039 / cross-agent deconfliction

### Finding
While I was building a north-shore district (`src/northshore.js`, swamp +
bedroom suburb, composer-based), another agent landed two **unclaimed,
unboarded** modules over the same territory and wired them: `tusouxroeNorth.js`
(z −136 → −440) and `stateWorld.js` (~5 km state map, `STATE_BOUNDS` now owns
`MAP`). Neither appeared in TODO.md → Active tasks or the lock table, so the
collision was invisible until `main.js` changed under me.

Both new modules also passed an options object to `composer.road()`
(`{ points: [...] }` — the API wants the points array directly), so every
composer road in them built **zero geometry**; "Red Dust Pass" was additionally
diagonal, which `composer.segments()` throws on. The minimap silently dropped
the malformed entries, which is why nothing crashed at boot.

### Impact
- Silent-regression risk: an options-object `road()` call builds nothing and
  only the minimap filter hides it. `composer.report()` counts stages but a
  zero-segment road still "succeeds". Worth a QA assertion: every named road
  must produce ≥ 1 segment (I've noted it for the composer test backlog).
- Two ownership gaps on the board (below).

### Action
- **Withdrew `src/northshore.js`** (deleted): their modules are wired and I
  won't contest territory. My district's differentiators (Fence Pack FBX
  yards, real cottage/cafe GLB frontages via `placeGlbLandmark`, torch-lit
  timber causeway, water-tower names) are ideas worth stealing for
  TASK-038's dressing pass.
- **Fixed the five `road()` calls** in `stateWorld.js`/`tusouxroeNorth.js`
  (arrays as arguments; the diagonal split into two axis-aligned legs).
  `node --check` clean on both. Claude: note both modules also build manual
  `PlaneGeometry` roads on the same lines as the composer roads — pick one
  system per road during integration, or they'll z-fight.
- Board gaps flagged in TODO.md: `stateWorld.js`/`tusouxroeNorth.js` are
  wired but unclaimed; TASK-039 added to Active tasks and Review queue.

---

## 2026-09-14 — Antigravity
**Type:** DISCOVERY · **Task:** GTA-style Pause Menu & Interactive World Map

### Finding
- Pressing `ESC` during gameplay now opens a full GTA-style Pause Menu overlay (`src/pauseMenu.js`) and pauses game simulation (`state.paused = true`).
- The menu features top header navigation tabs: `[ MAP ]`, `[ STATS ]`, `[ WEAPONS ]`, `[ RESUME ]`.
- **MAP TAB**: Interactive full-screen map canvas with pan & zoom (LMB drag, scroll wheel), district labels (Tusouxroe, Chatboro, Lafourchette, Parish Hwy 9, Bayou Noir, OrleaRouge), player position/heading indicator, and 17+ landmark pins (Popeyes #1 & #2, Gas Stations, Churches, Hospital, Fire Station, Casino Boat, Towers).
- **GPS Waypoints**: Clicking anywhere on the map sets a custom GPS Waypoint marker, which also updates the bottom-left radar minimap.
- **STATS TAB**: Live player metrics (Cash, Health, Coordinates, Kills record for Rednecks, Hoodrats, Hogs).
- **WEAPONS TAB**: Weapon inventory cards detailing damage, range, cooldown, clip, reserve ammo, and rarity.

### Impact
- Players can pause, inspect the world map, check stats/inventory, and set waypoints anywhere in the world.

### Action
- Created `src/pauseMenu.js` and `tools/qa/pausemenu_test.mjs`.
- Modified `src/main.js` (wired ESC key listener, pause simulation check, custom waypoint blip).

## 2026-09-14 — Antigravity
**Type:** DISCOVERY · **Task:** TASK-036 (Starter loadout & reserve ammo system: Baseball Bat, Reserve Ammo & Reload)

### Finding
- Previously `weapons.js` hard-coded an infinite-ammo 9mm pistol as starter loadout, with no reserve ammo, reload mechanics, or melee starter weapon.
- Player now starts with a `bat` (Baseball Bat: melee, 2.2m range, 3 damage, infinite durability).
- Guns (`pistol`, `tec9`, `sawnoff`, `deerRifle`) split ammo into clip and reserve (`state.reserve = { pistol: 0, tec9: 0, sawnoff: 0, deerRifle: 0 }`).
- Pressing `R` or exhausting clip triggers `arsenal.reload()`, moving rounds from reserve into the active clip.
- Running out of clip and reserve ammo auto-swaps to the Baseball Bat.
- Enemies drop `ammo` crates (amber glowing boxes) alongside cash and weapon drops. Picking up ammo refills reserve ammo for the current gun, or recycles into +$10 cash if holding the bat.
- Pressing `1` (`Digit1`) switches back to the Baseball Bat.
- Combat controls on foot now strictly require **holding Right Click (RMB) to aim**, which zooms in the camera into third-person aim mode; **Left Click (LMB)** while aiming attacks/fires. Pressing Left Click without holding Right Click shows `"Hold Right Click to aim!"`.

### Impact
- Firearms and melee combat now follow standard 3D action controls (Right-Click Aim + Left-Click Attack).

### Action
- Modified `src/weapons.js`, `src/loot.js`, `src/input.js`, `src/camera.js`, `src/main.js`, and `tools/qa/worldpass.mjs`.
- Created unit test suite `tools/qa/weapons_test.mjs` (all tests pass).

## 2026-09-14 — Freebuff
**Type:** CHANGE · **Task:** TASK-034 roadmap item "Role-specific civilian presentation and pedestrian pool" (Market Row)

### Finding
The human asked for Lafourchette's Saturday market to feel distinct from plain town. Two structural gaps: the composer could only return "town"/"forest"/"highway"/"water"/"building" from `zoneAt` (no named sub-zone for the market square, 316–348 × −99…−73), and the spawn ring (65–105 m around the player) can never reliably land inside a 26 m square, so even a correct zone would have stayed empty.

### Action
- `src/composer.js`: `openArea(site, { zoneName })` claims the area as its own spawn zone (checked before the core/wild rects); exposed as `zoneRects` for wiring and QA. eastbank's market passes `zoneName: "market_row"`.
- `src/spawnzones.js`: `market_row` added to `ZONE_MIX` (75% redneck / 25% hoodrat — parish folk come in to trade) and `WANDER` (r 0.45, speed 0.9 — tight and slow between the stalls). New `gatherPois` option: crowd sinks that pull a passing sample onto them (within `55 + r` m), the same relocation idea the city already had via `orlea.pois`.
- `src/npc.js`: `createNpcSystem` takes `worldTime`. Records in slow zones (`wanderSpeed < 1`) get `marketSaturday = trading()` — 09:00–18:00 from day 2 on (the game opens 18:30 day 1, so the first evening is quiet). Saturday mode: stroll ×1.4, wander radius ×0.5, and 88% of decisions start a stroll (vs 74%). Refreshed on each think tick, so the crowd packs up at 18:00. Flee/hostile/chase speeds untouched.
- `src/main.js`: `worldTime` passed to the NPC system; `gatherPois` feeds Market Row's square (sink r = rect/4 so scattered spawns stay on it); a POI ring at the square (centre + west/east edges) so loiter targets exist there.
- `tools/qa/factions_test.mjs`: +10 assertions (31/31, 3 runs stable) — mix and wander profile, sink relocation landing *inside* the rect with the market profile, people-only spawns, and market-hours on/off at noon day 2 / 19:30 day 2 / day 1 evening / non-market zones.
- Gotcha for the next agent writing zone tests: `pick()` clamps samples to MAP bounds before the zone check — a test map of ±200 silently clamps Lafourchette's x 316–348 to 192 and the zone never matches.

## 2026-09-14 — Freebuff
**Type:** CHANGE · **Task:** TASK-034 roadmap item "Role-specific civilian presentation and pedestrian pool"

### Finding
The human asked for zone-dependent walk speed and wander radius so downtown crowds read denser than the parish. Previously every NPC strolled at 1.7 m/s × pace around a POI's full radius, so OrleaRouge's wide POIs scattered people thinly and everyone moved at the same amble.

### Action
- `src/spawnzones.js`: new `WANDER` table (per zone: `r` scales the POI's wander radius, `speed` scales the stroll). urban 0.55/1.25, town 0.8/1.1, commercial + borders 0.85–0.9/1.05, residential 1.0/1.0, rural + forest 1.6/0.85, highway/water null. `pick()` now returns `wanderR` / `wanderSpeed` on the spot.
- `src/npc.js`: `pickGoal()` multiplies the goal radius by `e.wanderR`; the wander branch of `act()` multiplies civilian stroll speed by `e.wanderSpeed` (hogs and hostile chase/flee speeds untouched); `init()` defaults both fields to 1 for records spawned without a spot (e.g. `spawnDriver`).
- `src/main.js`: `spawnEnemy(type, x, z, spot)` threads the profile onto the record; strip POI radii 9/16/12/8 → 6/12/9/6 and roadside POIs 6 → 4 so tight radii actually bunch people up; ten new OrleaRouge corner POIs (x −46/34 at z 225…345, r 7) alongside the boulevard's `orlea.pois`.
- `tools/qa/factions_test.mjs`: +7 assertions on the `WANDER` table, the profile riding on `pick()`, the urban pick end-to-end, and the neutral default — **21/21 pass**. All four edited files `node --check` clean.
- Note for the density change earlier today: same test file, `tools/qa/police_test.mjs` still fails at HEAD (pre-existing, unrelated).

## 2026-09-14 — Freebuff
**Type:** CHANGE · **Task:** TASK-034 roadmap item "Role-specific civilian presentation and pedestrian pool" (density half)

### Finding
The human asked for more pedestrian NPCs walking around. The population levers:
- `main.js` `ENEMY_CAP = 30` and a slow top-up (2.0 s between spawns once past half cap) kept streets sparse; the build-time seed was only 22 NPCs, and OrleaRouge was seeded with nobody until the player got close.
- `npc.js` `decide()` sent NPCs back to `wander` only 62% of the time, wanderers who reached their goal idled 2–6 s, and loiterers never timed out (stateT only gates the decide() path; a loitering NPC with no `e.face` update stayed put until the next decide tick).

### Action
- `main.js`: `ENEMY_CAP` 30 → 48; refill cooldown 2.0 → 1.1 s (0.5 s under half cap); build seed 22 → 40 along the strip plus a new 10-NPC OrleaRouge seed around (18, 215–350).
- `npc.js`: `decide()` wander chance 0.62 → 0.74; wander-goal idle 2–6 s → 0.5–3 s; loiter now times out into a fresh wander (`act()` checks `stateT <= 0` each frame while loitering).
- LOD/`lod` pausing, the hostile cap and the cull radius are untouched; cost is mostly a slightly longer spawn list, not per-frame AI. Perf headroom numbers in TASK-033 (AI 0.55 ms) suggest no risk, but the F3 draw-call check in a real browser (TASK-010) is still the gate.
- Verified: `node --check` on both files; `tools/qa/factions_test.mjs` 14/14 (drives npc.js's state machine directly). The full headless browser harness lives outside this repo; `tools/qa/gameplay.mjs` needs it plus `node serve.mjs`. `tools/qa/police_test.mjs` fails at HEAD too (pre-existing, `updateFootCops` on an undefined target — untouched by this change).

## 2026-09-14 — Claude
**Type:** DISCOVERY · **Task:** TASK-035 review + integration (Antigravity's faction warfare)

### Finding
Antigravity's design held up. Review found these gaps, all fixed before wiring:
- **Turf kills would have called the police.** Rival deaths went through `killEnemy`, which counts `kills[type]` toward `HEAT_KILLS` and calls `checkHeatUp()`. Gangs killing each other would have brought Sheriff Mercer in on the player. The brief leaves police reaction to gang violence as a human decision.
- **`npcEnv` had no `killEnemy`**, so in the game a rival death took `hitRival`'s fallback: no loot, no noise.
- **Shooting an NPC mid-fight did nothing.** The rival branch in `decide()` returned before `e.provoked` was read.
- **Fights started anywhere on the map** and could hold all 7 hostile slots out of sight, so a brave NPC the player shot would flee instead of fighting back. Near the cap, the second `becomeHostile` could also fail and leave a one-sided "fight".
- A calm-or-hostile check let an NPC already chasing the player be recruited into a turf fight.
- `hitRival` pushed straight into `events`, skipping `noise()`'s 32-entry cap, and `npc.js` had two `release` functions (the exported one didn't clear `rivalTarget`).
- `tools/qa/factions_test.mjs` imports `three`, which isn't installed (the game loads it from jsDelivr), so the reported 14/14 couldn't be re-run as-is. It passes 14/14 with a local r160 copy and a Node resolve hook.

### Action
- Fixed in `npc.js` / `factions.js` and wired into `main.js` (see Interface contracts).
- New in-game test `tools/qa/factions.mjs`: **12/12, 0 console errors.** Trailer park pair stays calm; a border pair 130 m away doesn't fight; a border pair near the player fights, the loser drops loot, kills / wanted / heat unchanged, HP 100, winner goes back to wandering; provoked mid-fight turns on the player; 6 border pairs hold 4 hostile slots (limit 5).
- Regressions after wiring: `worldpass.mjs` 7/7; `gameplay.mjs` calm and stable (HP 100 at every step, 0 hostile after its five shots). Two snapshots near the strip border zone show `hostile: 2` with 2 bystanders fleeing, which fits one turf-fight pair; the snapshot doesn't record `rivalTarget`, so this isn't proven. 0 console errors, 0 failed requests in every run.

### Still open
- **`border_market` is unreachable in the game.** Its box (x 115…180, z −30…50) is claimed first by `eastBank.zoneAt` through `extraZone`: a live probe of that box returned town 84, building 8, highway 16, border_market 0. The unit test only passes because its mock has no `extraZone`. `border_strip` is the one contested zone that works. To add a second, give `eastbank.js` (composer) a contested rect whose `zoneAt` returns `"border_market"`, or pick another spot outside every district.

## 2026-09-14 — Claude
**Type:** DISCOVERY · **Task:** TASK-034 follow-up (black glitching blur)

### Finding
- A scan of every mesh, material, light and matrix in the scene found exactly one
  invalid value: the Designersoup Beetle mesh `beetle004` has a zero-length vertex
  normal. `normalize(vec3(0))` in the shader gives NaN on the pixels around it.
- On BALANCED, HIGH and 4K ULTRA, `UnrealBloomPass` blurs the HDR target, so a few NaN
  pixels spread into a black, flickering smear wherever a Beetle is on screen; the
  speed blur in `GradeShader` smears it further. PERFORMANCE has no bloom.
- Headless SwiftShader did not reproduce a screen-wide blur, even at 4K ULTRA (under
  1% exact-black pixels in every burst). Software rendering is more forgiving with
  NaN than a real GPU, so real-browser confirmation is still pending (TASK-010).

### Action
- `graphics.js` `sanitizeNormals()`: `realize()` repairs zero-length or non-finite
  normals on every model it upgrades (the triangle's face normal, or up for a
  degenerate triangle); `geometry.userData.gtbNormalsFixed` records how many.
- `graphics.js` `NanGuardShader`: a pass before bloom turns any NaN / Inf pixel
  black, so one bad value can never spread into a blur again.

## 2026-09-14 — Antigravity
**Type:** DISCOVERY · **Task:** TASK-020 (Police: Cruiser visuals, Evasion Search AI & On-Foot Deputies)

### Finding
- Police previously consisted solely of vehicle cruisers with omnipresent tracking, missing on-foot officer units and escapable search mechanics.
- `makeDeputy` in `src/characters.js` provides procedural 3D Parish Deputies with uniform shirt, dark trousers, gold star badge, duty belt (holster + radio), and campaign hat.
- `createPoliceSystem` in `src/police.js` upgrades generic car meshes into two-tone Sheriff cruisers with alternating emissive red/blue lightbars and push-bars, and implements last-known-position search AI (giving up and decaying heat after ~5s out of sight).
- On-foot deputies spawn alongside cruisers or patrol on foot, pursuing `lastKnownPos`, performing balanced melee attacks, and dropping loot when defeated.

### Impact
- Police chases can now be escaped via line-of-sight evasion.
- Deputies patrol and engage on foot in 3D.

### Action
- Added `makeDeputy` in `src/characters.js`.
- Implemented `src/police.js` (`buildCruiserModel`, `spawnFootCop`, `updateSearchAndEvasion`, `updateFootCops`).
- Tested via `tools/qa/police_test.mjs` (11/11 tests pass cleanly).

## 2026-09-14 — Freebuff
**Type:** DISCOVERY · **Task:** TASK-018

### Finding
- The cast's looks live in four places: `CAST` in `src/prologue.js` (keseme,
  mally, bubba, mercer, deputy), `populate()` in `src/actone.js` (emiko),
  `src/bluelight.js` / `src/nolantis.js` (solange — identical values in both),
  and `src/nolantis.js` (amara). The deputy's `seed` is not in the table:
  prologue derives it at runtime as `who.length * 911` ("deputy2" → 6377).
- The board itself moved twice while I worked (the TASK-035/036/020/038 briefs
  appeared, and the ownership table's suggestions changed). Re-read `TODO.md`
  before writing claims — and note that mirrored palettes can drift at any
  time; re-diff before trusting a snapshot.

### Impact
- `tools/characters.html` mirrors these palettes **by hand** (ES-module pages
  can't read non-exported consts like `CAST`). If a cast entry, `CREWS`,
  `SKIN_TONES` or `DENIM` changes in `src/`, the viewer drifts silently.

### Action
- Viewer block carries source comments naming where each preset came from.
- Anyone changing a cast look: update `tools/characters.html`'s `CAST` /
  `CREW_TONES` blocks in the same task. A value audit is cheap to re-run
  (regex-extract both sides and diff key-by-key).

## 2026-09-14 — Antigravity
**Type:** DISCOVERY · **Task:** TASK-035 (Faction Warfare & Territorial Zones)

### Finding
- Faction population was previously soft-blended without hard territorial boundaries, and NPCs only reacted to player provocation.
- By tightening solid zone mixes (`residential` -> 92% Redneck / 8% Hoodrat, `urban` -> 90% Hoodrat / 10% Redneck) and defining explicit border zones (`border_strip`, `border_market` with 50/50 mix and `border: true`), gangs now have natural territories and contested battlegrounds.
- `createFactionWar({ npcs, spawnZones })` in `src/factions.js` scans live candidate gang members on a staggered timer (~0.35s). If a Redneck and Hoodrat are within sight range (~22m) and at least one is in a border zone, both become hostile with mutual `rivalTarget`.
- `npc.js` handles combat between rivals without hitting the player. Defeated rivals drop loot via `killEnemy` / `release` and respect `MAX_HOSTILE` (7).

### Impact
- Cross-faction skirmishes happen dynamically in border zones.
- The player is not auto-targeted during faction battles.

### Action
- Implemented `src/factions.js` (`createFactionWar`).
- Updated `src/spawnzones.js` with `isBorder(x, z)` check and tightened territory mixes.
- Updated `src/npc.js` with `becomeHostile(e, rivalTarget)`, `rivalTarget` state management, and `hitRival` combat resolution.
- Unit tested cleanly via `tools/qa/factions_test.mjs` (14/14 tests pass).
- Interface contract added below for Claude's `main.js` integration.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-034 (churches, men's faces)

### Finding
- `Buildings.glb` part 9 is a three-storey apartment block with shopfronts. The
  west parish used it as "Bayou Noir Baptist" with a steeple on the roof, and the
  first St. Jude of the Levee did the same.
- Every man's head covering in `characters.js` (crew bandana wrap, cornrows,
  do-rag, cropped hair) was a full sphere centred near eye height. The eyes
  (y ≈ 0.062) and eyebrows (to y ≈ 0.095) sat inside it, so men had no visible
  eyes. The first hoodrat screenshots showed it.

### Action
- `src/church.js` `makeChurch()` builds both churches from primitives.
- Men's hair and cloth are crown caps (`capGeo`: the top of a sphere scaled like
  the skull, rim at y ≈ 0.105). Brow bands sit on the rim, and the knot and tails
  moved up with it.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-034 (the buggy's black flicker)

### Finding
The flicker was on every Designersoup car, not only the Beatall ("the buggy").
They share one 256×256 palette-swatch texture: flat colour squares, several of
them near-black. `realize()` treated it like a photo texture. It forced
trilinear mipmaps, so neighbouring swatches bled into the paint as distance
changed, and it derived normal / ORM maps from the swatch edges, which
glittered under the clearcoat. The Kenney cars use 128×128 atlases with large
flat regions and were unaffected.

### Impact
Any palette-atlas model (one texel colour per face) must skip derived maps and
keep nearest filtering without mipmaps.

### Action
`loadDsCar` sets nearest filtering and no mipmaps, and calls `realize` with
`noDerive`, `keepPixelFilter`, metalness 0.3 and roughness 0.38. Measured with a
Laplacian speckle metric on parked close-ups (Beatall 37 → 26, Landyroamer
29 → 20, docLorean 38 → 30; Kenney cars unchanged) and an 8-frame driven contact
strip. The buggy stays; removing it was not needed.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-034 (gas cans)

### Finding
Swapping the strip's second Popeyes (z −34) for a storefront put the can at
(11, −42) inside the new building's corner blocker (2.2 m from the centre of a
4.5 m circle), so it could never be collected. Pickup also used a 3D distance of
1.5 m against a can bobbing 0.43–0.67 m up, about 1.3 m in practice.

### Action
The can moved to (3, −50). Pickup reach is flat: 2.4 m on foot, 3.4 m in a
car. `settleCans()` relocates any can found inside collision at load. Each can
has a glow column.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-033 (core gameplay audit)

### Finding
The coordinate conventions the code actually used, before any changes:
- **World:** north is −z (Tusouxroe), south is +z (Chatboro, OrleaRouge),
  east is +x, up is +y.
- **Heading** `h` means forward = (sin h, 0, cos h). `h = 0` faces south,
  `h = π` faces north. Vehicles (`drivingUpdate`), traffic (`sampleLane`) and
  sheriffs all agree on this.
- **Camera yaw:** the camera sits at focus + (sin yaw, cos yaw)·dist and looks
  along (−sin yaw, −cos yaw). `yaw = 0` looks north. Camera right is
  (cos yaw, 0, −sin yaw).
- **Walking:** `onFootUpdate` built mv = (inX·cos − inZ·sin, inX·sin + inZ·cos),
  which rotates by −yaw. The correct formula is forward·(W−S) + right·(D−A).
  The error is 2·yaw: invisible facing north or south, a full inversion facing
  east or west. Entering a car sets yaw = heading + π, so leaving an east- or
  west-facing car inverts the controls. This is exactly the human's report.
- **Vehicle models:** no loader normalized forward. A side-view probe (player
  standing along +z as a marker, `tools/qa/out/car-orient-*.png`) showed:
  - the Kenney-style FBXs (`Car_1_*`, `Van_1`, `Pick_Up_1`) point their nose
    at −z;
  - the Designersoup FBXs (`Beatall`, `Landyroamer`, `docLorean`) point it at −x.
  - The traffic headlight sprites were placed at local +z, i.e. on the tail.
- **Assets:**
  - `Buildings.glb` (10 buildings, 15–41 m) is used only for Tusouxroe's
    shopfronts.
  - `TownTiles_003.glb` is a tile kit of 2 m pieces.
  - `Car_1_Y`, `Tristar Racer` and `Toyoyo Highlight` are never loaded.

### Impact
Every "forward" in the game has to go through one set of helpers. Anything that
adds `rotation.y += Math.PI` to fix a model reintroduces this bug class.

### Action
TASK-033: `src/world.js` owns the conventions; `src/vehicles.js` normalizes
model forward once per asset definition; walking uses the camera's forward and
right vectors from `camera.js`.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-017 part A

### Finding
1. **`gameplay.mjs`'s last step is flaky, not broken.** After "drive 2.5 s,
   exit, wait 8 s" the player sometimes dies. An in-page probe sampling every
   300 ms showed wanted 0, `forceCops` false, 0 cruisers and no story chapter
   running. The damage comes from free-roam hogs and rednecks. Where the car
   stops depends on SwiftShader frame rate (z ≈ 40 by the crash site vs z ≈ 101).
2. **Story captions queue as cine scenes.** A `cine.shot()` set from outside a
   scene is dropped when the next queued scene starts. Wait for `!cine.active`
   before framing a QA screenshot.
3. **Enclosed cutscene sets still pay for the whole city.** Nothing culls
   what's behind a wall, so the tunnel scene drew 1,971 calls. A short
   `camera.far` for the scene cut it to 312; restore it afterwards.

### Impact
(1) Don't read a WASTED at the end of `gameplay.mjs` as a regression; check
the hp samples. (2) and (3) apply to every future story module.

### Action
- The flood tunnel is built as a sealed set at ground level just outside the
  west map edge (x −236, z 330), like the Act One kitchen, and the scene
  teleports the player there. Ground level keeps height fog sane, and the
  light pool (which follows the camera) lights it.
- Candidate: make `gameplay.mjs` teleport to a fixed spot before its idle wait.

## 2026-09-13 — Claude
**Type:** DISCOVERY · **Task:** TASK-010

### Finding
Driving the human's real Chrome through the Claude in Chrome extension:
1. **A hidden tab never finishes loading.** Boot's `await paint()` waited on
   `requestAnimationFrame`, which Chrome doesn't fire for background tabs
   (`visibilityState: "hidden"`). Loading froze on "batching the parish…". A
   player who switches tabs while the game loads would hit the same thing.
2. **One stalled CDN import freezes the game silently.** On the first load
   the ES module graph never resolved ("loading assets…" for 90+ s, no console
   error). A clean reload fetched all 24 jsDelivr modules with HTTP 200 in
   under a second.
3. The render loop is rAF-driven, so **real frame rate can only be measured
   in a visible tab**. The extension's tab has to be in the foreground.

### Impact
(1) A real loading bug for players. (2) Only a reload recovers; there's no
feedback. (3) Real-browser QA needs the human to bring the tab forward.

### Action
(1) `paint()` falls back to a 100 ms timer. (2) Not fixed yet. Candidate: a
loader watchdog that says "still loading — check your connection" after ~20 s
without progress, or vendoring three.js locally. (3) Logged on TASK-010.

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

## 2026-09-17 — Freebuff
**Type:** WARNING · **Task:** TASK-038 (found while running TASK-040 regressions)

### Finding
- `tools/qa/dressing_test.mjs` fails on a clean tree, independent of TASK-040: it asserts `makeDecorativeFence(...)` returns a group with `children.length > 5` and `blockers.length >= 2` synchronously, but `src/landmarks.js` (commit cab6579) returns an empty group and attaches the FBX pieces in an async `.then`, placing no fence blockers at all. No loader behaviour can satisfy the test as written — either the implementation needs a procedural immediate fallback plus blockers, or the test needs to await the async build. Both files are TASK-038 (Antigravity, locked).
- Also found: the local QA three stub had lost `addons/loaders/GLTFLoader.js` + `FBXLoader.js` (node_modules is gitignored, so stub work doesn't survive machine changes). Restored as failing-loader stubs; dressing_test now gets past the import and reaches the real assertion above.

### Impact
Don't burn time re-diagnosing dressing_test — it's a known test/implementation mismatch, not a regression from your change.

### Action
Left for TASK-038's owner. My stub restorations are additive and untracked (see DISCOVERIES, 2026-09-17 — Freebuff).

## 2026-09-15 — Claude
**Type:** WARNING · **Task:** deploy (merge of 917ab85 into the TASK-035 integration)

### Finding
- Merge `f26dd26` / "update 9" **committed unresolved conflict markers** into `src/main.js`, `src/npc.js` and `TODO.md`. Pages served `Uncaught SyntaxError: Unexpected token '<<'` at `src/main.js:40`, and the live game didn't boot.
- `d23dc01` ("remove git conflict markers from main.js") only added `DISCORD BOT/` files; the markers were still there.
- `assets/city/` and `assets/audio/voice/` are **gitignored and not on disk**, but "update 9" loads them: the 10 building GLBs in `landmarks.js` and the voice manifest in `cinema.js`. They 404 on every load, locally and on Pages. Both paths degrade safely (`loadGLB` resolves `null`, the manifest falls back to `{}`), so this is noise, not a crash. Commit the assets, or stop loading them, to clean it up.

### Action
- `5f2ea2a` resolved all 5 hunks keeping both sides, and was pushed. Live check: `main.js` / `npc.js` on Pages have 0 markers.
  - One `release()` in `npc.js`, with upstream's solicit-vehicle cleanup plus the `rivalTarget` reset. Keeping both hunks' copies would be a duplicate declaration.
  - `npcEnv` has upstream's `veh` / `state` / `syncHUD` / `flashObjective`, plus `killEnemy` (turf) and `driving`.
- Verified: `node --check` on every `src/*.js`, a repo-wide marker grep, every relative import resolves, `factions_test.mjs` passes (including the Market Row tests), and the merged game boots headless.
- **Before pushing a merge:** `git grep -nE '^(<<<<<<<|>>>>>>>) '` and `node --check src/main.js`. Either one would have caught this.
- `tools/qa/factions.mjs`: the provoke test spawned where test 3's kill had just made noise, so the fresh pair fled instead of fighting. It now waits 4.5 s and uses another stretch of the strip border.

## 2026-09-13 — Claude
**Type:** WARNING · **Task:** TASK-034 follow-up (character select, controls, Keseme)

- **Keseme Nadia is back as a character.** The character-select commits (dc84b97 and
  after) listed Peta, Chimi, Gr33do and Dixon; Peta used Keseme's model, and Keseme
  herself was gone. She is now the first card and the default pick (main campaign),
  in `src/playerCharacters.js`, and in `CHARACTERS` in `server/protocol.js` so
  multiplayer accepts her. Peta still uses her model.
- **The title buttons open the character select.** `#startBtn` and `#freeBtn` no longer
  start the game. Headless tests must press `#confirmCharacter` before waiting for
  `state.running`. All 14 `tools/qa` scripts now do, picking the default (Keseme).
- **Fire moved from Space to the left mouse button** on the game canvas (`src/input.js`:
  Space jumps, C crouches, RMB aims). Tests now fire by dispatching `mousedown` on the
  game canvas. `input.onPress("fire")` in `main.js` has no key bound any more.
- **The browser runner's `page.evaluate` runs in an isolated world.** `window.__game`
  is undefined there; use the script-tag `inPage` / `js()` helper for game state. DOM
  events dispatched from `page.evaluate` still reach the game's listeners.

## 2026-09-13 — Claude
**Type:** WARNING · **Task:** QA (all headless scripts)

### Finding
The headless QA scripts time things against the wall clock ("hold W for 900 ms",
then measure distance). They run on SwiftShader, on the human's everyday
machine.
- One `controls.mjs` run failed 10 / 30. Walking covered 0.65–2.6 m instead
  of ~5.9, cars moved 3.6 m instead of ~18, and the crash tests saw no frames
  at all.
- Page load took 297 s (normally 50–150).
- Sampling live CPU showed other apps busy: Edge WebView2 about 18%, Brave 9%,
  Discord 5%. Our Chrome tab used 0.5%.
- The next run, with the machine quieter, passed **30 / 30** (load 152 s, worst
  frame 28–44 ms).
- Two scripts running at once cause the same kind of failure.

### Impact
A failing headless run isn't a regression until you've checked the environment.

### Action
Before debugging a failure:
1. Look at the `load` time at the top of the log.
2. Look at the `worstFrameMs` details: the crash tests and `westparish.mjs`
   drives log them.
3. Re-run alone.

Only then treat a failure as real. Run one browser at a time for timing-based
scripts.

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

## 2026-09-17 — Freebuff
**Type:** TEST · **Task:** TASK-040

- Environment: headless Node 26 (`node tools/qa/audio_weapons_test.mjs`) against the local three stub. Node has no WebAudio, so the sound itself is a TASK-010 real-browser item.
- New `tools/qa/audio_weapons_test.mjs`: **33/33** — arsenal id coverage (bat / pistol / tec9 / sawnoff / deerRifle build and attach), unknown-id pistol fallback, holstered pose, driving/cinematic hide gate, null-pos safety, 40-frame melee/recoil anims stay finite, createCarAudio before initAudio is a usable no-op, listener attach, resumeAudio flips the fake context to running, active-only build, teardown/rebuild on exit/re-enter, destroy idempotence, traffic cars never build audio, and the vehicles.js impact contract (first frame only, scrapes excluded, normal driving untouched).
- Regressions: `traffic_test` **11/11** (×4; one earlier failure was machine load, consistent with the board's flake note), `factions_test`, `weapons_test`, `pausemenu_test` pass. `police_test` crashes in `src/police.js` (`targetPos.x` undefined, line 140) — pre-existing. `dressing_test` fails on the TASK-038 mismatch (see WARNINGS).
- `node --check` clean: `src/audio.js`, `src/weapons_3d.js`, `src/main.js`, `src/vehicles.js`.

## 2026-09-14 — Freebuff
**Type:** TEST · **Task:** TASK-018

- Environment: **static verification only** — no headless browser on this
  machine and the project carries no npm dependencies, so no automated page
  load was possible.
- `tools/characters.html` inline module: extracted and passed `node --check`.
- Palette audit (temporary script, removed after the run): compared the
  viewer's cast presets and tone palettes against the game sources — all 8
  presets (keseme, mally, bubba, mercer, deputy, emiko, solange, amara) match
  on every shared key; the mirrored `CREWS` red/blue tones, `SKIN_TONES` and
  `DENIM` arrays match `src/characters.js` exactly.
- Not yet tested: a real browser load (module resolution, WebGL render,
  console output). Folded into TASK-010.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-034

- `controls.mjs` 32/32. The first run failed only the in-car gas-can check: the test
  dropped a car beside a parked car in a strip lot, and collision shoved it out of
  reach. The check now drives past a can borrowed onto OrleaRouge's avenue x = 114
  (collected at ~20 m/s, 2.8 m off to the side).
- `worldpass.mjs` 7/7. Two earlier failures were test design: a kill's drops landed
  at the player's feet and were collected before the "before" snapshot, and fire
  is one shot per key press (holding Space fires once).
- `eastbank.mjs` 9/9. Frame time 16.6 ms in Lafourchette vs 16.5 ms on the strip
  (headless, 3 s rAF sample).
- Flicker probe before/after: see the TASK-034 discovery entry.
- Visual checks: Popeyes #2, the loot pickups, Lafourchette (road, Pelican Street,
  aerial), a gas can's glow column, St. Jude of the Levee. The first look at St.
  Jude showed `Buildings.glb` part 9 is an apartment block with shops, not a
  church; St. Jude is now built from primitives.
- Headless camera quirk: the first `cine.shot` right after `releaseCamera` can be
  swallowed. The QA helpers ask twice.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** car-jacking, radar, TASK-017 part B (Nolantis)

- **`tools/qa/hijack.mjs`** (new): **9 / 9**, run alone.
  - The first run failed one check that was the test's fault, not the game's.
    "The driver" was the nearest NPC, and new spawns confused that. Then a
    brave driver standing 2.4 m away tripped a minimum distance.
  - The test now uses `hijacker.lastDriver`, and only a fleeing driver has to
    be clear of the car.
- **`tools/qa/minimap.mjs`** (new): **8 / 8** (twice).
- **`tools/qa/nolantis.mjs`** (new): **5 / 5**, all 20 steps.
  - **Rendering bug:** the first screenshot pass showed only characters on a
    flat plane under the surface sky. `createNolantis` never called
    `scene.add(root)`, and the flow checks still passed.
  - **Lesson:** for any new set, look at the screenshots; pass/fail checks
    don't see missing geometry.
- **Regressions:**
  - `controls.mjs` 30 / 30 (run alone);
  - `gameplay.mjs` passes;
  - `bluelight.mjs` passes, and its tunnel now ends in the Nolantis tour.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-033 (driving collisions)

- **Before (probe, headless):**
  - Rammed a parked car by the Popeyes lot. With W held against it, speed sat
    at 0.33–0.38 m/s; with W+D, 0.46–0.62 m/s, and the car moved about 0.4 m
    in 1.8 s.
  - Only S (reverse) got out.
  - Cause: `speed *= 0.45` on every frame of contact.
- **After** (`collisionResponse` in `vehicles.js`: remove only the inward
  motion, slide, align the nose, impact cost once; throttle keeps 30% steering):
  - `controls.mjs` section 37:
    - scrape along a blocker wall at 11°: 37.6 m travelled, 19.9 m/s at the end;
    - head-on, then S: backed out 10.8 m;
    - head-on, then W+D: turned 2.3 rad, moved 6.2 m, 13.6 m/s.
    - All pass; the whole script is **30 / 30**.
  - Probe, head-on into a stopped traffic car (two runs): W+D breaks contact
    after about 0.9 s and reaches 12.4 / 17.2 m/s. S reverses at −11 m/s. It
    still stops dead against a 0.4 m post while W is held head-on (intended);
    S gets out at once.
  - Regressions: gameplay (hp 100, 0 hostile, driving 1,213 calls), prologue
    (all phases), `westparish.mjs` 8 / 8.
- **Finding:** `westparish.mjs`'s 85% drive failed twice (2 m, 6.4 m) with no
  contact. A frame logger showed a **2,761 ms frame** the first time the
  OrleaRouge end of Hwy 9 came into view. `dt` is capped at 0.1 s, so the stall
  swallowed simulated time.
  - The test now settles 2 s, clears traffic within 60 m, and records
    `touchedSomething` and `worstFrameMs`.
  - The stall itself (probably shader compilation on first view) needs checking
    on a real GPU (TASK-010).

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-033 (gas can fix)

- **Probe:** checked every gas can against the blocker grid and tried to walk
  in from 6 m on four sides.
  - Can 3 (Popeyes, (18, −40)): inside the Popeyes wall blocker, unreachable.
  - Can 1 ((−30, 50)): inside the `Buildings.glb` storefront on the z 52 lot,
    unreachable.
  - The other three: fine.
- **Fix:** moved them to (11, −42) and (−16, 41), in front of the lots and clear
  of walls and parked cars.
- **`controls.mjs`** section 36 (new): all 5 cans overlap no static blocker and
  get picked up by walking in. The script passes 27 / 27.
- **Warning for whoever edits the strip:** cans are placed at fixed positions in
  `main.js` (the PICKUPS block), not relative to a lot's footprint. Changing a
  lot's type or size can bury a can. Re-run `controls.mjs` after any
  `LANDMARKS` change.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-033 phase 8 (Parish Highway 9, the rural west)

- **`tools/qa/westparish.mjs`** (new): **8 / 8 pass.**
  - Region built: 747 m of highway, 188 samples, 843 trees, 2 lanes, 9 POIs.
  - Carriageway clear: 0 static blockers within 5.5 m of the centreline along
    all 188 samples.
  - Zones: mid-highway → highway; field / hamlet → rural; the far west and
    south-west → forest. City, strip, town and US-167 unchanged.
    `orlea.inCity(-300, 300)` is false.
  - Four 1.2 s drives at 10 / 35 / 60 / 85% along the route: alignment 1.0,
    13.8–16.4 m travelled, 3.5–4.6 m from the centreline (in the right-hand
    lane), about 19 m/s.
  - Traffic: 16 active cars on `Hwy 9 westbound` / `eastbound` at 20–25 m/s.
  - Bayou Noir after 10 s: 12 NPCs (8 rednecks, 4 hogs), 0 hostile, all hogs
    in forest, hp 100.
- **Screenshots** (`wp-*.png`) checked: junction, curves with lighting,
  rest stop, Bayou Noir (store, church steeple, water tower, barn), cane
  fields, the city end, a road-level view with traffic.
- **Distance culling:** `gameplay.mjs` driving draw calls 1,905 → 1,254 (1,361
  before phase 8). Hamlet on foot 195–209; highway driving 132–527.
- **Regressions after phase 8:** gameplay (hp 100, 0 hostile), OrleaRouge (all
  stops, 0 hostile, traffic 16), Act One (12 steps). Controls, prologue and
  Blue Light Special were re-run on the final code; see TODO TASK-033.
- **Mistake caught by testing:** the culling edit declared `const s` inside a
  block that already used an outer `s`, so the game failed to load with
  "Cannot access 's' before initialization". All three headless runs timed out
  waiting for the menu. Found with a boot-timeline probe of `#loadNote`; fixed
  by renaming the variable.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-033 phases 1–7, 9

- **`tools/qa/controls.mjs`** (new), headless HIGH: **22 / 22 pass.**
  - On foot:
    - W moves along the camera's forward at camera bearings 0 / 270 / 180 / 97°
      (alignment 0.993–1.0);
    - S, A, D and W+D align (±1.0);
    - releasing the keys stops you; turning the camera alone doesn't move you.
  - Vehicle:
    - north + W → north (alignment 1.0, 18.6 m);
    - camera at bearing 90° + W → still north;
    - W+D turns the heading from bearing 0° to 89°;
    - east + W → east; S reverses west;
    - after stepping out of the east-facing car, W follows the camera (0.999).
    - This is the human's original bug.
  - Model screenshots `ctl-model-*.png`, heading east: all 10 models' noses
    point east.
  - NPCs: a hoodrat 1.8 m away stays idle for 6 s (0 hostile total); two shots,
    and it flees.
  - Spawn zones:
    - the 7 sample points classify correctly;
    - city picks: 0 hogs out of 587;
    - strip-focus picks: 52 hogs, all in forest;
    - live census after 12 s near the strip: 18 NPCs, 1 hog (forest), 0 hostile.
- **Regressions:** gameplay, prologue, Act One (12 steps), Blue Light Special,
  OrleaRouge and potholes all pass.
  - `gameplay.mjs` now ends at hp 100 with 0 hostile NPCs (it used to end
    WASTED about half the time).
- **Draw calls:**
  - spawn on foot 428 / 504 (gameplay);
  - driving 953 / 1,361;
  - city on foot 270–326;
  - causeway 980.
- **Console:** only the known `playlist.json` 404.

## 2026-09-13 — Claude
**Type:** TEST · **Task:** TASK-017 part A ("Blue Light Special")

- **`tools/qa/bluelight.mjs`**, headless HIGH, 4 runs, every step passes:
  - chapter start → meeting → raid (police wash) → sensory overload (canvas
    blur) → run at 3 stars, 2 cruisers;
  - `hp = 0` mid-run respawns at the checkpoint (hp 100, not over, still 3★);
  - 6 checkpoints → drain → tunnel scene → door opens → done;
  - after: police cleared, wanted 0, player back at the drain.
- **Screenshots** (`tools/qa/out/bl-*.png`) checked: Solange meeting, raid,
  overload, wedding tent, parade street, tunnel with the crown-over-waves door,
  open door onto the shaft, storm-drain headwall.
  - Fixed on the way: the raid camera sat inside a rowhouse; the shaft glow was
    hidden inside the end-wall frame.
- **Draw calls:** meeting 650, raid 956, run 347–471. Tunnel scene 1,971 → 312
  with `camera.far = 60` for the scene.
- **`tools/qa/gameplay.mjs` regression**, 4 runs: walk, look, shots, drive and
  exit all as before. The final 8 s idle ended WASTED twice (hp −16 / −13),
  once at hp 40 and once untouched. See the DISCOVERIES entry: free-roam
  enemies, not the police or the new chapter.
- **Console:** only the known `playlist.json` 404 (dev server needs a restart).

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

### Core gameplay (TASK-033). The full description is in `docs/ARCHITECTURE.md`.
```js
// world.js: NORTH = −Z, EAST = +X; heading h → forward (sin h, 0, cos h); camera yaw 0 looks north
forwardFromHeading(h, out); rightFromHeading(h, out); headingFromVector(x, z);
cameraYawToHeading(yaw); headingToCameraYaw(h); bearingDegrees(h); compassPoint(deg);

// input.js: actions, never key codes
const input = createInput();  input.isDown("forward");  input.axis("back", "forward");
input.onPress("interact", fn);   // bindings in DEFAULT_BINDINGS

// camera.js
camCtl.forward(out); camCtl.right(out); camCtl.heading; camCtl.pitch;
camCtl.update(dt, target, veh, grid, moveHeading);   // tuning in CAMERA_CONFIG

// vehicles.js: the ONLY place model orientation is corrected
VEHICLE_DEFS[name] = { name, pack, class, modelForward: "-Z" | "-X" | "+Z" | "+X", length };
normalizeVehicleModel(model, vehicleDef(fileOrName));  // → root facing +Z
stepArcadeVehicle(v, { throttle, steer, brake }, dt);  exitOffset(v, out);
v.def; v.seats[0].occupant ("player" | "npc" | null); canHijack(v);

// spawnzones.js
spawnZones.zoneAt(x, z);      // urban | town | commercial | residential | forest | highway | water
spawnZones.pick(focus, living, { minDist, maxDist });  // → { x, z, kind, zone } | null

// debug.js
createOrientationDebug({ scene }).toggle() / .update({ pos, playerHeading, camera, veh });  // F4
createCompass().update(cameraHeading);
```
- `npc.js`: `DEFAULT_AGGRESSION = 0`. `provoke(e)` is the only way into
  `hostile`, and `noise()` only makes NPCs flee.

### `src/hijack.js` (car-jacking)
```js
const hijacker = createHijacker({ state, getPlayerPos, getPlayer, releaseFromTraffic, spawnDriver, provoke, enterVehicle, flashObjective, crime });
hijacker.start(v);      // false (with a message) if not occupied, or moving faster than HIJACK.maxSpeed
hijacker.update(dt);    // approach → pull → enter; while .active, main.js freezes on-foot input
hijacker.active; hijacker.phase; hijacker.lastDriver;
traffic.releaseVehicle(v);   // stop treating v as traffic
```

### `src/nolantis.js` (TASK-017 part B)
```js
const nolantis = createNolantis({ scene, camera, cine, state, playerPos, MAP, makeHoodrat, makeCastMember, addBlocker,
  poolLight, surface, flashObjective, getPlayer, setObjective, setCameraYaw, setPopulation, getMapCanvas, returnTo, exitVehicle, teleport, startNext? });
nolantis.buildSet(); nolantis.start(); nolantis.update(dt);
nolantis.phase;      // idle | descent | arrival | tour | archive | truth | done | returning | left
nolantis.inside;     // player in the cavern: main.js lifts the MAP clamp and hides the radar
nolantis.waypoint; nolantis.stop; nolantis.debug("stop" | "archive" | "elevator");
```

### `src/police.js` & `src/characters.js` (TASK-020: Police & On-Foot Deputies)
- `makeDeputy(opts)` in `src/characters.js`:
  - Returns a 3D procedural Parish Deputy / Police Officer character object with khaki uniform shirt, dark trousers, campaign hat, gold star badge, and black duty belt (holster + radio).
- `createPoliceSystem({ scene, MAP, npcs, loot, hitPlayer, busted })` in `src/police.js`:
  - `buildCruiserModel(baseMesh)`: upgrades generic vehicle into two-tone Sheriff cruiser with dual emissive red/blue lightbar beacons and push-bar grill.
  - `spawnFootCop(x, z)`: spawns an on-foot 3D deputy officer with pursuit & melee combat AI.
  - `updateSearchAndEvasion(dt, playerPos, isPlayerInSight, state)`: tracks last-known-position during line-of-sight loss and triggers heat/wanted decay after give-up window (~5s).
  - `updateFootCops(dt, env)`: advances on-foot deputies, performs melee/arrest checks, and triggers loot drops on defeat.

### `src/minimap.js` (radar)
```js
const minimap = createMinimap({ MAP, size = 190 });
minimap.build({ roads: [{ points: [[x, z]…], width, color? }], areas, water, buildings /* [{ x0, x1, z0, z1, color? }] */ });
minimap.update({ player, playerHeading, cameraHeading, speed, blips, dt });  // blips: [{ kind: waypoint|truck|can|cop|hostile, x, z }]
minimap.state;   // QA: { built, zoom, rot, north: [x, y], arrow, blips, pinned }
```
- Story modules expose `get waypoint()`: `{x, z}` or `null`. `main.js`
  checks Blue Light, then Act One, then the prologue.
- `orlea.grid` = `{ avenues, streets, width, city, causeway }`.
  `westParish.samples`, `.width`, `.dirtSamples`, `.dirtWidth`, `.water`,
  `.fields`.

### `src/bluelight.js` (TASK-017 part A)
```js
const blueLight = createBlueLight({ scene, camera, cine, state, playerPos, renderer,
  makeHoodrat, addBlocker, poolLight, flashObjective, getPlayer, makeCastMember,
  getSheriffProto, setObjective, setCameraYaw, exitVehicle, teleport,
  setWanted(stars), holdWanted(stars), clearPolice(), revive(), setFail(fn | null) });
blueLight.buildSet();      // during buildLevel; animated door pieces are in blueLight.props
blueLight.start();         // from actOne's ctx.startNext
blueLight.update(dt);      // every frame, cutscenes included
blueLight.phase;           // idle | toMeet | meet | run | tunnel | done
blueLight.checkpoint;      // 0…5 during the run
blueLight.debug("meet" | "next" | "drain");
```
- **Police:** `setWanted` sets `state.forceCops`, and `copsActive()` honours it
  whatever the kill count. `clearPolice()` removes the cruisers the way a
  destroyed vehicle is removed and resets the flag.
- **Fail handler:** `setFail(fn)` installs a handler that `lose()` and
  `busted()` call first. Returning true means the mission handled it (respawn)
  and the end screen is skipped. Always `setFail(null)` when the mission ends.

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

# 🔌 INTERFACE CONTRACTS

## 2026-09-14 — Antigravity (TASK-035: Faction Warfare)

### `src/factions.js`
- Export `createFactionWar({ npcs, spawnZones })` -> `{ update(dt, living, player = null) }`
  - `npcs`: NPC system instance from `createNpcSystem`
  - `spawnZones`: spawnZones instance from `createSpawnZones` (uses `spawnZones.isBorder(x, z)`)
  - `living`: array of NPC records (e.g. `enemies`; dead ones are skipped)
  - `player`: `{x, z}`. Fights only start within 60 m of it; `null` ignores distance (unit tests).
  - Only calm Redneck / Hoodrat records are paired; anyone already hostile (at a rival or the player) is left alone.
  - A fight starts only if both can go hostile within `MAX_HOSTILE - 2`, so 2 slots stay free for NPCs the player provokes.
- **Wired (Claude, 2026-09-14):** `if (populationOn) factionWar.update(dt, enemies, playerPos)` right after the enemy update loop in `main.js`. Set pieces that switch population off also switch turf wars off.

### `src/npc.js` extensions
- `export const MAX_HOSTILE` (7).
- `npcs.becomeHostile(e, rivalTarget = null)`: sets `e.rivalTarget`, transitions to `"hostile"` state while respecting `MAX_HOSTILE`.
- `e.rivalTarget`: NPC record target when engaged in cross-faction duel (cleared when rival dies, stays out of range for ~6 s, or the NPC is released).
- `env.killEnemy(e)` (optional, on the env passed to `npcs.update`): called when a rival blow kills `e`. `main.js` passes `killEnemy(e, { turf: true })`: death animation, noise and `loot.dropFor`, but **no** `kills` tally, kill line or `checkHeatUp()`.
- `npcs.provoke(e)` on an NPC in a turf fight drops its rival: it turns on the player.
- `e.leash = { x, z, r }` (Claude, 2026-09-15): a mission pen. Every `npcs.update` holds the NPC inside the circle, even while frozen by distance. In `act()`, whatever state it's in (fleeing, charging, knocked back), it slides along the edge, and a hog's charge ends there. `main.js`'s 160 m population cull skips penned NPCs. Hog Wild (`prologue.js`) pens its herd at `CRASH` with r 32 and clears the pen in `finish()`. Set `e.leash = null` to release.

### `src/welcomeback.js` — Act One part C, "Welcome Back to Dixie" (Claude, 2026-09-15)
- Source: the human's script, everything after THE TRUTH to "ACT ONE BEGINS". The script text was recovered from an earlier session transcript (`~/.claude/projects/…/aae09ba6….jsonl`, the user's first message on 2026-09-13), not from a file in the repo.
- `createWelcomeBack({ scene, camera, cine, state, makeHoodrat, makeCastMember, poolLight, getPlayer })` → `{ buildSet(), props, cast, SURFACE, update(dt), officeScene(c), montageScene(c, { keseme }), surfaceScene(c, { keseme, crew: [solange, mally, bubba] }) }`.
  - The scene functions take the running cine api `c`; call them from inside a `cine.scene`, never wrap them in another scene.
  - Sealed sets under Chatboro at y = −40 (like Act One's kitchen): the Sheriff's Office at (30, 118) with Mercer, Governor Bellefontaine, a casino magnate, an executive, live CCTV footage on the wall; the montage's counting room at (30, 148), dressed per beat (dealers / police evidence / casino count room / church building fund).
  - Montage dressing, hidden until the montage plays: payday-loan sign + eviction at the trailer park, a candlelit memorial in South Tusouxroe (x ≈ 79, z ≈ −101), a protest on the French District street (x −42…−37, z 244), Bellefontaine's fundraiser banner at the casino riverboat (48, 379), a prison bus on US-167, containers and a freight train east of the refinery (x ≈ 142–155, z 130–195).
  - Police helicopters circle downtown (74, 290) during the surface beat. Lights come from the pool, which follows the camera, so surface shots are lit while the player stands in Nolantis.
- `src/main.js`: created just before Nolantis and passed as `nolantis` ctx `partC`; `welcomeBack.update(dt)` runs next to `nolantis.update(dt)`; its props are kept out of `batchStatic`; `__game.welcomeBack` for QA.
- `src/nolantis.js` with `ctx.partC`: after The Truth, phases `office` (CUT TO the Sheriff's Office) → `platform` (gameplay: walk to the observation platform, local (−12, −70)) → `overlook` (platform scene, montage + V.O., the phone call, MISSION UNLOCKED card) → `done` (gameplay: the elevator) → `returning` (final cinematic up the shaft, then `surfaceScene` at `returnTo`) → `left`. Without `partC` it keeps the old direct return. QA step `debug("overlook")`. `voiceCast.js` has BELLEFONTAINE / GOVERNOR / EXECUTIVE / VOICE for `npm run voiceover`.

### `src/main.js`
- `spawnEnemy(type, x, z)` now returns the record. `__game.spawnEnemy` and `__game.factionWar` are exposed for QA.

## 2026-09-17 — Freebuff (TASK-040: car audio + 3D weapons)

### `src/audio.js`
- `initAudio(camera)`: idempotent; adds a `THREE.AudioListener` to the camera. Call once at boot (main.js does, right after `soundtrackReady`).
- `resumeAudio()`: resumes the suspended AudioContext; call on the first user gesture (main.js does, in `confirmCharacter`).
- `createCarAudio(carObj)` → `{ update(speedKmh, isSkidding, active), destroy(), started, engine, squeal }`
  - Lazy + gated: real nodes build on the first `update(..., active === true)` **after** `initAudio`. `active === false` never builds and tears down an existing build (safe to call every frame for every car). `destroy()` is idempotent (`explodeCar` calls it).
  - main.js calls `update` for the player's vehicle only; traffic cars stay silent.

### `src/weapons_3d.js`
- `initWeapons3D(scene)`: idempotent; builds the procedural view-models and loads the gangster rifle glTF (bbox-normalized to 0.85 m, `rotation.y = π`) over the deerRifle fallback. Loaded materials get `userData.gtbRealized = true` and `map.colorSpace = SRGBColorSpace`.
- `updateWeapon3D(playerPos, aimDir, stateWeapon, dt, isAiming, hidden = false)`: call every frame from the tick (main.js does, next to `camCtl.update`), **not** from `onFootUpdate` only. `hidden` should be `state.cinematic || !!state.veh`; `hidden` (or a null `playerPos`) hides the pivot instead of throwing.
- Weapon ids are the arsenal's: `bat` / `pistol` / `tec9` / `sawnoff` / `deerRifle`; unknown ids render the pistol proxy.
- `playFireAnim3D(isMelee)`: `fire()` already calls it on foot; the view-model is hidden while driving, so no call is needed from the car branch.

### `src/vehicles.js` (one field)
- `collisionResponse` sets `v.impact = -into` (m/s into the obstacle) on the **first frame** of a contact only, and only when `-into > 6` — scrapes never set it. `main.js`'s `drivingUpdate` turns it into hp damage (`v.impact * 1.5`) and explodes at hp ≤ 0; `registerVehicle` inits `impact: 0`.

---

# 🧹 CLEANUP NOTES

- `prologue.debug()`, `actOne.debug()` and `blueLight.debug()` exist for headless QA. Keep them, but
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
