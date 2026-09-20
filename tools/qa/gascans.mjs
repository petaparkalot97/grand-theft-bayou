// The gas-can objective, end to end (the escape plan the script sets up).
//
// The prologue hands the player "Scrounge 4 gas cans and get the truck out past
// Tusouxroe"; Act One repeats it between story beats. This checks the objective
// can actually be completed: the cans exist, they count, the HUD tracks them, the
// waypoint moves to the truck on the fourth, and reaching the truck ends the run.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/gascans.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./gascans).
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
  const out = process.env.SHOT_PREFIX || "gascans";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, "const g = window.__game;\n" + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");                  // free roam drops straight into Keseme (no character select)
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  log.steps.push("free roam running");

  // `flashObjective` holds #objective for 2.5 s (objTimer in main.js), so the standing
  // objective is only readable once the last flash — including the pointer-lock hint —
  // has expired. Every read below waits it out.
  const settled = () => page.waitForTimeout(2800);

  // ---- the escape plan is on the HUD from the start
  await settled();
  const start = await js(`return {
    cans: g.cans.length, taken: g.cans.filter((c) => c.userData.taken).length,
    hud: document.getElementById("cans").textContent.replace(/\\s+/g, " ").trim(),
    objective: document.getElementById("objective").textContent,
    truck: !!g.truck };`);
  pass("four cans to find, a truck to reach, and the HUD says so",
    start.cans >= 4 && start.taken === 0 && /gas cans/i.test(start.objective) && start.truck, { start });

  // ---- walking over one picks it up and the count moves
  const picked = await js(`
    const c = g.cans.find((x) => !x.userData.taken);
    g.state.cans = 0; g.teleport(c.position.x, c.position.z);
    return { at: [+c.position.x.toFixed(1), +c.position.z.toFixed(1)] };`);
  await page.waitForTimeout(900);
  const afterOne = await js(`return { cans: g.state.cans,
    hud: document.getElementById("cans").textContent.replace(/\\s+/g, " ").trim(),
    objective: document.getElementById("objective").textContent };`);
  pass("walking over a can picks it up and the HUD counts it",
    afterOne.cans === 1 && /1/.test(afterOne.hud), { picked, afterOne });

  // ---- the objective tracks the count while the plan is unfinished
  const partway = await js(`return g.state.cans >= 4 ? null : document.getElementById("objective").textContent;`);
  pass("the objective still names the plan while cans are missing",
    partway === null || /gas cans|can/i.test(partway), { partway });

  // ---- collect the rest: the waypoint should move to the truck
  await js(`
    for (const c of g.cans) { if (!c.userData.taken) { c.userData.taken = true; c.visible = false; } }
    g.state.cans = 4;
    return true;`);
  await settled();
  const full = await js(`return { cans: g.state.cans,
    hud: document.getElementById("cans").textContent.replace(/\\s+/g, " ").trim(),
    objective: document.getElementById("objective").textContent };`);
  pass("with four cans the objective points at the truck",
    full.cans === 4 && /truck/i.test(full.objective), { full });

  // ---- reaching the truck with a full tank ends the run
  const ending = await js(`
    const t = g.truck.position;
    g.teleport(t.x + 1.5, t.z + 1.5);
    return { truck: [+t.x.toFixed(1), +t.z.toFixed(1)] };`);
  await page.waitForTimeout(1200);
  const won = await js(`return { over: !!g.state.over, running: !!g.state.running,
    overlay: (document.querySelector("#overlay h1.end") || {}).textContent || null };`);
  pass("driving the truck out with four cans wins the run", won.over === true, { ending, won });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-1-ending.png` });
}
