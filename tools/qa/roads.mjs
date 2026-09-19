// Road-surface audit for the composer districts (TASK-039 integration issue).
// `src/stateWorld.js` and `src/tusouxroeNorth.js` used to lay a hand-built
// PlaneGeometry road 1-2 mm under every composer road, so the two z-fought and
// each line cost two meshes. One system per road now: the composer owns the
// surface. This walks each line and counts the road planes stacked on it.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/roads.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./roads).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

// Every road line the two district modules compose: [name, x0, z0, x1, z1, width].
const LINES = [
  ["North US-167",        -6,  -136,    -6,  -420, 11],
  ["Tusouxroe Blvd",    -190,  -260,   190,  -260, 11],
  ["Civic Center Way",  -110,  -380,  -110,  -160,  9],
  ["Industrial Drive",   110,  -380,   110,  -160,  9],
  ["Port Highway",       400,  -600,  1050,  -600, 12],
  ["Dockside Drive",     750, -1000,   750,  -420, 10],
  ["Red Dust Pass A",   -400,  -600, -1050,  -600,  9],
  ["Red Dust Pass B",  -1050,  -600, -1050,  -850,  9],
  ["Lakeshore Causeway", -400,  750, -1050,   750, 12],
];

export default async function run(page) {
  const log = { steps: [], results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "roads";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, "const g = window.__game;\n" + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  log.steps.push("free roam running");

  // ---- one road surface per line
  // A road surface is a ground plane (rotation.x = -PI/2) in the 0 - 0.05 m band
  // the districts build roads in, and about as wide as the road. Narrower planes
  // are sidewalks or markings; much wider ones are the world ground plane or a
  // lot; centre-line dashes are InstancedMesh and are not counted at all.
  const audit = await js(`
    const lines = ${JSON.stringify(LINES)};
    const planes = [];
    g.scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (!o.geometry || o.geometry.type !== "PlaneGeometry") return;
      if (Math.abs(o.rotation.x + Math.PI / 2) > 0.01) return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements, y = e[13];
      if (y < 0 || y > 0.05) return;
      const par = o.geometry.parameters || {};
      planes.push({ x: e[12], y, z: e[14], w: par.width || 0, h: par.height || 0, rz: o.rotation.z });
    });
    const N = 20;
    const hits = lines.map((L) => {
      const name = L[0], x0 = L[1], z0 = L[2], x1 = L[3], z1 = L[4], width = L[5];
      const cover = [];
      for (const pl of planes) {
        const across = Math.min(pl.w, pl.h);
        if (across < width * 0.75) continue;                    // a sidewalk or a marking, not the road
        if (across > width + 6) continue;                       // the ground plane, a lot, a yard
        let n = 0;
        for (let i = 0; i <= N; i++) {
          const t = i / N, sx = x0 + (x1 - x0) * t, sz = z0 + (z1 - z0) * t;
          const on = Math.abs(pl.rz) > 0.01
            ? Math.hypot(sx - pl.x, sz - pl.z) < Math.max(pl.w, pl.h) / 2   // a rotated plane: use a radius
            : Math.abs(sx - pl.x) <= pl.w / 2 + 0.01 && Math.abs(sz - pl.z) <= pl.h / 2 + 0.01;
          if (on) n++;
        }
        if (n > N * 0.8) cover.push(pl);
      }
      return { name: name, surfaces: cover.length, ys: cover.map((pl) => +pl.y.toFixed(4)) };
    });
    return { planes: planes.length, hits: hits };
  `);
  if (audit && audit.error) { log.audit = audit; return; }
  log.audit = audit;
  for (const h of audit.hits) {
    pass(h.name + ": exactly one road surface", h.surfaces === 1, { surfaces: h.surfaces, ys: h.ys });
  }

  // ---- look at them
  const SHOTS = [
    ["north", -6, -280, [60, 70, -200]],
    ["port", 725, -600, [640, 80, -480]],
    ["canyon", -700, -600, [-620, 80, -480]],
    ["causeway", -725, 750, [-640, 80, 860]],
  ];
  for (const S of SHOTS) {
    const label = S[0], x = S[1], z = S[2], from = S[3];
    await js("g.teleport(" + x + ", " + z + "); g.cine.shot({ from: " + JSON.stringify(from) + ", look: [" + x + ", 0, " + z + "], dur: 0.1 }); return true;");
    await page.waitForTimeout(1600);
    await page.screenshot({ path: out + "-" + label + ".png" });
    await js("g.cine.releaseCamera(); return true;");
    log.steps.push("shot " + label);
  }

  log.perf = await js("return { calls: g.perf.calls, geometries: g.renderer.info.memory.geometries };");
}
