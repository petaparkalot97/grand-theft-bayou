// ---------------------------------------------------------------------------
// npc.js — NPC behaviour: people and hogs who live here, not a swarm.
//
// Before: every Redneck, Hoodrat and hog chased and attacked the player as soon
// as they were in range, so the whole parish converged on you. Now each NPC has
// a temperament and a home turf, and only turns hostile when something gives it
// a reason — you shot at it, violence broke out nearby, or it's the kind that
// picks fights and you walked right up to it.
//
//   idle / loiter  — standing around, facing a neighbour if one is close
//   wander         — strolling to a point on its home turf, or to another spot
//   flee           — running from gunfire or a fight, then calming down
//   hostile        — the old chase / charge / melee behaviour
//
// Cost: decisions run on staggered timers (not per frame), and distance sets
// the level of detail — near NPCs get everything, mid-range ones think rarely
// and animate every third frame, far ones are paused until you come back.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const rand = (lo, hi) => lo + (hi - lo) * Math.random();
const NEAR = 55, FAR = 110;
const MAX_HOSTILE = 7;             // never let the whole map pile onto the player

// Temperaments. Hogs are feral: some defend their patch, the rest bolt.
// People mostly mind their own business.
function temperament(type) {
  const r = Math.random();
  if (type === "hog") return r < 0.4 ? "territorial" : "skittish";
  if (type === "redneck") return r < 0.28 ? "hothead" : r < 0.55 ? "brave" : "timid";
  return r < 0.22 ? "lookout" : r < 0.5 ? "brave" : "timid";
}

