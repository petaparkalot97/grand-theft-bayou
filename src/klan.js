// ---------------------------------------------------------------------------
// klan.js — who actually threatened Keseme's mother.
//
// nolantis.js ends on an anonymous, distorted VOICE: "You should have given
// Sheriff Mercer the book." · "Go back to Tusouxroe." · "Your mother's house is
// very pretty." Keseme's answer, in the elevator, is the spine of everything
// after it — "Find out who threatened my mother" — and until now the game never
// said who called. This is the answer.
//
// They are not a free-roam street gang and must never spawn like one: a hooded
// mob standing around a gas station in daylight is a costume, not a threat.
// They turn out at night, in numbers, somewhere specific, and then they are
// gone. Everything here is driven by one of two things:
//
//   nightRide(...)   a set piece: trucks stop, robes get out, something burns,
//                    and they come for whoever is standing there. Used for the
//                    beat outside Mama Emiko's house in South Tusouxroe.
//   callOut(...)     a handful of them at a point, for a mission to place.
//
// A klansman is an ordinary NPC record — same rig, same animations, same
// interface main.js already spawns and kills Rednecks through. The only new
// things here are when they exist, how many, and what they do first.
//
// Tone, and the line this module holds: no emblems, no lettering, no slogans,
// no recruitment, no names of real organisations. They are hooded, anonymous,
// and they lose. The story is Keseme's and Emiko's, not theirs.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const RIDE_COOLDOWN = 240;         // seconds before a night ride can happen again

/**
 * @param {object} ctx from main.js:
 *   scene, state, playerPos, cine, spawnEnemy(type, x, z), killEnemy(e),
 *   enemies, npcs, addBlocker(x, z, r), poolLight(color, power, range, x, y, z),
 *   flashObjective(text), setObjective(text|null), isNight(), worldTime,
 *   registerVehicle(obj, r, opts), buildVehicle(name) | null
 */
