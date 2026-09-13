// Headless gameplay regression pass (Playwright-style `page`):
// walk, mouse look, shoot, NPC reactions, drive, exit, traffic, and entity
// counts over time. Prints everything it observed as JSON.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/gameplay.mjs
//
// SHOT_PREFIX=path/prefix sets where the screenshots go (default: ./gp).
// Headless Chromium renders with SwiftShader, so fps is not meaningful here;
// draw calls, CPU timings, behaviour and console errors are.
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const states = {};
  for (const e of g.enemies) if (!e.dead) states[e.state] = (states[e.state] || 0) + 1;
  const t = g.traffic;
  const cars = t ? t.cars.filter((c) => c.active).map((c) => ({
    x: +c.obj.position.x.toFixed(1), z: +c.obj.position.z.toFixed(1), v: +c.speed.toFixed(1) })) : null;
  return {
    hp: Math.round(g.state.hp), over: g.state.over, running: g.state.running,
    player: g.player.position.toArray().map((n) => +n.toFixed(1)),
    inCar: !!g.state.veh, npcStates: states, hostile: g.npcs.hostileCount,
    npcs: g.enemies.length, vehicles: g.vehicles.length, trafficPool: t ? t.cars.length : null, cars,
    yaw: +g.camCtl.yaw.toFixed(3), locked: g.camCtl.locked,
    perf: { fps: g.perf.fps, calls: g.perf.calls, sim: g.perf.simMs, ai: g.perf.aiMs, render: g.perf.renderMs },
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "gp";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");                  // free roam: no story cutscenes
  for (let i = 0; i < 3; i++) { await page.keyboard.press("BracketRight"); await page.waitForTimeout(150); }
  await page.keyboard.press("BracketLeft");      // -> HIGH
  await page.waitForTimeout(5000);
  log.t5_idle = await inPage(page, SNAP);

  // walk forward
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyW");
  log.walked = await inPage(page, SNAP);

  // mouse: click to capture then move; then the right-drag fallback
  await page.mouse.click(640, 360);
  await page.waitForTimeout(300);
  await page.mouse.move(700, 360, { steps: 6 });
  await page.waitForTimeout(400);
  log.afterClickMove = await inPage(page, SNAP);
  await page.keyboard.press("Escape");
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(560, 380, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(400);
  log.afterRightDrag = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-foot.png" });

  // gunfire: bystanders should scatter rather than all charging in
  for (let i = 0; i < 5; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(450); }
  await page.waitForTimeout(1500);
  log.afterShots = await inPage(page, SNAP);

  // drive: put the nearest ordinary car on the road and get in
  log.enter = await inPage(page, `
    const g = window.__game;
    const p = g.player.position;
    let best = null, bd = 1e9;
    for (const v of g.vehicles) {
      if (v.sheriff || v.traffic || v.dead) continue;
      const d = v.obj.position.distanceTo(p);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return { error: "no car" };
    best.obj.position.set(-3.5, best.obj.position.y, p.z - 4);
    best.heading = Math.PI; best.obj.rotation.y = Math.PI;
    best.blocker.x = -3.5; best.blocker.z = p.z - 4;
    g.state.veh = best;
    return { ok: true, dist: +bd.toFixed(1) };
  `);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2500);
  log.driving = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-drive.png" });
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1200);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(600);
  log.exited = await inPage(page, SNAP);

  // let the world run: entity counts must stay bounded
  await page.waitForTimeout(8000);
  log.later = await inPage(page, SNAP);
  return log;
}
