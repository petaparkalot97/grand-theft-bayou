// Does the spawn system actually populate each district? 400 spawn picks around a spot: how many
// land (vs null), in which zones, as which kinds, and how many inside a solid blocker or in water.
// (headless fps is ~1, so the live population never fills; this samples spawnZones.pick directly.)
// Found the Orlea inCity() bug: Oyster Bay and US-167 south had never spawned anyone.
//
// Needs puppeteer (`npm install puppeteer --no-save`).
//   node serve.mjs 8899   then   node tools/qa/pop_check.mjs
import puppeteer from 'puppeteer';
const spots = [["Oyster Bay",640,596],["Oyster harbor",720,860],["Port Calypso",760,-650],["Port quay",860,-930],["Red Dust",-650,-598],["Lakeshore",-700,760],["Lakeshore boardwalk",-690,900],["US-167 north",-6,-800],["US-167 south",-6,900],["Delta Road",778,-40]];
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,200)));
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#startBtn:not([disabled])', { timeout: 180000 });
for (const [name, x, z] of spots) {
  const r = await page.evaluate((x, z) => {
    const g = window.__game, out = { picks: 0, null: 0, byZone: {}, byKind: {}, insideBlocker: 0, inWater: 0 };
    const focus = { x, z };
    for (let i = 0; i < 400; i++) {
      const s = g.spawnZones.pick(focus, [], {});
      if (!s) { out.null++; continue; }
      out.picks++;
      out.byZone[s.zone] = (out.byZone[s.zone] || 0) + 1; out.byKind[s.kind] = (out.byKind[s.kind] || 0) + 1;
      let inside = false;
      g.blockerGrid.near(s.x, s.z, 5, (b) => { if (b._grid === 'static' && Math.hypot(b.x - s.x, b.z - s.z) < b.r * 0.8) { inside = true; return true; } });
      if (inside) out.insideBlocker++;
      if (g.stateWorld.zoneAt(s.x, s.z) === 'water') out.inWater++;
    }
    return out;
  }, x, z);
  console.log(name.padEnd(20), JSON.stringify(r));
}
if (errs.length) console.log('pageerrors', errs);
await browser.close();
