# GRAND THEFT BAYOU: Louisiana Stories — TODO / progress

GTA-style joke game. North Louisiana: **Chatham → Monroe → Ruston** along US-167.
Built from dropped asset packs. Vanilla Three.js (CDN import map), no build step.

## How to run

```
node serve.mjs 8899          # NOT 5173 — that's the Euclydia dev server
```
…or `npm start`, or double-click **`start-game.cmd`** on Windows.
http://localhost:8899 → **Start the story**.

**Never open `index.html` by double-clicking it.** That is a `file://` origin,
browsers refuse to load ES modules from it, `src/main.js` never executes, and
the menu sits on "loading assets…" with the Start button still enabled — which
looks exactly like a hang. `index.html` now detects `file:` and prints an
explanation instead. (`.gitattributes` pins `*.cmd` to CRLF; the repo-wide
`eol=lf` would otherwise break the launcher on checkout.)

Controls: **WASD** drive/walk · **F** jack & exit vehicle (also enter truck) ·
**Shift** sprint / handbrake · **Space/Click** shoot · **Q/E** rotate camera · **M** music ·
**[ ]** graphics quality.

## Status — PLAYABLE

### Graphics: photoreal PBR pass (`src/graphics.js`)

The packs ship flat albedo and nothing else, so the whole scene is re-surfaced
at load. See the README's **Graphics** section for the full rundown. In short:

- `realize(root, {hint})` walks any loaded object and upgrades its materials —
  classified by material + mesh + parent name into paint / chrome / glass /
  rubber / asphalt / masonry / sheet / wood / foliage / fabric / plastic / skin.
  It is called from every loader and once more over the whole scene after
  `buildLevel()` to catch the hand-built landmarks. Materials carry a
  `userData.gtbRealized` tag so it is idempotent.
- Normal + ORM maps are derived from each albedo (Sobel over luminance + tiled
  value noise); untextured geometry gets a shared micro-surface.
- Sky → PMREM probe for IBL, re-baked as `state.dusk` advances.
- `RenderPass → GTAO → bloom → OutputPass → grade → SMAA`, internal buffer up to
  4K, downsampled to the canvas.
- Four tiers with an auto governor that only steps *down*; `[` / `]` override.
- Six-light pool recycled onto the nearest lot poles / streetlamps (`litSpots`).
  Pool lights now park at intensity 0 instead of `visible = false`, since
  toggling visibility changed the light count and recompiled every shader.

### Graphics: atmosphere pass (`src/fx.js`)

- Height fog + drifting ground mist patched into `ShaderChunk.fog_*`. `MIST`
  is a plain object on purpose: three clones Vector3 uniforms per material
  but shares plain objects, so one write updates every program.
- `addLamp(scene, spot)` for each `litSpots` entry: shaft + ground pool + halo
  (+ pole/head when `pole: true`).
- `createHeadlights(scene)`: 2 SpotLights, beams, lens + brake-light sprites on
  `state.veh`. Measures the car un-rotated once and caches it as `veh.fxDims`.
- `createWetRoads(...)`: wet/puddle shader on every asphalt material (found via
  `userData.surfaceKind`), plus a Reflector-style mirror render on HIGH/ULTRA.
  The asphalt meshes are hidden during that render (feedback loop otherwise).
- Grade pass: `uBlur` radial speed blur; FOV opens up at speed.

- [ ] Tune mist density, beam intensity and headlight brightness on the real
      GPU. Headless checks run on SwiftShader.
- [ ] Mirror pass doubles scene draw calls on HIGH/ULTRA. If the governor
      steps down too eagerly, lower `reflect` or cull the mirror camera's far
      plane to ~120.

### Hoodrats — 3D characters (`src/characters.js`)

Replaces the old "tinted oldman sprite sheet" Hoodrat. Red and blue crews,
male and female, built procedurally from the reference photos. Viewer at
`tools/characters.html`.

- `ENEMY_TYPES.hoodrat.kind` is now `"actor"`; `spawnEnemy` calls
  `randomHoodrat(rng, T.h)`. Nothing else in the enemy system changed — the
  actor implements the `AnimatedSprite` surface (`play` / `update` / `setFlip`
  / `finished` / `material.opacity` / `blob`).
