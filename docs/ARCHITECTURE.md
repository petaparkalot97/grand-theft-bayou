# Grand Theft Bayou: core architecture

Read this before touching movement, the camera, vehicles, NPCs or spawning. It
exists because orientation bugs are easy to reintroduce: a car that drove
backwards and controls that inverted after leaving a car both came from systems
disagreeing about what "forward" means (TASK-033).

## World coordinates (`src/world.js`)

| Direction | Axis | On the map |
|---|---|---|
| North | −Z | Tusouxroe |
| South | +Z | Chatboro, the causeway, OrleaRouge |
| East | +X | |
| West | −X | |
| Up | +Y | |

- **Heading** `h` (players, vehicles, NPCs, traffic, sheriffs): the forward vector
  is `(sin h, 0, cos h)`. Right is `(−cos h, 0, sin h)`.
  - `h = 0` faces south, `π/2` east, `π` north, `−π/2` west.
  - Use `forwardFromHeading`, `rightFromHeading`, `headingFromVector`. Don't
    write the trig inline.
- **Camera yaw:** the camera orbits at `focus + (sin yaw, cos yaw)·dist`, so it
  looks along heading `yaw + π`. `yaw = 0` looks north.
  - Use `cameraYawToHeading` / `headingToCameraYaw`.
- **Compass bearing** (HUD, debug): `bearingDegrees(h)`, clockwise from north.

## Input (`src/input.js`)

- One source of truth. Gameplay asks about actions, never key codes:
  `input.isDown("forward")`, `input.axis("back", "forward")`,
  `input.onPress("interact", fn)`. Bindings live in `DEFAULT_BINDINGS`.
- Exceptions:
  - mouse look belongs to `camera.js`;
  - Enter / Esc in cutscenes belong to `cinema.js`.

```
MOUSE ─→ camera orientation            KEYBOARD ─→ player intent
camera orientation + intent ─→ world movement vector   (on foot)
KEYBOARD ─→ vehicle controls ─→ vehicle heading ─→ vehicle movement   (driving)
```

## On foot (`onFootUpdate` in `src/main.js`)

- `movement = cameraForward·(W−S) + cameraRight·(D−A)`, normalized, where
  `camCtl.forward()` / `camCtl.right()` are flattened onto the ground.
- W always walks where the camera looks, at any camera angle.
- The character (`characters.js`) turns to face the way it is actually moving.
  There's no separate facing input.

## Camera (`src/camera.js`)

- **Tuning:** every value is in `CAMERA_CONFIG`: sensitivity, pitch limits,
  per-mode distance / height / follow strength / recentring.
- **Mouse:** Pointer Lock; the mouse orbits without a held button. Right-drag
  is a fallback while the mouse is free.
- **Recentring:**
  - driving: behind the car after 1.4 s without mouse input (above 2 m/s);
  - on foot: behind the walking direction after 2.5 s, only while walking
    forward-ish, so strafing doesn't spin the view.
- **Collision:** a blocker-grid ray pull-in plus overhead occluder boxes
  (`setOccluders`). It snaps in and eases out; it never teleports.

## Vehicles (`src/vehicles.js`)

- **Game forward is local +Z.** `VEHICLE_DEFS` records each asset's measured
  nose axis, and `normalizeVehicleModel()` wraps the model in a root group
  rotated once. That is the only place a model's orientation is corrected.

  | Pack | Models | Nose |
  |---|---|---|
  | Kenney-style | `Car_1_R/B/Y`, `Van_1`, `Pick_Up_1`, `Truck_1` | −Z |
  | Designersoup | `Beatall`, `Landyroamer`, `docLorean`, `Tristar Racer`, `Toyoyo Highlight` | −X |

- **Adding a car:** add a definition, then check it with `tools/qa/controls.mjs`
  (model-orientation screenshots) or the F4 overlay (the red arrow must leave
  the nose).
- **Arcade model:** `stepArcadeVehicle(v, { throttle, steer, brake }, dt)`. W
  accelerates along the vehicle's own heading and A/D steer. S brakes, then
  reverses. The camera never changes where the car goes.
- **Record** (`registerVehicle`): `{ obj, heading, speed, def, seats, … }`.
  `seats[0]` is the driver.
  - Traffic cars have an `"npc"` driver.
  - `canHijack(v)` is the hook for the future GTA-style hijack (open door, pull
    the NPC out, take the seat).
  - Entering / exiting today is `enterExitVehicle()` in `main.js`, and the
    player steps out of the driver's (left) door via `exitOffset()`.

