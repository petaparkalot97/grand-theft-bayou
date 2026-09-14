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
| supplied `Fence Pack.zip`, `abandoned_office_space.zip`, `Hoodrathavoc.zip`, `gangster_rifle.zip`, `City Bowels`, `Los Santos Mini Map.bbdoc` | Not imported | Unity/Unreal/Marmoset/GTA-specific formats; not safe to wire into Three.js without conversion/licensing review |

## Current expansion

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