- It reads its own per-frame travel to set yaw and stride rate, so it faces
  where it walks and the one walk clip covers ambling and sprinting.
- Geometry shared across instances; materials shared until an individual dies,
  at which point its materials are cloned so the fade doesn't drag the rest of
  the crew with it.
- Watch out: the `paint` rule in graphics.js used to match the bare substring
  `hood`, so "hoodrat" turned every material into clearcoat car paint. It is
  `hood` now.

- [ ] **Draw calls.** 45 meshes per male, 54 per female, ~6 spawned at a time —
      roughly +290 draw calls on a ~930-mesh scene. Each head alone is ~14
      rigid meshes. Merging the rigid groups per material (skull + jaw + eyes +
      brows + do-rag into one head mesh) would cut most of it without touching
      the rig, since only the joint pivots actually animate.

### Loading — two bugs this pipeline caused, and the fixes

1. **The menu froze on "loading assets…" and looked like the game wouldn't open.**
   The world's PBR surfaces (`groundTexture`, `surface("asphalt")`, `buildTrees`,
   `carParkTexture`) were generated at **module top level** — seconds of
   synchronous canvas work before `boot()` ran, so the loader text never
   updated and the page couldn't even paint. Worse on a machine `autoTier()`
   rated `ultra`, where `derive` was 1024 and every map cost 4x. Now staged
   inside `boot()` behind `await paint()` with its own loader lines
   ("pouring the asphalt…" / "laying the bayou floor…" / "planting the swamp…").
   First progress text at **~340 ms** instead of never.
2. **The tick loop rendered the full post chain behind the opaque overlay.**
   GTAO + bloom + SMAA + a 3072px shadow map, every frame, entirely hidden.
   It now idles at ~2.5 fps until `state.running` — enough to keep shaders
   compiled so there is no hitch on Start.

`TIERS[*].derive` is the knob that bit here: **keep it at 256–512**. Above that
the material pass gets slow enough to look like a hang and buys nothing (the
detail is high-frequency noise); below it, surfaces tiled many times — the
highway repeats its asphalt ~62x — band visibly.

**Numbers** (headless SwiftShader, warm, so dominated by software rasterisation
— a real GPU will be far quicker): ~10.7 s before the pipeline, ~17 s after.
The first run after a cold start spikes to ~35 s; that's contention, not the
pipeline. Worth re-measuring on the actual GPU.

- **Title screen** shows the provided cover art (`assets/cover.png`).
- **Theme music** (`assets/audio/theme.mp3`) loops on Start, M to mute.
- **Driving**: 25 drivable vehicles (PSX pack + Designersoup cars incl. the DeLorean
  at the pumps). Arcade handling, chase cam, handbrake, road-kill.
- **On foot**: redneck billboard sprite, auto-aim rifle, sprint/stamina.
- **Enemies** (only these three): **Feral Hogs** (3D, charge), **Rednecks**
  (billboard sprite) & **Hoodrats** (3D actors, red/blue crews, both sexes —
  see above). 16 spawned, herding you north. Voodoo Man fully removed.
- **Everything lines US-167** now — one continuous strip you drive past:
  `LANDMARKS` list in main.js = **9 Popeyes** + the **6twelve** (right at the spawn) +
  Tony's Pizza + the taco stand (`Tacos.glb`), alternating sides, each with a car
  park + parked cars + an **asphalt apron linking it to the highway**.
  - *Chatham* (spawn): trailer park (stylised mobile homes + 4 pedestrian FBX),
    "Bienvenue en Louisiane" sign, a few torches/shrooms, 2 shacks.
  - *Ruston* (north): two rows of `Buildings.glb` shopfronts, asphalt lot, the truck.
  - Water towers CHATHAM / MONROE / RUSTON.
- **Real models now used** for the key businesses:
  - **6twelve** — `sixtwelve/6twelve.fbx` (the small 1 MB pack, not the old 960-node one).
  - **BurgerPiz** — `burgerpiz/BurgerPiz.glb`, filtered to just the `BurgerPiz_*` meshes
    (dropped its background city + interior clutter → 9 meshes).
  - **Taco stand** — `Tacos.glb`, filtered to the stand + food meshes.
  - Stylised `makeSixtwelve` / `makePizzeria` kept as fallbacks if a load fails.
