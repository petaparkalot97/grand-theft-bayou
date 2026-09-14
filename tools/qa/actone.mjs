// Headless walkthrough of ACT ONE "Welcome Home" (Tusouxroe). Speeds through
// the prologue with its QA hooks, then: into Tusouxroe, the South Tusouxroe
// establishing scene, the front door, the kitchen with Emiko, and the ledger
// board. Screenshots at each beat; phases and objectives in the JSON log.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/actone.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./act1).
// Every step waits for the phase it expects (polling), rather than sleeping a
// fixed time: SwiftShader frame rates vary run to run, and cutscene lengths
// are in game time.
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
    prologue: g.prologue && g.prologue.phase, act1: g.actOne && g.actOne.phase,
    cinematic: g.state.cinematic, inCar: !!g.state.veh, hp: Math.round(g.state.hp),
    objective: document.getElementById("objective").textContent,
    subtitle: sub.classList.contains("on") ? sub.textContent.trim().slice(0, 90) : null,
    board: !!document.querySelector("#ledgerBoard.on"),
    player: g.player.position.toArray().map((n) => +n.toFixed(1)),
    camera: g.camera.position.toArray().map((n) => +n.toFixed(1)),
    calls: g.perf.calls,
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "act1";
  const log = { steps: [] };
  const check = (expr) => inPage(page, `const g = window.__game; return !!(${expr});`);
  const hook = (target, step) => inPage(page, `return window.__game.${target}.debug("${step}");`);

  /** Press `key` every `every` ms until `expr` is true (or time out). */
  async function pressUntil(key, expr, label, { every = 900, timeout = 90000 } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if ((await check(expr)) === true) { log.steps.push(`${label}: ok in ${Date.now() - t0} ms`); return true; }
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(every);
    }
    log.steps.push(`${label}: TIMED OUT`);
    return false;
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("startBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });

  // ---- speed-run the prologue ----
  await page.click("#startBtn");
  // the title buttons open the character select: confirm the default pick (Keseme Nadia)
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await pressUntil("Escape", `g.prologue.phase === "chase"`, "prologue -> chase");
  await hook("prologue", "stampede");
  await pressUntil("Escape", `g.prologue.phase === "hogs"`, "stampede -> hogs");
  await hook("prologue", "clear");
  await pressUntil(null, `g.prologue.phase === "retrieve"`, "hogs -> retrieve");
  await page.waitForTimeout(500);
  await hook("prologue", "board");
  await pressUntil("Escape", `g.prologue.phase === "done"`, "ledger -> done");
  log.afterPrologue = await inPage(page, SNAP);

  // ---- Act One ----
  if (!(await pressUntil("Escape", `g.actOne.phase === "toCity" && !g.state.cinematic && !g.cine.active`, "act one starts"))) {
    log.final = await inPage(page, SNAP);
    return log;
  }
  log.toCity = await inPage(page, SNAP);
  await hook("actOne", "arrive");
  await pressUntil(null, `g.actOne.phase === "arrive" && g.state.cinematic`, "establishing starts", { every: 300 });
  await page.waitForTimeout(5000);
  log.establishing = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-1-south-tusouxroe.png" });
  await pressUntil("Enter", `document.querySelector("#cineSub.on") && /crews/.test(document.querySelector("#cineSub").textContent)`, "crews shot", { every: 600, timeout: 40000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "-2-neighbourhood.png" });
  await pressUntil("Escape", `g.actOne.phase === "door" && !g.state.cinematic`, "establishing -> door");
  log.door = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-3-street.png" });

  await hook("actOne", "door");
  await pressUntil(null, `g.actOne.phase === "inside" && g.state.cinematic`, "into the house", { every: 300 });
  await page.waitForTimeout(5000);
  log.kitchen = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-4-kitchen.png" });
  await pressUntil("Enter", `document.querySelector("#ledgerBoard.on")`, "ledger board appears", { every: 500, timeout: 60000 });
  await pressUntil("Enter", `document.querySelectorAll("#ledgerBoard .card.on").length >= 12`, "board fills", { every: 500, timeout: 40000 });
  await page.waitForTimeout(2500);
  log.board = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-5-ledger-board.png" });
  await pressUntil("Escape", `g.actOne.phase === "done" && !g.state.cinematic`, "home scene -> done");
  await page.waitForTimeout(1500);
  log.done = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-6-after.png" });
  return log;
}
