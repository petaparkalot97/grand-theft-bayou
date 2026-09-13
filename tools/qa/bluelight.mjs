// Headless walkthrough of ACT ONE, continued: "BLUE LIGHT SPECIAL" (OrleaRouge).
// Starts the chapter straight from free roam, then: the Solange meeting, the
// raid (police wash, sensory overload), the checkpoint escape with forced
// police, a WASTED that must respawn instead of ending the game, and the flood
// tunnel door. Screenshots at each beat; phases and objectives in the JSON log.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/bluelight.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./bl).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const sub = document.querySelector("#cineSub");
  return {
    phase: g.blueLight && g.blueLight.phase, cp: g.blueLight && g.blueLight.checkpoint,
    cinematic: g.state.cinematic, over: !!g.state.over, hp: Math.round(g.state.hp),
    wanted: g.state.wanted, forceCops: !!g.state.forceCops,
    cruisers: g.vehicles.filter((v) => v.sheriff && !v.dead).length,
    wash: !!document.querySelector("#policeWash.on"),
    filter: g.renderer.domElement.style.filter || null,
    objective: document.getElementById("objective").textContent,
    subtitle: sub.classList.contains("on") ? sub.textContent.trim().slice(0, 90) : null,
    player: g.player.position.toArray().map((n) => +n.toFixed(1)),
    camera: g.camera.position.toArray().map((n) => +n.toFixed(1)),
    calls: g.perf.calls,
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "bl";
  const log = { steps: [] };
  const check = (expr) => inPage(page, `const g = window.__game; return !!(${expr});`);
  const hook = (step) => inPage(page, `return window.__game.blueLight.debug("${step}");`);

  async function pressUntil(key, expr, label, { every = 900, timeout = 90000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if ((await check(expr)) === true) { log.steps.push(`${label}: ok in ${Date.now() - t0} ms`); return true; }
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(every);
    }
    log.steps.push(`${label}: TIMED OUT`);
    log.stuck = await inPage(page, SNAP);
    return false;
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await pressUntil(null, `g.state.running`, "free roam running", { every: 300 });

  // ---- the chapter starts (normally from the end of "Welcome Home") ----
  await inPage(page, `window.__game.blueLight.start(); return true;`);
  log.start = await inPage(page, SNAP);
  await hook("meet");
  if (!(await pressUntil(null, `g.blueLight.phase === "meet" && g.state.cinematic`, "meeting starts", { every: 300 }))) return log;
  await page.waitForTimeout(4000);
  log.meet = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-1-solange.png" });

  await pressUntil("Enter", `document.querySelector("#policeWash.on")`, "the raid", { every: 600, timeout: 60000 });
  await page.waitForTimeout(1200);
  log.raid = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-2-raid.png" });
  await pressUntil("Enter", `/blur/.test(g.renderer.domElement.style.filter)`, "sensory overload", { every: 600, timeout: 40000 });
  await page.waitForTimeout(900);
  log.overload = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-3-overload.png" });
  if (!(await pressUntil("Escape", `g.blueLight.phase === "run" && !g.state.cinematic && !g.cine.active`, "meeting -> run"))) return log;
  await page.waitForTimeout(3500);
  log.run = await inPage(page, SNAP);

  // ---- WASTED during the mission respawns at the last checkpoint ----
  await inPage(page, `window.__game.state.hp = 0; return true;`);
  await page.waitForTimeout(1200);
  log.afterWasted = await inPage(page, SNAP);
  log.steps.push(`wasted respawn: ${!log.afterWasted.over && log.afterWasted.hp === 100 ? "ok" : "FAILED"}`);

  // ---- the checkpoints ----
  // a scripted shot frames each set piece (the follow camera faces wherever the teleport left it)
  const shots = {
    1: ["-4-wedding.png", { from: [-50, 4.2, 270.5], look: [-67, 1.6, 270] }],
    3: ["-5-parade.png", { from: [-36, 4.5, 328], look: [-58, 1.2, 331.5] }],
  };
  for (let i = 0; i < 5; i++) {
    await hook("next");
    await pressUntil(null, `g.blueLight.checkpoint === ${i + 1}`, `checkpoint ${i + 1}`, { every: 300, timeout: 20000 });
    if (shots[i]) {
      const [file, s] = shots[i];
      // a queued checkpoint caption starting a scene would take the camera back
      await pressUntil(null, `!g.cine.active`, `captions clear before shot ${i + 1}`, { every: 300, timeout: 20000 });
      await inPage(page, `window.__game.cine.shot({ from: ${JSON.stringify(s.from)}, look: ${JSON.stringify(s.look)}, dur: 0.1 }); return true;`);
      await page.waitForTimeout(2200);
      await page.screenshot({ path: out + file });
      await inPage(page, `window.__game.cine.releaseCamera(); return true;`);
    }
  }
  log.lastCheckpoint = await inPage(page, SNAP);

  // ---- the storm drain and the flood tunnel ----
  await hook("next");
  if (!(await pressUntil(null, `g.blueLight.phase === "tunnel" && g.state.cinematic`, "into the drain", { every: 300 }))) return log;
  await page.waitForTimeout(5000);
  log.tunnel = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-6-tunnel.png" });
  await pressUntil("Enter", `document.querySelector("#cineSub.on") && /colossal/.test(document.querySelector("#cineSub").textContent)`, "the door opens", { every: 600, timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "-7-door.png" });
  await pressUntil("Escape", `g.blueLight.phase === "done" && !g.state.cinematic && !g.cine.active`, "tunnel -> done");
  await page.waitForTimeout(1500);
  log.done = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-8-after.png" });
  return log;
}
