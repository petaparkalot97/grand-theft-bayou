// Headless check of TASK-032: Tusouxroe's potholes (40 per street).
// Free roam; reads the per-street counts, looks at South Tusouxroe and Main
// Street on foot, then drives the northbound lane of US-167 through Tusouxroe
// and samples the car's jolt / pothole hits.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/potholes.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./pot).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "pot";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  for (let i = 0; i < 3; i++) { await page.keyboard.press("BracketRight"); await page.waitForTimeout(150); }
  await page.keyboard.press("BracketLeft");      // -> HIGH
  await page.waitForTimeout(2000);

  log.setup = await inPage(page, `
    const g = window.__game, p = g.potholes;
    if (!p) return { error: "no potholes" };
    const spacingOk = p.list.every((a, i) => p.list.every((b, j) => i === j || a.street !== b.street ||
      Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r));
    return { total: p.list.length, counts: p.counts, meshes: p.meshes.length,
      wet: p.list.filter((h) => h.wet).length, noOverlap: spacingOk };
  `);

  const onFoot = async (name, x, z) => {
    await inPage(page, `window.__game.teleport(${x}, ${z}); return true;`);
    await page.waitForTimeout(3500);
    log[name] = await inPage(page, `const g = window.__game; return { calls: g.perf.calls, hp: Math.round(g.state.hp) };`);
    await page.screenshot({ path: `${out}-${name}.png` });
  };
  await onFoot("1-south-tusouxroe", 70, -106);
  await onFoot("2-main-street", -40, -78);

  // a car in the northbound lane at the south edge of Tusouxroe, facing north
  log.board = await inPage(page, `
    const g = window.__game;
    let best = null, bd = 1e9;
    for (const v of g.vehicles) {
      if (v.sheriff || v.traffic || v.dead || v.locked) continue;
      const d = v.obj.position.distanceTo(g.player.position);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return { error: "no car" };
    best.obj.position.set(-3.6, best.obj.position.y, -30);
    best.heading = Math.PI; best.obj.rotation.set(0, Math.PI, 0); best.speed = 0;
    best.blocker.x = -3.6; best.blocker.z = -30;
    best.potholesHit = 0; best.jolt = 0;
    g.teleport(-3.6, -30);
    g.state.veh = best;
    g.player.visible = false;
    window.__potCar = best;
    return { ok: true };
  `);
  await page.waitForTimeout(800);
  // Record inside the page, every frame. A jolt decays in a fraction of a
  // second, so polling from outside the page misses most of them.
  await inPage(page, `
    window.__potRec = { maxJolt: 0, maxPitch: 0, hits: 0, startZ: window.__potCar.obj.position.z };
    (function loop() {
      const v = window.__potCar, r = window.__potRec;
      if (v) {
        r.maxJolt = Math.max(r.maxJolt, v.jolt || 0);
        r.maxPitch = Math.max(r.maxPitch, Math.abs(v.obj.rotation.x));
        r.hits = v.potholesHit || 0;
      }
      requestAnimationFrame(loop);
    })();
    return true;`);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: out + "-3-drive.png" });
  await page.waitForTimeout(2400);
  await page.keyboard.up("KeyW");
  log.drive = await inPage(page, `const v = window.__potCar, r = window.__potRec;
    return { maxJolt: +r.maxJolt.toFixed(2), maxBodyPitch: +r.maxPitch.toFixed(3), hits: r.hits,
      travelled: +Math.abs(v.obj.position.z - r.startZ).toFixed(1), endSpeed: +v.speed.toFixed(1) };`);
  log.perf = await inPage(page, `const g = window.__game; return { calls: g.perf.calls, sim: g.perf.simMs, render: g.perf.renderMs };`);
  delete log.lastSample;
  return log;
}
