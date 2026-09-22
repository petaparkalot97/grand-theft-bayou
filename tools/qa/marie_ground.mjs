// Headless check of the second half of Marie Laveau (cemetery.js
// `keepsHerGround`): sanctuary from a wanted level on her ground, breaking a
// klan mob that walks in, and naming it when Keseme or a bystander is harmed.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/marie_ground.mjs
//
// She only does any of it at night and only inside the walls, so every case
// below is paired with a control outside them.
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const OBJ = `const el = document.getElementById("objective");
  return el ? el.textContent.trim().slice(0, 100) : null;`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "mg";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForTimeout(2500);

  // night, inside the walls, and let her fade in
  await inPage(page, `
    const g = window.__game;
    g.worldTime.setTime(23);
    const d = g.orlea.cemetery.debug;
    g.teleport(d.gate.x, d.gate.z + 6);
    return true;
  `);
  await page.waitForTimeout(6000);
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Enter"); await page.waitForTimeout(350); }
  log.present = await inPage(page, `const g = window.__game;
    const d = g.orlea.cemetery.debug;
    return { presence: +d.presence.toFixed(2), inside: d.inside(g.player.position.x, g.player.position.z) };`);

  // ---- sanctuary: a wanted level on her ground is broken ----
  log.sanctuarySet = await inPage(page, `
    const g = window.__game;
    g.state.forceCops = true;
    g.state.heat = 5.6; g.state.crimeCd = 0; g.state.wanted = 4;
    return { heat: +g.state.heat.toFixed(2), wanted: g.state.wanted };
  `);
  await page.waitForTimeout(1800);
  log.sanctuary = await inPage(page, `
    const g = window.__game;
    return { heat: +g.state.heat.toFixed(2), wanted: g.state.wanted,
             line: document.getElementById("objective").textContent.trim().slice(0, 100) };
  `);

  // control: same stars, standing on the street outside the gate
  await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    g.teleport(d.gate.x, d.gate.z - 8);
    g.state.heat = 5.6; g.state.crimeCd = 0;
    return true;
  `);
  await page.waitForTimeout(2500);
  log.outsideWalls = await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    return { heat: +g.state.heat.toFixed(2),
             inside: d.inside(g.player.position.x, g.player.position.z) };
  `);

  // control: she will not stand over a crime still in progress
  await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    g.teleport(d.gate.x, d.gate.z + 6);
    g.state.heat = 5.6; g.state.crimeCd = 6;
    return true;
  `);
  await page.waitForTimeout(2500);
  log.midCrime = await inPage(page, `const g = window.__game;
    return { heat: +g.state.heat.toFixed(2), crimeCd: +g.state.crimeCd.toFixed(1) };`);

  // ---- the mob: klansmen who walk onto her ground get broken ----
  await inPage(page, `const g = window.__game; g.state.crimeCd = 0; g.state.heat = 0; return true;`);
  log.klanSet = await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    // unprovoked, so the only thing acting on them is her
    const mob = g.klan.callOut(d.gate.x, d.gate.z + 8, 4, { radius: 3, provoke: false });
    return { placed: mob.length,
             inside: mob.filter((e) => d.inside(e.spr.position.x, e.spr.position.z)).length,
             states: mob.map((e) => e.state) };
  `);
  const trace = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(800);
    await inPage(page, `const g = window.__game; g.state.hp = 100; return true;`);
    trace.push(await inPage(page, `
      const g = window.__game;
      const robes = g.enemies.filter((e) => e.type === "klansman" && !e.dead);
      return { fleeing: robes.filter((e) => e.state === "flee").length, alive: robes.length,
               line: document.getElementById("objective").textContent.trim().slice(0, 100) };
    `));
  }
  log.klanBroken = {
    everFleeing: Math.max(...trace.map((t) => t.fleeing)),
    lines: [...new Set(trace.map((t) => t.line))].filter((l) => l.includes("MARIE")),
    trace,
  };
  await page.screenshot({ path: out + "-1-mob-broken.png" });

  // ---- the harmed: Keseme hurt on her ground gets named ----
  // clear the mob first, or her line about them sits on the HUD over this one
  await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    for (const e of g.enemies) if (e.type === "klansman" && !e.dead) g.killEnemy(e, { turf: true });
    g.teleport(d.gate.x, d.gate.z + 6);
    g.state.hp = 100;
    return true;
  `);
  await page.waitForTimeout(13000);          // let every cooldown of hers expire
  await page.waitForTimeout(1500);
  const hurtTrace = [];
  await inPage(page, `const g = window.__game; g.state.hp = 62; return true;`);
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    hurtTrace.push(await inPage(page, `
      const g = window.__game;
      const d = g.orlea.cemetery.debug;
      return { hp: Math.round(g.state.hp),
               inside: d.inside(g.player.position.x, g.player.position.z),
               veh: !!g.state.veh, cinematic: g.state.cinematic,
               presence: +d.presence.toFixed(2),
               obj: document.getElementById("objective").textContent.trim().slice(0, 60) };
    `));
  }
  log.kesemeHurt = {
    sawLine: hurtTrace.some((x) => x.obj.includes("hands on you") || x.obj.includes("Bleed later")),
    trace: hurtTrace,
  };

  // ---- a bystander killed on her ground gets mourned ----
  await page.waitForTimeout(13000);
  log.bystanderSet = await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    const e = g.spawnEnemy("hoodrat", d.gate.x + 1, d.gate.z + 7);
    if (!e) return { spawned: false };
    g.killEnemy(e, { turf: true });
    return { spawned: true, inside: d.inside(e.spr.position.x, e.spr.position.z) };
  `);
  await page.waitForTimeout(1800);
  log.mourned = await inPage(page, OBJ);

  return log;
}
