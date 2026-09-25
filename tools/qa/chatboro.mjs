// Headless survey of CHATBORO (chatboro.js), the village on the US-167 / Port
// Highway crossroads. Free roam only.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/chatboro.mjs
//
// The village's whole reason to exist is the junction, so that is what gets
// measured: can you drive in from the south on US-167, out the north, and east
// toward Tusouxroe — and is the village clear of the two districts either side
// of it. Plus the composer's own build report.
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
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const x = rect.x0 + i * STEP, z = rect.z0 + j * STEP;
        let ok = 1;
        g.blockerGrid.near(x, z, R + 3, (b) => {
          if (!ok) return;
          if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + R) ** 2) ok = 0;
        });
        free[i * H + j] = ok;
      }
    }
    const idx = (x, z) => [Math.round((x - rect.x0) / STEP), Math.round((z - rect.z0) / STEP)];
    function nearestFree(i0, j0, maxRad) {
      if (i0 >= 0 && j0 >= 0 && i0 < W && j0 < H && free[i0 * H + j0]) return [i0, j0];
      for (let rad = 1; rad <= maxRad; rad++) {
        for (let di = -rad; di <= rad; di++) {
          for (let dj = -rad; dj <= rad; dj++) {
            const i = i0 + di, j = j0 + dj;
            if (i < 0 || j < 0 || i >= W || j >= H) continue;
            if (free[i * H + j]) return [i, j];
          }
        }
      }
      return null;
    }
    return {
      W, H, free,
      reaches(ax, az, bx, bz) {
        const s = nearestFree(...idx(ax, az), Math.ceil(7 / STEP));
        const t = nearestFree(...idx(bx, bz), Math.ceil(7 / STEP));
        if (!s || !t) return { ok: false, why: s ? "target walled in" : "start walled in" };
        const seen = new Uint8Array(W * H);
        const q = [s[0] * H + s[1]];
        seen[q[0]] = 1;
        let n = 0, head = 0;
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
  await page.waitForFunction(() => window.__game && window.__game.chatboro, null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  log.report = await inPage(page, `
    const V = window.__game.chatboro, r = V.report();
    return {
      stages: r.stages, built: r.built, rejected: r.rejected, trees: r.trees,
      siteOverlaps: r.siteOverlaps, clusters: r.clusters, focal: r.focal,
      bounds: V.BOUNDS, lanes: V.lanes.length, pois: V.pois.length,
      minimap: { roads: V.minimap.roads.length, buildings: V.minimap.buildings.length, areas: V.minimap.areas.length },
      area: Math.round((V.BOUNDS.x1 - V.BOUNDS.x0) * (V.BOUNDS.z1 - V.BOUNDS.z0)),
    };
  `);
  const R = log.report;
  const conflicts = (R.stages || []).reduce((a, s) => a + (s.conflicts || 0), 0);
  ok("no stage built over another", conflicts === 0, { conflicts });
  ok("no reserved site overlaps anything", R.siteOverlaps === 0, { siteOverlaps: R.siteOverlaps });
  // A village, not a city: bigger than the old Chatboro end of the strip
  // (~19,500 m2) and a fraction of the Tusouxroe metro (169,120 m2).
  ok("it is a village, grown slightly", R.area > 22000 && R.area < 40000, { area_m2: R.area });
  ok("the village got built", R.built >= 18, { buildings: R.built });

  // The junction is the point. If you cannot drive through it, there is no
  // village here — just buildings beside a road you have to go around.
  log.junction = await inPage(page, `
    ${FILL}
    const g = window.__game, V = g.chatboro, B = V.BOUNDS;
    const ox = B.x0 + 80, oz = B.z0 + 120;                       // local (0,0) = the crossroads
    const wx = (x) => ox + x, wz = (z) => oz + z;
    const f = makeFill(g, { x0: B.x0 - 30, x1: B.x1 + 40, z0: B.z0 - 30, z1: B.z1 + 30 }, 1.5, 1.8);
    return {
      crossroads: [wx(0), wz(0)],
      southToNorth: f.reaches(wx(0), wz(112), wx(0), wz(-112)),   // up US-167, through the village
      eastToTusouxroe: f.reaches(wx(0), wz(0), wx(60), wz(0)),    // out the Port Highway
      westArm: f.reaches(wx(0), wz(0), wx(-74), wz(0)),           // and the arm Chatboro paves itself
      toChurch: f.reaches(wx(0), wz(0), wx(-50), wz(-30)),        // and to its landmark
    };
  `);
  for (const [k, label] of [
    ["southToNorth", "US-167 runs through the village, south to north"],
    ["eastToTusouxroe", "the Port Highway leaves east toward Tusouxroe"],
    ["westArm", "the western arm of the Port Highway is drivable"],
    ["toChurch", "you can reach the church from the crossroads"],
  ]) ok(label, log.junction[k].ok === true, log.junction[k]);

  // Chatboro must not have grown into either neighbour.
  log.spacing = await inPage(page, `
    const g = window.__game;
    const V = g.chatboro.BOUNDS, T = g.tusouxroe.BOUNDS;
    const overlap = V.x1 > T.x0 && V.x0 < T.x1 && V.z1 > T.z0 && V.z0 < T.z1;
    return {
      chatboro: V, tusouxroe: T, overlap,
      gapEastToTusouxroe: +(T.x0 - V.x1).toFixed(1),
      // north Tusouxroe's strip (the OrleaRouge end of US-167) stops at z -440
      gapSouthToStrip: +(V.z0 - -440).toFixed(1),
    };
  `);
  ok("Chatboro does not overlap Tusouxroe", log.spacing.overlap === false, log.spacing);
  ok("open road between Chatboro and Tusouxroe", log.spacing.gapEastToTusouxroe > 20, { gap: log.spacing.gapEastToTusouxroe });
  ok("open road between Chatboro and the strip", log.spacing.gapSouthToStrip < -40, { gap: log.spacing.gapSouthToStrip });

  // And the crowd: a zone with no ZONE_MIX entry spawns nobody, silently.
  log.zones = await inPage(page, `
    const g = window.__game, V = g.chatboro, B = V.BOUNDS;
    const ox = B.x0 + 80, oz = B.z0 + 120;
    const seen = {};
    for (let x = B.x0 + 4; x < B.x1; x += 7) {
      for (let z = B.z0 + 4; z < B.z1; z += 7) {
        const zone = V.zoneAt(x, z);
        if (zone) seen[zone] = (seen[zone] || 0) + 1;
      }
    }
    const known = Object.keys(g.spawnZones && g.spawnZones.ZONE_MIX ? g.spawnZones.ZONE_MIX : {});
    return { seen, known: known.length ? known : null };
  `);
  ok("the village has a town crowd", (log.zones.seen.town || 0) > 20, log.zones);

  log.passed = log.checks.filter((c) => c.ok).length;
  log.failed = log.checks.filter((c) => !c.ok).map((c) => c.name);
  return log;
}
