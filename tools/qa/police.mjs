// In-game checks for TASK-020: the Sheriff you can actually get away from.
//
// The module (src/police.js) holds the search / give-up logic; main.js drives the
// cruisers. This drives the real game: raise heat, let a cruiser come, then break
// contact and check the chase ends on its own — and that standing next to one is
// an arrest, not a seven-second death.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/police.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./police).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const log = { steps: [], results: [] };
  try { await tests(page, log); } catch (err) { log.crash = String((err && err.stack) || err); }
  log.passed = log.results.filter((r) => r.ok).length;
  log.failed = log.results.filter((r) => !r.ok).map((r) => r.name);
  return log;
}

async function tests(page, log) {
  const out = process.env.SHOT_PREFIX || "police";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, "const g = window.__game;\n" + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  log.steps.push("free roam running");

  // ---- 1. a chase starts
  await js("g.teleport(-6, 60); g.state.forceCops = true; g.state.heat = 4.3; g.state.wanted = 3; return true;");
  await page.waitForTimeout(3000);
  const chase = await js(`return { cruisers: g.sheriffs.filter((s) => !s.dead).length, wanted: g.state.wanted,
    heat: +g.state.heat.toFixed(2), seen: g.sheriffSees() };`);
  pass("cruisers turn out for a 3-star wanted level", chase.cruisers >= 1, chase);

  // ---- 2. they look like cruisers, not a white pickup with a box on the roof
  const look = await js(`
    const s = g.sheriffs.find((c) => !c.dead);
    if (!s) return { error: "no cruiser" };
    let red = 0, blue = 0, boxes = 0;
    s.obj.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === "BoxGeometry") boxes++;
      if (!o.material) return;
      if (o.material.name === "red beacon") red++;
      if (o.material.name === "blue beacon") blue++;
    });
    return { red, blue, boxes };`);
  pass("the cruiser carries a red/blue lightbar rig", look.red >= 1 && look.blue >= 1, look);

  // the beacons alternate: sample the shared materials twice, ~1/12 s apart
  const flashA = await js(`
    const s = g.sheriffs.find((c) => !c.dead); if (!s) return null;
    let red = null, blue = null;
    s.obj.traverse((o) => { if (o.material && o.material.name === "red beacon") red = o.material.emissiveIntensity;
                            if (o.material && o.material.name === "blue beacon") blue = o.material.emissiveIntensity; });
    return { red, blue };`);
  await page.waitForTimeout(140);
  const flashB = await js(`
    const s = g.sheriffs.find((c) => !c.dead); if (!s) return null;
    let red = null, blue = null;
    s.obj.traverse((o) => { if (o.material && o.material.name === "red beacon") red = o.material.emissiveIntensity;
                            if (o.material && o.material.name === "blue beacon") blue = o.material.emissiveIntensity; });
    return { red, blue };`);
  pass("one beacon is lit at a time (red and blue alternate)",
    flashA && flashB && Math.abs(flashA.red - flashA.blue) > 1 && Math.abs(flashB.red - flashB.blue) > 1,
    { flashA, flashB });

  // Frame the cruiser for a look. It is mid-chase, so hold it still and re-aim at
  // where it actually is right before the shutter: aiming once and waiting photographs
  // the empty street it just left.
  let shot = null;
  for (let i = 0; i < 5; i++) {
    shot = await js(`
      const s = g.sheriffs.find((c) => !c.dead); if (!s) return null;
      // stand it on the open highway: framed where it happens to be, the camera
      // ends up inside whatever building it drove past
      g.teleport(-10, 100);
      s.obj.position.set(-2, 0, 100);
      s.obj.rotation.y = Math.PI * 0.75;
      s.speed = 0;
      g.cine.shot({ from: [4.5, 2.6, 106], look: [-2, 1.1, 100], dur: 0.1 });
      return { at: [+s.obj.position.x.toFixed(1), +s.obj.position.z.toFixed(1)] };`);
    await page.waitForTimeout(260);
  }
  await page.screenshot({ path: `${out}-1-cruiser.png` });
  await js("g.cine.releaseCamera(); return true;");
  log.steps.push(`cruiser shot at ${shot && shot.at}`);

  // ---- 3. contact on foot is an arrest, not a shredder
  const dmg = await js(`
    const s = g.sheriffs.find((c) => !c.dead); if (!s) return { error: "no cruiser" };
    g.state.hp = 100; g.state.bustCd = 0; window.__cop = s;   // the cruiser has been on top of us since the photo
    g.teleport(s.obj.position.x + 3, s.obj.position.z);
    return { hp: g.state.hp };`);
  for (let i = 0; i < 6; i++) {          // hold contact for ~1.8 s, staying inside 4 m
    await js("const s = window.__cop; g.teleport(s.obj.position.x + 3, s.obj.position.z); return true;");
    await page.waitForTimeout(300);
  }
  const afterContact = await js("return { hp: Math.round(g.state.hp), bustCd: +g.state.bustCd.toFixed(2), over: !!g.state.over };");
  // 5 HP/s for ~1.8 s is about 9; the old 14 HP/s would have taken ~25 and the bust
  // (bustCd > 3 s) lands before the health bar ever runs out.
  // ~1.8 s of contact: 5 HP/s costs about 9, the old 14 HP/s would have cost 25.
  // Held any longer this is an arrest (bustCd > 3 s -> busted), which is the point.
  pass("on-foot contact costs about 5 HP/s, not 14",
    dmg && !dmg.error && !afterContact.over && afterContact.hp > 78 && afterContact.hp < 100,
    { before: dmg, after: afterContact });

  // ---- 4. you can lose them
  const lost = await js(`
    g.state.hp = 100; g.state.bustCd = 0;
    g.teleport(-6, 60 - 520);                       // 520 m north, well past COP_SIGHT
    if (g.state.over) return { error: "busted before the escape test" };
    return { wanted: g.state.wanted, heat: +g.state.heat.toFixed(2), cruisers: g.sheriffs.filter((s) => !s.dead).length,
             seen: g.sheriffSees(), givenUp: g.police.hasGivenUp() };`);
  // Poll the escape rather than sampling one instant: the give-up window is 5 s and
  // the heat drains a couple of seconds later, so a single late read misses it.
  const timeline = [];
  let sawGiveUp = false;
  for (let i = 0; i < 32; i++) {
    const t = await js(`return { running: !!g.state.running, over: !!g.state.over, wanted: g.state.wanted,
      heat: +g.state.heat.toFixed(2), givenUp: g.police.hasGivenUp(), seen: g.sheriffSees(),
      cruisers: g.sheriffs.filter((s) => !s.dead).length };`);
    timeline.push({ at: +(i * 0.5).toFixed(1), wanted: t.wanted, heat: t.heat, givenUp: t.givenUp,
                    seen: t.seen, cruisers: t.cruisers, over: t.over });
    if (t.over) break;                     // busted: the sim is frozen, nothing below means anything
    if (t.givenUp) sawGiveUp = true;
    if (t.wanted === 0 && t.cruisers === 0 && sawGiveUp) break;
    await page.waitForTimeout(500);
  }
  pass("out of sight for the give-up window, they stop knowing where you are",
    !lost.error && sawGiveUp && timeline.every((t) => t.seen === false && !t.over), { lost, timeline });
  const end = await js(`return { wanted: g.state.wanted, heat: +g.state.heat.toFixed(2),
    cruisers: g.sheriffs.filter((s) => !s.dead).length, objective: document.getElementById("objective").textContent };`);
  pass("the chase ends on its own: wanted back to 0 without wrecking a cruiser", end.wanted === 0, { end });
  pass("the cruisers stand down and leave", end.cruisers === 0, { end });

  // ---- 5. a fresh crime brings them back
  await js("g.state.heat += 2.6; g.state.crimeCd = 6; return true;");
  await page.waitForTimeout(2500);
  const again = await js(`return { wanted: g.state.wanted, cruisers: g.sheriffs.filter((s) => !s.dead).length };`);
  pass("a new crime starts a new chase", again.wanted >= 1, { again });

  log.perf = await js("return { calls: g.perf.calls, hp: Math.round(g.state.hp) };");
}
