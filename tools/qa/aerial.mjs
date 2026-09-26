// Aerial / street-level screenshots of any spot on the map, for judging a district by eye.
//
//   node serve.mjs 8899                       (in another shell)
//   node tools/qa/aerial.mjs '[["name", x, z, cameraDistance, hourOfDay], ...]' tag
//   PSTEPS=12 (camera pitch: 0 = default 3rd-person, 12 = looking straight down), YAW=-1.57, EXPO=1
//
// Writes tools/qa/out/<tag>_<name>.png and prints draw calls / triangles per shot.
// Needs puppeteer (`npm install puppeteer --no-save`). Headless renders at night lighting, so dark ground is normal.
import puppeteer from 'puppeteer';
// usage: node aerial.mjs '[["name",x,z,dist,hourOfDay],...]' tag
const spots = JSON.parse(process.argv[2]); const tag = process.argv[3] || 'aer';
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,300)));
page.on('console', m => { if (m.type()==='error' && !/404|Failed to load/.test(m.text())) errs.push(m.text().slice(0,200)); });
await page.evaluateOnNewDocument((e) => { window.__EXPO = e; }, Number(process.env.EXPO || 1));
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#startBtn:not([disabled])', { timeout: 120000 });
await page.evaluate(async () => {
  const cam = await import('/src/camera.js');
  cam.CAMERA_CONFIG.onFoot.maxDistance = 400; cam.CAMERA_CONFIG.onFoot.minDistance = 4;
  const g = window.__game; g.renderer.toneMappingExposure = (window.__EXPO || 1); g.state.running = true; document.getElementById('overlay').style.display = 'none';
});
await new Promise(r => setTimeout(r, 2500));
const PSTEPS = Number(process.env.PSTEPS ?? 12), YAW = Number(process.env.YAW ?? 0);
async function pitchUp() { // right-drag to raise the camera
  await page.mouse.move(640, 300); await page.mouse.down({ button: 'right' });
  for (let i = 0; i < PSTEPS; i++) await page.mouse.move(640, 300 + (i+1)*22);
  await page.mouse.up({ button: 'right' });
}
let first = true;
for (const [name, x, z, dist = 120, hour = 19.5] of spots) {
  await page.evaluate((x, z, hour) => { const g = window.__game; g.teleport(x, z); g.worldTime.setTime(hour); g.renderer.toneMappingExposure = Number(window.__EXPO || 1); }, x, z, hour);
  if (first) { await pitchUp(); const steps = Math.round(Math.log(dist/15)/0.1); for (let i = 0; i < steps; i++) await page.mouse.wheel({ deltaY: 100 }); first = false; }
  if (YAW) await page.evaluate((y)=>window.__game.camCtl.addYaw(y), YAW);
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: `tools/qa/out/${tag}_${name}.png` });
  const info = await page.evaluate(() => { const g = window.__game; return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, yaw: g.camCtl.yaw, pitch: g.camCtl.pitch, cy: g.camera.position.y }; });
  console.log(name, JSON.stringify(info));
}
if (errs.length) console.log('errors', errs);
await browser.close();
