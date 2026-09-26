// ---------------------------------------------------------------------------
// vehicles.js — vehicle definitions, model orientation, seats, and the arcade
// driving model.
//
// THE ONE PLACE ASSET ORIENTATION IS NORMALIZED. The game's vehicle forward is
// local +Z (world.js: heading h → forward (sin h, 0, cos h)). Imported models
// don't agree, so each definition records the axis its nose actually points
// along, measured with a side-view probe (see AGENT_LOG, TASK-033):
//
//   Kenney-style FBX (Car_1_*, Van_1, Pick_Up_1, Truck_1)   nose = −Z
//   Designersoup FBX (Beatall, Landyroamer, docLorean, …)    nose = −X
//
// normalizeVehicleModel() wraps the loaded model in a root Group, rotated once
// inside it, so everything else (driving, traffic, sheriffs, cutscenes, the
// headlight sprites) can assume the root faces +Z. Never "fix" a car elsewhere
// with rotation.y += Math.PI.
//
// Architecture for later GTA-style hijacking: a vehicle record has `seats`
// (driver first), each with an `occupant` ("player", "npc" or null). The
// controller (stepArcadeVehicle) only reads controls and the vehicle's own
// heading; who is sitting in the seat is the interaction layer's business.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { forwardFromHeading, rightFromHeading, wrapAngle } from "./world.js";

/** Rotation about +Y that turns a model's nose axis into +Z. */
const AXIS_TO_PLUS_Z = Object.freeze({ "+Z": 0, "-Z": Math.PI, "+X": -Math.PI / 2, "-X": Math.PI / 2 });

const kenney = (name, cls) => ({ name, pack: "kenney", class: cls, modelForward: "-Z", length: 3.4 });
const dsoup = (name, cls) => ({ name, pack: "designersoup", class: cls, modelForward: "-X", length: 4.2 });

/** Every drivable model, by asset name. `class`: civilian | sports | utility | special. */
export const VEHICLE_DEFS = Object.freeze({
  Car_1_R: kenney("Car_1_R", "civilian"),
  Car_1_B: kenney("Car_1_B", "civilian"),
  Car_1_Y: kenney("Car_1_Y", "civilian"),
  Van_1: kenney("Van_1", "utility"),
  Pick_Up_1: kenney("Pick_Up_1", "utility"),
  Truck_1: kenney("Truck_1", "utility"),
  Beatall: dsoup("Beatall", "civilian"),
  Landyroamer: dsoup("Landyroamer", "utility"),
  // The DeLorean is a hovercraft: it floats a little off the ground, bobs, glows blue underneath, and
  // is fast and slippery (main.js updateHover). Space hops it.
  docLorean: { ...dsoup("docLorean", "special"), hover: true,
    handling: { accel: 30, maxForward: 46, maxReverse: 14, drag: 0.22, grip: 2.3, brakeGrip: 3.4, fullSteerSpeed: 9 } },
  "Tristar Racer": dsoup("Tristar Racer", "sports"),
  "Toyoyo Highlight": dsoup("Toyoyo Highlight", "civilian"),
  fallback: { name: "fallback", pack: "procedural", class: "civilian", modelForward: "+Z", length: 4.4 },
  // Two-wheelers, built by bikes.js (no model files). One seat ("sports" class), the
  // rider stays on show and the frame leans (main.js drivingUpdate). `seat`: where
  // the rider's hips sit, +Z forward. `handling` overrides DRIVE for this vehicle.
  motorbike: { name: "motorbike", pack: "procedural", class: "sports", modelForward: "+Z", length: 2.1, bike: true,
    seat: { z: -0.16, y: 0.9, lean: 0.34 },
    handling: { accel: 34, maxForward: 38, maxReverse: 5, grip: 2.5, brakeGrip: 3.4, fullSteerSpeed: 5 } },
  scooter: { name: "scooter", pack: "procedural", class: "sports", modelForward: "+Z", length: 1.8, bike: true,
    seat: { z: -0.22, y: 0.8, lean: 0.08 },
    handling: { accel: 17, maxForward: 20, maxReverse: 4, grip: 2.9, brakeGrip: 3.6, fullSteerSpeed: 3.5 } },
  limo: { name: "limo", pack: "procedural", class: "civilian", modelForward: "+Z", length: 6.2,
    handling: { accel: 16, maxForward: 24, grip: 1.25, brakeGrip: 2.1, fullSteerSpeed: 8 } },
  pushbike: { name: "pushbike", pack: "procedural", class: "sports", modelForward: "+Z", length: 1.75, bike: true, pedal: true,
    seat: { z: -0.2, y: 0.82, lean: 0.16 },
    handling: { accel: 10, maxForward: 12, maxReverse: 2, drag: 2.1, grip: 2.6, brakeGrip: 3.2, fullSteerSpeed: 3 } },
});

