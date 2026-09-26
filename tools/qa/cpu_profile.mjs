// CPU profile of the running game (headless): the JS functions with the most self time over N seconds, grouped by source file. GPU work is
// SwiftShader's here, so the profile's `render` share (three.js internals: projectObject, renderBufferDirect, setProgram...) is a proxy for CPU-side
// draw submission, while game code shows as src/*.js.
//   node serve.mjs 8899   then   node tools/qa/cpu_profile.mjs [freeBtn|zombieBtn] [seconds] [x z]
import puppeteer from 'puppeteer';
const mode = process.argv[2] || 'freeBtn', secs = +(process.argv[3] || 20), at = process.argv[4] ? [+process.argv[4], +process.argv[5]] : null;
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector(`#${mode}:not([disabled])`, { timeout: 240000 });
await page.evaluate((m) => document.getElementById(m).click(), mode);
if (mode === 'zombieBtn') { await page.waitForSelector('#pipCreate.on'); await page.evaluate(() => [...document.querySelectorAll('#pipCreate .pipBtn')].find(b => b.textContent === 'BEGIN').click()); }
await new Promise(r => setTimeout(r, 6000));
if (at) await page.evaluate((x, z) => window.__game.teleport(x, z), at[0], at[1]);
if (mode === 'zombieBtn') await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 300; i++) { g.updateEnemyPopulation(0.6); g.updateZombiePopulation(0.6); } });
await new Promise(r => setTimeout(r, 3000));
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
await new Promise(r => setTimeout(r, secs * 1000));
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const self = new Map(); const dts = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const dt = dts[i] || 0; total += dt; self.set(id, (self.get(id) || 0) + dt); });
const fn = new Map(), file = new Map();
for (const [id, t] of self) {
  const cf = byId.get(id).callFrame; const url = (cf.url || '(native)').replace(/^.*localhost:8899\//, '');
  const key = `${cf.functionName || '(anon)'}  ${url}:${cf.lineNumber + 1}`;
  fn.set(key, (fn.get(key) || 0) + t); file.set(url, (file.get(url) || 0) + t);
}
const pct = (t) => (100 * t / total).toFixed(1) + '%';
console.log(`sampled ${(total / 1e6).toFixed(1)} s of JS (of ${secs} s wall)`);
console.log('\n-- by file'); for (const [k, t] of [...file].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(pct(t).padStart(6), k);
console.log('\n-- top functions (self time)'); for (const [k, t] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(pct(t).padStart(6), k);
await browser.close();
