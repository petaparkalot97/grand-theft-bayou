// ---------------------------------------------------------------------------
// prologue.js — PROLOGUE "Mud, Blood & Magnolia" and MISSION 1 "Hog Wild".
//
// Follows the script: a radio-dial cold open over Dixie Beaux, Keseme's GPS and
// Mally's phone call, the chase after his stolen green Bravado, the hog
// stampede in the woods east of the strip, Bubba and his tranquilizer rifle,
// and the roadside standoff with Sheriff Clay Mercer over the ledger. It ends on
// the title card and hands over to free roam ("Act One").
//
// main.js owns the world and the player; this module drives the story on top of
// them through a small `ctx` interface (see createPrologue). Cutscenes run on
// cinema.js, so every scene can be skipped with Esc.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// The route the thieves take: north up US-167, then east on a dirt road into
// the woods between the BurgerPiz and the Popeyes lots. main.js keeps trees
// off it (PROLOGUE_KEEPOUT) and prologue lays the dirt.
export const ROUTE_EAST = [[4, 43], [40, 43], [62, 40], [74, 36]];
export const CRASH = { x: 86, z: 26 };
export const PROLOGUE_KEEPOUT = [
  { x: 22, z: 43, r: 7 }, { x: 40, z: 43, r: 9 }, { x: 52, z: 42, r: 9 },
  { x: 63, z: 40, r: 9 }, { x: 73, z: 36, r: 10 }, { x: 84, z: 29, r: 19 },
];

// Story characters, built with characters.js options.
const CAST = {
  keseme: { sex: "f", seed: 7021, skin: 0x8d6446, top: 0x2f6f6a, hair: 0x0f0b09, headwear: "none", curly: false,
            crew: { cloth: 0x23262b, chain: 0xcfd3da, shoe: 0x2b2f36 } },
  mally:  { sex: "m", seed: 3301, skin: 0x5e3a26, top: 0xf0eee6, headwear: "none",
            crew: { cloth: 0x2f9e44, chain: 0xd4af37, shoe: 0x2f9e44 } },
  bubba:  { sex: "m", seed: 5150, skin: 0xd6a57c, top: 0x6a6f3c, denim: 0x5b5a3c, hair: 0x6b4a2c, headwear: "none",
            crew: { cloth: 0x4b5230, chain: 0x8a8a8a, shoe: 0x4a3a28 } },
  mercer: { sex: "m", seed: 1952, skin: 0xe0b48e, top: 0xb89d6e, denim: 0x4e4234, hair: 0x9a9a9a, headwear: "hat", beard: false,
            crew: { cloth: 0x3c3226, chain: 0xd4af37, shoe: 0x2a2018, hat: 0xcbb58a } },
  deputy: { sex: "m", skin: 0xc79a74, top: 0x9c8660, denim: 0x3d3a34, headwear: "hat", beard: false,
            crew: { cloth: 0x2e2a22, chain: 0xaaaaaa, shoe: 0x201a14, hat: 0x6b5a3e } },
};

export function makeCastMember(makeHoodrat, who, extra = {}) {
  return makeHoodrat({ ...CAST[who], ...extra });
}

function tintClone(src, hex) {
  const obj = src.clone(true);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      const c = m.clone();
      if (c.color) c.color.multiply(new THREE.Color(hex));
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  return obj;
}

/**
 * @param {object} ctx  provided by main.js:
 *   scene, camera, cine, state, playerPos, getPlayer(), vehicles, enemies,
 *   registerVehicle(obj, r, opts), spawnEnemy(type, x, z), killEnemy(e), npcs,
 *   makeHoodrat(opts), makeThief(), surface(kind, size), hitPlayer(dmg),
 *   spawnTracer(a, b), muzzleFlash(p), setObjective(text|null),
 *   flashObjective(text), enterVehicle(v), exitVehicle(), startMusic(),
 *   setPopulation(on), models: { coupe, bravado, pickup }, getSheriffProto(),
 *   ROAD_X, SPAWN_Z, SIGN_Z, ROAD_HALF
 */
