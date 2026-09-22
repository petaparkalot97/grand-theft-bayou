// Headless test of car-jacking (src/hijack.js).
//   - F at a stopped traffic car: the jack runs (approach → pull → enter), the
//     driver is pulled out and reacts, the player ends up driving, the car is
//     no longer traffic, the seat says "player"
//   - the jacked car drives
//   - leaving it empties the seat; F again gets straight back in (no one to pull out)
//   - a parked, empty car is entered straight away
//   - a car going too fast can't be jacked
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/hijack.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./hj).
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
  const out = process.env.SHOT_PREFIX || "hj";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game;\n` + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // ---- find a traffic car on US-167 and make it stop: stand in its lane ahead of it
  let setup = null;
  for (let i = 0; i < 40 && !setup; i++) {
    setup = await js(`
      const t = g.traffic.cars.find((c) => c.active && (c.lane.name === "northbound" || c.lane.name === "southbound")
        && c.obj.position.z > -20 && c.obj.position.z < 120);
      if (!t) return null;
      window.__t = t; window.__v = t.v;
      const h = t.v.heading;
      g.teleport(t.obj.position.x + Math.sin(h) * 12, t.obj.position.z + Math.cos(h) * 12);
      return { lane: t.lane.name, occupant: t.v.seats && t.v.seats[0].occupant };`);
    if (!setup) await page.waitForTimeout(1000);
  }
  if (!setup) { pass("found a traffic car to jack", false); return; }
  pass("traffic cars have an NPC driver", setup.occupant === "npc", setup);
  await page.waitForTimeout(3500);   // it brakes for the player standing in the lane

  const before = await js(`const v = window.__v;
    // step to within reach of the driver's door (left side)
    const h = v.heading, rx = -Math.cos(h), rz = Math.sin(h);
    g.teleport(v.obj.position.x - rx * 3, v.obj.position.z - rz * 3);
    return { speed: +v.speed.toFixed(2), car: [v.obj.position.x, v.obj.position.z], enemies: g.enemies.filter((e) => !e.dead).length };`);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(120);
  const started = await js(`return { active: g.hijacker.active, phase: g.hijacker.phase, inCar: !!g.state.veh,
    stillTraffic: g.traffic.cars.some((c) => c.v === window.__v) };`);
  pass("F at an occupied, stopped car starts a jack (not an instant teleport in)", started.active && !started.inCar && !started.stillTraffic, { before, started });
  await page.waitForTimeout(380);
  await page.screenshot({ path: `${out}-1-pull.png` });
  await page.waitForTimeout(1200);

  const after = await js(`const v = window.__v;
    const live = g.enemies.filter((e) => !e.dead);
    const e = g.hijacker.lastDriver;
    const driver = e && { type: e.type, inEnemies: g.enemies.includes(e), dead: !!e.dead, state: e.state, mood: e.mood,
      d: +Math.hypot(e.spr.position.x - v.obj.position.x, e.spr.position.z - v.obj.position.z).toFixed(1) };
    return { active: g.hijacker.active, inCar: g.state.veh === v, occupant: v.seats[0].occupant,
      carMoved: +Math.hypot(v.obj.position.x - ${before.car[0]}, v.obj.position.z - ${before.car[1]}).toFixed(2),
      enemies: live.length, driver, objective: document.getElementById("objective").textContent };`);
  pass("the jack finishes with the player driving and the seat marked", !after.active && after.inCar && after.occupant === "player", after);
  pass("the car didn't move during the jack", after.carMoved < 0.5, { carMoved: after.carMoved });
  // the driver is out of the car and reacting: a timid one is already running (it was 11.7 m away in one run), a brave one is in your face
  // a brave one comes straight back at you (one run: hostile, 2.4 m from the car), so only a fleeing driver has to be clear
  pass("the driver was pulled out and reacts (flees or fights)",
    after.driver && after.driver.inEnemies && !after.driver.dead && after.driver.d < 30
      && ((after.driver.state === "flee" && after.driver.d > 2.5) || after.driver.state === "hostile"),
    { driver: after.driver });
  await page.screenshot({ path: `${out}-2-driving-off.png` });

  // ---- it drives
  const d0 = await js(`const v = window.__v; return [v.obj.position.x, v.obj.position.z];`);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1200); await page.keyboard.up("KeyW");
  const d1 = await js(`const v = window.__v; const r = [v.obj.position.x, v.obj.position.z]; v.speed = 0; return r;`);
  const moved = Math.hypot(d1[0] - d0[0], d1[1] - d0[1]);
  pass("the jacked car drives", moved > 4, { moved: +moved.toFixed(1) });

  // ---- out, and straight back in (no driver left to pull out)
  await page.waitForTimeout(600);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(400);
  const outOf = await js(`return { inCar: !!g.state.veh, occupant: window.__v.seats[0].occupant };`);
  pass("getting out empties the driver's seat", !outOf.inCar && outOf.occupant === null, outOf);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(150);
  const backIn = await js(`return { inCar: g.state.veh === window.__v, hijacking: g.hijacker.active };`);
  pass("an empty car is entered straight away", backIn.inCar && !backIn.hijacking, backIn);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(400);

  // ---- a car going too fast can't be jacked
  const fast = await js(`
    const t = g.traffic.cars.find((c) => c.active && c.speed > 10);
    if (!t) return null;
    // fake the driver's seat/speed check precisely: stand at its door and try
    const v = t.v, h = v.heading, rx = -Math.cos(h), rz = Math.sin(h);
    g.teleport(v.obj.position.x - rx * 2.6, v.obj.position.z - rz * 2.6);
    const ok = g.hijacker.start(v);
    return { speed: +v.speed.toFixed(1), started: ok, active: g.hijacker.active, objective: document.getElementById("objective").textContent };`);
  pass("a car going too fast can't be jacked", fast && !fast.started && !fast.active && /Too fast/.test(fast.objective), fast || { note: "no fast traffic car found" });
}
