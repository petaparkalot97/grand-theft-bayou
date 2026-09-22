// Headless test of the east bank (eastbank.js, laid out by composer.js):
//   - the map grows east (MAP.maxX reaches past EAST_MAX_X); you can walk and drive out there
//   - the district was composed in order: road → buildings → side streets → open areas → vegetation → landmark,
//     and every stage placed something
//   - nothing overlaps: no building footprint crosses a road corridor
//   - spawn zones: road → highway, walls → building (no spawns), streets → town, pines → forest, bayou → water
//   - culling: the district's clusters hide from the strip and show when you're there
//   - frame time in the district against the strip; screenshots from above and at street level
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/eastbank.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./eb).
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

async function frameTimes(page, ms) {
  const t = await page.evaluate((dur) => new Promise((res) => {
    const out = []; let last = performance.now(); const end = last + dur;
    const f = (n) => { out.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(out); };
    requestAnimationFrame(f);
  }), ms);
  const avg = t.reduce((s, v) => s + v, 0) / t.length;
  return { frames: t.length, avgMs: +avg.toFixed(1), worstMs: +Math.max(...t).toFixed(1) };
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "eb";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game;\n` + body);
  const shot = async (file, from, look, wait = 1600) => {
    // asked twice: right after a release, the first request can be swallowed by the camera handing back
    const ask = `g.cine.shot({ from: ${JSON.stringify(from)}, look: ${JSON.stringify(look)}, dur: 0.1 }); return true;`;
    await js(ask);
    await page.waitForTimeout(250);
    await js(ask);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}-${file}.png` });
    await js(`g.cine.releaseCamera(); return true;`);
    await page.waitForTimeout(700);          // let the release finish, or the next shot can be swallowed by it
  };

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // ---- composition
  const rep = await js(`const e = g.eastBank; if (!e) return null;
    return { report: e.report(), maxX: g.MAP.maxX, minimap: { roads: e.minimap.roads.length, buildings: e.minimap.buildings.length, areas: e.minimap.areas.length, water: e.minimap.water.length } };`);
  // The state-wide expansion pushed MAP.maxX past Lafourchette (1200 today), so the
  // check is that the map still reaches the district's east edge, not an exact number.
  pass("the map reaches east past Lafourchette (MAP.maxX >= 380)", rep && rep.maxX >= 380, { maxX: rep && rep.maxX });
  const STAGES = ["road", "buildings", "sideStreets", "openAreas", "vegetation", "landmark"];
  const st = rep ? rep.report.stages : [];
  const order = st.map((s) => STAGES.indexOf(s.stage));
  pass("composed in order road → buildings → side streets → open areas → vegetation → landmark, every stage placed something",
    STAGES.every((s) => st.some((e) => e.stage === s && e.items > 0)) && order.every((v, i) => i === 0 || v >= order[i - 1]) && !st.some((e) => e.conflicts),
    { stages: st });
  const itemsOf = (s) => st.filter((e) => e.stage === s).reduce((n, e) => n + e.items, 0);
  pass("a real district: ≥ 10 storefronts, ≥ 20 houses, 4 open areas + water, ≥ 500 pines, a landmark",
    itemsOf("buildings") >= 10 && itemsOf("sideStreets") >= 24 && itemsOf("openAreas") >= 5 && rep.report.trees >= 500 && rep.report.focal,
    { buildings: itemsOf("buildings"), sideStreetItems: itemsOf("sideStreets"), open: itemsOf("openAreas"), trees: rep && rep.report.trees, focal: rep && rep.report.focal, rejected: rep && rep.report.rejected, clusters: rep && rep.report.clusters });

  // ---- no building crosses a road
  const overlap = await js(`const m = g.eastBank.minimap, hits = [];
    for (const r of m.roads) {
      const half = r.width / 2;
      for (let i = 0; i < r.points.length - 1; i++) {
        const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
        const c = ax === bx ? { x0: ax - half, x1: ax + half, z0: Math.min(az, bz), z1: Math.max(az, bz) }
                            : { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: az - half, z1: az + half };
        for (const b of m.buildings) {
          if (b.x0 < c.x1 - 0.05 && b.x1 > c.x0 + 0.05 && b.z0 < c.z1 - 0.05 && b.z1 > c.z0 + 0.05) hits.push({ road: r.points, b });
        }
      }
    }
    return { buildings: m.buildings.length, hits: hits.slice(0, 5), count: hits.length };`);
  pass("no building footprint crosses a road", overlap.count === 0, overlap);

  // ---- spawn zones through the real spawnzones.js chain
  const zones = await js(`const Z = (x, z) => g.spawnZones.zoneAt(x, z), b = g.eastBank.minimap.buildings[0];
    return { road: Z(240, -106), wall: Z((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), town: Z(268, 18), forest: Z(330, 300), water: Z(300, 164), strip: g.eastBank.zoneAt(-6, 60) };`);
  pass("spawn zones: road → highway, walls → building, ball field → town, pines → forest, bayou → water; nothing claimed west of the district",
    zones.road === "highway" && zones.wall === "building" && zones.town === "town" && zones.forest === "forest" && zones.water === "water" && zones.strip === null, zones);

  // ---- culling
  await js(`g.teleport(-6, 120); return true;`);
  await page.waitForTimeout(1200);
  const fromStrip = await js(`return g.eastBank.drawn;`);
  const stripPerf = await frameTimes(page, 3000);
  await js(`g.teleport(236, -96); g.camCtl.addYaw(Math.PI - g.camCtl.yaw); return true;`);
  await page.waitForTimeout(2500);
  const inTown = await js(`return g.eastBank.drawn;`);
  const townPerf = await frameTimes(page, 3000);
  const shown = (s) => +s.split(" / ")[0];
  pass("distance culling: fewer clusters drawn from the strip than in Lafourchette", shown(fromStrip) < shown(inTown), { fromStrip, inTown });
  pass("frame time in Lafourchette stays within 1.5× the strip's (and no frame over 400 ms)",
    townPerf.avgMs <= stripPerf.avgMs * 1.5 + 2 && townPerf.worstMs < 400, { stripPerf, townPerf });
  await page.screenshot({ path: `${out}-6-street-level.png` });

  // ---- walk to the far east, drive down Lafourche Road
  await js(`g.teleport(370, 250); return true;`);
  await page.waitForTimeout(1000);
  const walked = await js(`return { x: +g.player.position.x.toFixed(1), z: +g.player.position.z.toFixed(1) };`);
  pass("on foot, the far east (x 370) is inside the map", walked.x > 365, walked);

  const drive = await js(`const v = g.vehicles.find((c) => !c.traffic && c.def);
    if (!v) return null;
    g.teleport(134, -104);
    v.obj.position.set(134, v.obj.position.y, -104); v.heading = Math.PI / 2; v.obj.rotation.y = Math.PI / 2; v.speed = 0; v.inContact = false;
    v.blocker.x = 134; v.blocker.z = -104; g.state.veh = v; g.player.visible = false; window.__ebCar = v;
    return { name: v.def.name };`);
  await page.waitForTimeout(800);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3500);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(400);
  const drove = await js(`const v = window.__ebCar; return { x: +v.obj.position.x.toFixed(1), z: +v.obj.position.z.toFixed(1), zone: g.spawnZones.zoneAt(v.obj.position.x, v.obj.position.z) };`);
  pass("driving east from South Tusouxroe carries on down Lafourche Road", drive && drove.x > 175 && Math.abs(drove.z + 106) < 7, { drive, drove });
  await page.screenshot({ path: `${out}-7-driving.png` });
  await js(`g.teleport(236, -96); return true;`);
  await page.waitForTimeout(600);

  // ---- how it reads
  await shot("1-lafourche-road", [152, 16, -121], [300, 2, -106]);      // north of the water tower, down the road to St. Jude
  await shot("2-st-jude", [330, 12, -90], [366, 9, -106]);
  await shot("3-pelican-street", [236, 18, -86], [236, 0, 30]);
  await shot("4-ball-field-market", [248, 60, -52], [290, 0, 0]);
  await shot("5-aerial", [250, 120, -160], [260, 0, -40], 2200);
}
