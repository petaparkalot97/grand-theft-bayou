// Headless survey of the TUSOUXROE metro (tusouxroe.js). Free roam only — no
// story needed, the district is world geometry.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/tusouxroe.mjs
//
// What it measures, rather than assumes:
//
//   A  the composer's own build report, and that no stage overwrote another
//   B  Act One is intact: nothing the city built lands in the reserved rect,
//      Mama's door is clear, and a walker can get from the door to her street
//   C  the river is not drivable, and BOTH bridges are
//   D  a car can get from Mama's street to the courthouse steps
//   E  a car can get from downtown up to Bastroux
//
// C, D and E are flood fills over the blocker grid at vehicle radius, because
// "I put a road there" and "you can drive there" are different claims.
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const FILL = `
  // A flood fill over the blocker grid. STEP is the cell size, R the radius of
  // the thing trying to move (0.6 player, 1.8 vehicle).
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
    // Free roam parks cars and walks pedestrians about, so an exact start cell
    // is not reliably clear: take the nearest free one within a few metres.
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
      W, H, free, idx, nearestFree,
      /** Can you get from a to b? Returns the reached-cell count, or null if the start is walled in. */
      reaches(ax, az, bx, bz) {
        const s = nearestFree(...idx(ax, az), Math.ceil(6 / STEP));
        const t = nearestFree(...idx(bx, bz), Math.ceil(8 / STEP));
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
        return { ok: !!seen[t[0] * H + t[1]], reached: n, of: free.reduce((a, b) => a + b, 0) };
      },
      /** Is a single point blocked for something of radius R? */
      blockedAt(x, z) {
        const [i, j] = idx(x, z);
        if (i < 0 || j < 0 || i >= W || j >= H) return null;
        return !free[i * H + j];
      },
    };
  }
`;

