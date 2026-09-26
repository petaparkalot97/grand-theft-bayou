// Performance audit probe (headless Chromium / SwiftShader — so read COUNTS, not milliseconds: draw calls, triangles, what is being drawn,
// what is lit, what casts a shadow, what the CPU does per frame).  For each spot: draw calls and triangles for the frame, then a census of the
// meshes actually inside the view frustum, grouped by kind, by material and by parent group.
//   node serve.mjs 8899     then     node tools/qa/perf_audit.mjs [freeBtn|zombieBtn]        (needs puppeteer)
import puppeteer from 'puppeteer';
const mode = process.argv[2] || 'freeBtn';
const SPOTS = [['Chatboro start', -6, 100, 0], ['Chatboro strip', 18, 60, 0], ['Tusouxroe', 0, -60, 0], ['Crown Strip', 0, -330, 0], ['OrleaRouge', 0, 300, 0], ['Oyster Bay', 640, 590, 0], ['Port Calypso', 760, -640, 0], ['forest (west band)', -700, 0, 0], ['Lakeshore', -700, 780, 0]];
const browser = await puppeteer.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector(`#${mode}:not([disabled])`, { timeout: 240000 });
await page.evaluate((m) => document.getElementById(m).click(), mode);
if (mode === 'zombieBtn') { await page.waitForSelector('#pipCreate.on'); await page.evaluate(() => [...document.querySelectorAll('#pipCreate .pipBtn')].find(b => b.textContent === 'BEGIN').click()); }
await new Promise(r => setTimeout(r, 6000));
const summary = await page.evaluate(() => {
  const g = window.__game, r = g.renderer;
  return { tier: g.gfxStats && Object.keys(g.gfxStats).length, meshesTotal: (() => { let n = 0; g.scene.traverse(o => { if (o.isMesh) n++; }); return n; })(), geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs ? r.info.programs.length : null };
});
console.log('scene:', JSON.stringify(summary));
for (const [name, x, z] of SPOTS) {
  const res = await page.evaluate(async (x, z) => {
    const g = window.__game, T = g.THREE, r = g.renderer, cam = g.camera;
    g.teleport(x, z);
    // headless runs ~1 fps, so the districts' distance culling may not have caught up with the teleport: run it by hand, twice
    for (let k = 0; k < 2; k++) for (const d of [g.westParish, g.eastBank, g.tusouxroe, g.chatboro, g.shruston, g.charsoufre, g.tusouxroeNorth, g.stateWorld]) if (d && d.update) d.update(1, g.playerPos);
    for (let i = 0; i < 5; i++) await new Promise(rr => requestAnimationFrame(rr));
    await new Promise(rr => setTimeout(rr, 2500));
    cam.updateMatrixWorld(true);
    const fr = new T.Frustum(), pm = new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    fr.setFromProjectionMatrix(pm);
    const sph = new T.Sphere();
    const kinds = { mesh: 0, instanced: 0, instances: 0, skinned: 0, sprite: 0, points: 0, line: 0, shadowCasters: 0, transparent: 0, doubleSided: 0 };
    const byMat = new Map(), byParent = new Map(), lights = { point: 0, spot: 0, dir: 0, shadowLights: 0 };
    let tris = 0;
    g.scene.traverse(o => {
      if (o.isLight) { if (o.isPointLight) lights.point++; else if (o.isSpotLight) lights.spot++; else if (o.isDirectionalLight) lights.dir++; if (o.castShadow) lights.shadowLights++; return; }
      if (!(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return;
      // effective visibility
      for (let p = o; p; p = p.parent) if (p.visible === false) return;
      if (o.frustumCulled !== false) {
        if (!o.geometry) return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (!fr.intersectsSphere(sph)) return;
      }
      if (o.isSprite) { kinds.sprite++; return; }
      if (o.isPoints) { kinds.points++; return; }
      if (o.isLine) { kinds.line++; return; }
      if (o.isInstancedMesh) { kinds.instanced++; kinds.instances += o.count; } else kinds.mesh++;
      if (o.isSkinnedMesh) kinds.skinned++;
      if (o.castShadow) kinds.shadowCasters++;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m) { if (m.transparent) kinds.transparent++; if (m.side === T.DoubleSide) kinds.doubleSided++; const key = (m.name || m.type) + (o.isInstancedMesh ? ' [inst]' : ''); byMat.set(key, (byMat.get(key) || 0) + 1); }
      const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0);
      tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
      let par = o.parent; let depth = 0; while (par && par.parent && par.parent !== g.scene && depth < 6) { par = par.parent; depth++; }
      const pk = (par && (par.name || par.type)) || 'scene';
      byParent.set(pk, (byParent.get(pk) || 0) + 1);
    });
    const top = (m, n = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    // frame cost with and without the shadow pass, and with the reflection pass off
    const measure = () => { r.info.reset && r.info.reset(); return r.info.render.calls; };
    void measure;
    const calls = r.info.render.calls, trisFrame = r.info.render.triangles;
    const enemies = g.enemies.filter(e => !e.dead).length;
    const visibleEnemies = g.enemies.filter(e => !e.dead && e.spr.visible).length;
    return { calls, trisK: Math.round(trisFrame / 1000), frustumTrisK: Math.round(tris / 1000), kinds, lights, topMaterials: top(byMat), topGroups: top(byParent, 6), enemies, visibleEnemies, perf: { simMs: g.perf.simMs, aiMs: g.perf.aiMs, renderMs: g.perf.renderMs } };
  }, x, z);
  console.log(`\n== ${name}`); console.log(JSON.stringify(res));
}
console.log('\nerrors', errs);
await browser.close();
