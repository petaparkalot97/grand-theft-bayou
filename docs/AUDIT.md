# Grand Theft Bayou — code audit (2026-09-26)

A read through the whole tree (38,600 lines of `src/`, the server, the tools, the deploy config) plus a lot of
running the game in headless Chromium. Everything below was either **measured or read in the code**; where a
claim is an inference it says so. Sorted from the smallest jobs to the largest, then ideas.

Legend: 🔴 real bug or risk · 🟠 will bite eventually · 🟡 polish · 💡 idea · ✅ fixed in this pass

---

## 0. Fixed during the audit (all in this commit)

| | What | Where |
|---|---|---|
| ✅🔴 | **The dev server handed out `.env`** — both API keys (Fish Audio, OpenRouter) — plus `.git/config` and the server code, to anyone who could reach the port. Now 404s on any dot-segment and on `/server`, `/node_modules`, `/scratch_puppet`. | `serve.mjs` |
| ✅🔴 | **`GET /rooms` threw** (`require()` in an ES module) — the public room list never worked. | `server/index.js` |
| ✅🔴 | **Multiplayer `DAMAGE` was unvalidated**: a negative amount healed, NaN/huge amounts one-shot anyone, a non-string id threw inside the message handler. Clamped to 0..40, id type-checked. | `server/Room.js` |
| ✅🔴 | **Zombies were standing around** — their hostility was drawing on the shared hostile budget (20), so with 60–300 out everyone past the twentieth never engaged. Zombies are now outside the budget and drift toward the player's scent. | `src/npc.js` |
| ✅🔴 | **`inCity()` had no upper bounds**, so all of south-east Louisiana counted as OrleaRouge: no NPC ever spawned in Oyster Bay or on US-167 south, and the "EXT. ORLEAROUGE" card fired in Oyster Bay. | `src/orlearouge.js` |
| ✅🔴 | **F on a casino / bar / stage in the Crown Strip said "There are no vehicles nearby."** `tusouxroeNorth.interact()` existed but was never wired into the F key — and it only ever printed the venue's blurb. It is wired now and the stations are playable (slots, roulette, blackjack, pool, bar, stage, VIP, DJ). The radar badges were never wired either. | `src/main.js`, `src/tusouxroeNorth.js` |
| ✅🟠 | Swamp trees were baked into a static batch, so `scene.remove()` on a "cleansed" tree did nothing (it stayed on screen). Now instanced per chunk with a zero-scale matrix. | `src/main.js` |
| ✅🟠 | `stateWorld`'s ctx never passed `loadDsCar` / `loadVehicle`: every parked car and truck placed in the state was a silent no-op. | `src/main.js` |
| ✅🟠 | Pedestrian barks fell back to the browser's **generic text-to-speech** when a line had no recording (35 Gay Guy / Lesbian lines, plus the types with no voice at all). Generated the missing lines; barks are now a recorded voice or silence; **zombies no longer speak**. | `cinema.js`, `pedestrianChatter.js` |
| ✅🟡 | QA browsers launch `--mute-audio` (a test run had been playing the game's NPC barks through the speakers). | `tools/qa/*` |

Also done in this pass, per the request list: radio on **R** (in vehicles) with no other music; first-person on foot
in every mode; gore (lens, walls, floor, exploding bodies); the DeLorean is a drivable hovercraft; the Crown Strip
games work. See `TODO.md`.

---

## 1. Easy fixes — under an hour each

> **Status after the second pass (2026-09-26, TASK-085):** ✅ done — 1 (deploy: `npm run deploy` builds `dist/` from `git ls-files`),
> 2 (editor endpoints: `EDITOR_TOKEN` / loopback-only, CORS allow-list), 3 (three.js vendored in `assets/vendor/three`), 4 (CI),
> 6 (puppeteer devDependency), 9 (Raycaster hoisted; the per-bark `Audio` element is still allocated), 10 (Cane Street), 11 (README layout),
> 12 (mouse sensitivity, FOV, invert-Y — key rebinding still open), 13 (`--check`), 14 (N removed; M is the master mute).
> **Still open:** 5 (the three stale QA scripts — `roads.mjs`'s "Red Dust Pass 2 surfaces" is a false positive, the scene holds one plane),
> 7 (renormalise line endings — a one-off, whole-tree diff, do it alone), 8 (dead code / `LOCATION_LOOT`), 15 (assets weight).
> A new bug found on the way: the "EXT. ORLEAROUGE" card fired anywhere south-east of the city (fixed, `orlearouge.js`).

1. 🟠 **Deploy leak risk.** `wrangler.jsonc` sets `pages_build_output_dir: "."` — the whole repo root. A local
   `wrangler pages deploy` would upload `.env`, `.git/`, `server/`, `tools/`, `docs/`, `node_modules/`. A git-connected
   Pages build is fine (`.env` is gitignored), a direct upload is not. Give it a real output directory (or a build
   step that copies only `index.html`, `src/`, `assets/`), and rotate the two keys if a direct upload was ever done.
2. 🟠 **The editor's AI endpoints are unauthenticated with `Access-Control-Allow-Origin: *`** (`/editor/ai`,
   `/editor/ai-duplicate`, `/editor/save`, `/editor/delete-slot`). If `server/` is deployed (Render), anyone can spend
   the OpenRouter key and overwrite/delete save slots. Add a shared-secret header (env var) and lock CORS to the
   game's origin.
3. 🟠 **three.js loads from a CDN with no integrity hash** (`index.html` import map, r160). The game does not start
   offline and trusts jsDelivr. Vendor `three` (the module plus the addons the game imports) under `assets/vendor/`, or add SRI.
4. 🟡 **No CI.** Add a GitHub Action: `node --check src/*.js`, the pure-node tests (`factions_test`, `weapons_test`,
   `police_test`, `traffic_test`, `pausemenu_test`, `zombie_test`), and `tools/qa/fill_check.mjs` headless. Right now
   regressions are found by hand.
5. 🟡 **Three QA scripts fail on a clean HEAD** and nobody notices: `roads.mjs` (Red Dust road-surface audit),
   `eastbank.mjs` (3 checks), `worldpass.mjs` (loot checks — free roam now has infinite ammo, so "32/16 rounds"
   can never hold). Update or retire them so a red run means something.
6. 🟡 **`fill_check` / `pop_check` / `run_pw` need puppeteer** and it is not in `package.json`. Add it as a
   devDependency (the repo is otherwise dependency-free, so keep it optional).
7. 🟡 **CRLF/LF churn**: git warns on nearly every commit. `.gitattributes` exists; normalise the tree once
   (`git add --renormalize .`) so diffs stop being noisy.
8. 🟡 **Dead / unwired code**: `missionClinic.js` is imported "unused" in `main.js` and marked NOT WIRED (Keseme's
   Mission 1 as written); `randomHog`, `CREWS`, `HIJACK`, `TIPS`… are exported and never imported; `LOCATION_LOOT`
   and `loot.dropAtLocation()` (TASK-080) have no caller. Wire or delete.
9. 🟡 **`fire()` allocates** a `THREE.Raycaster` and three vectors on every shot; `speakPedestrian` creates a new
   `Audio` element per bark. Hoist / pool (matters for the shotgun and the tec-9 at 460 rpm).
10. 🟡 **Composer warning on every load**: `Lafourchette: site "Cane Street" overlaps something already placed`.
    Harmless, but a clean console is how the next real warning gets noticed.
11. 🟡 **README is stale**: "main.js — everything" layout section, no mention of the district modules, `composer.js`,
    `townkit.js`, `gore.js`, `fpsview.js`. (Controls section updated in this pass.)
12. 🟡 **Settings that a first-person game needs and doesn't have**: mouse sensitivity, FOV, invert-Y, ADS
    sensitivity. `CAMERA_CONFIG.cameraOrbitSensitivity` is already a plain object — a slider is ten lines. Key
    rebinding: `DEFAULT_BINDINGS` is already data; it just needs a UI and `localStorage`.
13. 🟡 **Voice manifest coverage check**: add `tools/pedestrian-voiceover-gen.mjs --dry-run` to CI and fail if any
    line lacks a recording — that is exactly how the generic-TTS voices slipped through.
14. 🟡 **The `M` / `N` (music mute / next track) inputs and the soundtrack code are now dead** (music only plays in
    vehicles). Remove them or repurpose the ♪ button as a master mute.
15. 🟡 **`assets/` weighs 1.5 GB locally and the git pack is 746 MB.** The zips / unitypackage / bbdoc in `assets/`
    are gitignored but sit in the working tree; keep them out of it (a sibling folder) so nothing ever bundles them.

## 2. Medium jobs — a few hours to a day

1. 🟠 **Hit detection is planar.** `fire()` treats every target as a circle on the ground (distance to a horizontal
   ray). Fine for a top-down camera, wrong for a first-person shooter: no headshots, you can hit a zombie through
   its own knees, aiming up at a rooftop sniper does nothing, the crosshair pitch is ignored. Give targets a
   vertical capsule, raycast the true aim ray, add a headshot multiplier, hit-reaction by limb (and gore by hit
   location — the shotgun explosion should depend on where you hit).
2. 🟠 **No save game.** Reloading the page loses cash, weapons, kills, story progress. `localStorage` snapshot of
   `state`, the arsenal, `worldTime`, the story phase and position, autosaved on checkpoints.
3. 🟠 **NPCs and zombies steer in straight lines** and slide along collision circles. They bunch on walls, can't
   route around a block, and stall at the edge of a lake. A coarse nav grid (the blocker grid already gives 8 m
   cells) with A* on demand for anything within ~60 m of the player fixes most of it.
4. 🟠 **Draw calls while driving are ~3,900** (measured at Chatboro: 700 on foot → 3,880 in a car; unchanged by this
   audit, same at HEAD). Something in the car path (mirror pass, traffic and parked cars as individual meshes,
   headlights) multiplies it 5×. Instance the traffic/parked-car pool, cull the mirror pass harder. This is the
   difference between 60 fps and 25 on a mid GPU (SwiftShader can't tell us).
5. 🟠 **Parked cars are scenery** — all but the DeLoreans. In a GTA-alike every car should be drivable. The
   `parkVehicleHook` in `landmarks.js` is the seam: register parked cars as *sleeping* vehicles (no per-frame physics
   until entered or bumped) and the vehicle list stays cheap.
6. 🟠 **Multiplayer trusts the client for everything**: position, hits, vehicle ownership. The server only clamps
   now. A real fix is server-authoritative movement (rate/speed limits, hit validation against server positions).
   Fine for four friends; not for a public room list.
7. 🟠 **No SFX for gore or FPS feel**: wet impacts, the shotgun's chunk-and-shell, footsteps, breathing at low HP,
   hit-marker tick, hurt grunts. `cinema.js` `sfx()` synthesises everything; add `splat`, `gib`, `hitmarker`.
8. 🟠 **Night is very dark in first person.** The torch (T) helps; ambient/hemisphere levels were tuned for a
   third-person camera looking down at lamps. A first-person pass on exposure, a gun-mounted light default-on at
   night, muzzle-flash light (there's one pooled light already), and NPCs picked out by moonlight.
9. 🟡 **Boot takes 30–40 s in software GL** and ~20k meshes / 25k blockers / 8k swamp trees. Real GPUs are faster,
   but the whole map builds up front. Build the far districts lazily (composers already cull by cluster; they could
   also *build* by cluster on first approach).
10. 🟡 **Flat world.** The ground is one plane over 2.4 km. A heightfield (levees, bayou banks, the badlands
    mesas as real terrain, overpass ramps) is the single biggest visual upgrade left, and vehicles/NPCs need a
    `groundY(x, z)` — the collision code is already 2-D so it slots in.
11. 🟡 **Zombie mode needs ammo and pickups** now that it plays like an FPS: infinite ammo makes the horde a
    screensaver. (The survival-resources question in `TODO.md` → Blockers is the gate; even a thin "ammo drops from
    zombies, medkits in hospitals" layer changes it. `LOCATION_LOOT` is half of this.)
12. 🟡 **The story and first-person are untested together.** Every mode now starts in first person; the prologue's
    cameras, mission markers and the "hog wild" chase were tuned for the orbit camera. Playtest each mission
    with `V` both ways.
13. 🟡 **Weapon variety and feel**: grenades/molotovs, a real melee set (machete, tire iron — the Klansman already
    carries one), ADS per weapon, reload animation on the view model, shell ejection, spread that grows on
    sustained fire, a weapon wheel.
14. 🟡 **Composer cross-talk**: two composers don't see each other's grids, so roads that cross another composer's
    bounds need hand-planned sites (Red Dust and Oyster both do). A shared world occupancy grid would remove the
    whole class (and the `held()` workaround in `stateWorld.js`).
15. 🟡 **Determinism**: `rng` is seeded (`mulberry32`) but consumption order depends on async load order, and the
    wilderness bands use `Math.random`. QA comparisons between runs of the same build vary.

## 3. Big jobs — a week or more

1. 🟠 **`main.js` is 5,600 lines and owns everything** (world build, input, combat, vehicles, HUD, boot, story
   hooks). Every district module reaches back into it through a hand-assembled `ctx`. Split into systems
   (`combat.js`, `vehicles-runtime.js`, `hud.js`, `boot.js`) with a small event bus; it is the reason every feature
   here needs a "main.js wiring" step and the reason two of this session's bugs were "never wired".
2. 🟠 **World streaming.** 2.4 km × 2.4 km built and resident at once. Chunked build/unload (the composer clusters
   are already the unit) would cut boot, memory and draw-call pressure together.
3. 🟠 **Interiors + robbery (TASK-059)** for shops, houses, the hospital, the Superdome (TASK-058). The Crown Strip
   proves the technique (cutaway roofs, fixtures as data); it is bound to one terrace (`CROWN`, `crownToWorld`) and
   needs generalising before a second venue kind can use it. That is also what would make the BILLY JEANS / HAPPY
   HOGS branches in the new towns enterable.
4. 🟠 **A mission framework.** Missions are hand-written phase machines per act (`prologue.js`, `actone.js`,
   `nolantis.js`…). A shared "mission = data + objectives + fail/cleanup" layer would let side missions (taxi, courier,
   hit contracts, hurricane rescues) be written in an evening instead of a week.
5. 🟠 **The Mississippi (TASK-064)**: water you can swim in, boats, ferries, river fauna, levees.
6. 🟡 **Dynamic weather with consequences**: hurricane season, storm surge flooding the low districts, power cuts (the
   lamp system is already a single switch), debris. `weather.js` exists and only changes visuals.
7. 🟡 **Vertical world**: real bridges/overpasses/rooftops (vehicles and NPCs are 2-D circles today).
8. 🟡 **A proper server**: authoritative sim, persistence, accounts, anti-cheat — only if multiplayer becomes the
   point of the game.

---

## 4. Ideas — make it feel like Louisiana

Built this session (`louisianakit.js`, Oyster Bay): the three-spired cathedral, the square with the equestrian
statue and the beignet café, French Quarter galleries, a paddle-wheel steamboat, the Mardi Gras float den, Cajun
dance halls and daiquiri drive-thrus along the roads. **Designed and kit-ready but not placed yet** (next in line):

- **Oak Alley plantation** — a quarter-mile avenue of live oaks (`liveOaks()` with Spanish moss already exists),
  Greek Revival big house, cane fields. East forest, off Delta Road.
- **Avery Island pepper works** — the hot-sauce factory with a giant bottle water tower and a barrel yard.
- **The state pen and its rodeo** (Angola) — walls, towers, cell blocks, the Sunday rodeo arena. West band.
- **Chemical Row** — refinery flares and pipe racks along the river east of Port Calypso.
- **The Atchafalaya Basin bridge** — a long causeway over cypress swamp, with fishing camps and airboat launches.
- **The State Capitol** art-deco tower; **Lake Pontchartrain causeway** as an endless bridge you drive at night.

Gameplay that the setting hands you for free:

- **Mardi Gras**: a parade of floats moving along Front Street on a schedule, beads as a currency/heal pickup,
  masked crowds; a second-line jazz funeral procession you can join.
- **Hurricane night** as a free-roam event (flooding, sirens, looters, the zombies as a storm-surge of the dead).
- **Airboats and pirogues** as vehicles; gator hazards in the marsh; a fishing / crawfish-trap mini-game; a
  crawfish boil that heals the whole party.
- **Voodoo shop** (gris-gris buffs), Marie Laveau's tomb tour (the ghost already exists), Cajun food as timed buffs.
- **Zydeco / swamp-blues radio stations** (only four radio tracks exist today).
- **Zombie mode as an FPS campaign**: safehouses that need holding (the exclusion radius exists), waves that end at
  dawn, a horde "director" (quiet stretches, then a rush), crafted barricades, a lone boss (a Brute at the pen).
- **The DeLorean** should do something: a flux-capacitor boost (Space held → speed lines and a fire trail), a "time
  skip" that jumps the clock to the next dusk.

---

## 5. How this was checked

- `node --check` on every file in `src/`, `server/`, `serve.mjs`, `tools/`.
- Pure-node tests: `factions_test`, `weapons_test`, `police_test`, `traffic_test`, `pausemenu_test`, `zombie_test`.
- Headless Chromium (SwiftShader, muted): `tools/qa/fill_check.mjs` (roads clear + classified, density gates),
  `pop_check.mjs` (spawn picks per district), `gameplay.mjs` via `run_pw.mjs` (hp 100, 0 hostile, no console errors),
  screenshots of the first-person view, the gore, the DeLorean.
- **Not** checked (no GPU/audio device): frame rate, lighting on a real display, how any sound actually sounds.