## NPCs (`src/npc.js`)

- **Civilians by default:** `DEFAULT_AGGRESSION = 0`. States:
  - `idle` / `loiter` / `wander`: going about their business on their home turf;
  - `flee`: violence nearby, then calm down;
  - `hostile`: only after the player hurts them. "Brave" people and
    "territorial" hogs fight back; the rest flee.
- Standing next to someone does nothing.
- A hog's home turf is the woods it spawned in. People hang out at POIs.
- LOD: near NPCs think and animate fully, mid-range rarely, far ones pause.

## Spawning (`src/spawnzones.js`)

Every spawn point is classified into a zone, and the zone's mix decides who
appears:

| Zone | Where | Who |
|---|---|---|
| urban | OrleaRouge streets | people at hangouts |
| town | Tusouxroe (z < −50) | people |
| commercial | US-167 strip frontage | people |
| residential | trailer park, junkyard | mostly rednecks |
| rural | Bayou Noir, its dirt road, cane fields, the rest stop | rednecks, some hogs |
| forest | the pines (old map and the west) | occasional hogs, rednecks |
| highway | the carriageway | nobody |
| water | the causeway | nobody |

- Hogs are capped at `HOG_CAP` (4) alive.
- The population is capped at `ENEMY_CAP` (30) in `main.js`.

## Map structure

- **US-167** runs north–south along x = −6:
  - Tusouxroe north (shopfronts from `Buildings.glb`, Main Street, South
    Tusouxroe and the Nadia house);
  - the strip (15 lots: 2 Popeyes, 2 gas stations, 2 6twelves, 2 BurgerPiz,
    2 Tacos, 5 `Buildings.glb` storefronts);
  - Chatboro (spawn, trailer park, junkyard);
  - the bayou causeway (z 136–192);
  - OrleaRouge (z 196–382), a street grid built by `src/orlearouge.js`.
- **Parish Highway 9 and the rural west** (`src/westparish.js`; x from −440 to
  −150):
  - **Road hierarchy:** US-167 (major) → Parish Highway 9 (highway) → the dirt
    road to Bayou Noir (rural) → OrleaRouge's street grid (local).
  - **The highway:** a 747 m, four-lane Catmull-Rom route from US-167 at z ≈ 8
    to OrleaRouge street 330. The centreline is sampled at import, so
    `onParishHighway(x, z, pad)` works as a keepout before anything is built.
  - **Bayou Noir:** store and church from `Buildings.glb`, shacks, barn, water
    tower, cane fields. Also a rest stop (gas-station asset), and chunked
    instanced forest plus swamp water.
  - **Culling:** the hamlet, the rest stop and each forest chunk are culling
    clusters, hidden more than 300 m from the camera. Keep new parish detail
    inside a `cluster()` so it stays culled.
- **Bounds:** the `MAP` object in `main.js` (x −440 … 136, z −136 … 382). Use it,
  not `WORLD`, for any bound.
- Story chapters live in their own modules (`prologue.js`, `actone.js`,
  `bluelight.js`) and are phase machines: `buildSet / start / update / phase / debug`.

## Debug tools

- **F4:** the orientation overlay (`src/debug.js`). World axes; player / camera /
  vehicle headings and vehicle forward, speed and model definition. Arrows over
  the player:
  - blue: north;
  - green: player;
  - yellow: camera;
  - red: vehicle.
- **F3:** performance overlay (fps, frame ms, draw calls).
- **HUD compass:** under the wanted stars, shows the camera's bearing.
- **`window.__game`:** QA access (`teleport`, `camCtl`, `vehicles`, `spawnZones`,
  `input`, story modules).

## Tests

- `tools/qa/controls.mjs`: the TASK-033 acceptance tests.
  - Camera-relative walking at 0 / 90 / 180 / 270°.
  - Vehicle heading vs. camera, and model-orientation screenshots.
  - Calm and provoked NPCs; spawn zones and a live hog census.
  - Aerial shots of the strip.
- Regressions: `gameplay.mjs`, `prologue.mjs`, `actone.mjs`, `bluelight.mjs`,
  `orlearouge.mjs`, `potholes.mjs`.
