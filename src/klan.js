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
import { roundedBox } from "./geo.js";

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
    const post = new THREE.Mesh(roundedBox(0.34, 5.2, 0.34), charred);
    post.position.y = 2.6; post.castShadow = true;
    const arm = new THREE.Mesh(roundedBox(2.6, 0.32, 0.32), charred);
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
  function callOut(x, z, n = 5,
    { radius = 7, minRadius = 0, officer = true, provoke = true, arc = Math.PI * 2, facing = 0 } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      // `arc` + `facing` lay them across one side instead of ringing the point,
      // and `minRadius` keeps them off you. A full ring at radius 7 put six men
      // inside arm's reach the instant the scene ended — you were taking hits
      // before you had finished reading what was happening.
      const spread = n > 1 ? (i / (n - 1) - 0.5) * arc : 0;
      const a = facing + spread + (Math.random() - 0.5) * 0.22;
      const lo = minRadius || radius * 0.55;
      const r = lo + Math.random() * Math.max(0.001, radius - lo);
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
    // They come from the road, not out of the ground at your feet: an arc on
    // the far side of the cross from wherever Keseme is standing, 16–27 m out,
    // and NOT provoked yet. `armIn` gives her a beat to see them coming, get
    // her back to the wall and draw — which is the whole reason the holster
    // toggle exists.
    const away = Math.atan2(x - playerPos.x, z - playerPos.z);
    const mob = callOut(x, z, count, {
      radius: 27, minRadius: 16, arc: Math.PI * 0.85, facing: away, provoke: false,
    });
    ride = { cross, mob, onClear, done: false, armIn: 3.4, armed: false, allies: [], retarget: 0 };
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

  /**
   * Mally and Bubba turn up. They are ordinary NPC records (main.js ENEMY_TYPES
   * "mally" / "bubba", built from the story cast rig), so the same AI that
   * drives every other fight drives them — they close, they swing, they take
   * damage and they can go down. factions.js lists them as the klan's enemies,
   * so the mob fights back rather than ignoring them.
   *
   * They spawn behind Keseme relative to the mob, so they arrive INTO the
   * fight rather than on top of it.
   */
  function callAllies(fromX, fromZ) {
    if (!ctx.spawnEnemy || !ctx.npcs) return [];
    // behind her, relative to where the mob is coming from
    const toward = Math.atan2(playerPos.x - fromX, playerPos.z - fromZ);
    const out = [];
    const who = ["mally", "bubba"];
    for (let i = 0; i < who.length; i++) {
      const a = toward + (i === 0 ? 0.5 : -0.5);
      const e = ctx.spawnEnemy(who[i], playerPos.x + Math.sin(a) * 5.5, playerPos.z + Math.cos(a) * 5.5);
      if (!e) continue;
      e.ally = true;
      e.leash = { x: playerPos.x, z: playerPos.z, r: 46 };   // they stay in the fight, not the parish
      out.push(e);
    }
    return out;
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

    // the mission's own phases, once its set piece has been cleared
    if (mission && mission.phase === "cleared" && !ctx.state.cinematic) missionAftermath();

    if (!ride) return;

    // ---- they come on, and so do hers ----
    if (!ride.armed) {
      ride.armIn -= dt;
      if (ride.armIn <= 0 && !state.cinematic) {
        ride.armed = true;
        for (const e of ride.mob) if (!e.dead) ctx.npcs.provoke(e);
        const c = ride.cross.group.position;
        ride.allies = callAllies(c.x, c.z);
        if (ride.allies.length) {
          ctx.flashObjective("MALLY: \"You did NOT think we'd let you do this by yourself.\"");
        }
      }
    }

    // Keep both sides pointed at each other. Without this, an ally that kills
    // its man goes back to wandering and stands in the middle of a fight doing
    // nothing, which is worse than not having him there at all.
    ride.retarget -= dt;
    if (ride.armed && ride.retarget <= 0) {
      ride.retarget = 0.8;
      const standing = ride.mob.filter((e) => !e.dead && e.state !== "dead");
      for (const a of ride.allies) {
        if (a.dead || a.state === "dead") continue;
        const live = a.rivalTarget && !a.rivalTarget.dead && a.rivalTarget.state !== "dead";
        if (live || !standing.length) continue;
        let best = null, bd = Infinity;
        for (const k of standing) {
          const d = Math.hypot(k.spr.position.x - a.spr.position.x, k.spr.position.z - a.spr.position.z);
          if (d < bd) { bd = d; best = k; }
        }
        // `force`: a scripted ally must never lose its place to the crowd cap
        if (best) ctx.npcs.becomeHostile(a, best, true);
      }

      // And the mob fights BACK. Provoked at Keseme, a klansman will walk past
      // Mally taking swings at him to get to her, which plays as the allies
      // beating up a queue of men who have not noticed. Anyone without a target
      // of his own turns on whichever of hers is genuinely in his face —
      // closer than Keseme by a clear margin, so this pulls men OFF her (the
      // point of having help) without emptying the fight away from her.
      const live = ride.allies.filter((a) => !a.dead && a.state !== "dead");
      for (const k of standing) {
        if (k.rivalTarget && !k.rivalTarget.dead) continue;
        let best = null, bd = Infinity;
        for (const a of live) {
          const d = Math.hypot(a.spr.position.x - k.spr.position.x, a.spr.position.z - k.spr.position.z);
          if (d < bd) { bd = d; best = a; }
        }
        if (!best) continue;
        const toHer = Math.hypot(playerPos.x - k.spr.position.x, playerPos.z - k.spr.position.z);
        if (bd < toHer - 3 && bd < 14) ctx.npcs.becomeHostile(k, best, true);
      }
    }
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

  // ------------------------------------------------- NIGHT RIDE (the mission)
  // Act One's last beat, and the answer to the phone call in nolantis.js. The
  // shape of it was the human's call (2026-09-20): Mercer is leaned on rather
  // than one of them, Emiko lives but loses the house, and the arc is threaded
  // through both acts — this is the inciting incident, the investigation and
  // the payoff are Act Two.
  //
  // Emiko never comes outside. She is in a sealed kitchen 40 m under the street
  // (actone.js ROOM_Y) and staging her on the lawn would mean lifting her out
  // of it; through the door is also simply the better scene.
  let mission = null;             // { phase, mercer, houseFire }

  function houseOnFire() {
    const h = ctx.mamaHouse;
    if (!h) return;
    const g = new THREE.Group();
    scene.add(g);
    props.push(g);
    const flameMat = new THREE.MeshBasicMaterial({ name: "house fire", color: new THREE.Color(0xff8a2a).multiplyScalar(3.0) });
    flameMat.userData.gtbRealized = true;
    // Along the roofline. actone.js's house() puts the walls at 0.6…4.0 and the
    // pitched roof slabs around y 5.0, so anything at eaves height is simply
    // inside the building — the first pass put the whole fire in the front room
    // where the only thing you could see of it was the glow on the lawn.
    for (let i = 0; i < 7; i++) {
      const fx = h.x - h.w / 2 + 1 + i * ((h.w - 2) / 6);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.6 + Math.random() * 0.35, 2.6 + Math.random() * 1.8, 7), flameMat);
      f.position.set(fx, 6.0 + Math.random() * 0.6, h.z + (Math.random() - 0.5) * (h.d - 2.5));
      g.add(f);
    }
    const smokeMat = new THREE.MeshBasicMaterial({
      name: "house smoke", color: 0x14120f, transparent: true, opacity: 0.5, depthWrite: false,
    });
    smokeMat.userData.gtbRealized = true;
    for (let i = 0; i < 5; i++) {
      const sm = new THREE.Mesh(new THREE.SphereGeometry(1.4 + i * 0.5, 8, 6), smokeMat);
      sm.position.set(h.x + (Math.random() - 0.5) * 3, 8.4 + i * 2.3, h.z + (Math.random() - 0.5) * 3);
      g.add(sm);
    }
    const light = ctx.poolLight(0xff8f38, 120, 54, h.x, 5.8, h.z);
    const rec = { group: g, mat: flameMat, light, phase: Math.random() * 9, out: 0 };
    fires.push(rec);
    return rec;
  }

  /**
   * The mission. `onDone` is called once the last scene has played, so
   * actone.js can hand off to whatever comes next.
   */
  function nightRideOnMamas(onDone = null) {
    if (mission) return false;
    const lawn = ctx.mamaLawn;
    const door = ctx.mamaDoor;
    if (!lawn || !door) return false;
    mission = { phase: "opening", onDone, mercer: null, houseFire: null };

    ctx.cine.scene(async (c) => {
      state.cinematic = true;
      c.letterbox(true);
      await c.black(true, 0.6);
      // a hard cut to the small hours: the threat was always a night thing
      ctx.worldTime.setTime(1.1);
      ctx.teleport(door.x, door.z - 1.6, 0);
      await c.card("EXT.", "THE NADIA HOUSE", "South Tusouxroe · after midnight");
      await c.black(false, 0.8);
      c.shot({ from: [door.x - 2.6, 2.0, door.z - 4.2], look: [door.x, 1.5, door.z], dur: 9 });
      await c.caption("Keseme knocks. The porch light is off.", 2.0);
      await c.say("KESEME", "Mama. It's me.");
      await c.say("EMIKO (O.S.)", "It's gone one in the morning, baby.");
      await c.say("KESEME", "I know. Open the door.");
      await c.say("EMIKO (O.S.)", "…There were cars on the road all evening. Slow ones.");
      await c.wait(0.6);
      c.shot({ from: [door.x - 1.2, 1.8, door.z - 3.0], look: [lawn.x, 1.4, lawn.z + 6], dur: 7 });
      await c.caption("Headlights swing onto the lawn. Doors. No plates.", 2.4);
      seen = true;                              // nightRide must not replay its own intro
      await c.say("KESEME", "Mama, get in the back of the house.");
      await c.say("KESEME", "Now.");
      c.letterbox(false);
      state.cinematic = false;
      mission.phase = "fight";
      nightRide({
        x: lawn.x, z: lawn.z, count: 6,
        why: "They came to Mama's house. Put them off her lawn.",
        onClear: () => { if (mission && mission.phase === "fight") mission.phase = "cleared"; },
      });
      // He was parked up the street the whole time. Nothing he says afterwards
      // lands as hard as the fact that he is already there.
      if (ctx.makeCastMember) {
        const m = ctx.makeCastMember("mercer");
        m.position.set(lawn.x - 1.5, 0, lawn.z - 26);
        m.rotation.y = Math.PI;
        scene.add(m);
        props.push(m);
        mission.mercer = m;
        // and the cruiser he has been sitting in, lights off. The caption in
        // the closing scene says there is one parked up the street; there had
        // better be one parked up the street.
        const proto = ctx.getSheriffProto && ctx.getSheriffProto();
        if (proto) {
          const car = proto.clone(true);
          car.position.set(lawn.x + 2.6, proto.position.y, lawn.z - 27);
          car.rotation.y = Math.PI / 2;
          scene.add(car);
          props.push(car);
          mission.cruiser = car;
        }
      }
    });
    return true;
  }

  /** The back half: the house goes, Mercer says nothing useful, Act Two opens. */
  function missionAftermath() {
    mission.phase = "aftermath";
    mission.houseFire = houseOnFire();
    const door = ctx.mamaDoor;
    const m = mission.mercer;

    ctx.cine.scene(async (c) => {
      state.cinematic = true;
      c.letterbox(true);
      await c.wait(0.8);
      c.shot({ from: [door.x - 5, 4.2, door.z - 9], look: [ctx.mamaHouse.x, 3.0, ctx.mamaHouse.z], dur: 8 });
      await c.caption("The cross went over into the siding. The house is going up.", 2.6);
      await c.say("KESEME", "MAMA!");
      await c.say("EMIKO (O.S.)", "Back door — I'm out, I'm out —");
      await c.wait(0.8);
      await c.say("EMIKO", "My mother's house.");
      await c.say("KESEME", "I know.");
      await c.say("EMIKO", "Fifty-one years, Keseme.");

      if (m) {
        c.shot({ from: [m.position.x + 3.4, 2.0, m.position.z - 4.0], look: [m.position.x, 1.5, m.position.z], dur: 10 });
        await c.caption("A cruiser is parked up the street with its lights off. It has been there a while.", 2.8);
        await c.say("KESEME", "How long have you been sitting there?");
        await c.say("MERCER", "Got the call same as anybody.");
        await c.say("KESEME", "The call. From the house that's burning behind me.");
        await c.wait(0.7);
        await c.say("MERCER", "Keseme — ");
        await c.say("KESEME", "You knew they were coming.");
        await c.caption("Mercer looks at the fire, not at her.", 2.0);
        await c.say("MERCER", "I know who I'd be arresting. That's not the same as being able to.");
        await c.say("KESEME", "Who?");
        await c.say("MERCER", "Ask who's buying up this whole parish and putting a crown on it.");
        await c.say("MERCER", "Then ask yourself why a sheriff can't afford to.");
        await c.caption("He gets back in the cruiser.", 1.8);
      }

      // Hold on the house before the card. The gameplay camera cannot frame
      // this — it sits behind her and looks slightly down, so from 13 m the
      // roof fire is above the top of the screen and from 24 m the house is a
      // speck. A scripted shot is the only way the last image of the mission is
      // the thing the mission was about.
      const h = ctx.mamaHouse;
      ctx.teleport(h.x, h.z - 14, 0);
      c.shot({ from: [h.x - 7.5, 2.4, h.z - 17], look: [h.x, 5.6, h.z], dur: 6 });
      await c.wait(4.2);

      await c.black(true, 0.9);
      await c.card("ACT TWO", "PELICAN CROWN", "Find out who's buying the parish", { center: true, hold: 3.4 });
      if (m) m.visible = false;
      if (mission.cruiser) mission.cruiser.visible = false;
      c.releaseCamera();
      if (ctx.setCameraYaw) ctx.setCameraYaw(Math.PI);
      state.cinematic = false;
      c.letterbox(false);
      await c.black(false, 0.8);
      ctx.flashObjective("Emiko is safe. The house is not. Somebody paid for this — find out who.");
      mission.phase = "done";
      if (mission.onDone) mission.onDone();
    });
  }

  return {
    update,
    nightRide,
    mamaNightRide,
    nightRideOnMamas,
    callOut,
    burningCross,
    burnOut,
    stop,
    get running() { return !!ride; },
    get ready() { return rideCd <= 0 && ctx.isNight(); },
    /** Anything that moves or is shown and hidden — kept out of batchStatic. */
    get props() { return props; },
    /** null until the mission starts, then "opening" | "fight" | "cleared" | "aftermath" | "done". */
    get missionPhase() { return mission ? mission.phase : null; },
    debug: { get ride() { return ride; }, get fires() { return fires.length; },
      get mission() { return mission; } },
  };
}
