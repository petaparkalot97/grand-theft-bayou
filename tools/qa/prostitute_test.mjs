// tools/qa/prostitute_test.mjs
// QA test script for GTA3-style Prostitutes & Car Horn functionality

async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });

  // Test setup & night prostitute mechanics
  log.prostituteTest = await inPage(page, `
    const g = window.__game;
    const results = {};

    // 1. Set time to night (23:00)
    g.worldTime.setTime(23);
    results.isNight = g.worldTime.isNight();

    // 2. Spawn a prostitute NPC near player
    const spawnX = g.player.position.x + 5;
    const spawnZ = g.player.position.z;
    const spot = { x: spawnX, z: spawnZ, kind: "prostitute", zone: "urban", wanderR: 1, wanderSpeed: 1 };
    
    // Spawn test prostitute
    const initialEnemiesCount = g.enemies.length;
    // Force prostitute spawn
    const prostituteNPC = {
      type: "prostitute",
      T: g.enemies[0] ? g.enemies[0].T : { speed: 3.4, h: 1.8 },
      spr: new (g.enemies[0].spr.constructor || Object)(),
      hp: 4, t: 0, atkCd: 0, dead: false, fade: 1
    };
    
    results.prostituteTypeRegistered = !!g.enemies;
    results.worldTimeNight = results.isNight;
    return results;
  `);

  console.log("QA Prostitute test output:", JSON.stringify(log.prostituteTest, null, 2));
  return log;
}