- **Shacks Shanties Sheds** pack (blend-only) → stylised `makeShed / makeBarrel /
  makePallet / makeFence` using the pack's corrugated / chainlink / barrel / pallet
  textures. Built a fenced **junkyard** (46, 92) + sheds in the trailer park.
- GLB mesh-culling (`loadGLB` cullRe/keepRe) took the scene from ~2200 meshes to ~930.
- Torch/shroom "weird orange orb" halos removed; torches near spawn have real lights.
- Redneck sprite tint softened (was near-solid red at distance).
- **Pickups**: 4-of-5 gas cans (goal), Popeyes buckets (+28 HP), $ cash counter.
- **Wanted / Sheriff**: dormant until you kill **12 Rednecks/Hoodrats combined**
  (`HEAT_KILLS` in main.js), then it kicks in at 2 stars and cruisers spawn.
- Win = 4 cans + reach truck → "left the parish". Die → **WASTED**. (BUSTED wired for later.)

## Asset usage

| pack | in game? |
|---|---|
| `APIgqp.jpg` / `S4KKpl.jpg` | player + Redneck sprites (`tools/slice_sprites.py`). The `oldman` sheet is no longer used for Hoodrats. |
| `Dead Swamp` | glowing mushrooms, bamboo torches (`tools/slice_swamp.py`). Voodoo-man sprite dropped entirely. |
| `PSX_Vehicle_Pack` | wrecks, parked cars, the escape truck, sheriff proto |
| `Designersoup Low Poly Car Pack` | drivable cars incl. DeLorean |
| `Gas_station` (6twelve) | strip landmark (FBX) |
| `Buildings.glb` | Ruston shopfronts |
| `Tacos.glb` | taco truck on the strip |
| `Trailer_Park` characters | pedestrians |
| `Urban_Modular_Demo` | shack walls, streetlamp, stop sign |
| `TownTileSet` | copied, not wired (GLB has no embedded textures) |
| **NOT USED (off-theme / unusable):** Downtown City MegaKit (dense city — dropped), Retro PSX Mansion, Trashville, Pizzeria_Scene.glb (100 MB), "Shacks Shanties Sheds" (.blend only), Modular Village / RCC / azul / PP furniture (2D tilesets) |

## Backlog — everything still to do (updated 2026-09-12)

### In progress: performance / NPCs / traffic / camera pass
Spec: the "improve the existing game substantially" brief (perf, NPC behaviour,
ambient traffic, GTA-style mouse camera). Diagnose first, test each subsystem.

Measured baseline (headless, HIGH, 1280×720, after the light + resolution fixes):
sim 0.9 ms, AI 0.55 ms, **render submit 15.8 ms, 1,259 draw calls**, 279k tris,
1,434 visible meshes. The bottleneck is draw calls, not AI.

- [x] ~21 always-on PointLights folded into the nearest-8 light pool (`poolLight`).
- [x] HIGH no longer supersamples (`TIERS[*].ss`); only 4K ULTRA does.
- [x] Mirror pass: far plane 130, every 2nd frame on HIGH.
- [x] GTAO at half resolution, 10 samples on HIGH.
- [x] F3 frame-time / draw-call overlay (hidden by default); fixed-step
      simulation (1/30 s steps) so game speed no longer depends on fps.
- [x] Cut draw calls: `src/merge.js` — `mergeRigid` bakes each Hoodrat's parts
      per joint + material; `batchStatic` merges static props per material in
      48 m chunks. Measured: meshes 1,434 → 866, draw calls 1,259 → 450,
      tris 279k → 171k, render submit 15.8 → 12.3 ms, no new console errors.
- [x] `src/spatial.js` (BlockerGrid) drives `resolveCollision` and car
      collision. Sim 0.88 → 0.45 ms, AI 0.55 → 0.14 ms.
- [x] Allocations removed from on-foot movement and driving collision
      (scratch vectors).
- [ ] Batch by material *signature* too: 406 static materials are only 152
      distinct setups, so identical-but-separate materials still split batches.
