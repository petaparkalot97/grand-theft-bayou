// Headless check of the south of the map: the bayou causeway and OrleaRouge.
// Free roam; drives a car down the causeway into the city (entry V.O.), then
// visits the French District, downtown and the riverfront on foot. Reports
// traffic on the city lanes, NPC mix and behaviour, and draw calls.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/orlearouge.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./orl).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const p = g.player.position;
  const npcs = g.enemies.filter((e) => !e.dead);
  const near = npcs.filter((e) => Math.hypot(e.spr.position.x - p.x, e.spr.position.z - p.z) < 110);
  const kinds = {}, states = {};
  for (const e of near) { kinds[e.type] = (kinds[e.type] || 0) + 1; states[e.state] = (states[e.state] || 0) + 1; }
  const cars = g.traffic ? g.traffic.cars.filter((c) => c.active) : [];
  const lanes = {};
  for (const c of cars) lanes[c.lane.name] = (lanes[c.lane.name] || 0) + 1;
  const sub = document.querySelector("#cineSub");
  return {
    player: p.toArray().map((n) => +n.toFixed(1)), inCar: !!g.state.veh, hp: Math.round(g.state.hp),
    entered: g.orlea && g.orlea.entered,
    subtitle: sub.classList.contains("on") ? sub.textContent.trim().slice(0, 70) : null,
    nearNpcs: near.length, kinds, states, hostile: g.npcs.hostileCount,
    trafficActive: cars.length, lanes, vehicles: g.vehicles.length,
    perf: { calls: g.perf.calls, tris: g.perf.tris, sim: g.perf.simMs, ai: g.perf.aiMs, render: g.perf.renderMs },
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "orl";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  for (let i = 0; i < 3; i++) { await page.keyboard.press("BracketRight"); await page.waitForTimeout(150); }
  await page.keyboard.press("BracketLeft");      // -> HIGH
  await page.waitForTimeout(2500);

  // a car on the causeway, pointed south
  log.board = await inPage(page, `
    const g = window.__game;
    let best = null, bd = 1e9;
    for (const v of g.vehicles) {
      if (v.sheriff || v.traffic || v.dead || v.locked) continue;
      const d = v.obj.position.distanceTo(g.player.position);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return { error: "no car" };
    // the southbound lane (x = ROAD_X - 2.4): driving south in the northbound
    // lane just jams against oncoming traffic, which stops for you
    best.obj.position.set(-8.4, best.obj.position.y, 146);
    best.heading = 0; best.obj.rotation.y = 0; best.speed = 0;
    best.blocker.x = -8.4; best.blocker.z = 146;
    g.teleport(-8.4, 146);
    g.state.veh = best;
    g.player.visible = false;
    return { ok: true };
  `);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "-1-causeway.png" });
  log.causeway = await inPage(page, SNAP);

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4500);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1500);
  log.cityDrive = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-2-entering-city.png" });
  await page.keyboard.press("Escape");           // skip the entry V.O. if it's still up
  await page.waitForTimeout(800);

  // on foot: the French District, downtown, the riverfront
  const visit = async (name, x, z, wait = 5000) => {
    await inPage(page, `window.__game.teleport(${x}, ${z}); return true;`);
    await page.waitForTimeout(wait);
    log[name] = await inPage(page, SNAP);
    await page.screenshot({ path: `${out}-${name}.png` });
  };
  await visit("3-french-district", -26, 256);
  await visit("4-downtown", 30, 296);
  await visit("5-riverfront", 40, 372);
  await visit("6-overpass-camp", -22, 178);

  // gunfire in the city: do bystanders scatter?
  await inPage(page, `window.__game.teleport(-26, 256); return true;`);
  await page.waitForTimeout(3000);
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(450); }
  await page.waitForTimeout(1500);
  log.afterShots = await inPage(page, SNAP);
  await page.waitForTimeout(6000);
  log.later = await inPage(page, SNAP);
  return log;
}
