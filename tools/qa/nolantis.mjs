// Headless walkthrough of ACT ONE part B: NIRBAYOU NOLANTIS (src/nolantis.js).
// Starts the chapter straight from free roam (normally Blue Light Special's
// flood tunnel hands over), then: the descent, the reveal, the arrival terminal
// with Dr. Amara Veaux, the four-stop tour (walked by teleporting to each
// stop), "The Truth" in the archive, and the elevator back to OrleaRouge.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/nolantis.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./nol).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const log = { steps: [], results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "nol";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game, N = g.nolantis;\n` + body);
  const check = (expr) => js(`return !!(${expr});`);
  const sub = `(document.querySelector("#cineSub.on") ? document.querySelector("#cineSub").textContent : "")`;
  async function pressUntil(key, expr, label, { every = 700, timeout = 90000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if ((await check(expr)) === true) { log.steps.push(`${label}: ok in ${Date.now() - t0} ms`); return true; }
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(every);
    }
    log.steps.push(`${label}: TIMED OUT`);
    log.stuck = await js(`return { phase: N.phase, stop: N.stop, cinematic: g.state.cinematic, sub: ${sub}, player: [g.player.position.x, g.player.position.z] };`);
    return false;
  }
  const snap = () => js(`return { phase: N.phase, stop: N.stop, inside: N.inside, cinematic: g.state.cinematic,
    radarHidden: document.getElementById("minimap").hidden, calls: g.perf.calls,
    objective: document.getElementById("objective").textContent,
    player: [+g.player.position.x.toFixed(1), +g.player.position.z.toFixed(1)] };`);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  // the title buttons open the character select: confirm the default pick (Keseme Nadia)
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  // ---- the descent
  await js(`N.start(); return true;`);
  if (!(await pressUntil(null, `N.phase === "descent" && g.state.cinematic`, "descent starts", { every: 300 }))) return;
  await pressUntil("Enter", `/submerged ruins/.test(${sub})`, "past submerged ruins", { every: 900, timeout: 40000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}-1-ruins.png` });
  await pressUntil("Enter", `/waterways/.test(${sub})`, "waterways", { every: 900, timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}-2-waterway.png` });
  await pressUntil("Enter", `/shells and coral/.test(${sub})`, "the reveal", { every: 900, timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-3-reveal.png` });
  await pressUntil("Enter", `/We died/.test(${sub})`, "we died", { every: 900, timeout: 40000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}-4-we-died.png` });

  // ---- arrival
  await pressUntil("Enter", `/Keseme Nadia/.test(${sub})`, "Amara: Keseme Nadia.", { every: 900, timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}-5-amara.png` });
  if (!(await pressUntil("Escape", `N.phase === "tour" && !g.state.cinematic && !g.cine.active`, "arrival -> tour"))) return;
  // the welcome line flashes over the objective for 2.5 s, then the tour objective shows
  await page.waitForTimeout(3200);
  const tour = await snap();
  log.tour = tour;
  pass("the tour starts in the cavern, radar hidden", tour.phase === "tour" && tour.inside && tour.radarHidden && /1\/4/.test(tour.objective), tour);
  await page.screenshot({ path: `${out}-6-plaza.png` });

  // walking works down here, outside MAP
  const w0 = await js(`return [g.player.position.x, g.player.position.z, g.MAP.minX];`);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(1000); await page.keyboard.up("KeyW");
  const w1 = await js(`return [g.player.position.x, g.player.position.z];`);
  const walked = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]);
  pass("the player can walk in Nolantis (outside the surface map bounds)", walked > 3 && w1[0] < w0[2] - 100, { walked: +walked.toFixed(1), x: +w1[0].toFixed(1), mapMinX: w0[2] });

  // ---- the four stops
  for (let i = 0; i < 4; i++) {
    await js(`N.debug("stop"); return true;`);
    await pressUntil(null, `N.stop === ${i + 1}`, `stop ${i + 1}`, { every: 300, timeout: 20000 });
    await page.waitForTimeout(2500);
    if (i === 0 || i === 3) await page.screenshot({ path: `${out}-${i === 0 ? "7-housing" : "8-ledger"}.png` });
    await pressUntil("Enter", `!g.cine.active`, `stop ${i + 1} talk done`, { every: 800, timeout: 60000 });
  }
  const afterTour = await snap();
  pass("all four stops visited; next: the archive", afterTour.phase === "archive" && /archive/i.test(afterTour.objective), afterTour);

  // ---- the truth
  await js(`N.debug("archive"); return true;`);
  if (!(await pressUntil(null, `N.phase === "truth" && g.state.cinematic`, "into the archive", { every: 300, timeout: 20000 }))) return;
  await pressUntil("Enter", `/Pelican Crown Holdings appears/.test(${sub})`, "the map changes", { every: 900, timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-9-truth.png` });
  await pressUntil("Enter", `/asking why their government/.test(${sub})`, "Keseme's last line", { every: 900, timeout: 60000 });
  if (!(await pressUntil("Escape", `N.phase === "done" && !g.state.cinematic && !g.cine.active`, "truth -> done"))) return;
  const done = await snap();
  pass("after The Truth the objective points back to the elevator", done.phase === "done" && /elevator/i.test(done.objective), done);

  // ---- back to the surface
  await js(`N.debug("elevator"); return true;`);
  if (!(await pressUntil("Escape", `N.phase === "left" && !g.state.cinematic && !g.cine.active`, "elevator -> surface", { every: 600, timeout: 30000 }))) return;
  await page.waitForTimeout(1500);
  const up = await snap();
  pass("the elevator brings you back up to OrleaRouge; radar back", up.phase === "left" && !up.inside && !up.radarHidden
    && Math.hypot(up.player[0] - 120, up.player[1] - 372) < 6, up);
  await page.screenshot({ path: `${out}-10-surface.png` });
}
