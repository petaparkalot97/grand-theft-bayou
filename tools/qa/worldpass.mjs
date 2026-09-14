// Headless test of the world cleanup pass (message 6):
//   - Popeyes: exactly two, far apart, one on the strip and one in OrleaRouge
//   - loot: killing NPCs rolls drops; cash and weapon pickups exist on the ground,
//     walking over them adds cash / swaps the weapon; the weapon's numbers drive fire()
//   - drop rates over many rolls match the tables (hogs drop nothing)
//   - world time: dusk follows the clock, isNight(), setTime; weather multiplies fog
//   - the Designersoup cars: parked close-ups for the flicker/speckle check
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/worldpass.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./wpass).
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
  const out = process.env.SHOT_PREFIX || "wpass";
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game;\n` + body);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  // the title buttons open the character select: confirm the default pick (Keseme Nadia)
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  // ---- Popeyes
  const pop = await js(`const p = g.popeyesPlaced;
    return { count: p.length, places: p.map((q) => [Math.round(q.x), Math.round(q.z)]), apart: p.length === 2 ? Math.round(Math.hypot(p[0].x - p[1].x, p[0].z - p[1].z)) : null,
      inCity: p.map((q) => g.orlea.inCity(q.x, q.z)), locations: g.POPEYES_LOCATIONS.map((l) => l.name) };`);
  pass("exactly two Popeyes, a region apart (one on the strip, one in OrleaRouge)",
    pop.count === 2 && pop.apart > 120 && pop.inCity.filter(Boolean).length === 1, pop);
  await js(`g.teleport(8, 214); g.camCtl.addYaw((Math.PI / 2 - Math.PI) - g.camCtl.yaw); return true;`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}-1-popeyes-orlearouge.png` });

  // ---- drop tables over many rolls (no pickups left behind)
  const rates = await js(`
    const L = g.loot, fake = (type) => ({ type, spr: { position: { x: 5000, z: 5000 } } });
    const tally = {};
    for (const type of ["hoodrat", "redneck", "hog"]) {
      const t = tally[type] = { rolls: 2000, cash: 0, weapon: 0, amounts: {}, rarities: {} };
      for (let i = 0; i < t.rolls; i++) {
        for (const d of L.dropFor(fake(type))) {
          t[d.kind]++;
          if (d.kind === "cash") t.amounts[d.amount] = (t.amounts[d.amount] || 0) + 1;
          else { const r = g.arsenal.WEAPONS[d.id].rarity; t.rarities[r] = (t.rarities[r] || 0) + 1; }
        }
        while (L.active.length) L.update(0), L.active.length && (L.active[0].born = -1e9, L.update(0));
      }
    }
    return tally;`);
  const pct = (t, k) => t[k] / t.rolls;
  pass("drop rates follow the tables (hoodrat ~80% cash / ~16% weapon, redneck ~70% / ~24%, hog nothing)",
    Math.abs(pct(rates.hoodrat, "cash") - 0.8) < 0.04 && Math.abs(pct(rates.hoodrat, "weapon") - 0.16) < 0.04 &&
    Math.abs(pct(rates.redneck, "cash") - 0.7) < 0.04 && Math.abs(pct(rates.redneck, "weapon") - 0.24) < 0.04 &&
    rates.hog.cash === 0 && rates.hog.weapon === 0, { rates });

  // record every loot roll main.js makes (killEnemy calls loot.dropFor on this same object)
  await js(`const orig = g.loot.dropFor.bind(g.loot); window.__rolls = [];
    g.loot.dropFor = (e) => { const r = orig(e); window.__rolls.push({ npc: e, drops: r.map((d) => d.kind) }); return r; }; return true;`);

  // ---- a real kill: shoot a civilian until it drops and its loot table rolls
  await js(`window.__qaAim = true; g.teleport(-6, 100); return true;`);
  await page.waitForTimeout(2500);
  const kill = await js(`
    const p = g.player.position;
    let best = null, bd = 1e9;
    for (const e of g.enemies) { if (e.dead || e.type === "hog") continue; const d = Math.hypot(e.spr.position.x - p.x, e.spr.position.z - p.z); if (d < bd) { bd = d; best = e; } }
    if (!best) return null;
    window.__victim = best;
    g.teleport(best.spr.position.x + 3, best.spr.position.z);
    const h = Math.atan2(best.spr.position.x - (best.spr.position.x + 3), 0);
    g.camCtl.addYaw((h - Math.PI) - g.camCtl.yaw);
    return { type: best.type, hp: best.hp, cashBefore: g.state.cash, activeBefore: g.loot.active.length };`);
  let killed = false;
  for (let i = 0; i < 12 && kill; i++) {
    await js(`const e = window.__victim, p = g.player.position;
      const h = Math.atan2(e.spr.position.x - p.x, e.spr.position.z - p.z); g.camCtl.addYaw((h - Math.PI) - g.camCtl.yaw); return true;`);
    await page.waitForTimeout(250);
    await page.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; c.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })); });   // fire is the left mouse button now (Space jumps)
    await page.waitForTimeout(500);
    if (await js(`return !!window.__victim.dead;`)) { killed = true; break; }
  }
  const roll = await js(`const r = window.__rolls.find((x) => x.npc === window.__victim); return r ? { drops: r.drops, calls: window.__rolls.length } : null;`);
  pass("shooting an NPC kills it and its loot table rolls", kill && killed && roll, { kill, roll });

  // ---- pickups, deterministically: known drops a few metres from the player, then walk over them.
  // (A kill's own drops can land at the player's feet and be collected on the spot, which is right
  // for the game but useless for a before/after check.)
  const before = await js(`g.teleport(-6, 134); g.camCtl.addYaw(-g.camCtl.yaw);
    g.state.weapon = "bat"; g.state.ammo = Infinity; g.arsenal.render();
    g.loot.dropAt("cash", -6, 130.5, { amount: 50 });
    g.loot.dropAt("weapon", -6, 127.5, { id: "tec9", rounds: 48 });
    return { cash: g.state.cash, weapon: g.state.weapon };`);
  await page.waitForTimeout(400);
  const waiting = await js(`return g.loot.active.filter((d) => Math.abs(d.x + 6) < 0.1 && (Math.abs(d.z - 130.5) < 0.1 || Math.abs(d.z - 127.5) < 0.1)).length;`);
  for (const z of [130.5, 127.5]) {
    await js(`g.teleport(-6, ${z}); return true;`);
    await page.waitForTimeout(500);
  }
  const after = await js(`return { cash: g.state.cash, weapon: g.state.weapon, ammo: g.state.ammo, reserve: g.state.reserve.tec9, hud: document.getElementById("weaponHud").textContent, cashHud: document.getElementById("cash").textContent,
    left: g.loot.active.filter((d) => Math.abs(d.x + 6) < 0.1 && (Math.abs(d.z - 130.5) < 0.1 || Math.abs(d.z - 127.5) < 0.1)).length };`);
  pass("walking over drops collects them: +$50 on the HUD, the Tec-9 swapped in with 32/16 rounds",
    waiting === 2 && after.cash === before.cash + 50 && after.weapon === "tec9" && after.ammo === 32 && after.reserve === 16 && after.left === 0 &&
    after.cashHud === "$" + after.cash.toLocaleString() && after.hud === "Tec-9 · 32/16",
    { before, waiting, after });

  // ---- the new weapon drives fire()
  // fire is one shot per press: six taps 180 ms apart all fire with the Tec-9's 0.13 s
  // cooldown, where the 9mm's 0.42 s would swallow about half of them
  const w = await js(`return { weapon: g.state.weapon, ammo: g.state.ammo, stats: g.arsenal.stats(false) };`);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const c = [...document.querySelectorAll("canvas")].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; c.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })); });   // fire is the left mouse button now (Space jumps)
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(200);
  const shot = await js(`return { ammo: g.state.ammo, reserve: g.state.reserve.tec9, hud: document.getElementById("weaponHud").textContent };`);
  await js(`window.__qaAim = false; return true;`);
  const spent = w.ammo - shot.ammo;
  pass("firing uses the picked-up weapon (six taps at 180 ms all fire, rounds spent, HUD count)",
    w.weapon === "tec9" && w.stats.cooldown < 0.18 && spent === 6 && shot.hud === "Tec-9 · " + shot.ammo + "/16", { w, shot, spent });

  // ---- what drops look like: a showcase on the open highway at spawn, the camera north of the player
  await js(`g.teleport(-6, 134); g.camCtl.addYaw(-g.camCtl.yaw);
    g.loot.dropAt("cash", -7.5, 129.5, { amount: 50 });
    g.loot.dropAt("weapon", -5.8, 129.2, { id: "tec9" });
    g.loot.dropAt("weapon", -4.1, 129.5, { id: "sawnoff" });
    g.loot.dropAt("weapon", -6.6, 127.4, { id: "deerRifle" });
    return true;`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}-2-loot-on-ground.png` });

  // ---- a gas can and its glow column: the one moved into the open by the road (3, -50), from the chase
  // camera 8 m south of it, looking north
  await js(`const c = g.cans.reduce((b, x) => (Math.hypot(x.position.x - 3, x.position.z + 50) < Math.hypot(b.position.x - 3, b.position.z + 50) ? x : b));
    c.userData.taken = false; c.visible = true; g.teleport(c.position.x, c.position.z + 8); g.camCtl.addYaw(-g.camCtl.yaw); return true;`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}-3-gas-can.png` });

  // ---- world time + weather
  const clock = await js(`const t0 = g.worldTime.getCurrentTime(), dusk0 = g.state.dusk;
    const fog0 = g.scene.fog.density;
    g.worldTime.setTime(23);
    return { t0, dusk0: +dusk0.toFixed(3), label: g.worldTime.label(), night: g.worldTime.isNight() };`);
  await page.waitForTimeout(600);
  const late = await js(`return { dusk: +g.state.dusk.toFixed(3), fog: +g.scene.fog.density.toFixed(5) };`);
  await js(`g.weather.set("fog", { seconds: 0 }); return true;`);
  await page.waitForTimeout(600);
  const foggy = await js(`return { type: g.weather.type, fog: +g.scene.fog.density.toFixed(5), mult: g.weather.fogMultiplier };`);
  await js(`g.worldTime.setTime(12); return true;`);
  await page.waitForTimeout(600);
  const noon = await js(`return { dusk: +g.state.dusk.toFixed(3), night: g.worldTime.isNight() };`);
  await js(`g.weather.set("clear", { seconds: 0 }); g.worldTime.setTime(18.5); return true;`);
  pass("the clock drives dusk (18:30 → 0, 23:00 → night 1, noon → 0) and isNight()",
    clock.t0.hour === 18 && clock.night === true && late.dusk === 1 && noon.dusk === 0 && noon.night === false, { clock, late, noon });
  pass("weather multiplies fog (fog weather ≈ 3×)", foggy.type === "fog" && Math.abs(foggy.fog / late.fog - 3) < 0.05, { late, foggy });

  // ---- Designersoup cars parked close: speckle check screenshots
  const models = await js(`const seen = new Map(); for (const v of g.vehicles) if (v.def && !seen.has(v.def.name)) seen.set(v.def.name, v);
    window.__m = [...seen.entries()]; return window.__m.map(([n]) => n);`);
  for (let i = 0; i < models.length; i++) {
    if (!/Beatall|Landyroamer|docLorean|Toyoyo|Tristar|Car_1_R/.test(models[i])) continue;
    await js(`const v = window.__m[${i}][1]; g.teleport(-6, 30);
      const c = v.obj.clone(true); c.visible = true; c.position.set(6.5, v.obj.position.y, 70); c.rotation.set(0, Math.PI / 2, 0);
      g.scene.add(c); window.__pc = c; g.cine.shot({ from: [6.5, 2.0, 76], look: [6.5, 0.8, 70], dur: 0.1 }); return true;`);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${out}-car-${models[i].replace(/\s+/g, "_")}.png` });
    await js(`g.scene.remove(window.__pc); g.cine.releaseCamera(); return true;`);
  }
  log.models = models;
}