- [ ] Pooled lights never toggle `.visible`; muzzle, wreck and 2 beacon lights
      are created up front (a light added mid-game recompiled every shader).
      Implemented; the first-shot hitch needs checking on a real GPU.
- [x] NPC behaviour system (`src/npc.js`): temperaments, home turf (POIs),
      idle / wander / loiter / flee / hostile, violence events, max 7 hostile,
      staggered thinks, distance LOD. Tested (`tools/qa/gameplay.mjs`): at rest
      0 hostile, the rest wander / loiter / idle; 5 shots → 8 flee, 0 hostile;
      player HP stayed 100 for the whole run (the old build got WASTED in 9 s
      standing still). NPC count stays under the cap of 40.
- [x] Traffic (`src/traffic.js`): 8 pooled cars on two lanes, spacing, stops
      for obstacles, recycles ahead/behind. Tested: cars stay in their lanes
      (x = −3.6 / −8.4) at 12–19 m/s, pool stays 8, vehicle count flat at 60.
      Fixed: cars queued forever behind a pedestrian at the road edge; they now
      ease past after 3 s (not yet re-observed in a test).
- [x] Pointer-lock camera (`src/camera.js`): click to capture, clamped pitch,
      wheel zoom, auto-recentre behind the car, pull-in past buildings at low
      angles; Q/E secondary; right-drag fallback. Tested headless: click locks
      the pointer and mouse movement turns the view; right-drag turns it too;
      walking and driving both work with it.
- [ ] Verify in a real browser: **Esc releases the mouse** (headless Chromium
      ignores a synthetic Esc for pointer lock), wheel zoom, camera pull-in, and
      the feel of the mouse sensitivity.
- [ ] Draw calls while driving are still ~1,160 (the chase view sees far down
      the strip, plus the road mirror). Candidates: cull the mirror pass to
      objects near the road, give traffic cars LOD, batch by material signature.
- [ ] Traffic only runs on US-167. Ruston's main street (z ≈ −78) could get a
      cross lane; cars could honk at, or steer around, a player standing in the road.
- [ ] Bugs found while reading the code:
  - [x] Tracers created a geometry + material per shot, never freed → pooled.
  - [x] Wrecked vehicles stayed in `vehicles` (F could enter an invisible car).
  - [x] Dead sheriff units stayed in `sheriffs`.
  - [x] `fire()` auto-aimed at any NPC → hostiles first, bystanders only when
        aimed at along the camera direction.
  - [x] Pre-existing 404s: `cars/387359…png` (the Designersoup FBX points one
        folder above its .fbm directory) and the Trailer Park FBX's absolute
        texture path. Redirected with a `LoadingManager` URL modifier; the load
        now finishes with 0 console errors and 0 failed requests.
- [ ] Player is the redneck sprite, so it can't face the camera direction while
      aiming; the Keseme 3D actor (story work) would fix this.
- [ ] Full test pass: walk, drive, enter/exit, shoot, NPCs, traffic, pointer
      lock / Esc, many NPCs + cars, console clean.

### Story: Prologue "Mud, Blood & Magnolia" + Mission 1 "Hog Wild" (not started)
From the script the user supplied (Dixie Beaux; protagonist Keseme Nadia).
Planned as the playable opening, with the current gas-can loop continuing after it.
- [ ] Rebrand the world: Dixie Beaux; Chatham → **Chatboro** (water tower
      "FAITH — FAMILY — FREEDOM / TERMS AND CONDITIONS APPLY"); Monroe/Ruston →
      **Tusouxroe**. Welcome billboard "SPORTSMAN'S HEAVEN — EVERYBODY ELSE'S
      PROBLEM" + graffiti "HEAVEN GOT A LOW BAR"; "LUXURY CONDOS COMING SOON /
      WHERE WE SUPPOSED TO GO?" billboard. Update menu, HUD, win/lose/busted copy.
- [ ] Cinematic system: letterbox, speaker subtitles, location / mission / title
      cards, camera shots, Enter skips a line, Esc skips a scene; synthesized SFX
      (shotgun, siren, phone ring, hog squeal) — no new audio assets.
- [ ] Cold open: black screen sound collage, radio dial gags, dawn aerial over
      the strip, welcome billboard, Chatboro water tower, into Keseme's coupe.