/** Definition for an asset file or name ("Car_1_R.fbx", "docLorean"). */
export function vehicleDef(fileOrName) {
  const name = String(fileOrName).replace(/^.*[\\/]/, "").replace(/\.fbx$/i, "");
  return VEHICLE_DEFS[name] || VEHICLE_DEFS.fallback;
}

/**
 * Wrap a loaded, scaled model so its root faces +Z and sits on the ground.
 * Returns the root; `root.userData.vehicleDef` holds the definition.
 */
export function normalizeVehicleModel(model, def) {
  const correction = AXIS_TO_PLUS_Z[def.modelForward] || 0;
  model.rotation.y = correction;
  model.position.set(0, 0, 0);
  const root = new THREE.Group();
  root.name = `vehicle:${def.name}`;
  root.add(model);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = -box.min.y;          // wheels on the ground
  root.userData.vehicleDef = def;
  root.userData.modelRotationOffset = correction;
  return root;
}

/** Seats for a new vehicle record: the driver's first. */
export function createSeats(def) {
  const seats = [{ role: "driver", occupant: null }];
  if (def && def.class !== "sports") seats.push({ role: "passenger", occupant: null });
  return seats;
}

export const driverSeat = (v) => (v.seats ? v.seats[0] : null);

/** Future hijack hook: an occupied vehicle the player could pull a driver out of. */
export const canHijack = (v) => {
  const s = driverSeat(v);
  return !!(s && s.occupant && s.occupant !== "player");
};

export const vehicleForward = (v, out) => forwardFromHeading(v.heading, out);
export const vehicleRight = (v, out) => rightFromHeading(v.heading, out);

/** Where someone stepping out of the driver's door (the left side) stands, as an offset. */
export function exitOffset(v, out, distance = 2.4) {
  rightFromHeading(v.heading, out);
  out.x *= -distance; out.z *= -distance;
  return out;
}

// ---------------------------------------------------------------- driving
export const DRIVE = Object.freeze({
  accel: 26,            // m/s² with the throttle down
  maxForward: 30,       // m/s
  maxReverse: 11,
  drag: 0.9,            // per second
  brakeDamp: 3.5,       // per second while braking
  grip: 1.7,            // rad/s of steering at full lock
  brakeGrip: 2.6,       // handbrake turns tighter
  fullSteerSpeed: 7,    // m/s at which steering reaches full authority
  throttleSteer: 0.3,   // steering authority kept at a standstill while on the throttle
  contactSteer: 0.6,    // …and while touching something, so a car nosed into a wall turns out of it quickly
  impactLoss: 0.35,     // share of speed lost on the first frame of a head-on hit
  scrapeFriction: 0.6,  // per second, while sliding along something
  wallAlign: 5,         // per second: how fast the nose swings round to follow a wall
});

// Human report (2026-09-23): cars were catching fire/exploding off a single,
// often quite mild, collision. The old gate (`-into > 6`, ~22 km/h) let almost
// any registered hit through, and main.js's `v.impact * 1.5` damage formula
// meant a hit right at that gate already dealt ~30% of a typical car's health
// — enough to ignite it on contact. Raised the gate to a genuine crash speed
// and switched the damage formula (main.js) to scale off the excess above it,
// so a graze at the threshold does zero damage instead of a third of your hp.
export const CRASH_MIN_IMPACT = 10;   // m/s closing speed before a hit counts as a crash at all
export const CRASH_DAMAGE_SCALE = 1.1; // hp lost per m/s of impact above CRASH_MIN_IMPACT

/**
 * Arcade model. `controls`: { throttle −1…1 (W = +1), steer −1…1 (D = right), brake }.
 * Updates v.speed and v.heading only; the vehicle travels along its own heading.
 * S brakes while rolling forward and reverses once stopped.
 */
