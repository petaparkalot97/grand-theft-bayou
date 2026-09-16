// ---------------------------------------------------------------------------
// traffic.js — ambient cars on US-167.
//
// The map is one long highway, so traffic is lane-following, not navigation:
// each lane is a polyline, and a car is just (lane, distance along it, speed).
// Cars keep their distance from whatever is ahead in their lane (other traffic,
// the player, NPCs crossing), are recycled from far behind the player to far
// ahead, and are never created or destroyed in steady state.
//
// A car the player jacks is released from traffic and becomes an ordinary
// vehicle; the pool quietly builds a replacement.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { reflect } from "./fx.js";

const clamp = THREE.MathUtils.clamp;

function makeLane(def) {
  const pts = def.points.map(([x, z]) => new THREE.Vector2(x, z));
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { name: def.name, pts, acc, length: acc[acc.length - 1], cruise: def.cruise || [13, 20], next: def.next || null };
}

/** Position at distance `s` along `lane` into `out` ({x, z}); returns the heading. */
function sampleLane(lane, s, out) {
  s = clamp(s, 0, lane.length);
  let i = 1;
  while (i < lane.acc.length - 1 && lane.acc[i] < s) i++;
  const a = lane.pts[i - 1], b = lane.pts[i];
  const seg = lane.acc[i] - lane.acc[i - 1] || 1;
  const t = (s - lane.acc[i - 1]) / seg;
  out.x = a.x + (b.x - a.x) * t;
  out.z = a.y + (b.y - a.y) * t;
  return Math.atan2(b.x - a.x, b.y - a.y);
}

/** Distance along `lane` of the point on it closest to (x, z). */
function projectLane(lane, x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < lane.pts.length; i++) {
    const a = lane.pts[i - 1], b = lane.pts[i];
    const abx = b.x - a.x, abz = b.y - a.y;
    const len2 = abx * abx + abz * abz || 1;
    const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / len2, 0, 1);
    const px = a.x + abx * t, pz = a.y + abz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bestD) { bestD = d; best = lane.acc[i - 1] + Math.sqrt(len2) * t; }
  }
  return best;
}

