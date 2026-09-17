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

`src/stateWorld.js` expands the map into a massive 5km x 5km state containing connected regions:
- Port Calypso & Docks: Industrial port connected to US-167 via Port Highway. Includes a lighthouse, container yard, fire station, supply depot, and newly added apartments, diner, and port authority tower.
- Cypress Hills & Red Dust Badlands: Off-road canyon and quarry connected via Red Dust Pass. Includes oil derricks, hilltop cabins, a radio tower, and a ruined schoolhouse and badlands motel.
- Lakeshore Marsh & Causeway: Swamp outskirts connected via Lakeshore Causeway. Includes stilt huts, fishing outposts, airboat tours, an abandoned diner, and a swamp edge market and apartments.
- Oyster Bay: Coastal town connected to US-167 via Oyster Highway. Includes a hospital, farmer's market, apartments, school, and seafood diner.

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
- [ ] Add additional bayou/dock shortcuts and a bridge activity encounter.
- [ ] Run the external Playwright QA harness and capture East Bank screenshots /
  draw-call measurements on a real browser.
