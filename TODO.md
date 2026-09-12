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