// Night driving: every car carries head and tail lights. Sprites, not real
// lights — a dozen extra PointLights would undo the lighting budget.
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.8)");
  g.addColorStop(0.45, "rgba(255,255,255,0.15)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
const lampMats = {};
function lampMaterial(kind) {
  if (lampMats[kind]) return lampMats[kind];
  const color = kind === "head" ? new THREE.Color(0xfff0d0).multiplyScalar(2.2)
                                : new THREE.Color(0xff2a18).multiplyScalar(1.4);
  const m = new THREE.SpriteMaterial({
    map: glowTexture(), color, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, fog: false,
  });
  m.userData.gtbRealized = true;
  return (lampMats[kind] = m);
}

/**
 * @param {object}   o
 * @param {THREE.Scene} o.scene
 * @param {Array}    o.lanes            [{ name, points: [[x, z], ...], cruise: [min, max],
 *                                          next: name of the lane to run when this one
 *                                          runs out — pair a lane with its return lane and
 *                                          traffic becomes a circuit instead of vanishing
 *                                          at the lane ends }]
 * @param {Array}    o.models           loaded car Object3Ds to clone
 * @param {Function} o.registerVehicle  (obj, radius, opts) => vehicle record
 * @param {Function} o.unregisterVehicle(vehicle) — optional, for dead cars
 * @param {number}   o.perLane          active cars per lane
 */
export function createTraffic(o) {
  const lanes = o.lanes.map(makeLane);
  // resolve "next" names into lane objects so a car can hand itself over at the end
  const byName = new Map(lanes.map((l) => [l.name, l]));
  for (const l of lanes) if (l.next) l.next = byName.get(l.next) || null;
  const perLane = o.perLane || 4;
  const maxCars = o.maxCars || o.lanes.length * perLane;   // pool size
  const SPAWN_MIN = o.spawnMin || 75;
  const SPAWN_MAX = o.spawnMax || 130;
  const DESPAWN = o.despawn || 235;   // past the ~240 m fog edge: a despawn is never on screen
  const WRAP_HIDE = o.wrapHide || 165; // a lane-end U-turn happens only beyond this (in the mist)
  const cars = [];
  const tmp = { x: 0, z: 0 };
  let spawnCd = 0;

  function buildCar() {
    const models = o.models.filter(Boolean);
    if (!models.length) return null;
    const src = models[(Math.random() * models.length) | 0];
    const obj = src.clone(true);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const k = 1 / (obj.scale.x || 1);          // sprites live in the model's scaled space
    const y = (box.min.y + (box.max.y - box.min.y) * 0.42 - obj.position.y) * k;
    const half = ((box.max.x - box.min.x) / 2) * 0.62 * k;
    for (const sx of [-1, 1]) {
      const head = new THREE.Sprite(lampMaterial("head"));
      head.position.set(sx * half, y, (box.max.z - obj.position.z) * k + 0.1 * k);
      head.scale.setScalar(0.9 * k);
      const tail = new THREE.Sprite(lampMaterial("tail"));
      tail.position.set(sx * half, y, (box.min.z - obj.position.z) * k - 0.1 * k);
      tail.scale.setScalar(0.55 * k);
      obj.add(head, tail);
      reflect(head);                       // other cars' lights show in the wet road
      reflect(tail);
    }
    obj.visible = false;
    o.scene.add(obj);
    const v = o.registerVehicle(obj, 1.9, { hp: 30 });
    if (v.seats) v.seats[0].occupant = "npc";  // someone's driving; a future hijack pulls them out
    const car = { obj, v, lane: null, s: 0, speed: 0, target: 0, cruise: 15, think: 0, active: false };
    v.traffic = car;
    return car;
  }

  function place(car, lane, s) {
    car.lane = lane;
    car.s = s;
    car.cruise = lane.cruise[0] + Math.random() * (lane.cruise[1] - lane.cruise[0]);
    car.speed = car.cruise;
    car.target = car.cruise;
    car.think = Math.random() * 0.3;           // stagger decisions across cars
    car.active = true;
    car.obj.visible = true;
    apply(car);
  }

  function apply(car) {
    const h = sampleLane(car.lane, car.s, tmp);
    car.obj.position.x = tmp.x;
    car.obj.position.z = tmp.z;
    car.obj.rotation.y = h;
    car.v.heading = h;
    car.v.speed = car.speed;
    car.v.blocker.x = tmp.x;
    car.v.blocker.z = tmp.z;
  }

  function park(car) {
    car.active = false;
    car.obj.visible = false;
    // keep the blocker far outside the map while parked
    car.v.blocker.x = car.v.blocker.z = 1e5;
    car.obj.position.set(1e5, car.obj.position.y, 1e5);
  }

  /**
   * Find a free spot out of sight on a lane that passes near `focus`. Starts
   * from the point on each lane nearest the player and steps along it, so it
   * works for north–south and east–west lanes alike; emptiest lanes first.
   */
  function trySpawn(car, focus) {
    const near = [];
    for (const l of lanes) {
      const s0 = projectLane(l, focus.x, focus.z);
      sampleLane(l, s0, tmp);
      if (Math.hypot(tmp.x - focus.x, tmp.z - focus.z) > DESPAWN * 0.6) continue;
      let n = 0;
      for (const c of cars) if (c.active && c.lane === l) n++;
      near.push({ l, s0, n });
    }
    near.sort((a, b) => a.n - b.n);
    for (const { l: lane, s0 } of near) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const s = s0 + dir * (SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN));
        if (s < 4 || s > lane.length - 4) continue;
        sampleLane(lane, s, tmp);
        const d = Math.hypot(tmp.x - focus.x, tmp.z - focus.z);
        if (d < SPAWN_MIN * 0.8 || d > DESPAWN * 0.9) continue;
        if (cars.some((c) => c.active && c.lane === lane && Math.abs(c.s - s) < 20)) continue;
        place(car, lane, s);
        return true;
      }
    }
    return false;
  }

  function release(car) {
    // jacked or wrecked: it stops being traffic and is just a vehicle now
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    car.v.traffic = null;
  }

  /** How far ahead the lane is clear, looking at traffic and `obstacles`. */
  function clearance(car, obstacles) {
    let gap = Infinity;
    for (const c of cars) {
      if (c === car || !c.active || c.lane !== car.lane) continue;
      const d = c.s - car.s;
      if (d > 0 && d < gap) gap = d;
    }
    const h = car.v.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const px = car.obj.position.x, pz = car.obj.position.z;
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i];
      const rx = ob.x - px, rz = ob.z - pz;
      const along = rx * fx + rz * fz;
      if (along <= 0 || along > 32) continue;
      const lateral = Math.abs(rx * fz - rz * fx);
      // After waiting a few seconds, only something squarely in the lane holds
      // the car up; a pedestrian on the edge of the road gets eased past
      // instead of blocking the highway forever.
      if (lateral < (car.wait > 3 ? 1.2 : 2.4) && along < gap) gap = along;
    }
    // called right after `car.think` is reset, so it holds the think interval
    car.wait = gap < 7 ? (car.wait || 0) + car.think : 0;
    return gap;
  }

  return {
    get cars() { return cars; },

    /** Stop treating `vehicle` as traffic (it's being jacked, or story-owned). */
    releaseVehicle(vehicle) {
      const car = cars.find((c) => c.v === vehicle);
      if (car) release(car);
    },

    /**
     * @param {number} dt
     * @param {{x:number, z:number}} focus       usually the player position
     * @param {Array<{x,z}>} obstacles           things cars should stop for
     * @param {object|null} playerVeh            the vehicle the player is in
     */
    update(dt, focus, obstacles, playerVeh) {
      // keep the pool topped up — one new car per call at most, so a burst of
      // cloning never lands in a single frame
      spawnCd -= dt;
      if (spawnCd <= 0 && cars.length < maxCars) {
        const car = buildCar();
        if (car) { cars.push(car); park(car); }
        spawnCd = 0.25;
      }

      for (let i = cars.length - 1; i >= 0; i--) {
        const car = cars[i];
        if (car.v.dead || car.v === playerVeh) { release(car); continue; }

        if (!car.active) {
          trySpawn(car, focus);
          continue;
        }

        const dx = car.obj.position.x - focus.x, dz = car.obj.position.z - focus.z;
        const dist = Math.hypot(dx, dz);
        if (dist > DESPAWN) { park(car); continue; }   // the pool recycles; circuits make this rare

        // Decisions at a rate that depends on distance: close cars react
        // quickly, far ones (hidden in the mist anyway) barely think.
        car.think -= dt;
        if (car.think <= 0) {
          car.think = dist < 60 ? 0.15 : dist < 110 ? 0.45 : 1.0;
          const gap = clearance(car, obstacles);
          car.target = gap < 7 ? 0 : gap < 24 ? car.cruise * (gap - 7) / 17 : car.cruise;
        }
        // Lane end: hand over to the paired return lane (a circuit, never a
        // vanish) — but only when the swap happens in the mist. In view, the car
        // pulls up at the end and waits instead, which reads as a car paused at
        // the junction, not a glitch.
        if (car.s >= car.lane.length - 1) {
          if (car.lane.next && dist > WRAP_HIDE) {
            car.lane = car.lane.next;
            car.s = 1;                       // the return lane starts where this one ended
            car.think = 0;                   // re-decide speed for the new lane at once
          } else {
            car.s = car.lane.length - 1;
            car.speed = 0;
            car.target = 0;
          }
          apply(car);
          continue;
        }
        // brake hard, accelerate gently
        const rate = car.target < car.speed ? 7 : 1.6;
        car.speed = THREE.MathUtils.damp(car.speed, car.target, rate, dt);
        car.s += car.speed * dt;
        apply(car);
      }
    },
  };
}
