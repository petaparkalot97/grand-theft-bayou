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
// `stroll` (walking a lane the district has checked is clear), `work` (a shift at
// a station — HAPPY HOGS' barman cycles pour/polish/serve/lean along his counter),
// and `act` (a scripted performance, and there is only ever one). A strolling actor
// is why walk lanes are picked against the venue's own collision.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { ZONE_MIX } from "./spawnzones.js";
import {
  makeDancer, makeHog, makeStar, randomGayMan, randomHighEndEscort, randomHoodrat,
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
 * The bar shift, in order: pour, wipe down, hand it over, lean and watch the
 * room, breathe. Four poses plus idle, shuffled by the beat, is enough that the
 * counter never settles into a loop you can read from the door.
 */
const BAR_POSES = ["pour", "polish", "serve", "barlean", "idle", "pour", "barlean"];

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
  gogo:      { anim: "dance", h: 1.78, make: (r) => makeDancer({ sex: r() < 0.5 ? "m" : "f", seed: (r() * 1e9) | 0, height: 1.78 }) },
  // ---- outside: the strip's front-of-house --------------------------------
  bouncer:   { anim: "idle",  h: 1.98, make: (r, h) => randomHoodrat(r, h), beat: "still" },
  valet:     { anim: "idle",  h: 1.84, make: (r, h) => randomHoodrat(r, h), beat: "shuffle", r: 1.6 },
  smoker:    { anim: "idle",  h: 1.96, make: (r, h) => randomRedneck(r, h), beat: "still" },
  // ---- HAPPY HOGS: the house is hogs ---------------------------------------
  // The same animal on the people rig; what differs is the job, which is the same
  // distinction the sheet draws for people. A `hogdancer`'s shuffle radius is 0.3 m
  // and that is the whole trick of the podiums — the beat cannot walk her off a
  // 0.6 m disc. A `hogkeep` works the counter instead: `beat: "work"` cycles the
  // poses in `poses` on his own clock and drifts a step along the bar between
  // them, so the bar is never being minded by a statue.
  hogdancer: { anim: "dance", h: 1.78, beat: "shuffle", r: 0.3,
    make: (r, h, s) => makeHog({ variant: "dancer", sex: s && s.sex === "m" ? "m" : r() < 0.5 ? "m" : "f", seed: (r() * 1e9) | 0, height: h }) },
  hogkeep:   { anim: "pour",  h: 1.86, beat: "work", r: 1.5, poses: BAR_POSES,
    make: (r, h, s) => makeHog({ variant: "barman", sex: "m", seed: (r() * 1e9) | 0, height: h }) },
  // ---- the act: one per venue at most, and only the lounge has one ----------
  // `beat: "act"` hands the actor to makeAct() below instead of the still /
  // shuffle / stroll beats: a script drives him, because a performer who stands
  // there is the one thing the stage must never look like.
  star:      { anim: "showboat", h: 1.84, beat: "act", make: (r, h, s) => makeStar({ seed: s && s.seed != null ? s.seed : (r() * 1e9) | 0, height: h }) },
  // ---- the room ------------------------------------------------------------
  patron:    { anim: "idle",  mix: true, beat: "still" },
  // the front of the stage: watching, dancing on the spot, and (see `hype`) the
  // first to react when the act lands a move
  fan:       { anim: "dance", mix: true, beat: "shuffle", r: 0.7 },
  guest:     { anim: "idle",  mix: true, beat: "shuffle", r: 1.1 },
  dancer:    { anim: "dance", h: 1.80, make: (r) => makeDancer({ sex: r() < 0.5 ? "m" : "f", seed: (r() * 1e9) | 0, height: 1.80 }), beat: "shuffle", r: 0.9 },
  party:     { anim: "dance", mix: true, beat: "shuffle", r: 1.4 },
  walker:    { anim: "walk",  mix: true, beat: "stroll" },
  queue:     { anim: "idle",  mix: true, beat: "shuffle", r: 0.5 },
  wait:      { anim: "idle",  mix: true, beat: "still" },   // lingering, drink in hand
};

