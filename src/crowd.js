// ---------------------------------------------------------------------------
// crowd.js — the people: who is in the room, and who is on the pavement.
//
// A venue's fixtures know where a bar is, where the machines face and which way
// the stage looks, so they are what proposes *people*: `b.spot(lx, lz, { role })`
// next to their own geometry (interiors.js). This module turns that list of
// candidates into actors — nobody is placed by hand, and a floor plan that moves
// a bar moves its barman with it.
//
// Three rules, all of them about not being the most expensive thing on screen:
//
//   * The roles are `characters.js`'s own procedural people. No skinning, no
//     AnimationMixer, no new assets.
//   * The *mix* is spawnzones.js's `entertainment` table — the same weights that
//     already decide who walks the strip when the player is not looking. A room
//     full of patrons is therefore a room full of the Crown Strip's own crowd,
//     not a second casting decision that could drift from it.
//   * The actors carry `userData.noBatch`, so merge.js's batch sweep leaves them
//     alone: a merged actor is an actor that can never dance again. Everything
//     else about them is cheap — one beat per actor, decided on staggered
//     timers, and the district only ticks the groups it has made visible.
//
// Beats, and nothing more: `still` (standing where the fixture wanted them),
// `shuffle` (a step inside a small radius — the dance floor and the sidewalk),
// and `stroll` (walking a lane the district has checked is clear). A strolling
// actor is why walk lanes are picked against the venue's own collision.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ZONE_MIX } from "./spawnzones.js";
import {
  makeDancer, randomGayMan, randomHighEndEscort, randomHoodrat,
  randomLesbian, randomProstitute, randomRedneck, randomTuxedo,
} from "./characters.js";

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let q = Math.imul(a ^ (a >>> 15), 1 | a);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The kinds of person the strip draws, and the factory each one comes from.
 * Heights mirror main.js's ENEMY_TYPES so the man who walked in off the avenue
 * and the man standing inside the door are the same size.
 *
 * `tourist` and `suit` have no 3D factory of their own — main.js spawns those as
 * billboards — so on the strip they wear the dinner jacket. Noted rather than
 * hidden: they are the two kinds that do not look exactly like their outside
 * counterpart.
 */
const KIND_FACTORY = {
  tuxedo:        { h: 1.86, make: randomTuxedo },
  tourist:       { h: 1.85, make: randomTuxedo },
  hoodrat:       { h: 1.92, make: randomHoodrat },
  thug:          { h: 1.98, make: randomHoodrat },
  highendescort: { h: 1.82, make: randomHighEndEscort },
  prostitute:    { h: 1.80, make: randomProstitute },
  gayman:        { h: 1.86, make: randomGayMan },
  lesbian:       { h: 1.78, make: randomLesbian },
  suit:          { h: 1.90, make: randomTuxedo },
  redneck:       { h: 2.00, make: randomRedneck },
};

/** Who the strip draws when a spot has no opinion: spawnzones.js's door mix. */
const DOOR_MIX = ZONE_MIX.entertainment;

/**
 * A weighted bag built from that mix, so `ZONE_MIX.entertainment` stays the only
 * place the strip's crowd is described. Any kind without a factory here simply
 * does not appear (there is no hobo on the strip's door list, and no hog).
 */
function buildBag(mix) {
  const bag = [];
  for (const [kind, weight] of Object.entries(mix)) {
    if (kind === "border" || !KIND_FACTORY[kind]) continue;
    for (let i = 0; i < Math.round(weight * 100); i++) bag.push(kind);
  }
  return bag.length ? bag : ["tuxedo"];
}
const BAG = buildBag(DOOR_MIX);

/** Somebody off that bag, at the height the spawn tables use for their kind. */
function makeMixed(rng, scale = 1) {
  const kind = BAG[(rng() * BAG.length) | 0];
  const { h, make } = KIND_FACTORY[kind];
  const a = make(rng, h * scale);
  a.userData.crowdKind = kind;
  return a;
}

/**
 * The casting sheet. A fixture's `role` hint is a *staff* part (somebody has to
 * be behind the bar); anything unhinted is drawn from the door mix.
 *
 * `beat` is what the actor does with its time, `anim` the clip it holds while
 * standing. Only ever clips characters.js already has.
 */
