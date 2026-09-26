# World-building audit and expansion notes

## Existing runtime map

- `src/main.js` owns the world bounds, ground, collision `BlockerGrid`, highway
  strip, Tusouxroe and asset loading.
- `src/orlearouge.js` owns the connected south city (`x -136..136`, `z
  196..382`): causeway, French District, downtown towers, shops, hospital,
  cemetery, construction site and riverfront casino.
- `src/westparish.js` owns the rural west transition: Parish Highway 9, Bayou
  Noir, cane fields, shacks, church/general store and forest clusters.
- `src/npc.js` supplies staggered idle/loiter/wander/flee/hostile behavior,
  group-facing, violence events and near/mid/far LOD. `src/traffic.js` uses
  explicit lane polylines and a pooled vehicle population.
- Coordinates follow `world.js`: north is `-Z`, east is `+X`, and player movement
  is camera-relative. Static geometry is registered with the blocker grid and
  camera occluders where appropriate.

## Asset inventory

| Family | Runtime use | Notes |
| --- | --- | --- |
| `models/urban` road/wall/window/roof/streetlamp kit | Existing city and Tusouxroe | Many variants remain available for future authored blocks |
| `models/buildings`, `burgerpiz`, `tacos`, `gasstation`, `sixtwelve` | Highway strip / west parish | Existing landmarks |
| `models/vehicles`, `models/cars` | Traffic, wrecks, parked cars, police | Existing pooled traffic |
| `models/shacks` | Chatboro, Bayou Noir, service yards | Existing sheds, fencing, barrels, pallets |
| `sprites` / character atlases | Enemies, NPC-like ambient population, swamp decor | `voodoo` source art remains unused by the runtime |
| `assets/city/models/textured` | East Bank expansion | Ten supplied low-poly GLBs: cottage, apartments, school, cafe, market, hospital, offices, garage, fire station, tower |
| `assets/models/trailerpark/chars` | Loader helpers exist | Character FBX assets are not currently used for ambient population |
| `assets/models/swamp` source images | Sliced shroom/torch runtime sprites | Several source images remain reference-only |
| `assets/gangster_rifle.zip` | Not imported | **Corrected 2026-09-14 (TASK-038 audit): usable now.** Contains a real glTF (`scene.gltf` + `scene.bin` + PBR textures) — loads directly with the existing `GLTFLoader` path. Earlier "not safe to import" note was wrong for this file. |
| `assets/Fence Pack.zip`, `assets/abandoned_office_space.zip` | Not imported | **Corrected 2026-09-14: partially usable.** Each contains loose `.fbx` meshes alongside Unity/Unreal-project-specific files (`.unitypackage`, `.uproject`/`.umap`/`.uasset`). The loose FBX (fence pieces; `bin.FBX`, `chair.FBX`, `flower_pot.FBX`, etc.) load like any other `assets/models/*` FBX — only the engine-project files are unusable. |
| `assets/Hoodrathavoc.zip` | Not imported | Character models in `.dff`/`.txd` (GTA/RenderWare format). Confirmed still not usable — Three.js has no RenderWare loader; needs an external conversion step. See TODO.md → Blockers. |
| `assets/City Bowels`, `Los Santos Mini Map.bbdoc` | Not imported, not tracked in git (`.gitignore`) | Large source bundles (~75MB / ~344MB); kept local only, not evaluated for runtime use. |
| `assets/City assets.zip`, `assets/crayon-city-architecture-v1.1.1.zip` | Already used | Identical `.glb` sets already unpacked at `assets/city/models/textured` (see the East Bank row above) — the zips are just the zipped source, nothing new to extract. |

## Current expansion

`src/stateWorld.js` expands the map into a 2.4 km x 2.4 km state. Its four
corner districts used to be five hand-placed buildings each, a kilometre of
empty road apart; since TASK-084 each is a composed town built from one shared
procedural kit (`src/townkit.js`: houses, shopfronts, motel, diner, gas stop,
warehouse, barn, stilt house, container yard, tank farm, crane, ship, quarry,
pier, boat, pole line — plain boxes with named, cached materials, so
`batchStatic` folds them):

- **Oyster Bay** (`src/oysterbay.js`, south-east, Oyster Highway z 600): a
  coastal town — gateway motel/diner/gas, Front Street's brick blocks and
  storefronts, four streets north (hospital, high school, church at the end),
  five south down to a harbour with a pier, boats and dock sheds, a town green,
  a cemetery of above-ground tombs, a water tower, BurgerPiz and Bayou Arsenal.
- **Port Calypso** (`src/portcalypso.js`, north-east, Port Highway z -600): a
  working container port — three container yards, a tank farm, warehouse rows
  down Dockside / Terminal / Quay Roads, a quay with gantry cranes and a ship
  alongside, the Port Authority tower and HQ, dockworkers' houses on Workers'
  Lane, and the lighthouse on its jetty.
- **Red Dust** (`src/reddust.js`, north-west, Red Dust Pass z -600): a sun-bleached
  badlands mining town — dirt Main Street with false fronts and a saloon, side
  streets of trailers and cabins, homesteads with barns, a quarry, a derrick
  field, red-rock mesas, the ruined schoolhouse, a chapel, the summit radio
  tower, and a red-dust ground instead of black grass.
