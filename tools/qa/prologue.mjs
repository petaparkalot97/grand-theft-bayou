// Headless walkthrough of the Prologue / Mission 1 "Hog Wild":
// cold open -> phone call -> chase -> stampede -> hogs -> ledger -> free roam.
// Uses prologue.debug() to skip the driving, and Enter / Esc like a player.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/prologue.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./pro).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const pro = g.prologue;
  const herd = g.enemies.filter((e) => e.herd && !e.dead).length;
  const sub = document.querySelector("#cineSub");
  return {
    phase: pro && pro.phase, cinematic: g.state.cinematic, letterbox: document.body.classList.contains("letterbox"),
    subtitle: sub.classList.contains("on") ? sub.textContent.trim().slice(0, 80) : null,
    objective: document.getElementById("objective").textContent,
    inCar: !!g.state.veh, hp: Math.round(g.state.hp), over: g.state.over, herd,
    bravado: pro && pro.vehicles[1] ? { visible: pro.vehicles[1].obj.visible,
      pos: pro.vehicles[1].obj.position.toArray().map((n) => +n.toFixed(1)), locked: !!pro.vehicles[1].locked } : null,
    camera: g.camera.position.toArray().map((n) => +n.toFixed(1)),
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "pro";
  const log = {};
  const key = async (k, n = 1, gap = 120) => {
    for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(gap); }
  };
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("startBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  log.menu = await page.evaluate(() => [...document.querySelectorAll("#overlay button")].map((b) => b.textContent));

  await page.click("#startBtn");

  // the title buttons open the character select: confirm the default pick (Keseme Nadia)

  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });

  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForTimeout(3000);
  log.coldOpen = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-1-coldopen.png" });

  // Enter through the radio lines, then watch the aerial shot
  await key("Enter", 14, 250);
  await page.waitForTimeout(4000);
  log.aerial = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-2-aerial.png" });

  await key("Escape");                          // skip the rest of the cold open
  await page.waitForTimeout(2500);
  log.drive = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-3-phone.png" });

  await key("Escape");                          // skip the phone call
  await page.waitForTimeout(3000);
  log.chase = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-4-chase.png" });

  await inPage(page, `return window.__game.prologue.debug("stampede");`);
  await page.waitForTimeout(3500);
  log.stampede = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-5-stampede.png" });

  await key("Escape");
  await page.waitForTimeout(2500);
  log.hogs = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-6-hogs.png" });

  // the herd is penned at the crash site (npc.js e.leash): a hog dragged 50 m out is pulled
  // back to the edge, and a gunfire stampede never carries any of them past it.
  // The simulation only runs outside cutscenes and the pause menu, and the Esc above can
  // land after the stampede scene ended and open the pause menu: settle both first.
  let cinematicWaitMs = 0;
  while (cinematicWaitMs < 15000 && (await inPage(page, `return !!window.__game.state.cinematic;`))) {
    await page.waitForTimeout(250); cinematicWaitMs += 250;
  }
  const pausedBefore = await inPage(page, `return !!window.__game.state.paused;`);
  if (pausedBefore) { await key("Escape"); await page.waitForTimeout(400); }
  const simRunning = await inPage(page, `const s = window.__game.state; return !s.cinematic && !s.paused && s.running && !s.over;`);
  log.pen = await inPage(page, `
    const g = window.__game, C = { x: 86, z: 26 };
    // debug("stampede") skips the drive, leaving the player ~135 m off: walk up like a player would
    g.teleport(76, 40);
    const herd = g.enemies.filter((e) => e.herd && !e.dead);
    window.__pen = { herd, dragged: herd[0] || null, max: 0 };
    const penned = herd.filter((e) => e.leash && e.leash.x === C.x && e.leash.z === C.z).length;
    if (herd[0]) herd[0].spr.position.set(C.x + 50, 0, C.z);
    return { alive: herd.length, penned, r: herd[0] && herd[0].leash ? herd[0].leash.r : null,
      playerToCrash: +Math.hypot(g.player.position.x - C.x, g.player.position.z - C.z).toFixed(1) };`);
  await page.waitForTimeout(1000);
  const penDist = `const P = window.__pen, d = (e) => Math.hypot(e.spr.position.x - 86, e.spr.position.z - 26);`;
  log.pen.draggedBackTo = await inPage(page, penDist + `return P.dragged ? +d(P.dragged).toFixed(2) : null;`);
  await inPage(page, penDist + `window.__game.npcs.noise(86, 26, 40);
    P.timer = setInterval(() => { for (const e of P.herd) if (!e.dead) P.max = Math.max(P.max, d(e)); }, 50);
    return true;`);
  await page.waitForTimeout(4000);
  Object.assign(log.pen, await inPage(page, penDist + `clearInterval(P.timer);
    return { maxDuringStampede: +P.max.toFixed(2), aliveAfter: P.herd.filter((e) => !e.dead).length };`));
  Object.assign(log.pen, { pausedBefore, cinematicWaitMs, simRunning });
  const edge = (log.pen.r || 0) + 0.5;
  log.pen.ok = log.pen.alive > 0 && log.pen.penned === log.pen.alive &&
    log.pen.draggedBackTo != null && log.pen.draggedBackTo <= edge && log.pen.maxDuringStampede <= edge;

  await inPage(page, `return window.__game.prologue.debug("clear");`);
  await page.waitForTimeout(2500);
  log.retrieve = await inPage(page, SNAP);
  await key("Escape");                          // Bubba's bark
  await page.waitForTimeout(800);
  await inPage(page, `return window.__game.prologue.debug("board");`);
  await page.waitForTimeout(9000);
  log.ledger = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-7-ledger.png" });

  await key("Escape");
  await page.waitForTimeout(3000);
  log.done = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-8-freeroam.png" });
  return log;
}