export const ROLES = {
  // ---- staff: pinned by whichever fixture owns that part of the room --------
  barkeep:   { anim: "idle",  h: 1.88, make: (r, h) => randomHoodrat(r, h) },
  dealer:    { anim: "idle",  h: 1.86, make: (r, h) => randomTuxedo(r, h) },
  croupier:  { anim: "idle",  h: 1.84, make: (r, h) => randomTuxedo(r, h) },
  clerk:     { anim: "idle",  h: 1.80, make: (r, h) => randomHoodrat(r, h) },
  host:      { anim: "idle",  h: 1.78, make: (r, h) => randomHighEndEscort(r, h) },
  dj:        { anim: "dance", h: 1.82, make: (r, h) => randomGayMan(r, h) },
  performer: { anim: "twerk", h: 1.72, make: (r) => makeDancer({ sex: "f", seed: (r() * 1e9) | 0, height: 1.72 }) },
  go-go:     { anim: "dance", h: 1.78, make: (r) => makeDancer({ sex: r() < 0.5 ? "m" : "f", seed: (r() * 1e9) | 0, height: 1.78 }) },
  // ---- outside: the strip's front-of-house --------------------------------
  bouncer:   { anim: "idle",  h: 1.98, make: (r, h) => randomHoodrat(r, h), beat: "still" },
  valet:     { anim: "idle",  h: 1.84, make: (r, h) => randomHoodrat(r, h), beat: "shuffle", r: 1.6 },
  smoker:    { anim: "idle",  h: 1.96, make: (r, h) => randomRedneck(r, h), beat: "still" },
  // ---- the room ------------------------------------------------------------
  patron:    { anim: "idle",  mix: true, beat: "still" },
  guest:     { anim: "idle",  mix: true, beat: "shuffle", r: 1.1 },
  dancer:    { anim: "dance", h: 1.80, make: (r) => makeDancer({ sex: r() < 0.5 ? "m" : "f", seed: (r() * 1e9) | 0, height: 1.80 }), beat: "shuffle", r: 0.9 },
  party:     { anim: "dance", mix: true, beat: "shuffle", r: 1.4 },
  walker:    { anim: "walk",  mix: true, beat: "stroll" },
  queue:     { anim: "idle",  mix: true, beat: "shuffle", r: 0.5 },
  wait:      { anim: "idle",  mix: true, beat: "still" },   // lingering, drink in hand
};

/** Resolve a role name, falling back to a patron. */
export function roleOf(name) { return ROLES[name] || ROLES.patron; }

/**
 * Choose which candidate spots actually get a person: the pinned ones (staff the
 * fixtures asked for) always, then the rest spread out greedily — nearest-first
 * would cluster the whole crowd in the doorway, so a spot inside `minGap` of
 * somebody already cast is skipped. A second, looser pass tops the room up when
 * the first one was too strict to reach `count`.
 *
 * @param {Array<{lx:number, lz:number, role?:string}>} spots
 * @param {{count:number, rng:Function, minGap?:number}} o
 */
export function selectSpots(spots, { count = 12, rng = Math.random, minGap = 1.5 } = {}) {
  // staff first, so a bar full of stools cannot crowd the barman out of his job
  const chosen = spots.filter((s) => s.role && ROLES[s.role]);
  const free = spots.filter((s) => !s.role);
  for (let i = free.length - 1; i > 0; i--) {           // deterministic shuffle
    const j = (rng() * (i + 1)) | 0;
    [free[i], free[j]] = [free[j], free[i]];
  }
  // two passes: spread properly first, then relax the gap to reach `count` in a
  // small room (a DJ booth's three spots are all inside 2 m of each other)
  for (const gap of [minGap, minGap * 0.55]) {
    for (const s of free) {
      if (chosen.length >= count) break;
      if (chosen.some((c) => Math.hypot(c.lx - s.lx, c.lz - s.lz) < gap)) continue;
      chosen.push(s);
    }
  }
  return chosen.slice(0, count);
}

/** Place one actor at a local spot and give it its beat. */
function place(a, s, role, rng) {
  a.position.set(s.lx, s.y || 0, s.lz);
  a.baseY = s.y || 0;
  const yaw = s.face != null ? s.face : rng() * Math.PI * 2;
  a._yaw = yaw;
  a.rotation.y = yaw;
  if (a._last) a._last.copy(a.position);
  a.play(role.anim || "idle", { force: true, loop: true });
  a.update(0.001);                 // settle the first pose out of the bind pose
}

/**
 * Build the actors for `spots`.
 *
 * @param {Array}  spots  local-space candidates from the fixtures ({ lx, lz, y, role, face })
 * @param {object} o
 *   count    how many to cast (staff are always included)
 *   seed     deterministic casting, so a rebuild looks the same
 *   lane     { z, x0, x1 } a verified-clear line the `walker` role paces
 *   reach    actors only hold still beyond this... (unused; the district hides groups)
 * @returns {{ group, actors, meshes, tick }}
 */
