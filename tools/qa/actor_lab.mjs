// Actor lab: a row of people (walking, jogging, running, idle, riding, hurt, dying, dead), side-on and 3/4, so a change to
// characters.js can be judged in motion and in the poses that hurt most (a corpse, a rider, a sprint) instead of standing still.
//   node serve.mjs 8899     then     node tools/qa/actor_lab.mjs [outPrefix]        (needs puppeteer)
// Saves <prefix>-side.png, <prefix>-front.png, <prefix>-run.png (walk, jog, run in profile), <prefix>-dead.png (default tools/qa/out/actors).
import puppeteer from 'puppeteer';
const out = process.argv[2] || 'tools/qa/out/actors';
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 1400, height: 700 });
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#freeBtn:not([disabled])', { timeout: 240000 });
await page.evaluate(() => document.getElementById('freeBtn').click());
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => {
  const g = window.__game;
  g.worldTime.setTime(13); g.teleport(0, 100); g.state.paused = true; g.state.cinematic = false;
  const X0 = 0, Z = 0, Y = 300;                                   // up in the sky: no trees, no buildings, just a stage
  // a lit stage: the wilds are black ground at night and dusk, and a pose is judged on its silhouette against a plain floor
  const T = g.THREE;
  const floor = new T.Mesh(new T.PlaneGeometry(60, 40), new T.MeshBasicMaterial({ color: 0x8a9478 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(X0 + 12, Y - 0.02, Z); g.scene.add(floor);
  g.scene.add(new T.HemisphereLight(0xffffff, 0x8a8a80, 2.4));
  const kinds = [['redneck', 'walk', 1.5], ['hoodrat', 'walk', 4.5], ['redneck', 'walk', 7.5], ['dockworker', 'idle', 0], ['mechanic', 'ride', 0], ['suit', 'hurt', 0], ['tourist', 'death', 0], ['redneck', 'death', 0]];
  window.__lab = kinds.map(([type, anim, speed], i) => {
    const e = g.spawnEnemy(type, X0 + i * 3.2, Z); e.state = 'lab'; e.spr.rotation.y = 0; e.spr.baseY = Y;
    if (anim === 'ride') { e.spr.rideHip = 0.9; e.spr.rideLean = 0.3; }
    e.spr.play(anim, { loop: anim !== 'death' && anim !== 'hurt', force: true });
    return { e, x0: X0 + i * 3.2, anim, speed, t: 0 };
  });
  let last = performance.now();
  (function loop() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const a of window.__lab) {
      a.t += dt; const s = a.e.spr;
      if (a.speed > 0) { s.position.x += 0; s.position.z += a.speed * dt; if (s.position.z > Z + 6) s.position.z = Z - 6; s.position.x = a.x0; }
      if (!(a.speed > 0)) s.position.y = 300;
      s.update(dt);
    }
    requestAnimationFrame(loop);
  })();
});
async function shot(name, from, look) {
  await page.evaluate((from, look) => window.__game.cine.shot({ from, look, dur: 0.1 }), from, look);
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: `${out}-${name}.png` });
}
await new Promise(r => setTimeout(r, 1500));
await shot('side', [11, 301.5, 22], [11, 301, 0]);
await shot('front', [26, 301.6, 12], [11, 301, 0]);
await new Promise(r => setTimeout(r, 1500));
await shot('run', [8, 301.0, 0], [3.2, 300.9, 0]);
await shot('dead', [20, 302.4, 5], [19.6, 300.3, 0]);
console.log('errors', errs);
await browser.close();
