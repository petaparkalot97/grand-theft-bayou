// Headless test of TASK-033 phase 8: Parish Highway 9 and the rural west.
//   - the carriageway is clear of static blockers end to end
//   - spawn zones: highway / rural / forest in the parish; the old map unchanged;
//     OrleaRouge's inCity no longer claims the parish south-west
//   - drivability: short drives at four points along the route follow the road
//   - traffic runs on the new lanes; Bayou Noir's NPCs are calm
//   - screenshots: junction, curves, rest stop, hamlet and fields, the city end
//   - draw calls on foot in the hamlet and driving on the highway
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/westparish.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./wp).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const log = { results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "wp";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game, W = g.westParish;\n` + body);
  const shot = async (name, from, look, wait = 1500) => {
    await js(`g.cine.shot({ from: ${JSON.stringify(from)}, look: ${JSON.stringify(look)}, dur: 0.1 }); return true;`);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}-${name}.png` });
    await js(`g.cine.releaseCamera(); return true;`);
  };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });

  const info = await js(`return { ok: !!W, length: Math.round(W.length), samples: W.samples.length, trees: W.trees, lanes: W.lanes.map((l) => l.name + " (" + l.points.length + ")"), pois: W.pois.length, MAP: g.MAP, rest: W.restStop };`);
  log.info = info;
  pass("the region is built", info.ok && info.samples > 100 && info.trees > 400, { length: info.length, trees: info.trees });

  // ---- the carriageway is clear of static blockers
  const corridor = await js(`
    const vehicleBlockers = new Set(g.vehicles.map((v) => v.blocker));
    let hits = 0; const where = [];
    for (const p of W.samples) {
      g.blockerGrid.near(p.x, p.z, 10, (b) => {
        if (vehicleBlockers.has(b)) return false;
        if (Math.hypot(b.x - p.x, b.z - p.z) < 5.5) { hits++; if (where.length < 6) where.push([Math.round(b.x), Math.round(b.z), +b.r.toFixed(1)]); }
        return false;
      });
    }
    return { hits, where };`);
  pass("no static blockers on the carriageway", corridor.hits === 0, corridor);

  // ---- zones
  const zones = await js(`const z = g.spawnZones.zoneAt, s = W.samples[Math.floor(W.samples.length / 2)];
    return { highwayMid: z(s.x, s.z), field: z(-367, -85), hamlet: z(-268, -20), westForest: z(-420, 300), southwest: z(-300, 300),
      city: z(20, 300), strip: z(14, 60), town: z(-40, -80), usHighway: z(-6, 60), inCitySW: g.orlea.inCity(-300, 300), inCityDowntown: g.orlea.inCity(20, 300) };`);
  pass("parish zones: highway, rural, forest", zones.highwayMid === "highway" && zones.field === "rural" && zones.hamlet === "rural" && zones.westForest === "forest" && zones.southwest === "forest", { zones });
  pass("old map zones unchanged", zones.city === "urban" && zones.strip === "commercial" && zones.town === "town" && zones.usHighway === "highway", {});
  pass("OrleaRouge.inCity excludes the parish", zones.inCitySW === false && zones.inCityDowntown === true, {});

  // ---- drivability: short drives along the route
  const drives = [];
  for (const frac of [0.1, 0.35, 0.6, 0.85]) {
    await js(`
      const i = Math.floor(W.samples.length * ${frac}), p = W.samples[i], q = W.samples[i + 1];
      const h = Math.atan2(q.x - p.x, q.z - p.z);
      const v = window.__car || (window.__car = g.vehicles.find((x) => !x.sheriff && !x.traffic && !x.dead && x.def));
      // the right-hand lane
      const rx = -(q.z - p.z), rz = q.x - p.x, rl = Math.hypot(rx, rz) || 1;
      const x = p.x + rx / rl * 3.5, z = p.z + rz / rl * 3.5;
      g.teleport(x, z);
      v.obj.position.x = x; v.obj.position.z = z; v.heading = h; v.obj.rotation.y = h; v.speed = 0; v.inContact = false;
      v.blocker.x = x; v.blocker.z = z;
      g.state.veh = v; g.player.visible = false;
      // This tests the road, not traffic: send away any traffic car within 60 m of the start
      // (the pool respawns them out of sight, past 60 m)
      for (const c of g.traffic.cars) {
        if (!c.active || Math.hypot(c.obj.position.x - x, c.obj.position.z - z) > 60) continue;
        c.active = false; c.obj.visible = false;
        c.v.blocker.x = c.v.blocker.z = 1e5; c.obj.position.set(1e5, c.obj.position.y, 1e5);
      }
      window.__start = { x, z, h };
      window.__touched = false;
      (function watch() { if (window.__start && window.__car.inContact) window.__touched = true; if (window.__start) requestAnimationFrame(watch); })();
      return true;`);
    // let the view settle first: teleporting to a new part of the map compiles
    // shaders and un-culls clusters, and a long frame there eats simulated time
    await page.waitForTimeout(2000);
    await js(`window.__frames = []; let last = performance.now();
      (function f() { const now = performance.now(); window.__frames.push(now - last); last = now; if (window.__frames.length < 400 && window.__start) requestAnimationFrame(f); })();
      return true;`);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    const mid = await js(`return g.perf.calls;`);
    await page.keyboard.up("KeyW");
    const r = await js(`const v = window.__car, s = window.__start;
      const dx = v.obj.position.x - s.x, dz = v.obj.position.z - s.z, len = Math.hypot(dx, dz) || 1e-9;
      const d = { moved: +len.toFixed(1), alignment: +((dx * Math.sin(s.h) + dz * Math.cos(s.h)) / len).toFixed(3),
        offRoad: +(Math.min(...W.samples.map((p) => Math.hypot(p.x - v.obj.position.x, p.z - v.obj.position.z)))).toFixed(1), speed: +v.speed.toFixed(1),
        touchedSomething: window.__touched,
        frames: window.__frames.length, worstFrameMs: Math.round(Math.max(0, ...window.__frames)) };
      window.__start = null;
      v.speed = 0; return d;`);
    drives.push({ frac, calls: mid, ...r });
  }
  log.drives = drives;
  pass("drives along the highway stay on the road and at speed", drives.every((d) => d.moved > 8 && d.alignment > 0.95 && d.offRoad < 7), {});
  log.callsDriving = drives.map((d) => d.calls);

  // ---- traffic on the new lanes
  await page.keyboard.press("KeyF");
  await js(`const s = W.samples[Math.floor(W.samples.length * 0.45)]; g.teleport(s.x + 20, s.z); return true;`);
  await page.waitForTimeout(9000);
  const traffic = await js(`const cars = g.traffic.cars.filter((c) => c.active);
    const hwy = cars.filter((c) => c.lane.name.startsWith("Hwy 9"));
    return { active: cars.length, onHighway: hwy.length, lanes: [...new Set(hwy.map((c) => c.lane.name))], speeds: hwy.map((c) => +c.speed.toFixed(1)) };`);
  pass("traffic runs on Parish Highway 9", traffic.onHighway >= 2, traffic);

  // ---- screenshots
  const S = await js(`const n = W.samples.length; const at = (f) => W.samples[Math.floor(n * f)]; return { a: at(0.02), c: at(0.45), e: at(0.93), rest: W.restStop };`);
  await shot("1-junction", [30, 42, 50], [-60, 0, 8]);
  await shot("2-curves", [S.c.x + 60, 70, S.c.z - 40], [S.c.x - 10, 0, S.c.z + 10]);
  await shot("3-rest-stop", [S.rest.x + 30, 22, S.rest.z + 34], [S.rest.x, 2, S.rest.z]);
  await shot("4-bayou-noir", [-210, 38, 30], [-280, 0, -40]);
  await shot("5-cane-fields", [-300, 26, -10], [-360, 0, -80]);
  await shot("6-city-end", [S.e.x - 30, 16, S.e.z - 30], [S.e.x + 40, 2, S.e.z]);
  await shot("7-road-level", [S.c.x + 2, 2.2, S.c.z - 1], [S.c.x - 30, 1.5, S.c.z + 30]);

  // ---- Bayou Noir: people, calm; draw calls on foot
  await js(`g.teleport(-262, -30); return true;`);
  await page.waitForTimeout(10000);
  const hamlet = await js(`const live = g.enemies.filter((e) => !e.dead);
    const near = live.filter((e) => Math.hypot(e.spr.position.x + 262, e.spr.position.z + 30) < 110);
    const kinds = {}; for (const e of near) kinds[e.type] = (kinds[e.type] || 0) + 1;
    const hogZones = near.filter((e) => e.type === "hog").map((e) => g.spawnZones.zoneAt(e.spr.position.x, e.spr.position.z));
    return { near: near.length, kinds, hostile: near.filter((e) => e.state === "hostile").length, hogZones, calls: g.perf.calls, hp: Math.round(g.state.hp) };`);
  pass("Bayou Noir has calm locals", hamlet.near > 0 && hamlet.hostile === 0 && hamlet.hogZones.every((z) => z === "rural" || z === "forest"), hamlet);
  await page.screenshot({ path: `${out}-8-on-foot.png` });
}