export function createKlan(ctx) {
  const { scene, state, playerPos } = ctx;
  const props = [];                // anything that moves or is shown/hidden
  const fires = [];                // { mat, light, phase, t, life }
  let ride = null;                 // the running night ride, if any
  let rideCd = 0;
  let seen = false;                // the player has met them at least once

  // ------------------------------------------------------------- the cross
  // The one piece of staging this needs. It is a threat left on a lawn, and it
  // is built to be put out — `burnOut()` is how a mission ends the beat.
  function burningCross(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
    props.push(g);

    const charred = new THREE.MeshStandardMaterial({ name: "charred timber", color: 0x241c16, roughness: 1 });
    charred.userData.gtbRealized = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 5.2, 0.34), charred);
    post.position.y = 2.6; post.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.32, 0.32), charred);
    arm.position.y = 3.7; arm.castShadow = true;
    g.add(post, arm);

    // the flame: emissive shells that flicker, plus one pooled light. No
    // particle system — this is read from thirty metres away in the dark.
    const flameMat = new THREE.MeshBasicMaterial({ name: "cross fire", color: new THREE.Color(0xff7a22).multiplyScalar(3.4) });
    flameMat.userData.gtbRealized = true;
    for (const [fx, fy, fh, fr] of [[0, 2.7, 5.0, 0.5], [-0.9, 3.7, 1.0, 0.36], [0.9, 3.7, 1.0, 0.36]]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(fr * 0.55, fr, fh, 8, 1, true), flameMat);
      f.position.set(fx, fy, 0);
      g.add(f);
    }
    const light = ctx.poolLight(0xff8a30, 90, 46, x, 3.4, z);
    const rec = { group: g, mat: flameMat, light, phase: Math.random() * 9, out: 0 };
    fires.push(rec);
    ctx.addBlocker(x, z, 0.6);
    return rec;
  }

  /** Put a cross out over `secs`, then leave the charred timber standing. */
  function burnOut(rec, secs = 4) {
    if (rec.spent || rec.out > 0) return;
    rec.out = secs;
    rec.outT = secs;
  }

  // -------------------------------------------------------------- the mob
  /**
   * Put `n` of them on the ground around (x, z) and, unless `provoke` is false,
   * point them at the player. Returns the NPC records, so a mission can wait on
   * them being dead.
   */
  function callOut(x, z, n = 5, { radius = 7, officer = true, provoke = true } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = radius * (0.55 + Math.random() * 0.45);
      // the first one out is the one giving the orders, in the crimson robe.
      // spawnEnemy reads `officer` off the spot argument, because the robe
      // colour is chosen when the body is built, not afterwards.
      const lead = officer && i === 0;
      const e = ctx.spawnEnemy("klansman", x + Math.sin(a) * r, z + Math.cos(a) * r,
        lead ? { officer: true } : null);
      if (!e) continue;
      e.officer = lead;
      // `provoke: false` puts them on the ground without pointing them at
      // anyone — a picket standing there before it kicks off, and the only way
      // to see the turf rules (factions.js) work on them, since a klansman
      // already swinging at the player can never be an instigator.
      if (provoke) ctx.npcs.provoke(e);
      out.push(e);
    }
    return out;
  }

  // --------------------------------------------------------- the night ride
  /**
   * The set piece. A cross goes up and lights, robes come out of the dark, and
   * they come for whoever is standing there. Ends when they are all down (or
   * `stop()` is called); the cross burns out and the timber stays.
   *
   * @param {object} o
   * @param {number} o.x,o.z   where the cross goes
   * @param {number} o.count   how many turn out (default 6)
   * @param {string} o.why     the objective line while it runs
   * @param {function} o.onClear  called once the last of them is down
   */
  function nightRide({ x, z, ry = 0, count = 6, why = "Put them down.", onClear = null } = {}) {
    if (ride) return ride;
    rideCd = RIDE_COOLDOWN;
    const cross = burningCross(x, z, ry);
    const mob = callOut(x, z, count, { radius: 9 });
    ride = { cross, mob, onClear, done: false };
    if (why) ctx.setObjective(why);
    if (!seen) {
      seen = true;
      ctx.cine.scene(async (c) => {
        c.card("EXT.", "SOUTH TUSOUXROE", "After midnight");
        await c.wait(1.0);
        await c.caption("Headlights on the lawn. Doors. No plates.", 2.2);
        await c.say("KESEME", "…Mama, get in the back of the house.");
        await c.say("KESEME", "Now.");
      });
    }
    return ride;
  }

  function stop({ clear = true } = {}) {
    if (!ride) return;
    if (clear) for (const e of ride.mob) if (!e.dead) ctx.killEnemy(e);
    burnOut(ride.cross);
    ride.done = true;
    ride = null;
  }

  // -------------------------------------------------------------- update
  function update(dt) {
    if (rideCd > 0) rideCd -= dt;

    // the fires: a slow roll with a fast flicker on top, and a burn-out ramp
    const t = performance.now() / 1000;
    for (const f of fires) {
      // `spent` and not `out = 0`: clearing the ramp flag let the flicker below
      // run again on the very next frame, so a cross that had finished burning
      // put its light straight back on over an invisible flame.
      if (f.spent) continue;
      let k = 1;
      if (f.out > 0) {
        f.outT -= dt;
        k = Math.max(0, f.outT / f.out);
        if (k <= 0) { f.mat.visible = false; f.light.power = 0; f.spent = true; continue; }
      }
      const s = 1 + Math.sin(t * 3.1 + f.phase) * 0.18 + Math.sin(t * 11 + f.phase) * 0.1;
      f.mat.color.setHex(0xff7a22).multiplyScalar(3.4 * s * k);
      f.light.power = 90 * s * k;
    }

    if (!ride) return;
    // the ride is over when the last of them is down
    if (ride.mob.every((e) => e.dead)) {
      const done = ride.onClear;
      burnOut(ride.cross);
      ride = null;
      ctx.flashObjective("They're down. Nobody came. Nobody was ever going to come.");
      if (done) done();
    }
  }

  /**
   * The beat the whole thread has been pointing at: they come to Emiko's house.
   * "Your mother's house is very pretty" (nolantis.js) was this. The lawn comes
   * from actone.js via main.js, so it stays on the real house.
   */
  function mamaNightRide(onClear = null) {
    const at = ctx.mamaLawn;
    if (!at) return null;
    return nightRide({
      x: at.x, z: at.z, count: 6, onClear,
      why: "They came to Mama's house. Put them off her lawn.",
    });
  }

  return {
    update,
    nightRide,
    mamaNightRide,
    callOut,
    burningCross,
    burnOut,
    stop,
    get running() { return !!ride; },
    get ready() { return rideCd <= 0 && ctx.isNight(); },
    /** Anything that moves or is shown and hidden — kept out of batchStatic. */
    get props() { return props; },
    debug: { get ride() { return ride; }, get fires() { return fires.length; } },
  };
}
