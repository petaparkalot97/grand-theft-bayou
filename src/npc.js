// ---------------------------------------------------------------------------
// npc.js — NPC behaviour: people and hogs who live here, not a swarm.
//
// Civilians, not enemies. Everyone idles, loiters and wanders their home turf
// and ignores the player; default aggression is zero. Violence nearby makes
// people scatter. Only an NPC the player actually hurts reacts, and its
// temperament decides how: it defends itself (fights back) or it flees.
//
//   idle / loiter  — standing around, facing a neighbour if one is close
//   wander         — strolling to a point on its home turf, or to another spot
//   flee           — running from gunfire or a fight, then calming down
//   hostile        — defending itself after being attacked: chase / charge / melee
//
// Cost: decisions run on staggered timers (not per frame), and distance sets
// the level of detail — near NPCs get everything, mid-range ones think rarely
// and animate every third frame, far ones are paused until you come back.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { vehicleRight } from "./vehicles.js";

const rand = (lo, hi) => lo + (hi - lo) * Math.random();
const NEAR = 55, FAR = 110;
export const MAX_HOSTILE = 7;      // never let the whole map pile onto the player
// Market Row keeps Saturday hours: bustling trade 09:00–18:00, but only from
// day 2 on — the game opens at 18:30 on day 1, so the first evening is quiet.
const MARKET_OPEN = 9, MARKET_CLOSE = 18;

// Nobody attacks unprovoked. Temperament only matters once the player hurts an
// NPC: "brave" people and "territorial" hogs defend themselves, the rest run.
export const DEFAULT_AGGRESSION = 0;
function temperament(type) {
  const r = Math.random();
  if (type === "hog") return r < 0.4 ? "territorial" : "skittish";
  if (type === "redneck") return r < 0.5 ? "brave" : "timid";
  return r < 0.35 ? "brave" : "timid";
}

