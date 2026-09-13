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