- **Lakeshore Marsh** (`src/lakeshore.js`, south-west, Lakeshore Causeway z 750):
  swamp tourism — bait shops and airboat tours on the causeway, a lake with four
  boardwalk streets lined with houses on piles, Gator Road north into the
  cypress marsh to a tour landing and the Bayou Lodge, marsh pools.
- **The roads between** (`src/roadside.js`, profiles in `src/corridors.js`):
  US-167 north (farmland, a truck stop, billboards) and south (bayou), and the
  four connector highways, each a composer district of farmsteads, roadside
  stops, trailers, churches, billboards, pole lines and forest at country
  spacing (about half the slots left empty on purpose).

The towns carry Chatboro's own chains: a 6twelve and a GAS·N·GEAUX on every gateway strip and
corridor stop (`townkit` `shops.brandGas`, over main.js `makeGasStation`), a Popeyes in each town and
at each end of US-167 (`shops.popeyes`, over `makePopeyes`), and franchise frontages of the Crown
Strip's BILLY JEANS (Oyster Bay, Lakeshore) and HAPPY HOGS (Port Calypso, Red Dust) — exterior only
(`shops.club`); the walk-in interiors stay at the flagships in Tusouxroe North.

Every one is composed in `composer.js`'s stage order, registers its roads and
buildings with the spawn-zone classifier (`stateWorld.zoneAt` asks each
composer first), and adds its POIs, minimap shapes and traffic lanes.
`tools/qa/fill_check.mjs` audits it: every road drivable end to end, classified
as road, and each region above a mesh-density floor.

`src/eastbank.js` adds a connected East Bank beyond the original OrleaRouge
edge:

- Cypress Heights: cottages, apartments, school, yards, bins, fences and a
  quiet residential loop.
- Market Row: cafe, market, hospital, parking, loading area, dumpsters and
  civic lighting.
- Port Mercer: offices, garage, fire station, fenced service yard, freight,
  barrels, pallets and a drainage shortcut.
- Three east-west connectors plus a north-south spine are included in the
  traffic lane graph and spawn-zone classifier.

## Roadmap

- [x] Expand east edge with connected residential, civic/commercial and
  industrial districts.
- [x] Add authored landmarks, service relationships, shortcut and district
  transitions.
- [x] Reuse supplied low-poly city assets with static blockers and camera
  occluders.
- [x] Add district-specific NPC spawn zones and traffic lanes.
- [ ] Add role-specific civilian presentation (workers, residents, shoppers)
  without duplicating the enemy actor system.
- [ ] Add schedules/time-of-day population weights for Market Row and Port
  Mercer.
- [ ] Add a dedicated ambient pedestrian pool distinct from hostile enemies.
- [ ] Add interiors selectively (cafe, garage, fire station) after navigation
  and collision playtesting.
- [x] Fill the state map: the four corner districts as composed towns, the roads between them (TASK-084).
- [x] Four Louisiana set pieces off Delta Road: Belle Plantation and its oak alley, the Hot Bayou Pepper Works, Pelican Petrochemical, the Bayou State Penitentiary and Prison Rodeo (`src/wonders.js`, TASK-085).
- [ ] The west wilderness band (x -1050..-450, z -350..350) has no road into it yet: a spur off Parish Highway 9 or the Red Dust Pass, then the same treatment (a Cajun dance-hall crossroads, a sugar mill, a cypress-swamp airboat camp).
- [ ] Add additional bayou/dock shortcuts and a bridge activity encounter.
- [ ] Run the external Playwright QA harness and capture East Bank screenshots /
  draw-call measurements on a real browser.

## Delta Road wonders (`src/wonders.js`)

Four self-contained set pieces along the dirt track between Port Calypso and Oyster Bay, each a short spur off Delta Road, each composed
with `composer.js` from `townkit.js` / `louisianakit.js` (one composer, "Wonders", bounds x 440..1060 / z -340..380):

| Place | Ground | Reached by | What is there |
|---|---|---|---|
| Belle Plantation | x 470-750, z -312..-208 | Plantation Lane (gravel, from Delta at z -260) | oak alley (14 live oaks), big house, parterre, pond, gazebo, sugar kettles, store, lot |
| Hot Bayou Pepper Works | x 803-1048, z 96-208 | Pepper Lane (gravel, z 150) | two pepper fields, factory + stack, giant bottle, barrel house, tasting room (food service) |
| Pelican Petrochemical | x 809-1048, z -238..-32 | River Road (paved, z -40, east from Delta's jog) | columns, spheres, pipe racks, flare, tank farm |
| Bayou State Penitentiary & Prison Rodeo | x 548-800, z 236-366 | Rodeo Road (paved, z 300) | walled compound + towers (a zombie-mode safehouse), Warden's Surplus, rodeo ring, bleachers, bulls, lot |

Rules learned building them (also in `AGENT_LOG.md`): reserve the ground in `districts.js` KEEPOUTS as **two rects, one either side of the spur**
(a keepout is re-claimed after the corridor's roads, so a rect across a road makes it "building" ground); register the spur with Delta's composer
as a `junctions` entry (`SPURS`); and keep clear of OrleaRouge's grid (`CITY.maxX` 520) — the city cinematic and spawn rules key off it.
