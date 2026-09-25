// Mesh-density heat map of the whole map (100 m cells), printed as a table: where is the map built and
// where is it empty? Counts scene meshes after static batching, so compare cells to each other, not to
// a raw building count. This is what showed the map was one blob with four empty corners (TASK-084).
//
// Needs puppeteer (`npm install puppeteer --no-save`).
//   node serve.mjs 8899   then   node tools/qa/heatmap.mjs
import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 650 });
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('#startBtn:not([disabled]), #zombieBtn:not([disabled])', { timeout: 120000 });
await new Promise(r => setTimeout(r, 4000));
const res = await page.evaluate(() => {
  const g = window.__game, C = 100, N = 24, off = 1200;
  const cells = Array.from({ length: N }, () => new Array(N).fill(0));
  const box = new (g.camera.position.constructor)();
  let total = 0;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox; if (!bb) return;
    const c = bb.getCenter(box.clone()).applyMatrix4(o.matrixWorld);
    // skip huge ground planes
    const sz = bb.getSize(box.clone());
    if (sz.x > 400 || sz.z > 400) return;
    const ix = Math.floor((c.x + off) / C), iz = Math.floor((c.z + off) / C);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return;
    cells[iz][ix]++; total++;
  });
  const bl = g.blockers ? g.blockers.length : null;
  return { cells, total, bl };
});
console.log('total meshes', res.total, 'blockers', res.bl);
console.log('     x: ' + Array.from({length:24},(_, i)=>String((i*100-1200)).padStart(5)).join(''));
res.cells.forEach((row, i) => console.log('z' + String(i*100-1200).padStart(5) + ' ' + row.map(n => String(n).padStart(5)).join('')));
await browser.close();