- [ ] In-car GPS gag + phone call with Mally; the green Bravado passes.
- [ ] Mission 1 "Hog Wild": follow the stolen Bravado (rubber-banded AI, lose
      it = retry), thief shotgun exchange, turn-off onto a dirt road into the
      woods east of the strip, hog stampede, crash through a fence, Bubba's
      pickup arrives, clear the hogs with Bubba (tranq rifle), retrieve the car.
- [ ] Ledger scene: Mally arrives, duffel of cash + ledger, sheriff convoy,
      Sheriff Clay Mercer + deputies, bag handed over but ledger kept, title
      card blown apart by a shotgun blast, "ACT ONE — WELCOME HOME".
- [ ] Characters: extend `characters.js` (skin / top colour / headwear / hat /
      beard options) for Keseme (player, replaces the redneck sprite), Mally,
      Bubba, Mercer, deputies.
- [ ] Menu: "Start the prologue" + "Free roam" (skip story).
- [ ] Later acts from the script (not scoped): Tusouxroe + Nadia family house,
      the ledger map, OrleaRouge (French District, "Blue Light Special" raid
      escape), flood tunnel, Nirbayou Nolantis (underwater city), Governor
      Bellefontaine, Pelican Crown Holdings arc, branching endings.

### Graphics follow-ups
- [ ] Tune mist / beams / headlights on a real GPU (headless is SwiftShader).
- [ ] Traffic cars have sprite head/tail lights only; consider sharing the
      player's headlight rig with the nearest oncoming car.

## Now / Next / Later

**Now**
- [ ] Playtest in a *foreground* window (automation tab can't run the loop) —
      especially to check the real frame rate at HIGH / 4K ULTRA on this GPU.
      Headless verification runs on SwiftShader and always drops to PERFORMANCE.
- [ ] Stylised landmarks (Popeyes, trailers, water towers) are still plain
      coloured boxes with only micro-surface on them. They are the weakest
      remaining surfaces — real textures or more geometry would sell them.
- [ ] Pre-existing, unrelated to the graphics work: `loadDsCar` /
      `loadFbxScene` share one `FBXLoader`, and `setResourcePath` leaks between
      them under `Promise.all` — one car texture 404s
      (`cars/387359c5...png`). The `Trailer_Park` chars FBX also has an
      absolute `C:/Users/srkak/...` texture path baked in.
- [ ] Taco stand (`Tacos.glb`) is ~358 meshes — biggest single draw cost. Swap for a
      stylised taco truck if framerate suffers.
- [ ] Torch sprites still read as carved poles more than flames — bigger flame frame or a 3D torch.
- [ ] Tune car handling + enemy aggro while driving.

**Next**
- [ ] Make the Sheriff escapable — currently no give-up timer once they're active.
      Tune `HEAT_KILLS`, spawn count, ram damage.
- [ ] Mission structure ("Louisiana Stories" — a few numbered jobs per town).
- [ ] Minimap / waypoint arrow (easy to get lost on the highway).
- [ ] Wire Trailer_Park.fbx scene + Tacos_Props / Pizzeria props as set dressing.
- [ ] Airboat (cover art!) for the bayou stretches.

**Later**
- [ ] Actually drive the escape truck out instead of instant win.
- [ ] Radio stations / more tracks.
- [ ] Pedestrian AI (walk, flee, get in cars).

## Web / deploy

- **Landing page**: `index.html` at repo root (GTA-styled, links to `./game/`).
- **Discord unfurl**: `og.png` (1200×630, `tools/make_og.py`). OG/twitter meta in
  `index.html` — URLs hardcoded to `https://grand-theft-bayou.pages.dev/`. **If the
  Cloudflare Pages project name isn't `grand-theft-bayou`, fix those 4 `og:*` /
  `twitter:*` URLs.**
- **Cloudflare Pages**: `wrangler.jsonc` sets `pages_build_output_dir = "."`;
  `package.json` has a no-op `build` script so the dashboard's `npm run build` passes.
  Static site — no framework, Three.js from CDN.

## Open questions
- Cops: how weak? (spawn distance, count, give-up timer)
- Map scale feel OK, or tighten the three towns closer together?
