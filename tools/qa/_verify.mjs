import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0,300)));
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#freeBtn:not([disabled])', { timeout: 300000 });
await page.evaluate(() => document.getElementById('freeBtn').click());
await new Promise(r => setTimeout(r, 8000));
const out = {};
// 1 hostile hog / hoodrat / redneck
out.hostile = await page.evaluate(async () => {
  const g = window.__game; g.teleport(-6, 100);
  const list = [];
  for (const [k, dx] of [['hog', 8], ['hoodrat', -8], ['redneck', 12]]) { g.spawnEnemy(k, -6 + dx, 100 + 5, {}); }
  await new Promise(r => setTimeout(r, 7000));
  return g.enemies.filter(e => ['hog','hoodrat','redneck'].includes(e.type) && !e.dead).map(e => e.type + ':' + e.state + ':' + e.mood);
});
// 2 escape menu -> options
await page.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 500));
out.pause = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#pauseMenuOverlay button')].find(b => b.textContent === 'OPTIONS'); if (!btn) return 'no OPTIONS tab';
  btn.click(); const p = document.getElementById('menuOptionsPanel');
  const r = p.getBoundingClientRect(); return { inOverlay: !!p.closest('#pauseMenuOverlay'), hidden: p.hidden, w: Math.round(r.width), h: Math.round(r.height) };
});
await page.screenshot({ path: 'tools/qa/out/options_ingame.png' });
await page.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 300));
out.afterClose = await page.evaluate(() => { const p = document.getElementById('menuOptionsPanel'); return { hidden: p.hidden, inOverlay: !!p.closest('#pauseMenuOverlay') }; });
// 3 death -> hospital
out.death = await page.evaluate(async () => {
  const g = window.__game; g.teleport(-6, 100);
  g.state.hp = 0;
  await new Promise(r => setTimeout(r, 6000));
  const h = g.services.nearest('hospital', g.playerPos.x, g.playerPos.z);
  return { hp: g.state.hp, over: g.state.over, pos: [Math.round(g.playerPos.x), Math.round(g.playerPos.z)], hospital: h && [h.x, h.z, h.name], dist: h && Math.round(Math.hypot(h.x - g.playerPos.x, h.z - g.playerPos.z)) };
});
// 4 prostitutes: solicit + look
out.solicit = await page.evaluate(async () => {
  const g = window.__game; g.teleport(-66, 300);
  for (const e of g.enemies) if (!e.dead) e.spr.position.set(9999, 0, 9999);
  g.spawnEnemy('prostitute', -60, 296, {}); g.spawnEnemy('highendescort', -62, 300, {}); g.spawnEnemy('prostitute', -58, 302, {});
  await new Promise(r => setTimeout(r, 4000));
  return document.getElementById('objective') ? document.getElementById('objective').textContent.slice(0, 100) : 'n/a';
});
await page.evaluate(() => { const g = window.__game; const p = g.enemies.find(e => e.type === 'prostitute' && !e.dead); const q = p.spr.position;
  g.playerPos.set(q.x + 3.2, 0, q.z + 1.5); g.camera.position.set(q.x + 2.2, 1.5, q.z + 3.3); g.camera.lookAt(q.x, 1.0, q.z); });
await page.screenshot({ path: 'tools/qa/out/prostitute_look.png' });
console.log(JSON.stringify(out, null, 1)); console.log('errors:', errs);
await browser.close();
