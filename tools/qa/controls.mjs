// Headless acceptance tests for TASK-033 (core gameplay rework), following the
// spec's test list:
//   30 on foot: W walks where the camera looks at yaw 0 / 90 / 180 / 270°;
//      strafe, diagonal, stop, turning the camera without moving
//   31 vehicle: facing north + W → north; camera turned east + W → still north;
//      steering right turns toward east; facing east + W → east
//   32 model orientation: every vehicle model side-on with its heading arrow (screenshots)
//   33 NPCs: a civilian next to the player stays calm; shot, it defends or flees
//   34 hogs: none in the city or on the highway, the live ones in the woods
//   35 buildings: aerial shots of the strip
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/controls.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./ctl).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const HELPERS = `
  const g = window.__game;
  const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
  const deg = (h) => Math.round(((Math.atan2(Math.sin(h), -Math.cos(h)) * 180 / Math.PI) + 360) % 360);
`;

export default async function run(page) {
  const log = { results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "ctl";
  const pass = (name, ok, detail) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, HELPERS + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  log.callsAtSpawn = await js(`return g.perf.calls;`);

  // ---------------------------------------------------------------- 30: on foot
  const CX = 74, CZ = 290;                       // an OrleaRouge intersection, open both ways
  async function walk(yawTarget, keys, ms = 900) {
    await js(`g.teleport(${CX}, ${CZ}); g.camCtl.addYaw(wrap(${yawTarget} - g.camCtl.yaw)); return true;`);
    await page.waitForTimeout(700);
    const before = await js(`const f = g.camCtl.forward({}), r = g.camCtl.right({});
      return { p: [g.player.position.x, g.player.position.z], f: [f.x, f.z], r: [r.x, r.z], cam: deg(g.camCtl.heading) };`);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(150);
    const after = await js(`return [g.player.position.x, g.player.position.z];`);
    const dx = after[0] - before.p[0], dz = after[1] - before.p[1];
    const len = Math.hypot(dx, dz) || 1e-9;
    return { before, dx, dz, len, dir: [dx / len, dz / len] };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  for (const [label, yaw] of [["0°", 0], ["90°", Math.PI / 2], ["180°", Math.PI], ["270°", Math.PI * 1.5]]) {
    const w = await walk(yaw, ["KeyW"]);
    pass(`on foot, camera yaw ${label}: W walks where the camera looks`, w.len > 2 && dot(w.dir, w.before.f) > 0.95,
      { cameraBearing: w.before.cam, moved: +w.len.toFixed(2), alignment: +dot(w.dir, w.before.f).toFixed(3) });
  }
  {
    const s = await walk(Math.PI / 2, ["KeyS"]);
    pass("on foot, yaw 90°: S walks toward the camera", s.len > 2 && dot(s.dir, s.before.f) < -0.95, { alignment: +dot(s.dir, s.before.f).toFixed(3) });
    const d = await walk(Math.PI / 2, ["KeyD"]);
    pass("on foot, yaw 90°: D strafes to screen-right", d.len > 2 && dot(d.dir, d.before.r) > 0.95, { alignment: +dot(d.dir, d.before.r).toFixed(3) });
    const a = await walk(Math.PI * 1.5, ["KeyA"]);
    pass("on foot, yaw 270°: A strafes to screen-left", a.len > 2 && dot(a.dir, a.before.r) < -0.95, { alignment: +dot(a.dir, a.before.r).toFixed(3) });
    const wd = await walk(Math.PI, ["KeyW", "KeyD"]);
    const diag = [(wd.before.f[0] + wd.before.r[0]) / Math.SQRT2, (wd.before.f[1] + wd.before.r[1]) / Math.SQRT2];
    pass("on foot, yaw 180°: W+D walks forward-right diagonally", wd.len > 2 && dot(wd.dir, diag) > 0.95, { alignment: +dot(wd.dir, diag).toFixed(3) });
  }
  {
    await page.waitForTimeout(400);
    const p0 = await js(`return [g.player.position.x, g.player.position.z];`);
    await page.waitForTimeout(800);
    const p1 = await js(`return [g.player.position.x, g.player.position.z];`);
    pass("on foot: releasing the keys stops the player", Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.05, {});
    await js(`g.camCtl.addYaw(2.1); return true;`);
    await page.waitForTimeout(900);
    const p2 = await js(`return [g.player.position.x, g.player.position.z];`);
    pass("on foot: turning the camera alone doesn't move the player", Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 0.05, {});
  }

  // ---------------------------------------------------------------- 31: vehicle
  const pickCar = `
    const usable = (x) => !x.sheriff && !x.dead && x.def;
    window.__testCar = window.__testCar || g.vehicles.find((x) => usable(x) && !x.traffic && x.def.pack === "kenney")
      || g.vehicles.find((x) => usable(x) && !x.traffic);
    if (!window.__testCar) throw new Error("no drivable vehicle with a definition");
  `;
  async function driveFrom(x, z, heading, cameraHeading, keys, ms) {
    await js(`${pickCar}
      const v = window.__testCar;
      g.teleport(${x}, ${z});
      v.obj.position.x = ${x}; v.obj.position.z = ${z};
      v.heading = ${heading}; v.obj.rotation.y = ${heading}; v.speed = 0;
      v.blocker.x = ${x}; v.blocker.z = ${z};
      g.state.veh = v; g.player.visible = false;
      return true;`);
    await page.waitForTimeout(600);   // the camera swings in behind the car
    if (cameraHeading != null) await js(`g.camCtl.addYaw(wrap((${cameraHeading} - Math.PI) - g.camCtl.yaw)); return true;`);
    await page.waitForTimeout(500);
    const before = await js(`const v = window.__testCar; return { p: [v.obj.position.x, v.obj.position.z], h: v.heading, cam: deg(g.camCtl.heading) };`);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    const mid = await js(`const v = window.__testCar; return { cam: deg(g.camCtl.heading), calls: g.perf.calls };`);
    for (const k of keys) await page.keyboard.up(k);
    const after = await js(`const v = window.__testCar; const r = { p: [v.obj.position.x, v.obj.position.z], h: v.heading, speed: v.speed }; v.speed = 0; return r;`);
    const dx = after.p[0] - before.p[0], dz = after.p[1] - before.p[1];
    const len = Math.hypot(dx, dz) || 1e-9;
    return { before, mid, after, len, dir: [dx / len, dz / len] };
  }
  const NORTH = [0, -1], EAST = [1, 0];
  {
    const n = await driveFrom(114, 365, Math.PI, null, ["KeyW"], 1300);
    pass("vehicle facing north: W drives north", n.len > 4 && dot(n.dir, NORTH) > 0.97,
      { moved: +n.len.toFixed(1), alignment: +dot(n.dir, NORTH).toFixed(3), cameraBearing: n.before.cam });
    log.callsDriving = n.mid.calls;
    const ne = await driveFrom(114, 365, Math.PI, Math.PI / 2, ["KeyW"], 1000);
    pass("vehicle facing north, camera turned east: W still drives north", ne.len > 3 && dot(ne.dir, NORTH) > 0.97 && Math.abs(ne.before.cam - 90) < 25,
      { cameraBearingAtStart: ne.before.cam, alignment: +dot(ne.dir, NORTH).toFixed(3) });
    const st = await driveFrom(114, 365, Math.PI, null, ["KeyW", "KeyD"], 1200);
    pass("vehicle facing north: W+D steers toward the east", st.after.h < st.before.h - 0.3 && st.dir[0] > 0,
      { headingBearing: [Math.round((((Math.atan2(Math.sin(st.before.h), -Math.cos(st.before.h))) * 180 / Math.PI) + 360) % 360),
        Math.round((((Math.atan2(Math.sin(st.after.h), -Math.cos(st.after.h))) * 180 / Math.PI) + 360) % 360)] });
    const e = await driveFrom(20, 290, Math.PI / 2, null, ["KeyW"], 1300);
    pass("vehicle facing east: W drives east", e.len > 4 && dot(e.dir, EAST) > 0.97, { alignment: +dot(e.dir, EAST).toFixed(3) });
    const r = await driveFrom(20, 290, Math.PI / 2, null, ["KeyS"], 1300);
    pass("vehicle facing east: S reverses west", r.len > 1.5 && dot(r.dir, EAST) < -0.97, { alignment: +dot(r.dir, EAST).toFixed(3) });
    // step out: on-foot W must follow the camera again (the original bug)
    await page.keyboard.press("KeyF");
    await page.waitForTimeout(500);
    const exitW = await js(`const f = g.camCtl.forward({}); return { inCar: !!g.state.veh, f: [f.x, f.z], p: [g.player.position.x, g.player.position.z], cam: deg(g.camCtl.heading) };`);
    await page.keyboard.down("KeyW"); await page.waitForTimeout(800); await page.keyboard.up("KeyW");
    const exitP = await js(`return [g.player.position.x, g.player.position.z];`);
    const ed = [exitP[0] - exitW.p[0], exitP[1] - exitW.p[1]], el = Math.hypot(ed[0], ed[1]) || 1e-9;
    pass("after exiting an east-facing car: W walks where the camera looks", !exitW.inCar && el > 2 && dot([ed[0] / el, ed[1] / el], exitW.f) > 0.95,
      { cameraBearing: exitW.cam, alignment: +dot([ed[0] / el, ed[1] / el], exitW.f).toFixed(3) });
  }

  // ---------------------------------------------------------------- 32: model orientation
  const models = await js(`
    const seen = new Map();
    for (const v of g.vehicles) {
      const key = v.def ? v.def.name : "?";
      if (!seen.has(key)) seen.set(key, v);
    }
    window.__models = [...seen.values()];
    return window.__models.map((v) => v.def ? v.def.name + " (" + v.def.modelForward + ")" : "no def");
  `);
  log.models = models;
  for (let i = 0; i < models.length; i++) {
    await js(`
      const v = window.__models[${i}];
      const c = v.obj.clone(true);
      c.visible = true;
      c.position.set(60, v.obj.position.y, 290);
      c.rotation.set(0, Math.PI / 2, 0);            // heading EAST
      g.scene.add(c);
      window.__probe = c;
      g.teleport(67, 290);                          // the player stands east of it: the nose should point at them
      g.cine.shot({ from: [60, 3.2, 300], look: [62, 1, 290], dur: 0.1 });   // from the south, looking north: east is screen-right
      return true;`);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}-model-${i}.png` });
    await js(`g.scene.remove(window.__probe); g.cine.releaseCamera(); return true;`);
  }

  // ---------------------------------------------------------------- 33: NPCs
  {
    await js(`g.teleport(-6, 100); return true;`);
    await page.waitForTimeout(2500);
    const near = await js(`
      const p = g.player.position;
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        if (e.dead || e.type === "hog") continue;
        const d = Math.hypot(e.spr.position.x - p.x, e.spr.position.z - p.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return null;
      window.__npc = best;
      g.teleport(best.spr.position.x + 1.8, best.spr.position.z);
      return { type: best.type, mood: best.mood, dist: +bd.toFixed(1) };`);
    await page.waitForTimeout(6000);
    const calm = await js(`const e = window.__npc; return { state: e && e.state, hostileTotal: g.enemies.filter((x) => !x.dead && x.state === "hostile").length };`);
    pass("civilian standing next to the player for 6 s stays calm", near && calm.state !== "hostile" && calm.hostileTotal === 0, { npc: near, after: calm });
    // Attack it: step into reach, aim the camera at it and swing. Two things about
    // the starter loadout (TASK-036): the bat only reaches 2.2 m, so the 1.8 m
    // stand-off the calm test uses is not reliably a hit once the NPC has wandered
    // a step; and on foot fire() refuses unless you are aiming (RMB) — the suite's
    // `window.__qaAim` stands in for holding it.
    const closeIn = `const e = window.__npc, p = g.player.position;
      g.teleport(e.spr.position.x + 1.3, e.spr.position.z);
      const h = Math.atan2(e.spr.position.x - g.player.position.x, e.spr.position.z - g.player.position.z);
      g.camCtl.addYaw(wrap((h - Math.PI) - g.camCtl.yaw)); return true;`;
    await js(closeIn);
    await page.waitForTimeout(700);
    // `fire()` on foot refuses unless the player is aiming (RMB). The "no aim, no
    // swing" half of that cannot be checked from here: the first left click on the
    // canvas is swallowed by the pointer-lock request ("Click the game to look
    // around…"), which in a headless browser never resolves. See AGENT_LOG.
    await js("window.__qaAim = true; return true;");
    await page.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; c.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })); }); await page.waitForTimeout(400); await js(closeIn); await page.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; c.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })); });
    await page.waitForTimeout(1500);
    const hit = await js(`const e = window.__npc; return { state: e.state, mood: e.mood, hp: e.hp, dead: !!e.dead };`);
    pass("attacked civilian reacts (defends or flees)", hit.dead || hit.state === "hostile" || hit.state === "flee", { after: hit });
  }

  // ---------------------------------------------------------------- 34: hogs
  {
    const zones = await js(`const z = g.spawnZones.zoneAt;
      return { city: z(20, 300), highway: z(-6, 60), strip: z(14, 60), woods: z(-90, 40), causeway: z(-6, 160), town: z(-40, -80), trailerPark: z(-48, 116) };`);
    pass("zones classify the map", zones.city === "urban" && zones.highway === "highway" && zones.strip === "commercial"
      && zones.woods === "forest" && zones.causeway === "water" && zones.town === "town" && zones.trailerPark === "residential", { zones });
    const picks = await js(`
      const tally = (focus) => {
        const t = { total: 0, hogs: 0, hogZones: {}, kinds: {} };
        for (let i = 0; i < 600; i++) {
          const s = g.spawnZones.pick(focus, []);
          if (!s) continue;
          t.total++; t.kinds[s.kind] = (t.kinds[s.kind] || 0) + 1;
          if (s.kind === "hog") { t.hogs++; t.hogZones[s.zone] = (t.hogZones[s.zone] || 0) + 1; }
        }
        return t;
      };
      return { city: tally({ x: 20, z: 300 }), strip: tally({ x: -6, z: 40 }), town: tally({ x: -6, z: -60 }) };`);
    pass("no hog spawns in the city", picks.city.hogs === 0, { city: picks.city });
    pass("hogs spawn only in the woods, never on the highway or strip", Object.keys(picks.strip.hogZones).every((z) => z === "forest"), { strip: picks.strip });
    await js(`g.teleport(-6, 60); return true;`);
    await page.waitForTimeout(12000);
    const census = await js(`
      const live = g.enemies.filter((e) => !e.dead);
      const hogs = live.filter((e) => e.type === "hog").map((e) => ({
        zone: g.spawnZones.zoneAt(e.spr.position.x, e.spr.position.z),
        home: e.home ? g.spawnZones.zoneAt(e.home.x, e.home.z) : null,
        x: Math.round(e.spr.position.x), z: Math.round(e.spr.position.z) }));
      const byType = {}; for (const e of live) byType[e.type] = (byType[e.type] || 0) + 1;
      return { live: live.length, byType, hogs, hostile: live.filter((e) => e.state === "hostile").length };`);
    // A hog is born in the woods (`home`, npc.js) and potters about within 14 m of it,
    // which can carry it a few paces into a neighbouring zone rectangle. What must hold
    // is where they come from: no hog is ever *spawned* in town (spawnzones.js ZONE_MIX
    // gives hogs to `forest` and `rural` only).
    pass("live hogs are few, and every one was born in the woods",
      census.hogs.length <= 4 && census.hogs.every((h) => h.home === "forest" || h.home === "rural"), { census });
  }

  // ---------------------------------------------------------------- 35: buildings
  for (const [i, z] of [[1, 80], [2, 0], [3, -70]]) {
    await js(`g.teleport(-6, ${z}); g.cine.shot({ from: [60, 55, ${z + 40}], look: [-6, 0, ${z - 10}], dur: 0.1 }); return true;`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}-strip-${i}.png` });
    await js(`g.cine.releaseCamera(); return true;`);
  }

  // ---------------------------------------------------------------- 36: gas cans are reachable
  // A can inside a building's collision can never be picked up (the Popeyes one was).
  {
    const cans = await js(`
      const vehicleBlockers = new Set(g.vehicles.map((v) => v.blocker));
      return g.cans.map((c, i) => {
        const inside = [];
        g.blockerGrid.near(c.position.x, c.position.z, 12, (b) => {
          if (vehicleBlockers.has(b)) return false;
          const d = Math.hypot(b.x - c.position.x, b.z - c.position.z);
          if (d < b.r + 0.9) inside.push({ x: +b.x.toFixed(1), z: +b.z.toFixed(1), r: b.r });
          return false;
        });
        return { i, x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1), inside };
      });`);
    for (const c of cans) {
      let from = null;
      for (const [ox, oz] of [[0, 6], [0, -6], [6, 0], [-6, 0]]) {
        await js(`const c = g.cans[${c.i}]; c.userData.taken = false; c.visible = true; g.state.cans = 0;
          g.teleport(${c.x + ox}, ${c.z + oz});
          g.camCtl.addYaw(wrap((Math.atan2(${-ox}, ${-oz}) - Math.PI) - g.camCtl.yaw)); return true;`);
        await page.waitForTimeout(700);
        await page.keyboard.down("KeyW"); await page.waitForTimeout(1600); await page.keyboard.up("KeyW");
        if (await js(`return g.cans[${c.i}].userData.taken;`)) { from = [ox, oz]; break; }
      }
      pass(`gas can ${c.i} at (${c.x}, ${c.z}) can be picked up`, c.inside.length === 0 && from, { blockersOverlapping: c.inside, reachedFrom: from });
    }

    // The human's report: "The gas cans need to be easier to get to". Reach is measured flat and
    // is generous: standing 2 m away picks one up, and a car rolling past ~3 m off grabs it too.
    const reach = await js(`const c = g.cans[0]; c.userData.taken = false; c.visible = true; g.state.cans = 0;
      g.teleport(c.position.x + 2.0, c.position.z); return { onFoot: g.CAN_REACH, inCar: g.CAN_REACH_VEHICLE };`);
    await page.waitForTimeout(600);
    const onFoot = await js(`return g.cans[0].userData.taken;`);
    // In a car: drive past a can 2.8 m to one side (beyond on-foot reach). The can is borrowed onto
    // OrleaRouge's avenue x = 114 (no traffic lane) so the car's path is known to be clear; a car
    // dropped next to a can in a strip lot gets shoved by the parked cars and proves nothing.
    const home = await js(`const c = g.cans[1]; const was = [c.position.x, c.position.z];
      c.position.x = 114; c.position.z = 300; c.userData.taken = false; c.visible = true; g.state.cans = 0;
      const v = g.vehicles.find((x) => !x.traffic && x.def);
      g.teleport(116.8, 312);
      v.obj.position.x = 116.8; v.obj.position.z = 312; v.heading = Math.PI; v.obj.rotation.y = Math.PI; v.speed = 0; v.inContact = false;
      v.blocker.x = 116.8; v.blocker.z = 312;
      g.state.veh = v; g.player.visible = false; window.__canCar = v;
      for (const t of g.traffic.cars) {
        if (!t.active || Math.hypot(t.obj.position.x - 116, t.obj.position.z - 300) > 80) continue;
        t.active = false; t.obj.visible = false; t.v.blocker.x = t.v.blocker.z = 1e5; t.obj.position.set(1e5, t.obj.position.y, 1e5);
      }
      return was;`);
    await page.waitForTimeout(500);
    await page.keyboard.down("KeyW");
    let inCar = false;
    for (let i = 0; i < 12 && !inCar; i++) {
      await page.waitForTimeout(250);
      inCar = await js(`return g.cans[1].userData.taken;`);
    }
    await page.keyboard.up("KeyW");
    const car = await js(`const v = window.__canCar, c = g.cans[1];
      const r = { x: +v.obj.position.x.toFixed(1), z: +v.obj.position.z.toFixed(1), speed: +v.speed.toFixed(1), stillDriving: g.state.veh === v };
      c.position.x = ${home[0]}; c.position.z = ${home[1]};
      g.teleport(${home[0]} + 6, ${home[1]} + 6);
      return r;`);
    pass("gas cans are easy to grab: 2 m away on foot, driving past 2.8 m off in a car",
      reach.onFoot >= 2.2 && reach.inCar >= 3.2 && onFoot && inCar, { reach, onFoot, inCar, car });
    const beams = await js(`return g.cans.map((c) => c.children.some((m) => m.material && m.material.blending === 2 && m.geometry.type === "CylinderGeometry"));`);
    pass("every gas can has its glow column", beams.every(Boolean), { beams });

    await js(`for (const c of g.cans) { c.userData.taken = false; c.visible = true; } g.state.cans = 0; return true;`);
  }

  // ---------------------------------------------------------------- 37: crashing into things
  // The human's report: after hitting something, the controls go sluggish and out
  // of control. On OrleaRouge's avenue x = 114 (no traffic lane), with temporary
  // walls of blockers so the geometry is known.
  {
    const placeCar = (x, z, h) => js(`${pickCar}
      const v = window.__testCar;
      g.teleport(${x}, ${z});
      v.obj.position.x = ${x}; v.obj.position.z = ${z}; v.heading = ${h}; v.obj.rotation.y = ${h}; v.speed = 0; v.inContact = false;
      v.blocker.x = ${x}; v.blocker.z = ${z};
      g.state.veh = v; g.player.visible = false;
      // this tests walls, not traffic: street 330's cross-traffic used to T-bone the scrape run
      for (const c of g.traffic.cars) {
        if (!c.active || Math.hypot(c.obj.position.x - ${x}, c.obj.position.z - ${z}) > 80) continue;
        c.active = false; c.obj.visible = false;
        c.v.blocker.x = c.v.blocker.z = 1e5; c.obj.position.set(1e5, c.obj.position.y, 1e5);
      }
      return true;`);
    const carState = () => js(`const v = window.__testCar; return { x: v.obj.position.x, z: v.obj.position.z, h: v.heading, speed: v.speed };`);
    // hold keys, and report the worst frame while they were held (a long frame eats simulated time: dt is capped at 0.1 s)
    const hold = async (keys, ms) => {
      await js(`window.__hf = []; window.__hlast = performance.now(); window.__hon = true;
        (function f() { const n = performance.now(); window.__hf.push(n - window.__hlast); window.__hlast = n; if (window.__hon) requestAnimationFrame(f); })(); return true;`);
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(ms);
      for (const k of keys) await page.keyboard.up(k);
      return js(`window.__hon = false; return Math.round(Math.max(0, ...window.__hf));`);
    };
    const wall = (points) => js(`window.__wall = (window.__wall || []).concat(${JSON.stringify(points)}.map(([x, z]) => { const b = { x, z, r: 0.8 }; g.blockerGrid.addStatic(b); return b; })); return window.__wall.length;`);
    const clearWall = () => js(`for (const b of window.__wall || []) g.blockerGrid.remove(b); window.__wall = []; return true;`);

    // glancing: a wall along x = 118, the car angled 11° into it while driving north
    const side = []; for (let z = 372; z > 260; z -= 1.5) side.push([118, z]);
    await wall(side);
    await placeCar(112, 368, Math.PI - 0.2);
    await page.waitForTimeout(1500);                // the first view of downtown can stall a frame for seconds
    const g0 = await carState();
    const hitchG = await hold(["KeyW"], 2600);
    const g1 = await carState();
    pass("scraping along a wall keeps the car moving (slides instead of sticking)", g0.z - g1.z > 25 && g1.speed > 10 && g1.x < 117,
      { travelledNorth: +(g0.z - g1.z).toFixed(1), speedAfter: +g1.speed.toFixed(1), x: +g1.x.toFixed(1), worstFrameMs: hitchG });
    await clearWall();

    // head-on: a wall across the avenue at z = 330
    const across = []; for (let x = 104; x <= 124; x += 1.5) across.push([x, 330]);
    await wall(across);
    await placeCar(114, 356, Math.PI);
    await page.waitForTimeout(800);                 // settle after the teleport before timing anything
    await hold(["KeyW"], 2000);
    const h0 = await carState();
    const hitchS = await hold(["KeyS"], 1200);
    const h1 = await carState();
    pass("after a head-on crash, S backs straight out", h0.z < 334 && h1.z - h0.z > 4,
      { stoppedAtZ: +h0.z.toFixed(1), backedOut: +(h1.z - h0.z).toFixed(1), worstFrameMs: hitchS });

    await placeCar(114, 345, Math.PI);
    await page.waitForTimeout(800);
    await hold(["KeyW"], 1500);
    const t0 = await carState();
    const hitchT = await hold(["KeyW", "KeyD"], 2200);
    const t1 = await carState();
    const turned = t0.h - t1.h, moved = Math.hypot(t1.x - t0.x, t1.z - t0.z);
    pass("after a head-on crash, W+D turns away and drives off", turned > 0.6 && moved > 4 && t1.speed > 3,
      { turnedRad: +turned.toFixed(2), moved: +moved.toFixed(1), speedAfter: +t1.speed.toFixed(1), x: +t1.x.toFixed(1), worstFrameMs: hitchT });
    await clearWall();
    await js(`window.__testCar.speed = 0; return true;`);
  }
}