export function createNpcSystem({ pois, resolveCollision, hitPlayer, bounds }) {
  const events = [];               // recent violence: { x, z, r, t }
  let now = 0, frame = 0, hostiles = 0, nextId = 1;
  const vel = new THREE.Vector3();
  const next = new THREE.Vector3();

  function nearestPoi(x, z) {
    let best = pois[0], bd = Infinity;
    for (const p of pois) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function setState(e, s, time) {
    if (e.state === "hostile" && s !== "hostile") hostiles--;
    if (s === "hostile" && e.state !== "hostile") hostiles++;
    e.state = s;
    e.stateT = time != null ? time : rand(2, 5);
  }

  function pickGoal(e) {
    // mostly potter about home; now and then walk over to a nearby spot
    let base = e.home;
    if (Math.random() < 0.22) {
      const options = pois.filter((p) => p !== e.home &&
        Math.hypot(p.x - e.home.x, p.z - e.home.z) < 70);
      if (options.length) base = e.home = options[(Math.random() * options.length) | 0];
    }
    const a = Math.random() * Math.PI * 2, r = Math.random() * (base.r || 10);
    e.goal.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
  }

  function recentViolence(p) {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (now - ev.t > 4) break;
      if ((ev.x - p.x) ** 2 + (ev.z - p.z) ** 2 < ev.r * ev.r) return ev;
    }
    return null;
  }

  function becomeHostile(e) {
    if (e.state === "hostile") return true;
    if (hostiles >= MAX_HOSTILE) return false;
    setState(e, "hostile", 0);
    e.calm = 0;
    return true;
  }

  function flee(e, fromX, fromZ) {
    e.threat.set(fromX, 0, fromZ);
    setState(e, "flee", rand(4, 7));
  }

  function decide(e, dist, env) {
    const p = e.spr.position;
    const interval = e.lod ? 1 : 0.3;

    if (e.state === "hostile") {
      // lose interest once the player is well out of reach for a while
      if (dist > e.T.aggro + 18) {
        e.calm += interval;
        if (e.calm > 6) { setState(e, "wander"); pickGoal(e); }
      } else e.calm = 0;
      return;
    }

    if (e.provoked) {
      e.provoked = false;
      // hurt: fight back unless timid (or a skittish hog), otherwise run
      if (e.mood === "timid" || e.mood === "skittish" || !becomeHostile(e)) flee(e, env.player.x, env.player.z);
      return;
    }

    const ev = recentViolence(p);
    if (ev && e.state !== "flee") {
      const nearPlayer = Math.hypot(ev.x - env.player.x, ev.z - env.player.z) < 30;
      if ((e.mood === "hothead" || e.mood === "territorial" || (e.mood === "brave" && Math.random() < 0.35))
          && nearPlayer && becomeHostile(e)) return;
      flee(e, ev.x, ev.z);
      return;
    }

    // temperament vs. the player simply being close
    if (!env.driving) {
      if ((e.mood === "territorial" && dist < 10) || (e.mood === "hothead" && dist < 8)) {
        if (becomeHostile(e)) return;
      }
      if (e.mood === "lookout" && dist < 6) {
        e.stare += interval;
        if (e.stare > 3 && becomeHostile(e)) return;
      } else e.stare = 0;
    }

    if (e.state === "flee") {
      if (e.stateT <= 0) setState(e, "idle", rand(1, 3));
      return;
    }
    if (e.state === "wander") {
      if ((e.goal.x - p.x) ** 2 + (e.goal.z - p.z) ** 2 < 1.5 || e.stateT < -12) setState(e, "idle", rand(2, 6));
      return;
    }
    if (e.stateT <= 0) {
      const r = Math.random();
      if (r < 0.62) { setState(e, "wander", 0); pickGoal(e); }
      else {
        setState(e, "loiter", rand(3, 8));
        // face whoever is standing nearest, so groups read as conversations
        let buddy = null, bd = 36;
        for (const o of env.others) {
          if (o === e || o.dead) continue;
          const d = (o.spr.position.x - p.x) ** 2 + (o.spr.position.z - p.z) ** 2;
          if (d < bd) { bd = d; buddy = o; }
        }
        e.face = buddy ? Math.atan2(buddy.spr.position.x - p.x, buddy.spr.position.z - p.z) : null;
      }
    }
  }

  function act(e, dt, dist, env) {
    const p = e.spr.position, T = e.T, hog = e.type === "hog";
    vel.set(0, 0, 0);
    let anim = "idle", fps = 5;

    if (e.state === "hostile") {
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const dx = (env.player.x - p.x) * inv, dz = (env.player.z - p.z) * inv;
      if (hog) {
        // hogs line up, then explosively charge in a straight line
        if (e.charge > 0) {
          e.charge -= dt;
          vel.copy(e.chargeDir).multiplyScalar(13);
        } else if (e.chargeCd === 0 && dist < 14 && dist > 2) {
          e.charge = 0.55; e.chargeCd = 2.4;
          e.chargeDir.set(dx, 0, dz);
          vel.copy(e.chargeDir).multiplyScalar(13);
        } else {
          vel.set(dx * T.speed, 0, dz * T.speed);
        }
        if (dist < T.melee && e.atkCd === 0) { e.atkCd = T.atkGap; hitPlayer(T.dmg); e.charge = 0; }
        anim = e.charge > 0 ? "charge" : "walk";
      } else if (dist < T.melee) {
        anim = "attack"; fps = 10;
        if (e.atkCd === 0) { e.atkCd = T.atkGap; hitPlayer(T.dmg); }
        e.spr.setFlip(dx);
      } else {
        vel.set(dx * T.speed, 0, dz * T.speed);
        anim = "walk"; fps = 9;
      }
    } else if (e.state === "flee") {
      const fx = p.x - e.threat.x, fz = p.z - e.threat.z;
      const d = Math.hypot(fx, fz) || 1;
      const s = (hog ? 7 : T.speed * 1.2) * e.pace;
      vel.set((fx / d) * s, 0, (fz / d) * s);
      anim = "walk"; fps = 12;
    } else if (e.state === "wander") {
      const gx = e.goal.x - p.x, gz = e.goal.z - p.z;
      const d = Math.hypot(gx, gz);
      if (d > 0.5) {
        const s = (hog ? 1.3 : 1.7) * e.pace;
        vel.set((gx / d) * s, 0, (gz / d) * s);
        anim = "walk"; fps = 6;
      }
    } else if (e.state === "loiter" && e.face != null && e.spr._yaw != null) {
      e.spr._yaw += (e.face - e.spr._yaw) * Math.min(1, dt * 3);
    }

    // presentation
    if (hog) {
      if (vel.lengthSq() > 0.01) e.spr.rotation.y = Math.atan2(vel.x, vel.z);
      const moving = anim !== "idle";
      const gait = moving ? Math.sin(e.t * (anim === "charge" ? 30 : 12)) * 0.12 : 0;
      const legs = e.spr.userData.legs;
      for (let i = 0; i < legs.length; i++) legs[i].position.y = 0.35 + (i % 2 ? gait : -gait);
      e.spr.position.y = anim === "charge" ? Math.abs(Math.sin(e.t * 30)) * 0.15 : 0;
    } else {
      if (anim === "walk" && Math.abs(vel.x) > 0.05) e.spr.setFlip(vel.x);
      if (e.spr.anim !== "hurt" || e.spr.finished) e.spr.play(anim, { fps, loop: true });
    }

    if (vel.lengthSq() > 0) {
      next.copy(p).addScaledVector(vel, dt);
      resolveCollision(p, next, 0.5);
      p.x = THREE.MathUtils.clamp(p.x, -bounds + 3, bounds - 3);
      p.z = THREE.MathUtils.clamp(p.z, -bounds + 3, bounds - 3);
    }
  }

  return {
    get hostileCount() { return hostiles; },

    /** Give a freshly spawned NPC record its temperament and home turf. */
    init(e) {
      e.id = nextId++;
      e.mood = temperament(e.type);
      e.home = nearestPoi(e.spr.position.x, e.spr.position.z);
      e.goal = new THREE.Vector3().copy(e.spr.position);
      e.threat = new THREE.Vector3();
      e.chargeDir = new THREE.Vector3();
      e.pace = rand(0.8, 1.2);
      e.think = Math.random() * 0.6;        // stagger: never all on the same frame
      e.calm = e.stare = 0;
      e.provoked = false;
      e.face = null;
      e.state = "idle";
      e.stateT = rand(0.5, 4);
      e.lod = 0;
    },

    /** Something violent happened at (x, z): a shot, a hit, a kill. */
    noise(x, z, r = 22) {
      events.push({ x, z, r, t: now });
      if (events.length > 32) events.shift();
    },

    /** The player hurt this NPC directly. */
    provoke(e) { e.provoked = true; e.think = 0; },

    /** Bookkeeping when an NPC dies or is culled. */
    release(e) { if (e.state === "hostile") hostiles--; e.state = "dead"; },

    beginFrame(dt) { now += dt; frame++; },

    /**
     * Advance one living NPC. `env`: { player: {x,z}, driving, others }.
     * Returns true when its animation should be updated this frame.
     */
    update(e, dt, env) {
      const p = e.spr.position;
      const dist = Math.hypot(env.player.x - p.x, env.player.z - p.z);
      e.lod = dist < NEAR ? 0 : dist < FAR ? 1 : 2;
      // far away and not after you: frozen until you come back
      if (e.lod === 2 && e.state !== "hostile") return false;

      e.t += dt;
      e.stateT -= dt;
      e.atkCd = Math.max(0, e.atkCd - dt);
      e.chargeCd = Math.max(0, e.chargeCd - dt);
      e.think -= dt;
      if (e.think <= 0) {
        e.think = (e.lod ? 0.9 : 0.25) + Math.random() * 0.15;
        decide(e, dist, env);
      }
      act(e, dt, dist, env);
      return e.lod === 0 || (frame + e.id) % 3 === 0;
    },
  };
}
