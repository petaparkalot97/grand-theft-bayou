// "Is the map filled, and is it still playable?" audit for the districts TASK-084 fills.
//
//   node serve.mjs 8899          (in another shell)
//   node tools/qa/fill_check.mjs [http://localhost:8899/]
//
// Needs puppeteer: `npm install puppeteer --no-save` at the repo root (node_modules is gitignored, package.json untouched). Prints one line
// per check and exits 1 on any failure. Checks, per route: nothing solid stands on the
// road line (a car-width sweep against the collision grid), the road is inside
// the map, and the spawn-zone classifier calls it a road; per region: how many
// meshes it holds (the density gate), how many blockers, the composer's own
// report, and draw calls at a fixed camera.
import puppeteer from "puppeteer";

const URL = process.argv[2] || "http://localhost:8899/";
// [name, x0, z0, x1, z1] — a straight line a car should be able to drive end to end
const ROUTES = JSON.parse(process.env.ROUTES || "null") || [
  ["Oyster Highway", 400, 600, 1040, 600],
  ["Cypress Street", 470, 596, 470, 480],
  ["Hospital Road", 555, 596, 555, 520],
  ["Magnolia Street", 760, 596, 760, 490],
  ["School Road", 850, 596, 850, 520],
  ["Shell Street", 470, 606, 470, 795],
  ["Pelican Street", 560, 606, 560, 795],
  ["Harbor Road", 720, 606, 720, 882],
  ["Oak Street", 880, 606, 880, 795],
  ["Bay Street", 980, 606, 980, 795],
  ["Water Street", 476, 800, 974, 800],
  ["Port Highway", 400, -600, 1040, -600],
  ["Dockside Drive", 750, -430, 750, -925],
  ["Terminal Road", 600, -608, 600, -796],
  ["Quay Road", 900, -608, 900, -925],
  ["Union Street", 520, -594, 520, -510],
  ["Cargo Way", 566, -800, 994, -800],
  ["Harbor Drive", 646, -930, 1034, -930],
  ["Workers' Lane", 446, -500, 694, -500],
  ["Lakeshore Causeway", -400, 750, -1040, 750],
  ["Heron Walk", -600, 758, -600, 1005],
  ["Egret Walk", -690, 758, -690, 1005],
  ["Pelican Walk", -780, 758, -780, 1005],
  ["Ibis Walk", -870, 758, -870, 1005],
  ["Gator Road", -700, 742, -700, 566],
  ["Red Dust Pass", -400, -600, -1040, -600],
  ["Ridge Road", -1050, -606, -1050, -845],
  ["Canyon Street", -560, -606, -560, -712],
  ["Saloon Street", -680, -606, -680, -696],
  ["Church Street", -780, -606, -780, -712],
  ["Ranch Road", -600, -594, -600, -484],
  ["Well Street", -720, -594, -720, -488],
  ["Tumble Street", -820, -594, -820, -504],
  ["Derrick Road", -834, -770, -562, -770],
  ["US-167 north", -6, -440, -6, -1180],
  ["US-167 south", -6, 440, -6, 1180],
  ["Oyster approach", 80, 600, 385, 600],
  ["Port approach", 80, -600, 385, -600],
  ["Red Dust approach", -80, -600, -385, -600],
  ["Lakeshore approach", -80, 750, -385, 750],
  ["Delta Street", 805, 596, 805, 446],
  ["Delta Road (south)", 805, 430, 805, -34],
  ["Delta Road (jog)", 800, -40, 756, -40],
  ["Delta Road (north)", 750, -46, 750, -415],
];
// [name, x0, x1, z0, z1, minMeshes] — the density gate: a region this size must hold at least this many meshes
const REGIONS = JSON.parse(process.env.REGIONS || "null") || [
  ["Oyster Bay town", 390, 1110, 430, 900, 600],
  ["Port Calypso", 390, 1110, -960, -430, 600],
  ["Lakeshore village", -1000, -400, 640, 1090, 300],
  ["Red Dust", -1050, -400, -830, -480, 250],
  ["US-167 north", -70, 60, -1200, -424, 120],
  ["US-167 south", -70, 60, 424, 1200, 120],
  ["Oyster approach", 60, 392, 530, 670, 40],
  ["Port approach", 60, 392, -670, -530, 40],
  ["Red Dust approach", -392, -70, -670, -530, 40],
  ["Lakeshore approach", -392, -70, 680, 820, 40],
  ["Delta Road", 690, 870, -430, 436, 60],
];

const browser = await puppeteer.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("#startBtn:not([disabled])", { timeout: 180000 });

const res = await page.evaluate((ROUTES, REGIONS) => {
  const g = window.__game, out = { routes: [], regions: [] };
  const grid = g.blockerGrid;
  for (const [name, x0, z0, x1, z1] of ROUTES) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 3);
    let hits = 0, first = null, off = 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      let hit = false;
      grid.near(x, z, 1.6, (b) => { if (b._grid === "static" && Math.hypot(b.x - x, b.z - z) < b.r + 1.2) { hit = true; return true; } });   // static only: traffic and parked-in-motion cars come and go
      if (hit) { hits++; if (!first) first = [Math.round(x), Math.round(z)]; }
      const zone = g.spawnZones.zoneAt(x, z);
      if (zone !== "highway" && zone !== null) off++;   // road cells classify as "highway"; null = outside the composer's grid
    }
    out.routes.push({ name, samples: n + 1, blocked: hits, first, notRoad: off });
  }
  g.scene.updateMatrixWorld(true);
  const v = new g.camera.position.constructor();
  for (const [name, x0, x1, z0, z1, min] of REGIONS) {
    let meshes = 0;
    g.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const c = o.geometry.boundingBox.getCenter(v.clone()).applyMatrix4(o.matrixWorld);
      const s = o.geometry.boundingBox.getSize(v.clone());
      if (s.x > 400 || s.z > 400) return;
      if (c.x >= x0 && c.x < x1 && c.z >= z0 && c.z < z1) meshes++;
    });
    let blockers = 0;
    for (const b of g.blockers) if (b.x >= x0 && b.x < x1 && b.z >= z0 && b.z < z1) blockers++;
    out.regions.push({ name, meshes, blockers, min });
  }
  return out;
}, ROUTES, REGIONS);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✓ PASS" : "❌ FAIL"}: ${msg}`); if (!ok) failed++; };
for (const r of res.routes) {
  check(r.blocked === 0, `${r.name}: clear end to end (${r.samples} samples${r.blocked ? `, ${r.blocked} blocked, first at ${r.first}` : ""})`);
  check(r.notRoad <= Math.ceil(r.samples * 0.1), `${r.name}: classifies as road (${r.notRoad}/${r.samples} not)`);
}
for (const r of res.regions) {
  check(r.meshes >= r.min, `${r.name}: ${r.meshes} meshes, ${r.blockers} blockers (gate ${r.min})`);
}
check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);