/** Who is on the clock in daylight: the people a venue needs to be open. */
const DAY_ROLES = new Set([
  "barkeep", "dealer", "croupier", "clerk", "host", "dj", "performer", "gogo",
  "bouncer", "valet", "smoker", "hogkeep",
]);

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
  // a spot may name its own pose (a fan zone dancing, a stool-punter slouched):
  // the role's default is for the part, the spot's is for this ten square metres
  a.play(s.anim || role.anim || "idle", { force: true, loop: true });
  a.update(0.001);                 // settle the first pose out of the bind pose
}

// ---------------------------------------------------------------------------
// The act — BILLY JEANS, on the lounge's stage.
//
// The whole difference between "a performer NPC" and "a show" is that the
// performer is scripted rather than idle: a routine of nine beats that he runs
// on his own clock, with his feet doing something specific in each one, and three
// of them big enough that the room is supposed to react. It is data (ACT_SCRIPT),
// not nine functions, because re-timing a show should be editing a number.
//
// Two things here are not obvious and are the whole trick:
//
//   * **The moonwalk needs to move him backwards while he faces forwards.**
//     characters.js's rig turns an actor to face its own travel, so `tick` locks
//     the yaw AFTER the actor's update: the clip holds the glide pose (both feet
//     flat, lead leg straight, trailing toe pointed) and this moves the body
//     under it. Take the lock away and the clip becomes a man walking backwards.
//   * **The deck is 6 m deep.** So the routine's travel is clamped to a rect the
//     stage fixture hands over, and every beat that walks is allowed to reach the
//     edge and stop rather than stepping off the riser. A scripted actor that can
//     leave its stage is a bug generator, so it cannot.
// ---------------------------------------------------------------------------

/**
 * The routine, in order. One entry per beat:
 *
 *   state  a name, for the QA and the debug
 *   clip   the characters.js pose he holds while it lasts
 *   dur    seconds
 *   big    the room reacts (the pit cheers — see `hype`)
 *   cheer  how long that reaction lasts (defaults to CHEER_TIME)
 *   side   m/s across the deck (x), flipping when he reaches a bound
 *   back   m/s away from the crowd — the moonwalk. Always backwards.
 *   fwd    m/s back toward the crowd, on the beat, to work the front again
 *   spin   whole revolutions over the beat
 *
 * Exactly three beats are `big`: the signature pose, the moonwalk and the freeze.
 * The spin at 4.5 rpm is spectacular and nobody in the room is *surprised* by it,
 * and marking every dramatic beat would leave the pit in the air for half the
 * show — a crowd that is always cheering is not reacting to anything.
 *
 * The order is the order in the brief: pose, mic, side-to-side, signature pose,
 * spin, footwork, moonwalk, freeze, crowd — then repeat, so he moonwalks every
 * eighteen seconds or so. Nothing here may move him off the deck either: `tick`
 * clamps to the stage's rect, so a beat with too much speed in it stalls at the
 * edge instead of walking off the riser into the bar.
 */
export const ACT_SCRIPT = [
  { state: "pose",      clip: "showboat", dur: 1.6 },
  { state: "mic",       clip: "showboat", dur: 2.2 },
  { state: "step",      clip: "dance",    dur: 2.4, side: 0.62 },
  { state: "signature", clip: "showboat", dur: 1.4, big: true, cheer: 2.2 },
  { state: "spin",      clip: "spin",     dur: 1.8, spin: 2 },
  { state: "footwork",  clip: "footwork", dur: 2.0 },
  { state: "moonwalk",  clip: "moonwalk", dur: 3.0, back: 0.72, big: true, cheer: 3.2 },
  { state: "freeze",    clip: "lean",     dur: 1.6, big: true, cheer: 2.4 },
  { state: "crowd",     clip: "showboat", dur: 2.0, fwd: 0.55 },
];

/** How long a big move keeps the room cheering, unless the beat says otherwise. */
const CHEER_TIME = 2.4;

/** On the clock while the act is on: they do not stop work to watch the show. */
const WORKING = new Set([
  "barkeep", "dealer", "croupier", "clerk", "host", "dj",
  "gogo", "performer", "bouncer", "valet", "smoker",
]);

