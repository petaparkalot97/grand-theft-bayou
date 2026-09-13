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

### Atmosphere (`src/fx.js` + the fog patch in `graphics.js`)

- **Ground mist.** three's fog chunks are patched so every fogged material
  also gets exponential **height fog**, integrated along the view ray and
  broken into slow-drifting mist banks. `MIST` in `graphics.js` is the one
  live uniform object (time / density / falloff) shared by every program.
- **Volumetric light shafts.** Every streetlamp and lot pole gets a soft
  additive light cone, a pool of light on the ground and a lens halo. The lot
  lights, which had no geometry before, also get a steel pole and lamp head.
- **Headlights.** Whatever you drive gets two real spotlights with visible
  beams, lens flares and tail lights that flare up when you brake. The lights
  are always in the scene at zero intensity, because adding or hiding a light
  recompiles every lit shader.
- **Wet asphalt.** Every `surface("asphalt")` material is damp, with standing
  puddles laid out in world space. On **HIGH / 4K ULTRA** a planar mirror pass
  re-renders the scene from under the road, so lamps, beams and headlights
  reflect in the puddles (`TIERS[*].reflect` sizes that buffer).
- **Speed.** At speed the camera FOV opens up and the grade pass adds radial
  motion blur and extra chromatic aberration, keeping the centre of the frame
  sharp.

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

## Story — Prologue "Mud, Blood & Magnolia"

**Start the prologue** plays the opening of the script; **Free roam** skips
straight to the open strip.

1. **Cold open.** A sound collage and a radio dial over a black screen, then a
   dawn flyover of Dixie Beaux, the state-line billboard and Chatboro's water
   tower.
2. **Keseme's coupe.** The GPS tries to drive her into the swamp, and Mally
   calls: somebody stole his green Bravado, and it just passed her.
3. **Mission 1 — Hog Wild.** Follow the Bravado up US-167 and onto a dirt road
   into the woods, dodging the thief's shotgun. Lose it and the chase restarts.
   A hog stampede runs it through a fence. Bubba shows up with a tranquilizer
   rifle; clear the hogs together and take the car back.
4. **The ledger.** A duffel of cash, a book of names and badge numbers, and
   Sheriff Clay Mercer. Then the title card, and *Act One — Welcome Home*.

5. **Act One — Welcome Home.** Drive home to South Tusouxroe (north-east of the
   strip): the redevelopment radio gag, then the neighbourhood (the court, the
   dominoes, a porch plate sale, two crews squaring off under a luxury-condo
   billboard). Go inside to Emiko, lay the ledger out, and watch Keseme's
   evidence board connect everything to Pelican Crown Holdings and Project
   Nolantis, with coordinates pointing south to OrleaRouge.
6. **Blue Light Special** (OrleaRouge). Meet the journalist Solange Duval in the
   French District ("It's not a conspiracy. It's worse. It's business."), until
   the police raid the street. Keseme counts her way through the sensory
   overload, spots the east alley they left open, and the escape begins at
   three stars. Go through the nightclub kitchen, a wedding reception, the
   cemetery, a brass-band parade and the riverfront, down into the storm drain.
   Getting wasted mid-run puts you back at the last checkpoint. It ends in a
   flood tunnel at a door marked with a crown over three waves.
   *Nirbayou Nolantis is next.*

In cutscenes, **Enter** skips a line and **Esc** skips the scene.

## The map

US-167 runs north–south through the whole map:

- **Tusouxroe** (north): shopfronts along Main Street, the truck lot, and
  South Tusouxroe (the Nadia house) in the north-east corner. The redevelopment
  money never reached the roads: every street in town has 40 potholes, some full
  of rainwater, and hitting one at speed jolts the car (`src/potholes.js`).
- **The strip**: the businesses lining the highway.
- **Chatboro** (where you start): the trailer park, the swamp, and the state line.
- **The bayou causeway**: south of Chatboro, the highway crosses open swamp
  under an overpass with a camp beneath it, and a refinery burns to the east.
- **OrleaRouge** (south): a street grid around the boulevard. The French
  District's balconied rowhouses and jazz and daiquiri neon, downtown towers,
  the public hospital, a cemetery, a construction site with Pelican Crown's
  hoarding, and the riverfront promenade with a casino riverboat. Traffic runs
  the boulevard and two cross streets. The first time you arrive, Keseme has
  something to say about the place.