export function createNpcSystem({ pois, resolveCollision, hitPlayer, bounds, worldTime = null }) {
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

  /** Market Row's Saturday hours right now (npc.js is created with worldTime). */
  function marketTrading() {
    if (!worldTime) return false;
    const h = worldTime.hours, d = worldTime.day;
    return h >= MARKET_OPEN && h < MARKET_CLOSE && d >= 2;
  }

  function setState(e, s, time) {
    if (e.state === "hostile" && s !== "hostile") {
      hostiles--;
      e.rivalTarget = null;
    }
    if (s === "hostile" && e.state !== "hostile") hostiles++;
    e.state = s;
    e.stateT = time != null ? time : rand(2, 5);
  }

  function pickGoal(e) {
    // mostly potter about home; now and then walk over to a nearby spot
    let base = e.home;
    if (e.type !== "hog" && Math.random() < 0.22) {   // hogs stay in their patch of woods
      const options = pois.filter((p) => p !== e.home &&
        Math.hypot(p.x - e.home.x, p.z - e.home.z) < 70);
      if (options.length) base = e.home = options[(Math.random() * options.length) | 0];
    }
    // `wanderR` comes from the spawn zone (spawnzones.js WANDER): city blocks
    // keep trips short, out in the parish they stretch out, and market day
    // crowds keep to the stalls
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (base.r || 10) * (e.wanderR || 1) * (e.marketSaturday ? 0.5 : 1);
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

  function becomeHostile(e, rivalTarget = null) {
    if (e.state === "hostile") {
      if (rivalTarget && (!e.rivalTarget || e.rivalTarget.dead)) e.rivalTarget = rivalTarget;
      return true;
    }
    if (hostiles >= MAX_HOSTILE) return false;
    e.rivalTarget = rivalTarget || null;
    setState(e, "hostile", 0);
    e.calm = 0;
    return true;
  }

  function flee(e, fromX, fromZ) {
    e.threat.set(fromX, 0, fromZ);
    setState(e, "flee", rand(4, 7));
  }

  function noise(x, z, r = 22) {
    events.push({ x, z, r, t: now });
    if (events.length > 32) events.shift();
  }

  function release(e) {
    if (e.state === "hostile") hostiles--;
    if (e.solicitVeh) {
      if (e.solicitVeh.seats && e.solicitVeh.seats[1] && e.solicitVeh.seats[1].occupant === e) {
        e.solicitVeh.seats[1].occupant = null;
      }
      if (e.solicitVeh.obj) e.solicitVeh.obj.rotation.z = 0;
      e.solicitVeh = null;
    }
    if (e.spr) e.spr.visible = true;
    e.rivalTarget = null;
    e.state = "dead";
  }

  // a turf fight blow (factions.js); a kill goes through env.killEnemy for the loot
  function hitRival(victim, dmg, env) {
    if (victim.dead || victim.state === "dead") return;
    victim.hp -= dmg;
    noise(victim.spr.position.x, victim.spr.position.z, 15);
    if (victim.hp > 0) return;
    if (env.killEnemy) env.killEnemy(victim);
    else { release(victim); victim.dead = true; }
  }

  function decide(e, dist, env) {
    const p = e.spr.position;
    const interval = e.lod ? 1 : 0.3;

    if (e.state === "approaching_car" || e.state === "in_car") {
      if (e.provoked) {
        if (e.solicitVeh && e.solicitVeh.seats && e.solicitVeh.seats[1] && e.solicitVeh.seats[1].occupant === e) {
          e.solicitVeh.seats[1].occupant = null;
        }
        if (e.solicitVeh && e.solicitVeh.obj) e.solicitVeh.obj.rotation.z = 0;
        e.solicitVeh = null;
        e.provoked = false;
        if (e.spr) e.spr.visible = true;
        flee(e, env.player.x, env.player.z);
      }
      return;
    }

    // keep market hours fresh (cheap, and the staggered think tick already
    // runs well under once a second per NPC)
    if (e.wanderSpeed < 1) e.marketSaturday = marketTrading();

    if (e.state === "hostile") {
      // hurt by the player in the middle of a turf fight: the player is now the problem
      if (e.provoked) { e.provoked = false; e.rivalTarget = null; e.calm = 0; }
      if (e.rivalTarget) {
        if (e.rivalTarget.dead || e.rivalTarget.state === "dead") {
          e.rivalTarget = null;
          setState(e, "wander");
          pickGoal(e);
          return;
        }
        const rPos = e.rivalTarget.spr.position;
        const rDist = Math.hypot(rPos.x - p.x, rPos.z - p.z);
        if (rDist > e.T.aggro + 18) {
          e.calm += interval;
          if (e.calm > 6) { e.rivalTarget = null; setState(e, "wander"); pickGoal(e); }
        } else e.calm = 0;
        return;
      }
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

    // gunfire or a fight nearby: bystanders scatter, nobody joins in
    const ev = recentViolence(p);
    if (ev && e.state !== "flee") {
      flee(e, ev.x, ev.z);
      return;
    }
    // (the player merely being close is not a reason to do anything)

    if (e.state === "flee") {
      if (e.stateT <= 0) setState(e, "idle", rand(1, 3));
      return;
    }
    if (e.state === "wander") {
      if ((e.goal.x - p.x) ** 2 + (e.goal.z - p.z) ** 2 < 1.5 || e.stateT < -14) setState(e, "idle", rand(0.5, 3));
      return;
    }
    if (e.stateT <= 0) {
      const r = Math.random();
      // pedestrians walk more than they stand: ~3/4 of decisions start a stroll,
      // and the market crowd is here to browse, so almost always
      if (r < (e.marketSaturday ? 0.88 : 0.74)) { setState(e, "wander", 0); pickGoal(e); }
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
      const hasRival = e.rivalTarget && !e.rivalTarget.dead && e.rivalTarget.state !== "dead";
      const targetPos = hasRival ? e.rivalTarget.spr.position : env.player;
      const targetDist = hasRival ? Math.hypot(targetPos.x - p.x, targetPos.z - p.z) : dist;
      const inv = targetDist > 1e-4 ? 1 / targetDist : 0;
      const dx = (targetPos.x - p.x) * inv, dz = (targetPos.z - p.z) * inv;

      if (hog) {
        // hogs line up, then explosively charge in a straight line
        if (e.charge > 0) {
          e.charge -= dt;
          vel.copy(e.chargeDir).multiplyScalar(13);
        } else if (e.chargeCd === 0 && targetDist < 14 && targetDist > 2) {
          e.charge = 0.55; e.chargeCd = 2.4;
          e.chargeDir.set(dx, 0, dz);
          vel.copy(e.chargeDir).multiplyScalar(13);
        } else {
          vel.set(dx * T.speed, 0, dz * T.speed);
        }
        if (targetDist < T.melee && e.atkCd === 0) {
          e.atkCd = T.atkGap;
          if (hasRival) hitRival(e.rivalTarget, T.dmg, env);
          else hitPlayer(T.dmg);
          e.charge = 0;
        }
        anim = e.charge > 0 ? "charge" : "walk";
      } else if (targetDist < T.melee) {
        anim = "attack"; fps = 10;
        if (e.atkCd === 0) {
          e.atkCd = T.atkGap;
          if (hasRival) hitRival(e.rivalTarget, T.dmg, env);
          else hitPlayer(T.dmg);
        }
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
        // zone sets the pace (spawnzones.js WANDER): city folk hurry, the
        // parish ambles, and Market Row's Saturday crowd weaves between the
        // stalls; hogs are untouched
        const s = (hog ? 1.3 : 1.7 * (e.wanderSpeed || 1) * (e.marketSaturday ? 1.4 : 1)) * e.pace;
        vel.set((gx / d) * s, 0, (gz / d) * s);
        anim = "walk"; fps = 6;
      }
    } else if (e.state === "loiter") {
      if (e.stateT <= 0) { setState(e, "wander", 0); pickGoal(e); }   // nobody loiters forever
      else if (e.face != null && e.spr._yaw != null) {
        e.spr._yaw += (e.face - e.spr._yaw) * Math.min(1, dt * 3);
      }
    } else if (e.state === "approaching_car") {
      const v = e.solicitVeh;
      if (!v || v.dead || !v.obj) {
        e.solicitVeh = null;
        setState(e, "wander", 0);
        pickGoal(e);
        return;
      }
      e.solicitTimer = (e.solicitTimer || 15) - dt;
      const doorOffset = new THREE.Vector3();
      vehicleRight(v, doorOffset);
      doorOffset.multiplyScalar(2.2);
      const doorPos = doorOffset.add(v.obj.position);
      e.goal.copy(doorPos);
      const gx = doorPos.x - p.x, gz = doorPos.z - p.z;
      const d = Math.hypot(gx, gz);

      if (d < 2.2 && Math.abs(v.speed || 0) < 2.5 && v.seats && v.seats[1] && !v.seats[1].occupant) {
        e.state = "in_car";
        v.seats[1].occupant = e;
        e.inCarTimer = 3.5;
        if (e.spr) e.spr.visible = false;
        if (typeof env.flashObjective === "function") {
          env.flashObjective("Prostitute entered vehicle ($50 for health)");
        }
      } else if (e.solicitTimer <= 0 || d > 28) {
        e.solicitVeh = null;
        setState(e, "wander", 0);
        pickGoal(e);
      } else {
        const s = T.speed * 1.1;
        vel.set((gx / (d || 1)) * s, 0, (gz / (d || 1)) * s);
        anim = "walk"; fps = 8;
      }
    } else if (e.state === "in_car") {
      const v = e.solicitVeh;
      if (e.spr) e.spr.visible = false;
      if (!v || v.dead || env.veh !== v) {
        if (v && v.seats && v.seats[1] && v.seats[1].occupant === e) v.seats[1].occupant = null;
        if (v && v.obj) v.obj.rotation.z = 0;
        e.solicitVeh = null;
        if (e.spr) e.spr.visible = true;
        setState(e, "wander", 0);
        pickGoal(e);
        return;
      }
      if (v.obj) v.obj.rotation.z = Math.sin(e.t * 14) * 0.035;
      e.inCarTimer = (e.inCarTimer || 3.5) - dt;
      if (e.inCarTimer <= 0) {
        if (v.obj) v.obj.rotation.z = 0;
        if (env.state) {
          env.state.money = Math.max(0, (env.state.money || 0) - 50);
          env.state.hp = Math.min(100, (env.state.hp || 100) + 50);
          if (typeof env.syncHUD === "function") env.syncHUD();
        }
        if (typeof env.flashObjective === "function") {
          env.flashObjective("Full service complete! +50 HP (-$50)");
        }
        const doorOffset = new THREE.Vector3();
        vehicleRight(v, doorOffset);
        doorOffset.multiplyScalar(2.4);
        e.spr.position.copy(v.obj.position).add(doorOffset);
        if (e.spr) e.spr.visible = true;
        if (v.seats && v.seats[1]) v.seats[1].occupant = null;
        e.solicitVeh = null;
        setState(e, "wander", 0);
        pickGoal(e);
      }
      return;
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
      // bounds: a half-size (square map) or { minX, maxX, minZ, maxZ }
      const B = typeof bounds === "number"
        ? { minX: -bounds, maxX: bounds, minZ: -bounds, maxZ: bounds } : bounds;
      p.x = THREE.MathUtils.clamp(p.x, B.minX + 3, B.maxX - 3);
      p.z = THREE.MathUtils.clamp(p.z, B.minZ + 3, B.maxZ - 3);
    }
  }

  return {
    get hostileCount() { return hostiles; },
    becomeHostile,
    noise,
    release,

    /** Give a freshly spawned NPC record its temperament and home turf. */
    init(e) {
      e.id = nextId++;
      e.mood = temperament(e.type);
      // people hang out at the nearest hangout; a hog's home is the woods it was born in
      e.home = e.type === "hog"
        ? { x: e.spr.position.x, z: e.spr.position.z, r: 14 }
        : nearestPoi(e.spr.position.x, e.spr.position.z);
      e.goal = new THREE.Vector3().copy(e.spr.position);
      e.threat = new THREE.Vector3();
      e.chargeDir = new THREE.Vector3();
      e.pace = rand(0.8, 1.2);
      e.wanderR = e.wanderR || 1;          // zone profile, set by the spawner
      e.wanderSpeed = e.wanderSpeed || 1;
      e.marketSaturday = e.wanderSpeed < 1 && marketTrading();
      e.think = Math.random() * 0.6;        // stagger: never all on the same frame
      e.calm = e.stare = 0;
      e.provoked = false;
      e.face = null;
      e.state = "idle";
      e.stateT = rand(0.5, 4);
      e.lod = 0;
    },

    /** The player hurt this NPC directly. */
    provoke(e) { e.provoked = true; e.think = 0; },

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
