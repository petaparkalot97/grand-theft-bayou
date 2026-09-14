// Headless test of the GTA-style radar (src/minimap.js).
//   - it builds and draws (roads show up as bright pixels)
//   - it turns with the camera: N at the top facing north, on the left facing east
//   - the player arrow points where the player faces, relative to the camera
//   - free-roam blips: every untaken gas can plus the truck; a story waypoint pins to the rim
//   - it zooms out with speed
//   - screenshots: Chatboro on foot, the strip facing east, OrleaRouge, driving Hwy 9, Blue Light's waypoint
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/minimap.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./mm).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const log = { results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "mm";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game;
    const wrap = (a) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
    const faceBearing = (deg) => { const h = Math.atan2(Math.sin(deg * Math.PI / 180), -Math.cos(deg * Math.PI / 180)); g.camCtl.addYaw(wrap((h - Math.PI) - g.camCtl.yaw)); };
    ` + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  const drawn = await js(`const c = document.querySelector("#minimap canvas");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let bright = 0, painted = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) painted++; if (d[i] > 140 && d[i + 1] > 140 && d[i + 2] > 120) bright++; }
    return { state: g.minimap.state, painted, bright, visible: getComputedStyle(document.getElementById("minimap")).display !== "none" };`);
  pass("radar builds and draws roads", drawn.state.built && drawn.visible && drawn.painted > 20000 && drawn.bright > 300, drawn);

  // ---- turning with the camera
  await js(`g.teleport(-6, 120); faceBearing(0); return true;`);
  await page.waitForTimeout(800);
  const north = await js(`return g.minimap.state;`);
  await page.screenshot({ path: `${out}-1-facing-north.png` });
  await js(`faceBearing(90); return true;`);
  await page.waitForTimeout(800);
  const east = await js(`return g.minimap.state;`);
  await page.screenshot({ path: `${out}-2-facing-east.png` });
  const R = 95;
  pass("N sits at the top when the camera faces north", north.north[1] < R - 60 && Math.abs(north.north[0] - R) < 12, { north: north.north });
  pass("N moves to the left when the camera faces east", east.north[0] < R - 60 && Math.abs(east.north[1] - R) < 12, { north: east.north });

  // ---- player arrow: walk forward, then turn the camera 90° without walking
  await js(`faceBearing(0); return true;`);
  await page.waitForTimeout(700);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(900); await page.keyboard.up("KeyW");
  await page.waitForTimeout(300);
  const walking = await js(`return g.minimap.state;`);
  await js(`g.camCtl.addYaw(-Math.PI / 2); return true;`);   // camera turns right 90°
  await page.waitForTimeout(800);
  const turned = await js(`return g.minimap.state;`);
  const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 540) % 360 - 180);
  pass("arrow points up after walking where the camera looks", Math.abs(deg(walking.arrow)) < 15, { arrowDeg: deg(walking.arrow) });
  pass("arrow turns left 90° when the camera turns right 90°", Math.abs(deg(turned.arrow) + 90) < 15, { arrowDeg: deg(turned.arrow) });

  // ---- blips
  const blips = await js(`return { state: g.minimap.state, cans: g.cans.filter((c) => !c.userData.taken).length };`);
  pass("free roam shows every untaken can and the truck", blips.state.blips >= blips.cans + 1, { blips: blips.state.blips, cans: blips.cans });
  await js(`g.blueLight.start(); return true;`);
  await page.waitForTimeout(800);
  const wp = await js(`return { state: g.minimap.state, waypoint: g.blueLight.waypoint };`);
  pass("a far story waypoint pins to the rim", wp.waypoint && wp.state.pinned >= 1, wp);
  await page.screenshot({ path: `${out}-3-waypoint.png` });

  // ---- zoom out with speed
  const zoom0 = await js(`return g.minimap.state.zoom;`);
  await js(`const s = g.westParish.samples, i = Math.floor(s.length * 0.4), p = s[i], q = s[i + 1];
    const v = g.vehicles.find((x) => !x.sheriff && !x.traffic && !x.dead && x.def);
    const h = Math.atan2(q.x - p.x, q.z - p.z);
    g.teleport(p.x, p.z); v.obj.position.x = p.x; v.obj.position.z = p.z; v.heading = h; v.obj.rotation.y = h; v.speed = 0;
    v.blocker.x = p.x; v.blocker.z = p.z; g.state.veh = v; g.player.visible = false; window.__v = v; return true;`);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(2500);
  const zoom1 = await js(`return { zoom: g.minimap.state.zoom, speed: window.__v.speed };`);
  await page.screenshot({ path: `${out}-4-driving-hwy9.png` });
  await page.keyboard.up("KeyW");
  pass("radar zooms out at speed", zoom1.zoom < zoom0 - 0.2, { zoomOnFoot: +zoom0.toFixed(2), zoomDriving: +zoom1.zoom.toFixed(2), speed: +zoom1.speed.toFixed(1) });

  // ---- the city
  await page.keyboard.press("KeyF");
  await js(`g.teleport(-26, 262); faceBearing(0); return true;`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-5-orlearouge.png` });
}