// A definition's handling, merged over DRIVE once and kept.
const _handling = new WeakMap();
function handlingOf(def) {
  if (!def || !def.handling) return DRIVE;
  if (!_handling.has(def)) _handling.set(def, Object.freeze({ ...DRIVE, ...def.handling }));
  return _handling.get(def);
}

export function stepArcadeVehicle(v, { throttle, steer, brake }, dt) {
  const DRIVE = handlingOf(v.def);        // bikes and scooters bring their own numbers
  v.speed += throttle * DRIVE.accel * dt;
  if (brake) v.speed *= 1 - Math.min(1, dt * DRIVE.brakeDamp);
  v.speed *= 1 - dt * DRIVE.drag;
  v.speed = THREE.MathUtils.clamp(v.speed, -DRIVE.maxReverse, DRIVE.maxForward);
  if (Math.abs(v.speed) < 0.05) v.speed = 0;
  // Steering right turns the heading clockwise seen from above, which lowers h
  // (north h = π, east h = π/2). Reversing flips it, like a real car.
  // With the throttle down you keep a little steering even at a standstill, so a
  // car nosed into a wall can turn out of it instead of grinding.
  const grip = brake ? DRIVE.brakeGrip : DRIVE.grip;
  const floor = throttle ? (v.inContact ? DRIVE.contactSteer : DRIVE.throttleSteer) : 0;
  const authority = Math.max(Math.min(1, Math.abs(v.speed) / DRIVE.fullSteerSpeed), floor);
  v.heading -= steer * grip * dt * Math.sign(v.speed || throttle || 1) * authority;
}

/**
 * Arcade collision response, called after the blocker grid has pushed the car
 * out of whatever it hit. (intendedX, intendedZ) is where the car tried to go
 * this step; (resolvedX, resolvedZ) is where it ended up.
 *
 * Only the part of the motion pointing INTO the obstacle is removed. The rest
 * is kept as a slide along the surface (with mild scrape friction), and the
 * nose swings round to follow it. So a glancing hit becomes a slide, and you
 * can back straight off or steer away with full control.
 * (It used to lose 55% of its speed on every frame of contact, which pinned the
 * car against whatever it touched.) The first frame of a contact costs extra
 * speed in proportion to how head-on it was, and gives a jolt. Returns true while touching.
 */
export function collisionResponse(v, intendedX, intendedZ, resolvedX, resolvedZ, dt = 1 / 60) {
  const px = resolvedX - intendedX, pz = resolvedZ - intendedZ;
  const len = Math.hypot(px, pz);
  const touching = len > 1e-4;
  if (touching) {
    const nx = px / len, nz = pz / len;                  // out of the obstacle
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let vx = fx * v.speed, vz = fz * v.speed;
    const into = vx * nx + vz * nz;                      // negative: moving into it
    if (into < 0) {
      vx -= nx * into;                                   // keep only the motion along the surface
      vz -= nz * into;
      const slide = Math.hypot(vx, vz);
      const dir = Math.sign(v.speed) || 1;               // forward or reversing
      let speed = dir * slide * (1 - Math.min(1, dt * DRIVE.scrapeFriction));
      if (!v.inContact) {
        const headOn = Math.min(1, -into / Math.max(1, Math.abs(v.speed)));
        speed *= 1 - DRIVE.impactLoss * headOn;
        if (-into > CRASH_MIN_IMPACT) {
          v.jolt = Math.min(1, (v.jolt || 0) + Math.min(0.8, -into / 25));
          v.impact = -into;   // m/s that hit the wall; the driver turns this into crash damage
        }
      }
      // The nose follows the slide (the tail, when reversing) — but only on a
      // glancing hit. Nose-first into a flat wall the slide is whatever the blocker
      // circles happen to give, and following it swung a stopped car a full 90°
      // along the wall while the player held W; S then reversed sideways instead of
      // backing straight out (tools/qa/controls.mjs).
      if (slide > 0.3 && slide > Math.abs(v.speed) * 0.35) {
        const target = Math.atan2(dir * vx, dir * vz);
        v.heading += wrapAngle(target - v.heading) * Math.min(1, dt * DRIVE.wallAlign);
      }
      v.speed = speed;
    }
  }
  v.inContact = touching;
  return touching;
}
