// ---------------------------------------------------------------------------
// hijack.js — GTA-style car-jacking.
//
// F next to a car someone is driving (vehicles.js canHijack: the driver's seat
// has an occupant that isn't the player) starts a short sequence instead of
// teleporting you in:
//
//   approach  the player steps to the driver's door (the left side, exitOffset)
//   pull      a yank, and the driver is hauled out onto the road
//   enter     the player takes the seat; the driver reacts by temperament
//             (npc.js provoke: timid ones run, brave ones swing at you)
//
// While a jack is running, main.js freezes on-foot input and the car can't
// move. A car going faster than HIJACK.maxSpeed can't be jacked. Empty and
// parked cars are still entered straight away by main.js.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { exitOffset, driverSeat, canHijack } from "./vehicles.js";

export const HIJACK = Object.freeze({
  maxSpeed: 8,       // m/s: faster than this and you can't get the door open
  approach: 0.35,    // s to step to the door
  yank: 0.15,        // s from reaching the door to the driver coming out
  eject: 0.5,        // s the driver is dragged clear of the car
  heat: 0.4,         // crime heat for jacking someone
});

const LINES = [
  "Out the car. Now.", "Sorry, sir. Emergency.", "I need this more than you.",
  "Keys stay, you go.", "Borrowing this. Forever.",
];

/**
 * @param {object} ctx from main.js: state, getPlayerPos(), getPlayer(),
 *   releaseFromTraffic(v), spawnDriver(x, z, v) → NPC record (v: so a bike's own rider comes off it), provoke(npc),
 *   enterVehicle(v), flashObjective(text), crime(amount)
 */
export function createHijacker(ctx) {
  let job = null;
  let lastDriver = null;             // the NPC most recently pulled out of a car
  const off = new THREE.Vector3();

  /** A point `dist` metres out from the vehicle's driver door. */
  function doorPoint(v, dist) {
    exitOffset(v, off, dist);
    return { x: v.obj.position.x + off.x, z: v.obj.position.z + off.z };
  }

  return {
    HIJACK,
    get active() { return !!job; },
    get phase() { return job ? job.phase : null; },
    get vehicle() { return job ? job.v : null; },
    /** The NPC record most recently pulled out of a car (QA, and later: witnesses, revenge). */
    get lastDriver() { return lastDriver; },

    /** Try to jack `v`. Returns false (and says why) if it can't be done. */
    start(v) {
      if (job || !v || v.dead || !canHijack(v)) return false;
      if (Math.abs(v.speed) > HIJACK.maxSpeed) {
        ctx.flashObjective("Too fast to jack. Wait for it to slow down.");
        return false;
      }
      ctx.releaseFromTraffic(v);          // nobody drives it off mid-jack
      v.speed = 0;
      const pos = ctx.getPlayerPos();
      job = {
        v, phase: "approach", t: 0,
        from: { x: pos.x, z: pos.z },
        door: doorPoint(v, 1.7),
        driver: null, driverFrom: null, driverTo: null,
      };
      return true;
    },

    update(dt) {
      if (!job) return;
      const { v } = job;
      if (v.dead) { job = null; return; }
      v.speed = 0;
      job.t += dt;
      const player = ctx.getPlayer(), pos = ctx.getPlayerPos();

      if (job.phase === "approach") {
        const k = Math.min(1, job.t / HIJACK.approach), e = k * k * (3 - 2 * k);
        pos.x = job.from.x + (job.door.x - job.from.x) * e;
        pos.z = job.from.z + (job.door.z - job.from.z) * e;
        player.position.x = pos.x;
        player.position.z = pos.z;
        player.visible = true;
        player.play("walk", { fps: 12 });
        if (k >= 1) {
          job.phase = "pull";
          job.t = 0;
          if (player._yaw != null) player._yaw = Math.atan2(v.obj.position.x - pos.x, v.obj.position.z - pos.z);
          player.play("attack", { loop: false, force: true });
        }
      } else if (job.phase === "pull") {
        if (!job.driver && job.t >= HIJACK.yank) {
          job.driverFrom = doorPoint(v, 0.8);
          job.driverTo = doorPoint(v, 4.2);
          job.driver = lastDriver = ctx.spawnDriver(job.driverFrom.x, job.driverFrom.z, v);
          const seat = driverSeat(v);
          if (seat) seat.occupant = null;
          if (job.driver && job.driver.spr.play) job.driver.spr.play("hurt", { loop: false, force: true });
        }
        if (job.driver) {
          const k = Math.min(1, (job.t - HIJACK.yank) / HIJACK.eject), e = 1 - (1 - k) * (1 - k);
          const d = job.driver.spr.position;
          d.x = job.driverFrom.x + (job.driverTo.x - job.driverFrom.x) * e;
          d.z = job.driverFrom.z + (job.driverTo.z - job.driverFrom.z) * e;
        }
        if (job.t >= HIJACK.yank + HIJACK.eject) job.phase = "enter";
      } else if (job.phase === "enter") {
        const seat = driverSeat(v);
        if (seat) seat.occupant = "player";
        ctx.enterVehicle(v);
        if (job.driver) ctx.provoke(job.driver);
        ctx.crime(HIJACK.heat);
        ctx.flashObjective(LINES[(Math.random() * LINES.length) | 0]);
        job = null;
      }
    },
  };
}
