// Headless check of St. Louis No. 1 (cemetery.js) and the Marie Laveau cameo.
// Free roam; teleports to the gate, walks the alleys, forces night, watches the
// ghost appear and move her round, fires a shot at her to check she objects,
// and takes an offering at the Glapion tomb.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/cemetery.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./cem).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

const SNAP = `
  const g = window.__game;
  const cem = g.orlea && g.orlea.cemetery;
  if (!cem) return { error: "no cemetery" };
  const d = cem.debug, gh = d.ghost;
  const p = g.player.position;
  const prompt = document.getElementById("cemeteryPrompt");
  return {
    player: [+p.x.toFixed(1), +p.z.toFixed(1)],
    hour: +g.worldTime.hours.toFixed(2), night: g.worldTime.isNight(),
    presence: +d.presence.toFixed(3),
    ghostVisible: !!(gh && gh.visible),
    ghost: gh ? [+gh.position.x.toFixed(1), +gh.position.y.toFixed(2), +gh.position.z.toFixed(1)] : null,
    prompt: prompt && !prompt.hidden ? prompt.textContent.trim() : null,
    hp: Math.round(g.state.hp), cash: g.state.cash,
    subtitle: (function () { const el = document.getElementById("cineSub");
      return el && el.classList.contains("on") ? el.textContent.trim().slice(0, 90) : null; })(),
    perf: { calls: g.perf.calls, tris: g.perf.tris },
  };
`;

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "cem";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForTimeout(2500);

  log.layout = await inPage(page, `
    const g = window.__game;
    const cem = g.orlea && g.orlea.cemetery;
    if (!cem) return { error: "cemetery not built" };
    const d = cem.debug;
    // how many blockers landed inside the walls, and the narrowest alley a
    // walker (r 0.6) has to get through vs. a car (r 1.8)
    const inWalls = g.blockers.filter((b) => b.x > -135 && b.x < -93 && b.z > 337 && b.z < 363);
    let minGap = 1e9;
    for (let i = 0; i < inWalls.length; i++) {
      for (let j = i + 1; j < inWalls.length; j++) {
        const a = inWalls[i], b = inWalls[j];
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
        if (gap > 0.05 && gap < minGap) minGap = gap;
      }
    }
    return { tomb: d.tomb, offering: d.offering, gate: d.gate, pathLegs: d.path.length,
             gapsPunched: d.gaps.length, blockersInside: inWalls.length,
             tightestGap: +minGap.toFixed(2) };
  `);

  // daylight first: she should not be there
  await inPage(page, `window.__game.worldTime.setTime(13); window.__game.teleport(-114, 341); return true;`);
  await page.waitForTimeout(3000);
  log.day = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-1-day.png" });

  // night: she fades in and starts her round
  await inPage(page, `window.__game.worldTime.setTime(23); return true;`);
  await page.waitForTimeout(4000);
  log.nightAppears = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-2-night-ghost.png" });
  await page.waitForTimeout(6000);
  log.nightMoved = await inPage(page, SNAP);

  // Can a walker get from the gate to her tomb, and can a car not? Flood-fill
  // the block on a 0.25 m grid against the real blocker list, once at the
  // player's radius and once at a car's, and see what each can reach.
  log.reach = await inPage(page, `
    const g = window.__game;
    const d = g.orlea.cemetery.debug;
    const X0 = -138, X1 = -90, Z0 = 330, Z1 = 366, STEP = 0.25;   // the street outside the gate has to be in the grid too
    const W = Math.round((X1 - X0) / STEP), H = Math.round((Z1 - Z0) / STEP);
    function fill(radius, sx, sz) {
      const free = new Uint8Array(W * H);
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < H; j++) {
          const x = X0 + i * STEP, z = Z0 + j * STEP;
          let ok = 1;
          g.blockerGrid.near(x, z, radius + 3, (b) => {
            if (!ok) return;
            if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + radius) ** 2) ok = 0;
          });
          free[i * H + j] = ok;
        }
      }
      const seen = new Uint8Array(W * H);
      // Free roam parks cars and walks pedestrians along this street, so the
      // exact start cell is not reliably clear — take the nearest free one.
      let si = Math.round((sx - X0) / STEP), sj = Math.round((sz - Z0) / STEP);
      if (!free[si * H + sj]) {
        let found = false;
        for (let rad = 1; rad < 40 && !found; rad++) {
          for (let di = -rad; di <= rad && !found; di++) {
            for (let dj = -rad; dj <= rad && !found; dj++) {
              const ni = si + di, nj = sj + dj;
              if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
              if (free[ni * H + nj]) { si = ni; sj = nj; found = true; }
            }
          }
        }
        if (!found) return { start: "blocked", reached: 0, seen };
      }
      const q = [si * H + sj];
      seen[si * H + sj] = 1;
      let n = 0;
      while (q.length) {
        const c = q.pop(); n++;
        const i = (c / H) | 0, j = c % H;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
          const k = ni * H + nj;
          if (seen[k] || !free[k]) continue;
          seen[k] = 1; q.push(k);
        }
      }
      return { start: "open", reached: n, seen };
    }
    const at = (seen, x, z) => {
      const i = Math.round((x - X0) / STEP), j = Math.round((z - Z0) / STEP);
      return !!seen[i * H + j];
    };
    // start just outside the gate, on the street, for both
    const walker = fill(0.6, d.gate.x, d.gate.z - 2.5);   // on the sidewalk, outside the gate
    const car = fill(1.8, d.gate.x, d.gate.z - 2.5);
    return {
      walkerStart: walker.start, carStart: car.start,
      walkerCells: walker.reached, carCells: car.reached,
      walkerReachesOffering: at(walker.seen, d.offering.x, d.offering.z),
      walkerReachesFarAlley: at(walker.seen, d.path[5].x, d.path[5].z),   // the far end of a middle alley
      carReachesOffering: at(car.seen, d.offering.x, d.offering.z),
      carGetsThroughGate: at(car.seen, d.gate.x, d.gate.z + 2.0),
    };
  `);
  await inPage(page, `const g = window.__game; const d = g.orlea.cemetery.debug;
    g.teleport(d.offering.x, d.offering.z - 3); return true;`);
  await page.waitForTimeout(2500);
  log.insideAlleys = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-3-alleys.png" });

  // the offering, at her step
  await inPage(page, `const g = window.__game; g.state.cash = 200; g.state.hp = 40;
    const d = g.orlea.cemetery.debug; g.teleport(d.offering.x, d.offering.z - 0.8); return true;`);
  await page.waitForTimeout(1500);
  log.atStep = await inPage(page, SNAP);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(2500);
  log.afterOffering = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-4-offering.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // a gun going off over her dead: she should object and withdraw
  log.gunshot = await inPage(page, `
    const g = window.__game;
    window.__qaAim = true;                       // fire() wants the aim button held
    if (g.arsenal.give) g.arsenal.give("pistol");
    g.state.ammo = 50; g.state.fireCd = 0;
    window.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    return { fireCd: +g.state.fireCd.toFixed(3), ammo: g.state.ammo };
  `);
  await page.waitForTimeout(1800);
  log.afterGunshot = await inPage(page, SNAP);
  log.scolded = await inPage(page, `const el = document.getElementById("objective");
    return el ? el.textContent.trim().slice(0, 90) : null;`);
  await page.waitForTimeout(6000);
  log.sulking = await inPage(page, SNAP);
  await page.screenshot({ path: out + "-5-after-gunshot.png" });

  return log;
}
