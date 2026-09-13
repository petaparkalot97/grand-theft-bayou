// ---------------------------------------------------------------------------
// world.js — the one authoritative world orientation. Every system that needs
// to know which way is north, or what "forward" means, asks here.
//
//   NORTH = −Z   (Tusouxroe, the top of the map)
//   SOUTH = +Z   (Chatboro, the causeway, OrleaRouge)
//   EAST  = +X
//   WEST  = −X
//   UP    = +Y
//
// This matches the map as it was built; it is documented, not changed.
//
// HEADING (players, vehicles, NPCs, traffic): an angle h around +Y whose forward
// vector is (sin h, 0, cos h). So h = 0 faces SOUTH, π/2 EAST, π NORTH, −π/2 WEST.
// An Object3D whose model faces local +Z faces its heading when rotation.y = h
// (models that don't face +Z are corrected once, in vehicles.js).
//
// CAMERA YAW (camera.js): the camera orbits at focus + (sin yaw, cos yaw)·dist
// and looks back at the focus, so it looks along heading yaw + π. yaw = 0 looks
// NORTH.
//
// The right-hand vector of heading h is forward × up = (−cos h, 0, sin h).
// ---------------------------------------------------------------------------

export const WORLD_DIRECTIONS = Object.freeze({
  NORTH: Object.freeze({ x: 0, y: 0, z: -1 }),
  SOUTH: Object.freeze({ x: 0, y: 0, z: 1 }),
  EAST: Object.freeze({ x: 1, y: 0, z: 0 }),
  WEST: Object.freeze({ x: -1, y: 0, z: 0 }),
  UP: Object.freeze({ x: 0, y: 1, z: 0 }),
});

/** Headings (see above) for the four compass points. */
export const HEADINGS = Object.freeze({ SOUTH: 0, EAST: Math.PI / 2, NORTH: Math.PI, WEST: -Math.PI / 2 });

const TAU = Math.PI * 2;
/** Wrap an angle into [−π, π). */
export const wrapAngle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

/** Forward vector of heading `h`, written into `out` (anything with x/y/z). */
export function forwardFromHeading(h, out) {
  out.x = Math.sin(h); out.y = 0; out.z = Math.cos(h);
  return out;
}

/** Right-hand vector of heading `h`, written into `out`. */
export function rightFromHeading(h, out) {
  out.x = -Math.cos(h); out.y = 0; out.z = Math.sin(h);
  return out;
}

/** Heading of a direction on the ground (x, z). */
export const headingFromVector = (x, z) => Math.atan2(x, z);

/** The heading a camera with this yaw is looking along. */
export const cameraYawToHeading = (yaw) => wrapAngle(yaw + Math.PI);

/** The camera yaw that sits behind something facing heading `h`. */
export const headingToCameraYaw = (h) => wrapAngle(h + Math.PI);

/** Compass bearing in degrees, clockwise from north (N 0°, E 90°, S 180°, W 270°). */
export function bearingDegrees(h) {
  const d = (Math.atan2(Math.sin(h), -Math.cos(h)) * 180) / Math.PI;
  return (d + 360) % 360;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** "N", "NE", … for a bearing in degrees. */
export const compassPoint = (deg) => POINTS[Math.round(deg / 45) % 8];
