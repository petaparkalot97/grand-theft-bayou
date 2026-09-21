// Headless check of newton.js — the ghost of Huey P. Newton in the Willowbrook
// schoolyard. Verifies he keeps dawn hours, that the Free Breakfast heals and
// charges nothing, that it is once a morning, and that copwatch drains a wanted
// level while he is watching but not while a crime is still in progress.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/newton.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./new).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const n = g.newton;
  const el = document.getElementById("breakfastPrompt");
  const p = g.player.position;
  return {
    hour: +g.worldTime.hours.toFixed(2), day: g.worldTime.day,
    presence: +n.debug.presence.toFixed(3), visible: !!(n.debug.ghost && n.debug.ghost.visible),
    present: n.present,
    prompt: el && !el.hidden ? el.textContent.trim() : null,
    hp: Math.round(g.state.hp), cash: g.state.cash,
    heat: +g.state.heat.toFixed(2), wanted: g.state.wanted,
    player: [+p.x.toFixed(1), +p.z.toFixed(1)],
    simRunning: g.state.running,
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "new";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForTimeout(2500);

  log.where = await inPage(page, `
    const g = window.__game;
    return { table: g.newton.debug.table, yardR: g.newton.debug.yardR };
  `);

  // stand at his table, but at noon: he should not be there
  await inPage(page, `
    const g = window.__game;
    g.worldTime.setTime(12);
    const t = g.newton.debug.table;
    g.teleport(t.x, t.z - 2);
    g.state.hp = 50;
    return true;
  `);
  await page.waitForTimeout(3000);
  log.noon = await inPage(page, SNAP);

  // dawn: he fades in and the prompt offers a free breakfast
  await inPage(page, `window.__game.worldTime.setTime(6); return true;`);
  await page.waitForTimeout(5000);
  log.dawn = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-1-dawn.png" });

  // the breakfast itself — and it must not take any money
  log.beforeEating = await inPage(page, `const g = window.__game;
    g.state.cash = 140; g.state.hp = 50; return { cash: g.state.cash, hp: g.state.hp };`);
  await page.waitForTimeout(1200);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(2500);
  log.afterEating = await inPage(page, SNAP);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  // and only once a morning
  await page.waitForTimeout(1500);
  log.secondHelping = await inPage(page, SNAP);

  // ---- copwatch ----
  // stars on, standing in the yard, crime finished: the heat should drain
  log.heatSet = await inPage(page, `
    const g = window.__game;
    g.state.forceCops = true;              // free roam only turns cops out on live heat
    g.state.heat = 5.6; g.state.crimeCd = 0;
    const t = g.newton.debug.table;
    g.teleport(t.x + 3, t.z + 3);
    g.state.hp = 100;
    return { heat: +g.state.heat.toFixed(2), wanted: g.state.wanted };
  `);
  await page.waitForTimeout(1500);
  const drain = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200);
    await inPage(page, `const g = window.__game; g.state.hp = 100; return true;`);
    drain.push(await inPage(page, `const g = window.__game;
      return { heat: +g.state.heat.toFixed(2), wanted: g.state.wanted }; `));
  }
  log.inYard = drain;

  // same stars, well outside the yard: should fall far more slowly
  await inPage(page, `
    const g = window.__game;
    g.state.heat = 5.6; g.state.crimeCd = 0;
    const t = g.newton.debug.table;
    g.teleport(t.x + 70, t.z + 70);
    return true;
  `);
  await page.waitForTimeout(1500);
  const away = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1200);
    await inPage(page, `const g = window.__game; g.state.hp = 100; return true;`);
    away.push(await inPage(page, `const g = window.__game;
      return { heat: +g.state.heat.toFixed(2), wanted: g.state.wanted }; `));
  }
  log.outsideYard = away;

  // he must not launder a crime that is still happening
  await inPage(page, `
    const g = window.__game;
    const t = g.newton.debug.table;
    g.teleport(t.x + 3, t.z + 3);
    g.state.heat = 5.6; g.state.crimeCd = 6;   // still at it
    return true;
  `);
  await page.waitForTimeout(1500);
  const hot = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1200);
    await inPage(page, `const g = window.__game; g.state.hp = 100; g.state.crimeCd = 6; return true;`);
    hot.push(await inPage(page, `const g = window.__game;
      return { heat: +g.state.heat.toFixed(2), crimeCd: +g.state.crimeCd.toFixed(1) }; `));
  }
  log.midCrime = hot;
  await page.screenshot({ path: out + "-2-copwatch.png" });

  return log;
}
