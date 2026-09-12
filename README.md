# Grand Theft Bayou: Louisiana Stories

A joke / experiment GTA-style game set in north Louisiana — **Chatham → Monroe → Ruston**
along US-167. Drive down the highway, jack cars, rob gas cans off the wrecks and the
strip malls, dodge Feral Hogs / Rednecks / Hoodrats, and get to the truck past the
Ruston line.

Vanilla **Three.js** (loaded from a CDN via import map), no build step.

## Graphics

The asset packs are low-poly / PSX-era: flat albedo textures, no surface data.
`src/graphics.js` rebuilds them as physically-based materials and renders the
result through a filmic HDR pipeline, so the models read as the real thing
rather than as untextured blocks. Nothing new is committed — every map is
generated in the browser at load.

- **Derived PBR maps.** Every albedo gets a tangent-space **normal map** (Sobel
  over luminance for macro relief + tiled value noise for micro-surface) and an
  **ORM map** (occlusion / roughness / metalness packed into RGB). Untextured
  hand-built geometry gets a shared micro-surface instead, so nothing is a
  perfectly smooth plane.
- **Material classification.** Each material is matched against its own name
  plus its mesh's and parent's, and mapped to a real surface: clearcoat car
  paint, chrome, glass, rubber, asphalt, masonry, corrugated sheet, wood,
  foliage, fabric, plastic. Signage becomes emissive.
- **Image-based lighting.** A physical sky with the sun just below the horizon
  is baked into a PMREM probe and used as the scene's environment, so metal and
  glass reflect something real. It is re-baked as the night deepens.
- **Pipeline.** ACES filmic tone mapping, PCF-soft shadows, then
  `RenderPass → GTAO → bloom → tone map → filmic grade → SMAA`. The grade pass
  does vignette, film grain, chromatic aberration and a teal/amber split-tone.
- **Resolution.** The scene renders into an internal buffer targeting up to
  4K and is downsampled to the canvas — real supersampling, not upscaling.
- **Quality tiers.** `4K ULTRA / HIGH / BALANCED / PERFORMANCE`, picked from the
  display and CPU at boot, shown bottom-left. A governor steps the tier *down*
  on its own if the frame rate can't hold it; **[** and **]** override it
  manually and switch the governor off.
- **Lighting.** A pool of six point lights is recycled onto whichever parking-lot
  poles and streetlamps are nearest the camera, so the whole strip reads as lit
  without blowing the forward renderer's per-object light budget.

All of the generated surfaces are built during `boot()`, between paints, so the
loader keeps reporting progress — doing it at module scope froze the menu on
"loading assets…" for the whole build.

## Characters — the Hoodrats

`src/characters.js` builds the Hoodrats procedurally: **two crews, red and
blue, in both sexes**, modelled on the reference photos — do-rag on the men, a
tied headband on the women, white ribbed tank (cropped on the women), crew
belt or leggings, baggy jeans, matching high-tops, chain and pendant, hoop
earrings.

They are built in code rather than loaded because no pack in the project has
anything close, and one builder then covers every combination plus per-spawn
variation (skin tone, build, denim wash, straight vs. curly hair) from a seed.
Geometry is shared across every instance; materials are shared too and only
cloned for an individual when it starts to fade out on death.

A Hoodrat exposes the same surface as an `AnimatedSprite` — `play` / `update` /
`setFlip` / `finished` / `material.opacity` — so it drops straight into the
enemy system and `updateEnemy()` never has to know it is 3D. It measures its
own travel each frame to face where it is walking and to scale the stride to
its real ground speed, so the same clip covers an amble and a sprint.
Animations: `idle`, `walk`, `attack`, `hurt`, `death`.

Open **`tools/characters.html`** on the dev server to inspect them — turntable,
orbit, animation switcher and a reroll for fresh variation.

## Run

**It has to be served over http.** Double-clicking `index.html` gives the page a
`file://` origin, and browsers block ES module loads from there — `src/main.js`
never runs and the menu sits on "loading assets…" forever. The page now detects
this and says so rather than hanging silently.

- **Windows:** double-click **`start-game.cmd`** — it starts the server and opens
  the browser for you.
- **Anywhere:** `npm start` (or `node serve.mjs 8899`), then open
  <http://localhost:8899>.

Then hit **Start the story**.

### Controls

| | |
|---|---|
| **WASD** | drive / walk |
| **F** | jack a car / get out / enter the truck |
| **Shift** | sprint on foot · handbrake in a car |
| **Space / left click** | shoot |
| **Q / E** or **right-drag** | rotate the camera |
| **M** | mute music |
| **[** / **]** | step graphics quality down / up |

## Layout

```
game/
  index.html        menu + HUD
  serve.mjs         tiny zero-dependency static server
  src/
    main.js         everything — world build, driving, enemies, wanted system
    graphics.js     PBR material pass + HDR render pipeline (see below)
    sprite.js       billboard sprite / atlas animation
  assets/
    sprites/        pixel-art atlases (built by tools/slice_*.py)
    models/         gltf / glb / fbx landmarks, vehicles, kit
    audio/ cover.png
tools/
    slice_sprites.py   APIgqp.jpg / S4KKpl.jpg  -> redneck / oldman atlases
    slice_swamp.py     Dead Swamp sheets        -> shroom / torch atlases
    inspect_models.py   dump gltf/glb structure
TODO.md               working notes / roadmap
```

## Assets

Built from third-party asset packs (itch.io / asset-store low-poly + pixel-art
packs). Licenses vary per pack; this repo is a personal experiment. Credits are
tracked in `TODO.md`. The original archives are **not** committed (see `.gitignore`).

The `cops` / wanted system stays dormant until you kill 12 Rednecks/Hoodrats
(`HEAT_KILLS` in `main.js`).
