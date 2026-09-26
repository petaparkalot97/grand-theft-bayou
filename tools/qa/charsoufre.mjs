// Headless survey of CHARSOUFRE (charsoufre.js) — Lake Charles and Sulphur,
// south-west on I-10. Free roam only.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/charsoufre.mjs
//
// The district's whole idea is two towns with opposite characters either side
// of one seam, so that is what gets measured: that you can cross it, that each
// half is what it claims to be, and that the lake and the marsh hold.
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const FILL = `
  function makeFill(g, rect, STEP, R) {
    const W = Math.round((rect.x1 - rect.x0) / STEP), H = Math.round((rect.z1 - rect.z0) / STEP);
    const free = new Uint8Array(W * H);
    for (let i = 0; i < W; i++) for (let j = 0; j < H; j++) {
      const x = rect.x0 + i * STEP, z = rect.z0 + j * STEP;
      let ok = 1;
      g.blockerGrid.near(x, z, R + 3, (b) => { if (ok && (b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + R) ** 2) ok = 0; });
      free[i * H + j] = ok;
    }
    const idx = (x, z) => [Math.round((x - rect.x0) / STEP), Math.round((z - rect.z0) / STEP)];
    function nearestFree(i0, j0, maxRad) {
      if (i0 >= 0 && j0 >= 0 && i0 < W && j0 < H && free[i0 * H + j0]) return [i0, j0];
      for (let rad = 1; rad <= maxRad; rad++) for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        if (free[i * H + j]) return [i, j];
      }
      return null;
    }
    return {
      reaches(ax, az, bx, bz) {
        const s = nearestFree(...idx(ax, az), Math.ceil(8 / STEP));
        const t = nearestFree(...idx(bx, bz), Math.ceil(8 / STEP));
        if (!s || !t) return { ok: false, why: s ? "target walled in" : "start walled in" };
        const seen = new Uint8Array(W * H); const q = [s[0] * H + s[1]];
        seen[q[0]] = 1;
        let head = 0, n = 0;
        while (head < q.length) {
          const k = q[head++]; n++;
          const i = (k / H) | 0, j = k % H;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            const nk = ni * H + nj;
            if (seen[nk] || !free[nk]) continue;
            seen[nk] = 1; q.push(nk);
          }
        }
        return { ok: !!seen[t[0] * H + t[1]], reached: n };
      },
    };
  }
`;

export default async function run(page) {
  const log = { checks: [] };
  const ok = (name, pass, detail) => log.checks.push({ name, ok: !!pass, detail });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 300000 });
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.charsoufre, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  log.report = await inPage(page, `
    const D = window.__game.charsoufre, r = D.report();
    return { stages: r.stages, built: r.built, rejected: r.rejected, trees: r.trees,
             siteOverlaps: r.siteOverlaps, siteOverlapNames: r.siteOverlapNames, focal: r.focal,
             bounds: D.BOUNDS, lake: D.LAKE, lanes: D.lanes.length, pois: D.pois.length,
             zones: D.zoneRects.map(([z]) => z),
             area: Math.round((D.BOUNDS.x1 - D.BOUNDS.x0) * (D.BOUNDS.z1 - D.BOUNDS.z0)) };
  `);
  const R = log.report;
  const conflicts = (R.stages || []).reduce((a, s) => a + (s.conflicts || 0), 0);
  ok("no stage built over another", conflicts === 0, { conflicts });
  ok("no reserved site overlaps anything", R.siteOverlaps === 0, { names: R.siteOverlapNames });
  ok("it is a town, not a city", R.area > 60000 && R.area < 100000, { area_m2: R.area });
  ok("both halves got built", R.built >= 32, { buildings: R.built });
  ok("the landmark is the Charpentier district", R.focal && R.focal.name === "Charpentier", R.focal);

  log.drive = await inPage(page, `
    ${FILL}
    const g = window.__game, D = g.charsoufre, B = D.BOUNDS;
    const ox = B.x0 + 130, oz = B.z0 + 150;                 // local (0,0) = I-10 at the seam
    const wx = (x) => ox + x, wz = (z) => oz + z;
    const car = makeFill(g, B, 2, 1.8);
    const walk = makeFill(g, { x0: wx(30), x1: wx(84), z0: wz(92), z1: wz(148) }, 0.6, 0.6);
    return {
      // the seam: Sulphur's main street to Lake Charles's, across I-10
      sulphurToLakeCharles: car.reaches(wx(-78), wz(-40), wx(16), wz(-40)),
      toCasinos: car.reaches(wx(16), wz(-40), wx(58), wz(-62)),
      toWorks: car.reaches(wx(16), wz(-40), wx(-107), wz(-100)),
      toWaterpark: car.reaches(wx(16), wz(-40), wx(-107), wz(29)),
      // out along the boardwalk on foot
      ontoBoardwalk: walk.reaches(wx(58), wz(96), wx(58), wz(130)),
      // and the lake must hold
      // from Ryan Street, not from (60,-80) — that start is inside a casino, so
      // the check passed on "start walled in" and proved nothing about the shore
      intoLake: car.reaches(wx(16), wz(-80), wx(106), wz(-80)),
    };
  `);
  for (const [k, label, want] of [
    ["sulphurToLakeCharles", "you can drive across the seam, Sulphur to Lake Charles", true],
    ["toCasinos", "a car gets to casino row", true],
    ["toWorks", "a car gets to the sulphur works", true],
    ["toWaterpark", "a car gets to the SPAR waterpark", true],
    ["ontoBoardwalk", "you can walk out onto the Creole Nature Trail", true],
    ["intoLake", "you cannot drive off the shore into Lake Chareaux", false],
  ]) ok(label, log.drive[k].ok === want, log.drive[k]);

  log.trespass = await inPage(page, `
    const g = window.__game, B = g.charsoufre.BOUNDS;
    const inside = (r) => r.x1 > B.x0 && r.x0 < B.x1 && r.z1 > B.z0 && r.z0 < B.z1;
    const sw = g.stateWorld ? g.stateWorld.minimap.buildings.filter(inside) : [];
    return { stateWorldBuildings: sw.length, examples: sw.slice(0, 4) };
  `);
  ok("no state-scale building is inside the town", log.trespass.stateWorldBuildings === 0, log.trespass);

  // The two halves must actually read as different places to spawnzones.js.
  log.zones = await inPage(page, `
    const g = window.__game, D = g.charsoufre, B = D.BOUNDS;
    const ox = B.x0 + 130, oz = B.z0 + 150;
    const west = {}, east = {};
    for (let x = B.x0 + 5; x < B.x1; x += 6) for (let z = B.z0 + 5; z < B.z1; z += 6) {
      const zone = D.zoneAt(x, z);
      if (!zone) continue;
      const bag = x < ox - 54 ? west : east;
      bag[zone] = (bag[zone] || 0) + 1;
    }
    return { west, east };
  `);
  ok("the Sulphur side has the works", (log.zones.west.industrial || 0) > 0, log.zones.west);
  ok("the Lake Charles side has the casinos and the festival", (log.zones.east.entertainment || 0) > 3, log.zones.east);

  log.passed = log.checks.filter((c) => c.ok).length;
  log.failed = log.checks.filter((c) => !c.ok).map((c) => c.name);
  return log;
}
