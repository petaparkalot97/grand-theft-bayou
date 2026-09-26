// Headless survey of SHRUSTON (shruston.js) — Shreveport + Ruston, north-west
// on I-20. Free roam only.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/shruston.mjs
//
// What it measures:
//   A  the composer's build report, no stage over another, no site overlaps
//   B  the Legends Walk: the roster is complete and you can get into it
//   C  Lake Caddo holds — you cannot drive off the shore into it
//   D  casino row, both campuses and the rodeo are reachable by car
//   E  nothing from the state-scale layer is inside the city (roadside.js's
//      I-20 corridor covers most of it)
//   F  the campuses spawn a campus crowd, not a village one
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
  await page.waitForFunction(() => window.__game && window.__game.shruston, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // ---- A ------------------------------------------------------------------
  log.report = await inPage(page, `
    const S = window.__game.shruston, r = S.report();
    return { stages: r.stages, built: r.built, rejected: r.rejected, trees: r.trees,
             siteOverlaps: r.siteOverlaps, siteOverlapNames: r.siteOverlapNames, focal: r.focal,
             bounds: S.BOUNDS, lake: S.LAKE, lanes: S.lanes.length, pois: S.pois.length,
             legends: S.legends, zones: S.zoneRects.map(([z]) => z),
             area: Math.round((S.BOUNDS.x1 - S.BOUNDS.x0) * (S.BOUNDS.z1 - S.BOUNDS.z0)) };
  `);
  const R = log.report;
  const conflicts = (R.stages || []).reduce((a, s) => a + (s.conflicts || 0), 0);
  ok("no stage built over another", conflicts === 0, { conflicts });
  ok("no reserved site overlaps anything", R.siteOverlaps === 0, { names: R.siteOverlapNames });
  ok("it is a city, second only to the metro", R.area > 140000 && R.area < 169120, { area_m2: R.area });
  ok("the city got built", R.built >= 55, { buildings: R.built });
  ok("the landmark is the Legends Walk", R.focal && R.focal.name === "Legends Walk", R.focal);

  // ---- B: the roster ------------------------------------------------------
  ok("thirteen bronzes and twelve stars", R.legends.bronzes === 13 && R.legends.stars === 12, R.legends);

  // ---- C, D: the city works -----------------------------------------------
  log.drive = await inPage(page, `
    ${FILL}
    const g = window.__game, S = g.shruston, B = S.BOUNDS;
    const ox = B.x0 + 130, oz = B.z0 + 300;                       // local (0,0)
    const wx = (x) => ox + x, wz = (z) => oz + z;
    const car = makeFill(g, B, 2, 1.8);
    const walk = makeFill(g, { x0: wx(4), x1: wx(80), z0: wz(34), z1: wz(112) }, 0.6, 0.6);
    return {
      // off Texas Avenue and into the Legends Walk colonnade
      intoLegendsWalk: walk.reaches(wx(42), wz(38), wx(42), wz(76)),
      // downtown to the casinos, the two campuses, and the rodeo
      toCasinos: car.reaches(wx(20), wz(40), wx(-20), wz(-96)),
      // Aim at the ground a car could actually stop on, not the middle of the
      // thing: (56, -265) is inside the Bayou Tech hall and (-88, 254) is inside
      // the rodeo rail, so both came back "target walled in" for the right
      // reason. The forecourt and the approach are the real test.
      toBayouTech: car.reaches(wx(20), wz(40), wx(56), wz(-249)),
      toGrambleton: car.reaches(wx(20), wz(40), wx(-93), wz(-249)),
      toRodeo: car.reaches(wx(20), wz(40), wx(-88), wz(204)),
      // and you must NOT be able to drive off the shore into Lake Caddo
      intoLake: car.reaches(wx(-40), wz(-70), wx(-95), wz(-70)),
    };
  `);
  ok("you can walk from Texas Avenue into the Legends Walk", log.drive.intoLegendsWalk.ok === true, log.drive.intoLegendsWalk);
  for (const [k, label] of [
    ["toCasinos", "a car gets from downtown to casino row"],
    ["toBayouTech", "a car gets to Bayou Tech"],
    ["toGrambleton", "a car gets to Grambleton State"],
    ["toRodeo", "a car gets to the rodeo grounds"],
  ]) ok(label, log.drive[k].ok === true, log.drive[k]);
  ok("you cannot drive off the shore into Lake Caddo", log.drive.intoLake.ok === false, log.drive.intoLake);

  // ---- E: the state-scale layer stays out ---------------------------------
  log.trespass = await inPage(page, `
    const g = window.__game, B = g.shruston.BOUNDS;
    const inside = (r) => r.x1 > B.x0 && r.x0 < B.x1 && r.z1 > B.z0 && r.z0 < B.z1;
    const sw = g.stateWorld ? g.stateWorld.minimap.buildings.filter(inside) : [];
    return { stateWorldBuildings: sw.length, examples: sw.slice(0, 4) };
  `);
  ok("no state-scale building is inside the city", log.trespass.stateWorldBuildings === 0, log.trespass);

  // ---- F: who is on the street --------------------------------------------
  log.zones = await inPage(page, `
    const g = window.__game, S = g.shruston, B = S.BOUNDS;
    const seen = {};
    for (let x = B.x0 + 5; x < B.x1; x += 8) for (let z = B.z0 + 5; z < B.z1; z += 8) {
      const zone = S.zoneAt(x, z);
      if (zone) seen[zone] = (seen[zone] || 0) + 1;
    }
    return seen;
  `);
  ok("the campuses have a campus crowd", (log.zones.campus || 0) > 5, log.zones);
  ok("the casinos and the auditorium are entertainment", (log.zones.entertainment || 0) > 5, log.zones);

  log.passed = log.checks.filter((c) => c.ok).length;
  log.failed = log.checks.filter((c) => !c.ok).map((c) => c.name);
  return log;
}