export function makeCrowd(spots, o = {}) {
  const rng = mulberry((o.seed | 0) || 7);
  const group = new THREE.Group();
  const chosen = selectSpots(spots, { count: o.count ?? 12, rng, minGap: o.minGap });
  const actors = [];
  let meshes = 0;

  for (const s of chosen) {
    const role = roleOf(s.role);
    const a = role.mix ? makeMixed(rng, s.scale || 1) : role.make(rng, (role.h || 1.84) * (s.scale || 1));
    place(a, s, role, rng);
    const beat = s.beat || role.beat || "still";
    const rec = {
      a, beat, anim: role.anim || "idle",
      home: new THREE.Vector3(s.lx, s.y || 0, s.lz),
      radius: s.r ?? role.r ?? 0.9,
      goal: new THREE.Vector3(s.lx, s.y || 0, s.lz),
      lane: s.lane ? o.lane : null,
      end: null, wait: rng() * 3, speed: s.speed ?? (0.9 + rng() * 0.35),
      role: s.role || "patron",
    };
    if (beat === "stroll" && o.lane) {
      const l = o.lane;
      rec.lane = l;
      rec.home.set(s.lx, s.y || 0, l.z);
      rec.z = l.z;
      rec.end = rng() < 0.5 ? l.x0 : l.x1;
      rec.a.position.z = l.z;
    }
    a.traverse((m) => {
      if (!m.isMesh) return;
      m.userData.noBatch = true;      // an actor that gets batched can never move again
      m.userData.crowd = true;
      meshes++;
    });
    group.add(a);
    actors.push(rec);
  }

  const target = new THREE.Vector3();
  /**
   * Advance every actor. Cheap by construction: a beat is one timer and at most
   * one lerp, and the district only calls this for the groups it is drawing.
   */
  function tick(dt) {
    for (const x of actors) {
      const a = x.a;
      if (x.beat === "still") { a.update(dt); continue; }
      x.wait -= dt;
      if (x.wait > 0) { a.update(dt); continue; }

      if (x.beat === "stroll") {
        const d = x.end - a.position.x;
        if (Math.abs(d) < 0.35) {
          x.end = x.end === x.lane.x0 ? x.lane.x1 : x.lane.x0;
          x.wait = 2 + Math.random() * 6;
          a.play("idle");
        } else {
          a.play("walk");
          a.position.x += Math.sign(d) * Math.min(Math.abs(d), x.speed * dt);
        }
        a.update(dt);
        continue;
      }

      // shuffle: a step inside the role's own radius, then stand again
      const d = Math.hypot(x.goal.x - a.position.x, x.goal.z - a.position.z);
      if (d < 0.3) {
        const ang = Math.random() * Math.PI * 2, r = Math.random() * x.radius;
        x.goal.set(x.home.x + Math.cos(ang) * r, x.home.y, x.home.z + Math.sin(ang) * r);
        x.wait = 0.7 + Math.random() * 3.2;
        a.play(x.anim, { force: false });
      } else {
        a.play("walk");
        target.copy(x.goal).sub(a.position);
        const len = target.length() || 1;
        a.position.addScaledVector(target, Math.min(len, x.speed * 0.75 * dt) / len);
      }
      a.update(dt);
    }
  }

  return { group, actors, meshes, tick };
}

/**
 * Is a point far enough from every blocker for a person to stand there?
 * `blockers` are the venue's own local-space circles (interiors.js `b.block`),
 * so this is the same collision the walker and the player use.
 */
export function spotFree(blockers, lx, lz, r = 0.5) {
  for (const b of blockers) if (Math.hypot(b.x - lx, b.z - lz) < b.r + r) return false;
  return true;
}

/**
 * Find a lane across a venue's forecourt that a person can walk end to end
 * without touching a car, a bollard, a planter or a bin. Tried from the door
 * outwards, and the caller asserts one exists — furniture that walls off the
 * whole forecourt should fail a test, not silently stop the street moving.
 *
 * @returns {{z:number, x0:number, x1:number}|null}
 */
export function pickLane(blockers, { zFrom, zTo, halfX, step = 0.5, r = 0.55, samples = 9 } = {}) {
  for (let z = zFrom; z <= zTo; z += step) {
    let clear = true;
    for (let i = 0; i <= samples && clear; i++) {
      const x = -halfX + (2 * halfX * i) / samples;
      if (!spotFree(blockers, x, z, r)) clear = false;
    }
    if (clear) return { z, x0: -halfX, x1: halfX };
  }
  return null;
}