/**
 * Drive one performer through `ACT_SCRIPT`, on a deck `bounds` says he fits on.
 *
 * @param {object} o
 *   actor   the actor to drive
 *   x, z, y where the fixture staged him (his mark, and where the walk states
 *           bring him back to)
 *   yaw     the facing he performs at (0 = at the crowd, models face +z)
 *   bounds  { x0, x1, z0, z1 } the deck — he is never allowed outside it
 *   name    what the crowd is watching (only used for the prompt and the QA)
 *   seed    deterministic variation, so the show is the same show every rebuild
 * @returns {{tick, info, actor}} `info()` is the QA read-out.
 */
export function makeAct(o = {}) {
  const a = o.actor;
  const rng = mulberry((o.seed | 0) || 3);
  const script = o.script || ACT_SCRIPT;
  const home = { x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0 };
  const yaw = o.yaw ?? 0;
  const bounds = o.bounds || { x0: home.x - 2, x1: home.x + 2, z0: home.z - 2, z1: home.z + 2 };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  // the step beat alternates across the deck rather than always to one side
  let side = rng() < 0.5 ? 1 : -1;
  let i = 0, t = 0, bigs = 0, glides = 0;
  // per-instance: the script is a shared const, so "this beat has already called
  // for a cheer" cannot live on the beat itself
  const reacted = new Array(script.length).fill(false);

  a.position.set(home.x, home.y, home.z);
  a.baseY = home.y;
  a._yaw = yaw;
  a.rotation.y = yaw;
  if (a._last) a._last.copy(a.position);
  a.play(script[0].clip, { force: true, loop: true });
  a.update(0.001);

  /** Enter a beat: the pose, and the book-keeping the QA reads. */
  function enter(n) {
    i = n % script.length;
    t = 0;
    const beat = script[i];
    a.play(beat.clip, { force: true, loop: true });
    if (beat.big) bigs++;
    if (beat.state === "moonwalk") glides++;
    return beat;
  }

  /**
   * One beat of one show. `react` is called with the pose a watching fan should
   * switch to while a big move plays out; the fans themselves are the crowd's.
   */
  function tick(dt, react) {
    if (o.paused) return;
    const beat = script[i];
    t += dt;
    const p = Math.min(1, t / beat.dur);

    // ---- his feet, while the clip holds the pose --------------------------
    let fx = 0, fz = 0;
    if (beat.side) {
      const nx = a.position.x + beat.side * side * dt;
      if (nx <= bounds.x0 || nx >= bounds.x1) side = -side;
      fx = beat.side * side * dt;
    }
    // The moonwalk: backwards, away from the crowd, which is the -z side of the
    // stage. `back` never reverses — a glide toward the audience is a slide, and
    // the glide is the move. He runs out of deck instead, and `fwd` walks him
    // back up to the front on the beats after it.
    if (beat.back) fz = -Math.abs(beat.back) * dt;
    if (beat.fwd) fz = Math.abs(beat.fwd) * dt;
    if (fx || fz) {
      a.position.x = clamp(a.position.x + fx, bounds.x0, bounds.x1);
      a.position.z = clamp(a.position.z + fz, bounds.z0, bounds.z1);
    }

    // The clip runs (and turns him to face its travel — so the yaw goes back on
    // after it with the stage's own facing, not the direction he is sliding).
    a.update(dt);
    const turn = beat.spin ? yaw + (p * p * (3 - 2 * p)) * beat.spin * Math.PI * 2 : yaw;
    a._yaw = turn;
    a.rotation.y = turn;

    if (beat.big && react && !reacted[i]) {
      reacted[i] = true;               // once per beat, not once per frame
      react(a, beat);
    }
    if (t >= beat.dur) {
      reacted[(i + 1) % script.length] = false;
      enter(i + 1);
    }
  }

  /** QA: which beat he is on, where he is, and what he has done so far. */
  function info() {
    const beat = script[i];
    return {
      name: o.name || "the act",
      state: beat.state, clip: beat.clip, big: !!beat.big,
      t: +t.toFixed(2), of: beat.dur,
      x: +a.position.x.toFixed(3), y: +a.position.y.toFixed(3), z: +a.position.z.toFixed(3),
      yaw: +a.rotation.y.toFixed(3), baseYaw: yaw,
      home: { x: home.x, z: home.z }, bounds, script: script.length,
      bigs, glides, beats: script.map((s) => s.state),
    };
  }

  return { tick, info, actor: a, script, bounds, hype: CHEER_TIME };
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
 * @returns {{ group, actors, meshes, tick, setShift, act, fans }}
 *   `act`  the show, if a fixture cast a `star` in this room (makeAct), and
 *   `fans` the pit that reacts to his big moves — both null / empty elsewhere
 */
export function makeCrowd(spots, o = {}) {
  const rng = mulberry((o.seed | 0) || 7);
  const group = new THREE.Group();
  const chosen = selectSpots(spots, { count: o.count ?? 12, rng, minGap: o.minGap });
  const actors = [];
  let meshes = 0;

  for (const s of chosen) {
    const role = roleOf(s.role);
    const a = role.mix ? makeMixed(rng, s.scale || 1) : role.make(rng, (role.h || 1.84) * (s.scale || 1), s);
    if (s.name) a.userData.name = s.name;
    place(a, s, role, rng);
    const beat = s.beat || role.beat || "still";
    const rec = {
      a, beat, anim: s.anim || role.anim || "idle",
      home: new THREE.Vector3(s.lx, s.y || 0, s.lz),
      radius: s.r ?? role.r ?? 0.9,
      goal: new THREE.Vector3(s.lx, s.y || 0, s.lz),
      lane: s.lane ? o.lane : null,
      end: null, wait: rng() * 3, speed: s.speed ?? (0.9 + rng() * 0.35),
      role: s.role || "patron",
      // the front row of a stage: `hype` marks somebody who is watching the act
      // rather than the room, so a big move reaches them and not the whole bar
      hype: 0, fan: !!s.hype,
      // a scripted actor's stage, if its fixture staged one
      bounds: s.bounds,
      // the bar shift, for the `work` beat: which poses, and which way the
      // counter runs (`patrol`), so his steps go along the bar and not into it
      poses: s.poses || role.poses || BAR_POSES,
      pose: 0,
      patrol: s.patrol || null,
      // the facing the part was cast at, for beats that move an actor who is not
      // supposed to turn with its feet (a barman walking his counter)
      face: s.face != null ? s.face : a._yaw,
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
    // The shift: staff hold the room all day, the people the room is *for* only
    // turn up after dark. `beat: "stroll"` (a stroller on the pavement) counts as
    // nightlife too, whatever role it was cast as.
    rec.night = !DAY_ROLES.has(rec.role) || s.night === true;
    rec.dayOk = !!s.day || DAY_ROLES.has(rec.role);
    // the act works the nights, and the dusk half-shift is not a coin toss for
    // him: a stage with nobody on it at 6pm is an empty stage
    if (beat === "act") rec.dusk = true;
    actors.push(rec);
  }
  for (const x of actors) x.live = true;

  // ---- the act, if a fixture staged one ------------------------------------
  // The stage hands over his mark and the deck he may not leave; everything else
  // about the show is the script above. Reacting to a big move is the *pit* plus
  // whoever else is close enough to see it — so the room has a front row that
  // loses it and a bar that keeps serving.
  const actRec = actors.find((x) => x.beat === "act");
  const act = actRec ? makeAct({
    actor: actRec.a,
    name: actRec.a.userData.name || "the act",
    x: actRec.home.x, y: actRec.home.y, z: actRec.home.z,
    yaw: actRec.a._yaw,
    bounds: actRec.bounds,
    seed: (o.seed | 0) || 3,
  }) : null;
  if (act) {
    actRec.act = act;
    // he is not a beat-driven actor: crowd.js's beats would walk him off his mark
    actRec.beat = "act";
  }
  const fans = actors.filter((x) => x.fan && !x.act);

  /**
   * A big move landed: the front row loses it. The pit is unconditional (it is
   * there to watch), and the rest of the room joins in from where it can see —
   * except the people whose job it is not to: a barman is mid-pour, a dealer is
   * mid-hand, and the go-go girls flanking the act do not stop dancing because
   * he did something good.
   */
  function hype(actor, beat) {
    if (!act) return;
    const for_ = (beat && beat.cheer) || CHEER_TIME;
    for (const x of fans) x.hype = for_;
    for (const x of actors) {
      if (x.act || x.hype > 0 || WORKING.has(x.role)) continue;
      if (Math.hypot(x.a.position.x - actor.position.x, x.a.position.z - actor.position.z) < 7) x.hype = for_;
    }
  }

  /**
   * The strip's clock. Staff work all day; punters, dancers and the queue do
   * not. `dusk` keeps every other one of them, which is the difference between
   * an afternoon block and a Friday night without needing a second cast.
   */
  function setShift(mode) {
    const day = mode === "day", dusk = mode === "dusk";
    for (let i = 0; i < actors.length; i++) {
      const x = actors[i];
      const live = day ? x.dayOk : dusk ? x.dusk || !x.night || i % 2 === 0 : true;
      if (live !== x.live) x.a.visible = live;
      x.live = live;
    }
  }

  const target = new THREE.Vector3();

  /**
   * A new place to be, inside the actor's own radius — along `patrol`'s axis when
   * the part has one. A barman's radius is 1.5 m of *counter*, not a 1.5 m circle:
   * the bar has a wall of bottles behind it and drinkers in front of it, and a disc
   * of random points would have him step through the first and into the second.
   */
  function repoint(x) {
    const r = x.radius || 0.8, ang = Math.random() * Math.PI * 2;
    if (x.patrol === "z") x.goal.set(x.home.x, x.home.y, x.home.z + Math.sin(ang) * r);
    else if (x.patrol === "x") x.goal.set(x.home.x + Math.sin(ang) * r, x.home.y, x.home.z);
    else x.goal.set(x.home.x + Math.cos(ang) * r, x.home.y, x.home.z + Math.sin(ang) * r);
    return x.goal;
  }

  /**
   * Advance every actor. Cheap by construction: a beat is one timer and at most
   * one lerp, and the district only calls this for the groups it is drawing.
   */
  function tick(dt) {
    for (const x of actors) {
      if (x.live === false) continue;
      const a = x.a;
      // the act runs his own script; `hype` is what he does to the room
      if (x.act) { x.act.tick(dt, hype); continue; }
      // A cheer interrupts whatever the actor was on — that is the reaction. When
      // it is over they go back to their own pose and their own beat, so the
      // front row is only up in the air while something is happening.
      if (x.hype > 0) {
        x.hype -= dt;
        if (a.anim !== "cheer") a.play("cheer", { loop: true });
        if (x.hype <= 0 && x.anim !== "cheer") a.play(x.anim, { loop: true });
        a.update(dt);
        continue;
      }
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

      // work: the bar shift. A pose timer of his own on top of the movement —
      // hold the pour, step along the counter, wipe it down, hand the drink over,
      // lean and look at the room — so "at work" is a thing he is doing rather
      // than a place he is standing. `repoint` keeps every step along the bar's
      // own axis inside `radius`, so he never turns his back to serve the shelf.
      if (x.beat === "work") {
        const d = Math.hypot(x.goal.x - a.position.x, x.goal.z - a.position.z);
        if (d > 0.25) {
          target.copy(x.goal).sub(a.position);
          const len = target.length() || 1;
          a.position.addScaledVector(target, Math.min(len, x.speed * 0.5 * dt) / len);
          a.play("walk");
        } else {
          x.wait -= dt;
          if (x.wait <= 0) {
            x.pose = (x.pose + 1) % x.poses.length;
            x.anim = x.poses[x.pose];
            a.play(x.anim, { force: true, loop: true });
            x.wait = 1.3 + Math.random() * 2.3;
            repoint(x);
          }
        }
        a.update(dt);
        // he serves the room, not the aisle: a step along the counter turns the
        // rig to face its travel, so the bar's own facing goes back on after it
        if (x.face != null) { a._yaw = x.face; a.rotation.y = x.face; }
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

  return {
    group, actors, meshes, tick, setShift,
    // the show, for the district to expose (and for the QA to watch run)
    act, fans,
  };
}

// ---------------------------------------------------------------------------
// The pavement: the traffic. The room's crowd above is furniture-shaped —
// somebody at every stool, a barman at every bar — and it stays put. This is
// what makes the strip a district: people walking its frontage, stopping at a
// door, going in, coming back out, and doing it somewhere else an hour later.
//
// No pathfinding, and none needed. A venue's pavement is one verified-clear line
// (pickLane, against that venue's own collision), with a short spur from the line
// to its door — which the build test already proves is walkable, because it is the
// same centreline the player walks in on. An actor walks the line, takes the spur,
// and either browses there or goes in (hidden, then back out). Every waypoint of
// every route is asserted clear of every blocker in the venue, so "NPCs walking
// through buildings" is a failing test rather than a bug report.
// ---------------------------------------------------------------------------

/** Where a pavement actor is in its little life. */
const OUT = 0, DWELL = 1, INSIDE = 2, GONE = 3;

/**
 * Build the pavement population for one venue's frontage.
 *
 * @param {object} spec
 *   seed   deterministic casting
 *   count  how many people are on this pavement in total (day or night)
 *   line   { z, x0, x1 } the clear walking line along the frontage
 *   door   { x, z } where the spur leaves the line (usually 0, the entrance)
 *   spots  [{ x, z, anim? }] other things worth walking to and standing at
 * @returns {{ group, actors, meshes, tick, setShift }}
 */
export function makePavement(spec) {
  const rng = mulberry((spec.seed | 0) || 11);
  const line = spec.line;
  const door = spec.door;
  const spots = spec.spots || [];
  const group = new THREE.Group();
  const actors = [];
  const count = spec.count ?? 8;
  let meshes = 0;

  // Parties, not a stream of solitaries: a third of the block walks in twos and
  // threes, and a group shares a destination, which is what makes a queue look
  // like a queue instead of four people who happen to be near each other.
  let left = count;
  while (left > 0) {
    const size = left > 2 && rng() < 0.34 ? 2 + ((rng() * 2) | 0) : 1;
    const n = Math.min(size, left);
    left -= n;
    const x0 = line.x0 + rng() * (line.x1 - line.x0);
    const speed = 1.05 + rng() * 0.5;
    for (let i = 0; i < n; i++) {
      // mostly the strip's own mix; every fifth one is a dancer, because a
      // pavement in front of a nightclub has somebody in it who cannot stay still
      const a = rng() < 0.2 ? ROLES.dancer.make(rng, ROLES.dancer.h) : makeMixed(rng);
      a.position.set(x0 + i * 0.7, 0, line.z + (i % 2 ? 0.55 : -0.55));
      a._yaw = rng() * Math.PI * 2;
      a.rotation.y = a._yaw;
      if (a._last) a._last.copy(a.position);
      a.play("idle", { force: true });
      a.update(0.001);
      a.traverse((m) => {
        if (!m.isMesh) return;
        m.userData.noBatch = true;
        m.userData.crowd = true;
        meshes++;
      });
      group.add(a);
      const rec = {
        a, group: n, state: OUT, speed: speed * (1 + i * 0.03), t: rng() * 3,
        legs: [], target: null, dwell: 0, inside: 0, rest: rng() < 0.25 ? "dance" : "idle",
        // most of the pavement is nightlife; a fifth of it works in daylight
        // (deliveries, cleaners, staff arriving) and the rest turns up after dark
        night: rng() < 0.8, dayOk: false, live: true, sway: (rng() - 0.5) * 1.6,
      };
      actors.push(rec);
      route(rec, pickTarget(rec));
    }
  }
  for (const x of actors) x.dayOk = !x.night;

  // ---- the little life: pick somewhere to be, walk there, stand a while ----
  function pickTarget(x) {
    const r = Math.random();
    if (r < 0.34) return { x: door.x, z: door.z, kind: "door" };
    if (r < 0.5) return { x: line.x0 - 6, z: line.z, kind: "gone" };      // off the block
    if (r < 0.62) return { x: line.x1 + 6, z: line.z, kind: "gone" };
    if (spots.length) { const s = spots[(Math.random() * spots.length) | 0]; return { ...s, kind: "spot" }; }
    return { x: line.x0 + Math.random() * (line.x1 - line.x0), z: line.z, kind: "line" };
  }

  /** Route from where the actor is to `t`: along the line, then the spur. */
  function route(x, t) {
    const legs = [{ x: x.a.position.x, z: line.z }];
    if (t.kind === "spot" || t.kind === "door") legs.push({ x: t.x, z: line.z });
    legs.push({ x: t.x, z: t.z });
    x.legs = legs;
    x.target = t;
    x.state = OUT;
  }

  function tick(dt) {
    for (const x of actors) {
      if (!x.live) continue;
      const a = x.a;
      x.t += dt;

      if (x.state === INSIDE) {
        // hidden inside the venue, then back out onto the pavement somewhere
        // else along the frontage — which is what "they moved on" looks like
        x.inside -= dt;
        if (x.inside <= 0) {
          a.visible = true;
          a.position.set(door.x + x.sway * 0.3, 0, door.z);
          a.play("idle", { force: true });
          route(x, { x: line.x0 + Math.random() * (line.x1 - line.x0), z: line.z, kind: "line" });
        }
        continue;
      }

      if (x.state === GONE) {
        x.dwell -= dt;
        if (x.dwell <= 0) {                         // somebody else walks in from the far end
          a.position.set(x.sway > 0 ? line.x0 - 5 : line.x1 + 5, 0, line.z);
          a.visible = true;
          x.sway = -x.sway;
          route(x, pickTarget(x));
        }
        continue;
      }

      if (x.state === DWELL) {
        x.dwell -= dt;
        if (x.dwell <= 0) {
          if (x.target.kind === "door" && Math.random() < 0.45) {
            a.visible = false;                      // in they go
            x.state = INSIDE;
            x.inside = 12 + Math.random() * 50;
          } else route(x, pickTarget(x));
        }
        a.update(dt);
        continue;
      }

      // OUT: one leg at a time, on foot, facing where it is going
      const leg = x.legs[0];
      if (!leg) { route(x, pickTarget(x)); continue; }
      const dx = leg.x - a.position.x, dz = leg.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        x.legs.shift();
        if (!x.legs.length) {
          const t = x.target;
          if (t.kind === "gone") { a.visible = false; x.state = GONE; x.dwell = 3 + Math.random() * 8; }
          else {
            x.state = DWELL;
            x.dwell = 1.5 + Math.random() * 5;
            a.play(t.anim || x.rest, { force: true });
          }
        }
      } else {
        const m = Math.min(d, x.speed * dt * (x.group > 1 ? 0.9 : 1));
        a.position.x += (dx / d) * m;
        a.position.z += (dz / d) * m;
      }
      a.play("walk");
      a.update(dt);
    }
  }

  /** Day: the block is nearly empty; dusk: half of it; night: all of it. */
  function setShift(mode) {
    const day = mode === "day", dusk = mode === "dusk";
    for (let i = 0; i < actors.length; i++) {
      const x = actors[i];
      const live = day ? x.dayOk : dusk ? !x.night || i % 2 === 0 : true;
      // somebody "inside" or already gone is not resurrected by the shift
      if (x.state !== INSIDE && x.state !== GONE) x.a.visible = live;
      x.live = live;
    }
  }

  // Every leg any of them can walk, in local space — the audit samples these
  // against the venue's own collision, so "a walker went through a car" is a
  // failing check rather than a thing somebody notices on a drive past.
  const routes = [
    { what: "the line", a: { x: line.x0 - 6, z: line.z }, b: { x: line.x1 + 6, z: line.z } },
    { what: "the door spur", a: { x: door.x, z: line.z }, b: { x: door.x, z: door.z } },
  ];
  for (const s of spots) routes.push({ what: "a stop", a: { x: s.x, z: line.z }, b: { x: s.x, z: s.z } });

  return { group, actors, meshes, tick, setShift, line, door, routes };
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
export function pickLane(blockers, { zFrom, zTo, halfX, step = 0.5, r = 0.55, minSpan = 4.5 } = {}) {
  for (let z = zFrom; z <= zTo; z += step) {
    // How far the pavement actually runs clear here — walked outwards from the
    // door axis rather than sampled at a fixed width. A frontage jammed with a
    // valet row and a queue still has a walkable strip in front of the rope; it
    // is narrower, and a lane that does not pretend otherwise is the honest one.
    let span = halfX;
    for (let x = 0.25; x <= halfX; x += 0.25) {
      if (!spotFree(blockers, x, z, r) || !spotFree(blockers, -x, z, r)) { span = x - 0.25; break; }
    }
    if (span >= minSpan && spotFree(blockers, 0, z, r)) return { z, x0: -span, x1: span };
  }
  return null;
}
