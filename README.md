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
7. **Nirbayou Nolantis** (`src/nolantis.js`).
   - **The descent:** the door opens onto a glass elevator that drops past rock,
     submerged ruins and waterways full of fish. It clears the rock above a
     hidden city beneath the Gulf: shell and coral towers, gardens under an
     artificial sun, a silent monorail, children in the plaza, no billboards.
   - **The arrival:** Dr. Amara Veaux and the Civic Guardians meet you ("Man,
     even Atlantis disrespect me.").
   - **The tour:** walk it with Amara: the housing terraces, the health garden,
     the public kitchen and vertical farm, and the public ledger with every
     expenditure ticking live.
   - **The Truth:** a projection of Dixie Beaux in the archive, where Pelican
     Crown's reach lights up.
   - **The return:** the elevator takes you back up to OrleaRouge.

In cutscenes, **Enter** skips a line and **Esc** skips the scene.

## Multiplayer foundation

The game includes a real, server-authoritative four-player WebSocket foundation.
The browser remains responsible for Three.js rendering; the Node server owns
rooms, character reservations, ready state, player input and 20 Hz movement
snapshots. Static world assets are never sent over the network.

Run the client and server in separate terminals:

```text
npm install
npm run server          # ws://localhost:8787, /health is available
npm start               # http://localhost:8899
```

Open the game in up to four browser windows. Choose **Multiplayer · Create /
Join**, create a room, share its `BAYOU-XXXX` code, select distinct characters,
ready everyone, and let the host start. The server rejects full rooms,
duplicate characters and invalid room/player messages. A disconnected player is
removed and the host is reassigned. The client interpolates other players and
shows connection/ping state in the lobby.

For deployment, run `npm run server` as a Node Web Service (Render or another
host), expose its port through `PORT`, and set `window.__MULTIPLAYER_URL` to the
production `wss://...` endpoint before loading the client. The current server
keeps room state in memory intentionally; a restart ends active rooms. Combat,
vehicles, NPC relevance and mission authority have protocol integration points
but remain the next multiplayer milestones.

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
- **Lafourchette, the east bank** (`src/eastbank.js`). South Tusouxroe's street
  keeps going east as Lafourche Road: storefronts, three side streets of
  shotgun houses with porches, a parking lot, the Saturday market, a ball
  field, pines, and St. Jude of the Levee at the end of the road. It's laid out
  by `src/composer.js` in a fixed order (road → buildings → side streets →
  open areas → vegetation → landmark), so it reads as a place rather than a
  scatter.

The strip mixes what's actually in `assets/`: gas stations, 6twelves, BurgerPiz,
Tacos, storefronts from `Buildings.glb`, and one Popeyes; the other stands on the
OrleaRouge boulevard (`POPEYES_LOCATIONS`).

People you put down drop what they carried: cash in $5 to $50 notes, and
sometimes a gun (a Tec-9, a sawed-off, or rarely a deer rifle) that replaces
your 9mm until it runs dry. Walk over a drop to take it.

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
- **Car-jacking** (`src/hijack.js`). Traffic cars have drivers. Press E by a
  slow or stopped one and Keseme walks to the driver's door and hauls the
  driver out. Timid drivers run; brave ones swing at you. Then the car is
  yours. It's a small crime, so the Sheriff notices if he's already on to you.
- **Radar** (`src/minimap.js`). A GTA San Andreas-style minimap, bottom-left.
  - It turns with the camera, with an N on the rim; your arrow shows which way
    you face.
  - Blips: the story waypoint (pinned to the rim when it's off-radar), gas
    cans, the escape truck, cops and anyone hostile.
  - It zooms out as you drive faster, and is drawn from the level's real roads,
    water and buildings.
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
| **WASD** | walk (first person: strafe and move where you look) · drive: **W** / **S** throttle and brake-reverse, **A** / **D** steer |
| **Mouse** | look and aim — click the game to capture the mouse, **Esc** releases it. **This is a first-person shooter**: on foot the camera is your head |
| **Left click** | shoot / swing (the weapon starts drawn; **X** puts it away). The click that captures the mouse never fires |
| **Right click** | aim down the sights (zoom, steadier hand) |
| **1 – 5** | bat · 9mm · Tec-9 · sawn-off shotgun · deer rifle (mouse wheel cycles too) |
| **R** | reload on foot · **in a car or on a bike: switch the radio on / off** (there is no other music) |
| **F** | torch on / off (first person) |
| **V** | first person <-> the old third-person orbit camera |
| **E** | get in / out of a car · use whatever you are standing at: a slot machine, the bar, the stage, a Pay 'n' Spray, a hospital, a gun counter (guns and ammo), a Popeyes counter (chicken and ammo, no guns) |
| **Shift** | sprint on foot · handbrake in a car |
| **Space** | jump — high, and it costs stamina · the DeLorean hovers: **Space** hops it |
| **Tab** | the Pip-Boy (zombie mode): S.P.E.C.I.A.L., skills, perks, traits — spend level-up points here |
| **C** | crouch (the sneak: slower, quieter, harder for the dead to notice) · **C C** quickly: prone (the crawl: slowest, the most stealth) · **C** again stands · sprinting stands you up |
| **K** | mute the car radio on its own (or click 📻 next to the ♪ button) |
| **Right Shift + Q / E** (or **← / →**) | turn the view (secondary) |
| **F3** | frame-time / draw-call readout |
| **F4** | orientation debug: world axes, player / camera / vehicle headings and arrows |
| **[** / **]** | step graphics quality down / up |

## Layout

```
index.html            menu + HUD
serve.mjs             tiny static server (dev)   ·   server/  multiplayer + map-editor server (Node, ws)
src/
  main.js             the game loop and everything that is not a module below: boot, driving, combat, HUD, wiring
  — the world —
  composer.js         staged district builder (road > buildings > side streets > open areas > vegetation > landmark)
                      on an occupancy grid; townkit.js / louisianakit.js are its procedural building kits
  stateWorld.js       the whole state outside the three original towns: regions, corridors, ambient zones
  tusouxroe / eastbank / westparish / chatboro / shruston / charsoufre / orlearouge / oysterbay /
  portcalypso / reddust / lakeshore / roadside / corridors / nolantis .js    the districts and roads
  — the people —
  npc.js  zombies.js  crowd.js  factions.js  police.js  traffic.js  spawnzones.js  safehouses.js  hijack.js
  — the player —
  camera.js  fpsview.js  weapons.js  weapons_3d.js  gore.js  loot.js  services.js  stats.js  pipboy.js
  — story —  prologue.js  actone.js  klan.js  newton.js  cinema.js  ...Campaign.js  pedestrianChatter.js
  graphics.js         PBR material pass + HDR render pipeline (see above)
  fx.js daycycle.js weather.js worldtime.js     atmosphere and time
assets/
  vendor/three/       three.js r160 (module + only the addons the game imports), vendored — no CDN
  sprites/ models/ audio/ ...
tools/
  build-site.mjs      builds dist/ (the deployable game only)      qa/   headless QA and unit tests (npm test)
  pedestrian-voiceover-gen.mjs   Fish Audio bark generator (--check: CI coverage test)
docs/                 AUDIT.md, WORLD_BUILDING.md, ZOMBIE_TRANSFORMATION_PLAN.md
TODO.md               the task board and hand-off notes        AGENT_LOG.md   decisions and test history
```

## Assets

Built from third-party asset packs (itch.io / asset-store low-poly + pixel-art
packs). Licenses vary per pack; this repo is a personal experiment. Credits are
tracked in `TODO.md`. The original archives are **not** committed (see `.gitignore`).

The `cops` / wanted system stays dormant until you kill 12 Rednecks/Hoodrats
(`HEAT_KILLS` in `main.js`).