export default async function run(page) {
  const log = { checks: [] };
  // `detail` goes in its own key, NOT spread. Spreading it let a measurement
  // that carries its own `ok` field overwrite the verdict — the river check
  // reported a failure for a fill whose ok:false WAS the pass.
  const ok = (name, pass, detail) => log.checks.push({ name, ok: !!pass, detail });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 300000 });
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.tusouxroe, null, { timeout: 60000 });
  await page.waitForTimeout(1200);

  // ---- A: what the composer says it built ---------------------------------
  log.report = await inPage(page, `
    const T = window.__game.tusouxroe, r = T.report();
    return {
      stages: r.stages, built: r.built, rejected: r.rejected, trees: r.trees,
      siteOverlaps: r.siteOverlaps,
      clusters: r.clusters, focal: r.focal,
      bounds: T.BOUNDS, actOneRect: T.ACT_ONE,
      lanes: T.lanes.length, pois: T.pois.length,
      minimap: { roads: T.minimap.roads.length, buildings: T.minimap.buildings.length,
                 water: T.minimap.water.length, areas: T.minimap.areas.length },
      zones: T.zoneRects.map(([n]) => n),
      area: Math.round((T.BOUNDS.x1 - T.BOUNDS.x0) * (T.BOUNDS.z1 - T.BOUNDS.z0)),
    };
  `);
  const R = log.report;
  const conflicts = (R.stages || []).reduce((a, s) => a + (s.conflicts || 0), 0);
  ok("no stage built over another", conflicts === 0, { conflicts });
  // A site() that overlaps a road only warns at load, and nobody reads the load
  // log: this is the check that a park is not quietly paved over.
  ok("no reserved site overlaps anything", R.siteOverlaps === 0, { siteOverlaps: R.siteOverlaps });
  ok("the metro is the biggest district", R.area > 150000, { area_m2: R.area });
  ok("downtown got built", R.built >= 40, { buildings: R.built });

  // ---- B: Act One is intact ----------------------------------------------
  log.actOne = await inPage(page, `
    const g = window.__game, T = g.tusouxroe;
    const A = T.ACT_ONE, door = g.mamaDoor, home = g.mamaHouse;
    const inside = (r) => r.x1 > A.x0 && r.x0 < A.x1 && r.z1 > A.z0 && r.z0 < A.z1;
    // every footprint the city recorded, against the reserved rect
    const trespass = T.minimap.buildings.filter(inside);
    // and how clear the door itself is
    let nearest = Infinity;
    g.blockerGrid.near(door.x, door.z, 8, (b) => {
      const d = Math.hypot(b.x - door.x, b.z - door.z) - b.r;
      if (d < nearest) nearest = d;
    });
    return {
      reserved: A, door, home, trespass: trespass.length, trespassers: trespass.slice(0, 4),
      nearestBlockerToDoor: +nearest.toFixed(2),
      doorInsideReserved: door.x > A.x0 && door.x < A.x1 && door.z > A.z0 && door.z < A.z1,
    };
  `);
  ok("nothing the city built is in Act One's footprint", log.actOne.trespass === 0, { trespass: log.actOne.trespass, examples: log.actOne.trespassers });
  ok("Mama's door is inside the reserved rect", log.actOne.doorInsideReserved === true, { door: log.actOne.door });
  ok("Mama's door is not walled in", log.actOne.nearestBlockerToDoor > 0.6, { nearestBlocker: log.actOne.nearestBlockerToDoor });

  // Keseme has to be able to walk from the door to her street.
  log.walkToStreet = await inPage(page, `
    ${FILL}
    const g = window.__game, A = g.tusouxroe.ACT_ONE, door = g.mamaDoor;
    const f = makeFill(g, { x0: A.x0 - 4, x1: A.x1 + 4, z0: A.z0 - 4, z1: A.z1 + 4 }, 0.5, 0.6);
    // her street is at actone's STREET_Z, 13 m south of the door
    return f.reaches(door.x, door.z - 1.2, door.x, door.z - 13);
  `);
  ok("a walker gets from Mama's door to her street", log.walkToStreet.ok === true, log.walkToStreet);

  // ---- C: the river, and the two bridges ---------------------------------
  // Mid-channel is open water, so "is this cell blocked" proves nothing — it is
  // meant to be clear, you are just meant not to be able to GET there. Both of
  // these are reachability, and each bridge gets its own z-band so the fill
  // cannot sneak across at the other one and still pass.
  log.river = await inPage(page, `
    ${FILL}
    const g = window.__game, T = g.tusouxroe, B = T.BOUNDS;
    // town-local -> world, the same two numbers tusouxroe.js uses
    const ox = B.x0 + 130, oz = B.z0 + 572;
    const wx = (x) => ox + x, wz = (z) => oz + z;
    // from Riverside Drive out into the channel, midway between the bridges
    const band = (zc, h) => ({ x0: wx(-34), x1: wx(40), z0: wz(zc - h), z1: wz(zc + h) });
    const wide = makeFill(g, band(-300, 44), 1, 1.8);
    const intoWater = wide.reaches(wx(32), wz(-300), wx(3), wz(-300));
    const across = [
      { name: "Louisville", r: makeFill(g, band(-230, 26), 1, 1.8).reaches(wx(-24), wz(-230), wx(30), wz(-230)) },
      { name: "Cypress", r: makeFill(g, band(-360, 26), 1, 1.8).reaches(wx(-24), wz(-360), wx(30), wz(-360)) },
    ];
    return { intoWater, across };
  `);
  log.bankProfile = await inPage(page, `
    const g = window.__game, B = g.tusouxroe.BOUNDS;
    const ox = B.x0 + 130, oz = B.z0 + 572;
    const wx = (x) => ox + x, wz = (z) => oz + z;
    const R = 1.8;
    const blk = (x, z) => { let bad = 0; g.blockerGrid.near(x, z, R + 3, (b) => { if ((b.x-x)**2 + (b.z-z)**2 < (b.r+R)**2) bad = 1; }); return bad; };
    const rows = {};
    for (const lz of [-300, -280, -320]) {
      let row = "";
      for (let lx = -34; lx <= 40; lx++) row += blk(wx(lx), wz(lz)) ? "#" : ".";
      rows["z" + lz] = row;
    }
    let onBank = 0;
    for (let lz = -349; lz <= -241; lz += 4) {
      g.blockerGrid.near(wx(14), wz(lz), 0.5, (b) => { if (Math.abs(b.x - wx(14)) < 0.5 && Math.abs(b.z - wz(lz)) < 0.5) onBank++; });
    }
    return { legend: "local x -34..40, # = blocked for a car", rows, eastBankBlockersFound: onBank, expected: 28 };
  `);
  ok("you cannot drive off the bank into the river", log.river.intoWater.ok === false, log.river.intoWater);
  for (const a of log.river.across) ok(`you can drive over the ${a.name} bridge`, a.r.ok === true, a.r);

  // ---- D & E: the city connects ------------------------------------------
  log.drive = await inPage(page, `
    ${FILL}
    const g = window.__game, T = g.tusouxroe, B = T.BOUNDS;
    const ox = B.x0 + 130, oz = B.z0 + 572;
    const wx = (x) => ox + x, wz = (z) => oz + z;
    const f = makeFill(g, B, 2, 1.8);
    const court = T.pois.find((p) => p.label && p.label.indexOf("Courthouse") >= 0);
    const door = g.mamaDoor;
    return {
      courthouse: court || null,
      // out of her street, onto the arterial, up to the courthouse steps
      toCourthouse: f.reaches(door.x, door.z - 14, court ? court.x : wx(62), court ? court.z : wz(-226)),
      // and on north, past the second bridge, to Bastroux main street
      toBastroux: f.reaches(wx(150), wz(-200), wx(82), wz(-490)),
      freeCells: f.free.reduce((a, b) => a + b, 0), cells: f.W * f.H,
    };
  `);
  ok("a car gets from Mama's street to the courthouse", log.drive.toCourthouse.ok === true, log.drive.toCourthouse);
  ok("a car gets from downtown up to Bastroux", log.drive.toBastroux.ok === true, log.drive.toBastroux);

  log.passed = log.checks.filter((c) => c.ok).length;
  log.failed = log.checks.filter((c) => !c.ok).map((c) => c.name);
  return log;
}