- **Parish Highway 9 and the rural west** (`src/westparish.js`).
  - A 750 m four-lane highway leaves US-167 in the middle of the strip, curves
    south-west through the pines, runs a long straight past the Bayou Noir Fuel
    rest stop, swings south, and comes into OrleaRouge on street 330. It's a
    second way into the city, built for driving fast, with traffic both ways.
  - A dirt road leads to **Bayou Noir** (pop. 212): a general store, the
    Baptist church, shacks, a barn, the water tower, and fenced sugar-cane
    fields. Hogs live out here, not downtown.

The strip mixes what's actually in `assets/`: gas stations, 6twelves, BurgerPiz,
Tacos, storefronts from `Buildings.glb`, and just two Popeyes.

North is −z and east is +x everywhere in the code (`src/world.js`); see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). OrleaRouge is built in
`src/orlearouge.js`. `MAP` in `src/main.js` holds the map's bounds. Cutscenes are
built with `src/cinema.js`, and the mission lives in `src/prologue.js`.

## Soundtrack

Drop audio files into **`assets/music/`** to add them to the background music,
and delete them to take them out. The game shuffles through everything in the
folder, and **N** skips to the next track. MP3, OGG, WAV, M4A, AAC, FLAC, OPUS
and WEBM all work.

- Locally, `serve.mjs` lists the folder live, so changes show up on the next
  page load.
- For static hosting, `npm run build` writes `assets/music/playlist.json`.
- If the folder is empty, the game falls back to `assets/audio/theme.mp3`.

## Performance and the living world

- **Draw calls.** Characters bake their parts per joint (`mergeRigid`), and
  static props are merged per material in 48 m chunks (`batchStatic`), both in
  `src/merge.js`. Static lights share a pool of the nearest 8.
- **Collision.** `src/spatial.js` puts blockers in a uniform grid, so a mover
  only tests what is near it.
- **NPCs** (`src/npc.js`). They're civilians: they idle, wander and loiter on
  their home turf and ignore you. Gunfire nearby sends them running. Only
  someone you actually hurt reacts: they fight back or flee, depending on
  temperament. Decisions run on staggered timers, and far-away NPCs are paused.
- **Spawning** (`src/spawnzones.js`). Who appears depends on where you are:
  people in towns and on the strip, rednecks at the trailer park and in Bayou
  Noir, the occasional hog in the woods and fields (never downtown, never on a
  highway, at most 4 at once).
- **Traffic** (`src/traffic.js`). Pooled cars drive both lanes of US-167, the
  city streets and Parish Highway 9. They keep their distance, stop for
  obstacles, and recycle ahead of and behind you.
- **Camera** (`src/camera.js`, tuning in `CAMERA_CONFIG`).
  - Click to capture the mouse and Esc to release it. Scroll to zoom.
  - The camera drifts back behind the car when you leave the mouse alone, and
    behind you when you walk forward for a while.
  - It pulls in when a building gets between you and it.
- **Vehicles** (`src/vehicles.js`). Every model's nose is corrected once, by
  definition, so cars drive the way they face.
- **Distance culling.** The western parish hides detail past 300 m, where the
  fog has already swallowed it.
- **F3** shows fps, frame time, simulation / AI / render cost and draw calls.
- **QA.** `tools/qa/gameplay.mjs` is a headless regression pass (walk, look,
  shoot, drive, NPCs, traffic, entity counts) for the browser-automation runner.

## Working on this with several AI agents

The project is set up for a team of coding agents (Claude as orchestrator,
plus Codex, Antigravity and Freebuff) working without stepping on each other:

- **[`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md)** — the rules: roles, how to claim
  a task, file locks, and why only the orchestrator edits `src/main.js`.
- **[`TODO.md`](TODO.md)** — the live task board: tasks with briefs, owners,
  locks, dependencies, a review queue, and test status.
- **[`AGENT_LOG.md`](AGENT_LOG.md)** — discoveries, decisions, interface
  contracts for every module, failed approaches, and test history.

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
| **WASD** | walk: **W** always goes where the camera looks · drive: **W** / **S** throttle and brake-reverse, **A** / **D** steer (the camera never changes where the car goes) |
| **F** | jack a car / get out / enter the truck |
| **Shift** | sprint on foot · handbrake in a car |
| **Space / left click** | shoot |
| **Mouse** | look around — click the game to capture the mouse, **Esc** releases it |
| **Wheel** | zoom the camera in / out |
| **Q / E** | rotate the camera (secondary) |
| **M** | mute music |
| **N** | next soundtrack track |
| **F3** | frame-time / draw-call readout |
| **F4** | orientation debug: world axes, player / camera / vehicle headings and arrows |
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