export function createPrologue(ctx) {
  const { scene, cine, state, playerPos } = ctx;
  const say = (c, who, line) => c.say(who, line);

  let started = false;          // start() runs the opening once: a second call would queue it again
  let phase = "idle";          // idle | open | drive | chase | stampede | hogs | retrieve | ledger | done
  let coupe = null, bravado = null, bubbaTruck = null;
  const cast = {};              // actors on set
  const props = [];             // things main.js must not static-batch
  const movers = [];            // scripted walks / drives
  const herd = [];
  const thieves = [];
  let fence = null;
  let talk = Promise.resolve();  // chained in-game dialogue, never overlapping

  // ---------------------------------------------------------------- set dressing
  function buildSet() {
    // dirt road from the highway into the woods
    const dirt = ctx.surface("dirt", 512);
    const pts = [[ctx.ROAD_X + ctx.ROAD_HALF, 43], ...ROUTE_EAST, [CRASH.x, CRASH.z]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0) + 3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, len), dirt.material(1, { color: 0xd8c3a0 }));
      for (const t of [m.material.map, m.material.normalMap, m.material.roughnessMap]) {
        if (t) t.repeat.set(1, len / 6);
      }
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.atan2(x1 - x0, z1 - z0) + Math.PI;
      m.position.set((x0 + x1) / 2, 0.025 + i * 0.001, (z0 + z1) / 2);
      m.receiveShadow = true;
      scene.add(m);
    }

    // a split-rail fence the Bravado goes through
    fence = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ name: "fence wood", color: 0x7a5a3a });
    for (const px of [-4, 0, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), wood);
      post.position.set(px, 0.75, 0);
      post.castShadow = true;
      fence.add(post);
    }
    for (const py of [0.5, 1.1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.14, 0.1), wood);
      rail.position.set(0, py, 0);
      rail.castShadow = true;
      fence.add(rail);
    }
    fence.position.set(CRASH.x - 3, 0, CRASH.z + 4);
    // yaw first, then tilt about the rails, so knocking it over lays it flat
    fence.rotation.order = "YXZ";
    fence.rotation.y = 0.7;
    scene.add(fence);
    props.push(fence);

    // Keseme's aging black coupe and Mally's green Bravado
    if (ctx.models.coupe) {
      const obj = tintClone(ctx.models.coupe, 0x3a3a42);
      obj.position.set(ctx.ROAD_X + 2.4, ctx.models.coupe.position.y, ctx.SPAWN_Z - 3);
      obj.rotation.set(0, Math.PI, 0);
      scene.add(obj);
      coupe = ctx.registerVehicle(obj, 1.9, { hp: 60 });
      coupe.heading = Math.PI;
      props.push(obj);
    }
    if (ctx.models.bravado) {
      const obj = tintClone(ctx.models.bravado, 0x5fe36b);
      obj.position.set(ctx.ROAD_X + 22, ctx.models.bravado.position.y, 96);
      scene.add(obj);
      bravado = ctx.registerVehicle(obj, 1.9, { hp: 999 });
      bravado.locked = true;              // nobody jacks it mid-chase
      bravado.baseY = obj.position.y;
      obj.visible = false;
      props.push(obj);
    }
    if (ctx.models.pickup) {
      const obj = ctx.models.pickup.clone(true);
      obj.position.set(30, ctx.models.pickup.position.y, 43);
      obj.rotation.y = Math.PI / 2;
      obj.visible = false;
      scene.add(obj);
      bubbaTruck = obj;
      props.push(obj);
    }
    return props;
  }

  // ---------------------------------------------------------------- movers
  /** Walk / drive `obj` to (x, z). Resolves on arrival (instantly when skipping). */
  function moveTo(obj, x, z, speed, { face = true, actor = false } = {}) {
    return new Promise((resolve) => {
      const i = movers.findIndex((m) => m.obj === obj);
      if (i >= 0) movers.splice(i, 1);
      movers.push({ obj, x, z, speed, face, actor, resolve });
    });
  }
  function updateMovers(dt) {
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i], p = m.obj.position;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      const step = m.speed * dt;
      if (cine.skipping || d <= step) {
        p.x = m.x; p.z = m.z;
        if (m.actor) m.obj.play("idle");
        movers.splice(i, 1);
        m.resolve();
        continue;
      }
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      if (m.actor) m.obj.play("walk");
      else if (m.face) m.obj.rotation.y = Math.atan2(dx, dz);
    }
  }
  function faceActor(actor, x, z) {
    if (actor) actor._yaw = Math.atan2(x - actor.position.x, z - actor.position.z);
  }
  function place(who, x, z, yawTo) {
    let a = cast[who];
    if (!a) {
      a = cast[who] = makeCastMember(ctx.makeHoodrat, who.replace(/\d+$/, ""), who.startsWith("deputy") ? { seed: who.length * 911 } : {});
      scene.add(a);
    }
    a.visible = true;
    a.position.set(x, 0, z);
    a._last.copy(a.position);
    if (yawTo) faceActor(a, yawTo[0], yawTo[1]);
    return a;
  }
  function dismiss(who) {
    if (!cast[who]) return;
    scene.remove(cast[who]);
    delete cast[who];
  }

  // ---------------------------------------------------------------- chase
  const chase = { route: null, wi: 0, speed: 0, lost: 0, shotCd: 3, exchanged: false, start: null };

  function launchBravado() {
    if (!bravado || chase.route) return;
    const pz = THREE.MathUtils.clamp(playerPos.z, 70, 130);
    const route = [];
    // bursts out of the 6twelve lot across the road ahead of Keseme
    if (pz - 30 > 52) route.push([ctx.ROAD_X + 2.4, pz - 30]);
    route.push([ctx.ROAD_X + 2.4, 48], ...ROUTE_EAST);
    chase.start = { x: ctx.ROAD_X + 20, z: Math.max(52, pz - 32) };
    chase.route = route;
    chase.wi = 0;
    chase.speed = 24;
    chase.lost = 0;
    const o = bravado.obj;
    o.position.set(chase.start.x, bravado.baseY, chase.start.z);
    o.visible = true;
    bravado.heading = -Math.PI / 2;
    ctx.flashObjective("The green Bravado just blew through the intersection.");
  }

  function resetChase() {
    // lost it: back to the start of the chase, a little further up the road
    ctx.flashObjective("You lost the Bravado. Try again.");
    chase.route = null;
    const v = state.veh || coupe;
    if (v) {
      v.obj.position.set(ctx.ROAD_X + 2.4, v.obj.position.y, 96);
      v.heading = Math.PI;
      v.obj.rotation.y = Math.PI;
      v.speed = 0;
      v.blocker.x = v.obj.position.x; v.blocker.z = v.obj.position.z;
      playerPos.copy(v.obj.position);
    }
    launchBravado();
  }

  function updateChase(dt) {
    const b = bravado, o = b.obj;
    const target = chase.route[chase.wi];
    const dx = target[0] - o.position.x, dz = target[1] - o.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) {
      chase.wi++;
      if (chase.wi >= chase.route.length) { chase.route = null; startStampede(); return; }
      return;
    }
    // rubber band: stay catchable, never trivial
    const gap = Math.hypot(playerPos.x - o.position.x, playerPos.z - o.position.z);
    const want = gap < 14 ? 27 : gap > 70 ? 9 : gap > 45 ? 14 : 22;
    chase.speed += (want - chase.speed) * Math.min(1, dt * 1.5);
    const desired = Math.atan2(dx, dz);
    let dh = desired - b.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    b.heading += THREE.MathUtils.clamp(dh, -3 * dt, 3 * dt);
    o.position.x += Math.sin(b.heading) * chase.speed * dt;
    o.position.z += Math.cos(b.heading) * chase.speed * dt;
    o.rotation.y = b.heading;
    o.rotation.z = THREE.MathUtils.clamp(-dh, -0.1, 0.1);
    b.speed = chase.speed;
    b.blocker.x = o.position.x; b.blocker.z = o.position.z;

    // losing it
    chase.lost = gap > 85 ? chase.lost + dt : 0;
    if (chase.lost > 6) { resetChase(); return; }

    // the thief leans out with a shotgun
    chase.shotCd -= dt;
    if (gap < 26 && chase.shotCd <= 0) {
      chase.shotCd = 2.2 + Math.random() * 1.4;
      if (!chase.exchanged) {
        chase.exchanged = true;
        dialogue(async (c) => {
          await say(c, "THIEF", "Back off!");
          await say(c, "KESEME", "No.");
          await say(c, "THIEF", "We'll shoot!");
          await say(c, "KESEME", "That is significantly more persuasive.");
          shotgunAtPlayer();
          await say(c, "KESEME", "And unnecessarily loud.");
        });
      } else {
        shotgunAtPlayer();
      }
    }
  }

  function shotgunAtPlayer() {
    if (!bravado) return;
    const from = bravado.obj.position.clone().setY(1.4);
    const to = playerPos.clone().setY(1.2);
    ctx.spawnTracer(from, to);
    ctx.muzzleFlash(from);
    cine.sfx("shotgun", 0.8);
    ctx.hitPlayer(3);
  }

  /** In-game (not letterboxed) dialogue; chained so lines never overlap. */
  function dialogue(fn) {
    talk = talk.then(() => cine.scene(fn)).catch((e) => console.error(e));
    return talk;
  }

  // ---------------------------------------------------------------- the herd
  function spawnHerd() {
    // pour out of the treeline to the north and east, loosely, not in a ring
    const spots = [];
    for (let i = 0; i < 14; i++) {
      const a = -0.4 + Math.random() * 2.2;
      const r = 14 + Math.random() * 14;
      spots.push([CRASH.x + Math.cos(a) * r, CRASH.z - Math.sin(a) * r]);
    }
    for (const [x, z] of spots) {
      ctx.spawnEnemy("hog", x, z);
      const e = ctx.enemies[ctx.enemies.length - 1];
      e.herd = true;
      e.T = { ...e.T, dmg: 9, aggro: 30 };       // a lot of them, so they hit softer
      e.mood = "territorial";
      e.home = { x: CRASH.x, z: CRASH.z, r: 14 };
      // where it ends up milling around the car during the cutscene
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
      e.mill = { x: CRASH.x + Math.cos(a) * r, z: CRASH.z + Math.sin(a) * r, pace: 5 + Math.random() * 4 };
      herd.push(e);
    }
    for (let i = 0; i < 3; i++) {
      const t = ctx.makeThief();
      t.blob.visible = i !== 0;
      // one thief climbed onto the roof, the other two are pinned against the doors
      t.position.set(CRASH.x + (i === 0 ? 0 : i * 1.4 - 2.8), i === 0 ? 1.15 : 0, CRASH.z + (i === 0 ? -0.2 : 1.9));
      scene.add(t);
      thieves.push(t);
    }
  }

  function herdLeft() {
    let n = 0;
    for (const e of herd) if (!e.dead) n++;
    return n;
  }

  // during the stampede cutscene the gameplay AI is paused, so drive the herd here
  function stampedeHerd(dt, t) {
    for (const e of herd) {
      if (e.dead) continue;
      const p = e.spr.position;
      const goal = e.mill || CRASH;
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
      const moving = d > 0.8;
      if (moving) {
        const pace = (e.mill ? e.mill.pace : 7) * Math.min(1, d / 3);
        p.x += (dx / d) * pace * dt;
        p.z += (dz / d) * pace * dt;
        e.spr.rotation.y = Math.atan2(dx, dz);
      } else if (e.mill && Math.random() < dt * 0.6) {
        // arrived: shuffle to a new spot near the car now and then
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 8;
        e.mill.x = CRASH.x + Math.cos(a) * r;
        e.mill.z = CRASH.z + Math.sin(a) * r;
      }
      const gait = moving ? Math.sin(t * 24 + p.x) * 0.12 : 0;
      e.spr.userData.legs.forEach((l, i) => (l.position.y = 0.35 + (i % 2 ? gait : -gait)));
    }
  }

  let bubbaCd = 1.5;
  function updateBubba(dt) {
    const bubba = cast.bubba;
    if (!bubba) return;
    bubbaCd -= dt;
    if (bubbaCd > 0) return;
    bubbaCd = 1.25 + Math.random() * 0.5;
    let best = null, bd = 28;
    for (const e of herd) {
      if (e.dead) continue;
      const d = e.spr.position.distanceTo(bubba.position);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    faceActor(bubba, best.spr.position.x, best.spr.position.z);
    const from = bubba.position.clone().setY(1.3);
    ctx.spawnTracer(from, best.spr.position.clone().setY(0.8));
    ctx.npcs.noise(bubba.position.x, bubba.position.z, 18);
    best.hp -= 3;                                   // tranquilizer darts: down, not dead
    if (best.hp <= 0) ctx.killEnemy(best);
  }

  // ---------------------------------------------------------------- scenes
  async function coldOpen(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0);
    await c.wait(0.6);
    const collage = [
      ["Cicadas.", null], ["Distant gunshots.", "gunshot"], ["A church choir.", null],
      ["A casino slot machine.", "chime"], ["Police sirens.", "siren"], ["A hog squealing.", "squeal"],
    ];
    for (const [line, sound] of collage) {
      if (sound) c.sfx(sound, 0.6);
      await c.caption(line, 0.95);
    }
    ctx.startMusic();
    await c.caption("A brass band explodes into life.", 1.4);
    await say(c, "RADIO ANNOUNCER", "Good morning, Dixie Beaux! Eighty-nine degrees, ninety-eight percent humidity, and approximately three hundred percent chance somebody's cousin is doing something illegal.");
    c.sfx("static"); await c.wait(0.35);
    await say(c, "PREACHER", "The end is near!");
    c.sfx("static"); await c.wait(0.35);
    await say(c, "TALK RADIO HOST", "Everything wrong with this state is because of people from somewhere else!");
    c.sfx("static"); await c.wait(0.35);
    await say(c, "WOMAN CALLER", "You were born in Ohio, Earl.");
    await c.caption("Silence.", 1.2);
    await say(c, "TALK RADIO HOST", "That's irrelevant.");

    // dawn over the strip
    c.shot({ from: [110, 70, 150], to: [30, 50, -20], look: [ctx.ROAD_X, 0, 80], lookTo: [ctx.ROAD_X, 0, -80], dur: 9 });
    c.black(false, 1.8);
    c.card("EXT.", "DIXIE BEAUX", "Dawn");
    await c.wait(6);

    // the state line billboard
    const sx = ctx.ROAD_X + ctx.ROAD_HALF + 3.5, sz = ctx.SIGN_Z, ry = -0.35;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    await c.shot({ from: [sx + fx * 15, 5, sz + fz * 15], to: [sx + fx * 10, 4.4, sz + fz * 10], look: [sx, 4, sz], dur: 4.2 });

    // Chatboro's water tower
    c.card("EXT.", "CHATBORO — MORNING", "Population: 4,083");
    await c.shot({ from: [-24, 13, 154], to: [-33, 17, 146], look: [-58, 19, 128], dur: 4.8 });

    // into the car
    const o = coupe ? coupe.obj.position : playerPos;
    c.card("INT.", "KESEME'S CAR", "Continuous");
    await c.shot({ from: [o.x, 32, o.z + 34], to: [o.x, 8, o.z + 14], look: [o.x, 1, o.z - 4], dur: 2.6 });
    state.cinematic = false;
  }

  async function phoneCall(c) {
    await c.wait(1.2);
    await say(c, "GPS", "Turn left in six hundred feet.");
    await c.caption("Keseme looks left. There is no road. Only swamp.");
    await say(c, "KESEME", "That's water.");
    await say(c, "GPS", "Recalculating.");
    await say(c, "KESEME", "You tried to kill me.");
    await say(c, "GPS", "Recalculating.");
    await say(c, "KESEME", "That's not an apology.");
    c.sfx("ring");
    await c.caption("Incoming call: MALIK “MALLY” BAPTISTE", 1.6);
    await say(c, "KESEME", "You're calling before nine in the morning.");
    await say(c, "MALLY", "It's eight fifty-seven.");
    await say(c, "KESEME", "Exactly.");
    await say(c, "MALLY", "We got a problem.");
    await say(c, "KESEME", "“We” usually means you did something stupid and somehow capitalism expects me to participate.");
    await say(c, "MALLY", "Somebody stole my car.");
    launchBravado();
    await c.wait(1);
    await say(c, "KESEME", "Green Bravado?");
    await say(c, "MALLY", "Yeah.");
    await say(c, "KESEME", "Broken passenger window?");
    await say(c, "MALLY", "Yeah.");
    await say(c, "KESEME", "Rear bumper held on with electrical tape?");
    await say(c, "MALLY", "It's tactical reinforcement.");
    await say(c, "KESEME", "Your tactical reinforcement just passed me.");
    await say(c, "MALLY", "Get my car!");
    await say(c, "KESEME", "You called the wrong friend.");
    await say(c, "MALLY", "You are literally following it.");
    await say(c, "KESEME", "Coincidence.");
  }

  async function stampede(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.3);
    // park Keseme on the dirt road behind the action, off-camera cut
    const v = state.veh;
    if (v) {
      v.obj.position.set(58, v.obj.position.y, 41.5);
      v.heading = Math.PI / 2 + 0.25;
      v.obj.rotation.set(0, v.heading, 0);
      v.speed = 0;
      v.blocker.x = 58; v.blocker.z = 41.5;
      playerPos.copy(v.obj.position);
    }
    // the Bravado has already swerved through the fence
    if (bravado) {
      const o = bravado.obj;
      o.position.set(CRASH.x, bravado.baseY, CRASH.z);
      bravado.heading = 2.3;
      o.rotation.set(0.05, 2.3, 0.12);
      bravado.speed = 0;
      bravado.blocker.x = CRASH.x; bravado.blocker.z = CRASH.z;
    }
    if (fence) { fence.rotation.x = -1.35; fence.position.y = 0.1; }
    spawnHerd();
    phase = "stampede";
    c.shot({ from: [66, 9, 54], to: [70, 7, 48], look: [CRASH.x, 1, CRASH.z], dur: 3.5 });
    await c.black(false, 0.4);
    c.sfx("squeal");
    await c.caption("A massive feral hog charges onto the road. The thieves swerve — straight through a fence.");
    await say(c, "KESEME", "Why are there so many—");
    c.sfx("squeal", 1.3);
    c.shot({ from: [104, 28, 62], to: [94, 21, 52], look: [CRASH.x, 0, CRASH.z], dur: 4.5 });
    await c.caption("The entire forest ERUPTS.");
    await say(c, "THIEF", "GET THESE DEMON PIGS AWAY FROM ME!");
    await say(c, "KESEME", "Technically pigs and hogs—");
    await say(c, "THIEF", "I DON'T CARE!");

    // Bubba rolls up
    if (bubbaTruck) {
      bubbaTruck.visible = true;
      bubbaTruck.position.set(34, bubbaTruck.position.y, 44);
      moveTo(bubbaTruck, 64, 45, 14);
    }
    c.shot({ from: [52, 6, 54], to: [56, 5, 52], look: [64, 1.4, 45], dur: 3 });
    await c.wait(2);
    const bubba = place("bubba", 63, 48, [CRASH.x, CRASH.z]);
    await say(c, "BUBBA", "KES!");
    await say(c, "KESEME", "Why are you here?");
    await say(c, "BUBBA", "Hog hunt.");
    await c.caption("He looks at the chaos.");
    await say(c, "BUBBA", "Apparently the hogs declared independence.");
    c.sfx("squeal");
    await say(c, "BUBBA", "HEY!");
    await c.caption("He pulls out a tranquilizer rifle.");
    await say(c, "KESEME", "Why do you have tranquilizers?");
    await say(c, "BUBBA", "Long story.");
    await say(c, "KESEME", "Legal story?");
    await say(c, "BUBBA", "Shorter story.");
    faceActor(bubba, CRASH.x, CRASH.z);
    state.cinematic = false;
  }

  async function ledgerScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    ctx.setPopulation(false);
    await c.black(true, 0.4);
    const b = bravado.obj.position;
    if (state.veh) ctx.exitVehicle();
    const keseme = ctx.getPlayer();
    keseme.position.set(b.x - 3, 0, b.z + 2.5);
    keseme._last.copy(keseme.position);
    playerPos.copy(keseme.position);
    faceActor(keseme, b.x, b.z);
    for (const t of thieves) scene.remove(t);
    thieves.length = 0;
    const bubba = place("bubba", b.x - 6, b.z + 5, [b.x, b.z]);
    const mally = place("mally", 60, 44);
    c.shot({ from: [b.x - 16, 6, b.z + 16], to: [b.x - 13, 5, b.z + 13], look: [b.x - 3, 1.3, b.z + 2], dur: 6 });
    await c.black(false, 0.6);
    c.card("EXT.", "RURAL ROAD — LATER", "Malik “Mally” Baptiste, 25");
    await moveTo(mally, b.x - 4.5, b.z + 1.5, 3.2, { actor: true });
    faceActor(mally, b.x, b.z);
    await say(c, "MALLY", "My baby!");
    await c.caption("Keseme points at the crushed hood.");
    await say(c, "KESEME", "Your baby has hoof prints.");
    await say(c, "BUBBA", "Adds character.");
    await say(c, "MALLY", "Why were they stealing it anyway?");

    const duffel = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.38, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.8 }));
    duffel.position.set(b.x - 2.4, 0.2, b.z + 1.4);
    duffel.castShadow = true;
    const cash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x5f8f4e, roughness: 0.9 }));
    cash.position.y = 0.24;
    duffel.add(cash);
    scene.add(duffel);
    faceActor(keseme, duffel.position.x, duffel.position.z);
    c.shot({ from: [b.x - 7, 3, b.z + 6], look: [b.x - 2.4, 0.4, b.z + 1.4], dur: 2 });
    await c.caption("Keseme reaches under the passenger seat. A black duffel bag. Stacks of cash.");
    await say(c, "MALLY", "That ain't mine.");
    await c.caption("Keseme gives him a look.");
    await say(c, "MALLY", "Most of it ain't mine.");
    await c.caption("Inside, a small ledger. Names. Dates. Dollar amounts. Police badge numbers. Political campaigns.");
    await say(c, "KESEME", "Mally.");
    await say(c, "MALLY", "Yeah?");
    await say(c, "KESEME", "Who gave you this bag?");
    await say(c, "MALLY", "Nobody.");
    await say(c, "KESEME", "Incorrect answer.");
    await say(c, "MALLY", "I was holding it for somebody.");
    await say(c, "KESEME", "Worse answer.");

    // the Sheriff's convoy
    c.sfx("siren", 1.2);
    const cruisers = [];
    const proto = ctx.getSheriffProto();
    const stops = [[b.x - 14, b.z + 10], [b.x - 18, b.z + 3], [b.x - 11, b.z + 16]];
    if (proto) {
      stops.forEach(([x, z], i) => {
        const car = proto.clone(true);
        car.position.set(20 - i * 8, proto.position.y, 43);
        car.rotation.y = Math.PI / 2;
        scene.add(car);
        cruisers.push(car);
        moveTo(car, x, z, 16);
      });
    }
    c.shot({ from: [b.x - 30, 14, b.z + 26], to: [b.x - 24, 11, b.z + 22], look: [b.x - 8, 1, b.z + 6], dur: 4 });
    await c.caption("Sirens. Sheriff vehicles emerge from the road. Too many.");
    await say(c, "KESEME", "How many people know you have this?");
    await say(c, "MALLY", "Maybe—");
    await say(c, "KESEME", "Don't say “maybe.”");
    await say(c, "MALLY", "Maybe everybody.");

    const mercer = place("mercer", b.x - 12, b.z + 8, [b.x - 3, b.z + 2.5]);
    place("deputy1", b.x - 15, b.z + 5, [b.x - 3, b.z + 2.5]);
    place("deputy2", b.x - 10, b.z + 13, [b.x - 3, b.z + 2.5]);
    await moveTo(mercer, b.x - 7, b.z + 5, 1.8, { actor: true });
    faceActor(mercer, keseme.position.x, keseme.position.z);
    c.shot({ from: [b.x - 1, 2.6, b.z + 9], look: [b.x - 7, 1.7, b.z + 5], dur: 3 });
    c.card("", "SHERIFF CLAY MERCER", "Polished boots. Perfect smile. Cold eyes.");
    await say(c, "MERCER", "Morning.");
    await c.caption("Nobody responds.");
    await say(c, "MERCER", "Beautiful day.");
    c.sfx("squeal", 0.5);
    await c.caption("A hog squeals in the distance.");
    await say(c, "BUBBA", "Debatable.");
    await c.caption("Mercer notices the ledger. His smile disappears for half a second. Keseme notices. Mercer notices her noticing.");
    await say(c, "MERCER", "That your property?");
    await say(c, "KESEME", "Found property.");
    await say(c, "MERCER", "Then I'll take it.");
    await say(c, "KESEME", "Evidence requires documentation.");
    await say(c, "MERCER", "You always this difficult?");
    await say(c, "KESEME", "Only when people ask me to ignore procedure.");
    await say(c, "MERCER", "Procedure?");
    await c.caption("No body cameras. No witnesses except his deputies.");
    await say(c, "MERCER", "Out here, young lady, procedure is whatever keeps everybody safe.");
    c.shot({ from: [b.x - 5, 1.9, b.z + 1], look: [b.x - 12, 1.5, b.z + 8], dur: 3 });
    await c.caption("Keseme recognizes one badge number from the ledger. Then another. Then another.");
    await say(c, "KESEME", "Interesting.");
    await say(c, "MERCER", "What's interesting?");
    await say(c, "KESEME", "Nothing.");
    await say(c, "MERCER", "Good.");
    await say(c, "MERCER", "Bag.");
    await c.caption("Keseme hands him the duffel — but not the ledger. It's already under her jacket.");
    duffel.position.set(mercer.position.x + 0.4, 0.9, mercer.position.z);
    await say(c, "MERCER", "You kids stay out of trouble.");
    await say(c, "MALLY", "Absolutely.");
    await say(c, "BUBBA", "Statistically unlikely.");

    // they leave
    dismiss("mercer"); dismiss("deputy1"); dismiss("deputy2");
    scene.remove(duffel);
    cruisers.forEach((car, i) => moveTo(car, 10 - i * 10, 43, 18).then(() => scene.remove(car)));
    c.shot({ from: [b.x - 9, 4, b.z + 10], look: [b.x - 4, 1.3, b.z + 2], dur: 3 });
    await c.caption("The deputies leave. Silence.");
    await say(c, "MALLY", "Please tell me you didn't—");
    await c.caption("Keseme pulls out the ledger.");
    await say(c, "MALLY", "We gonna die.");
    await say(c, "KESEME", "Possibly.");
    await say(c, "BUBBA", "Can we schedule it after lunch?");
    for (const car of cruisers) scene.remove(car);

    // title
    c.shot({ from: [b.x - 9, 4, b.z + 10], to: [b.x + 10, 80, b.z + 70], look: [b.x - 4, 1, b.z + 2], lookTo: [b.x, 0, b.z - 20], dur: 5 });
    await c.wait(3.2);
    await c.title("GRAND THEFT BAYOU");
    await c.card("ACT ONE", "WELCOME HOME", "", { center: true, hold: 2.4 });
    faceActor(bubba, keseme.position.x, keseme.position.z);
    state.cinematic = false;
  }

  // ---------------------------------------------------------------- flow
  function startStampede() {
    if (phase !== "chase") return;
    phase = "stampede";
    cine.scene(stampede).then(() => {
      phase = "hogs";
      ctx.setObjective("Help Bubba clear the hogs off the Bravado.");
    });
  }

  async function runPrologue() {
    phase = "open";
    ctx.setPopulation(false);
    if (coupe) ctx.enterVehicle(coupe);
    await cine.scene(coldOpen);

    phase = "drive";
    ctx.setObjective("Drive north on US-167.");
    await cine.scene(phoneCall);
    launchBravado();                       // in case Esc skipped the call
    phase = "chase";
    ctx.setPopulation(true);
    ctx.setObjective("Follow the stolen Bravado.");
    dialogue((c) => c.card("MISSION 1", "HOG WILD", "Follow the stolen car", { center: true, hold: 2.4 }));
  }

  function finish(skipped = false) {
    phase = "done";
    // the story carries on into Act One; Free roam (skipped) does not
    if (!skipped && ctx.onFinished) queueMicrotask(ctx.onFinished);
    if (bravado) bravado.locked = false;
    ctx.setPopulation(true);
    ctx.setObjective(null);
    ctx.flashObjective("The ledger's hot. Scrounge 4 gas cans and get the truck out past Tusouxroe.");
  }

  return {
    buildSet,
    get phase() { return phase; },
    /** Where the player should go next ({x, z}), or null: the minimap's waypoint blip. */
    get waypoint() {
      if ((phase === "chase" || phase === "retrieve") && bravado) return { x: bravado.obj.position.x, z: bravado.obj.position.z };
      if (phase === "hogs") return CRASH;
      return null;
    },
    get props() { return props; },
    get vehicles() { return [coupe, bravado].filter(Boolean); },

    /** Start the story from the menu. */
    start() {
      if (started) return;
      started = true;
      runPrologue().catch((e) => { console.error(e); finish(); });
    },

    /**
     * QA hooks for tools/qa/prologue.mjs, so a headless run can reach each
     * beat without steering a whole car chase: "stampede" | "clear" | "board".
     */
    debug(step) {
      if (step === "stampede" && phase === "chase") { chase.route = null; startStampede(); }
      if (step === "clear") for (const e of herd) if (!e.dead) ctx.killEnemy(e);
      if (step === "board" && bravado && !bravado.locked) ctx.enterVehicle(bravado);
      return phase;
    },

    /** Skip the story: free roam, as the game played before the prologue. */
    skip() {
      finish(true);
      if (bravado) {
        bravado.obj.visible = true;
        bravado.obj.position.set(ctx.ROAD_X + 20, bravado.baseY, 94);
        bravado.blocker.x = bravado.obj.position.x; bravado.blocker.z = 94;
      }
      if (fence) fence.visible = true;
    },

    update(dt) {
      updateMovers(dt);
      for (const a of Object.values(cast)) a.update(dt);
      for (const t of thieves) t.update(dt, ctx.camera);
      if (state.cinematic) {
        const p = ctx.getPlayer();
        if (p && !state.veh) p.update(dt, ctx.camera);
      }

      if (phase === "chase" && chase.route && !state.cinematic) updateChase(dt);
      else if (phase === "stampede") stampedeHerd(dt, performance.now() / 1000);
      else if (phase === "hogs") {
        updateBubba(dt);
        const n = herdLeft();
        ctx.setObjective(`Help Bubba clear the hogs: ${n} left`);
        if (n === 0) {
          phase = "retrieve";
          for (const t of thieves) moveTo(t, t.position.x + 40, t.position.z - 30, 7, { face: false });
          bravado.locked = false;
          ctx.setObjective("Get in Mally's Bravado.");
          dialogue(async (c) => { await say(c, "BUBBA", "That's the last of 'em. Go get Mally's car."); });
        }
      } else if (phase === "retrieve" && state.veh === bravado) {
        phase = "ledger";
        cine.scene(ledgerScene).then(finish);
      }
    },
  };
}
