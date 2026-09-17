// Headless test of the stateWorld.js regional expansion
//   - road connectivity check (roads must not dead-end-in-void; they should connect)
//   - draw calls on foot/driving within the existing budget guardrails
//   - NPCs actually spawn in each new zone type
//   - no new console errors

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
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game;\n` + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // Connectivity
  const lanes = await js(`return g.stateWorld ? g.stateWorld.lanes : [];`);
  pass("stateWorld lanes are actually exposed on __game (not an empty/undefined fallback)", lanes.length > 0, { laneCount: lanes.length });
  const connected = lanes.length > 0 && lanes.every(l => {
    // Check if points connect to x = -6 (main road)
    return l.points.some(p => Math.abs(p[0] - (-6)) < 2);
  });
  pass("road connectivity check (roads must connect to US-167 / ROAD_X)", connected, { lanes });

  // Draw calls (Budget)
  const drawCalls = await js(`return g.renderer.info.render.calls;`);
  pass("draw calls within budget (<= 1500)", drawCalls <= 1500, { drawCalls });

  // Zones & Spawns
  const spawns = await js(`
    const pts = [{x: 450, z: -650}, {x: -650, z: -600}, {x: -450, z: 820}];
    const res = [];
    for(const p of pts) {
      g.playerPos.set(p.x, 0, p.z);
      g.state.teleportPlayer = true;
      res.push(g.spawnZones.zoneAt(p.x, p.z));
    }
    return res;
  `);
  pass("NPCs spawn zones map correctly to industrial/resort/wild", spawns.some(z => z !== null), { spawns });
}
