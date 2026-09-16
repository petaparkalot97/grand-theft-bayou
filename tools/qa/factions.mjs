// Headless test of TASK-035 in the running game: Redneck vs Hoodrat turf fights.
//   - zones: the strip frontage (z -40…40) is border_strip; what the border_market box really is
//   - solid territory (the trailer park): a redneck and a hoodrat side by side stay calm
//   - out of the player's sight (> 60 m): a border pair doesn't start fighting
//   - a border pair near the player fights; the loser drops loot, but kills, heat and HP don't move
//   - provoked mid-fight: the NPC drops its rival and turns on the player
//   - budget: many border pairs never take more than MAX_HOSTILE - 2 hostile slots
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/factions.mjs --timeout 300000
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
  const pass = (name, ok, detail = {}) => log.results.push({ name, ok: !!ok, ...detail });
  const js = (body) => inPage(page, `const g = window.__game, q = window.__fq;\n` + body);
  // poll `cond` (a js body returning truthy) for up to `ms`
  const until = async (cond, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await js(cond);
      if (r && !r.error) return { ok: true, ms: Date.now() - t0, r };
      if (r && r.error) return { ok: false, error: r.error };
      await page.waitForTimeout(250);
    }
    return { ok: false, ms };
  };

  const t0 = Date.now();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  log.loadMs = Date.now() - t0;

  // helpers kept on the page
  await js(`
    window.__fq = {
      tag: {},
      clear(x, z, r) {
        for (const e of g.enemies) {
          if (e.dead || Math.hypot(e.spr.position.x - x, e.spr.position.z - z) > r) continue;
          g.npcs.release(e); g.scene.remove(e.spr); e.dead = "gone";
        }
      },
      spawn(name, kind, x, z, hp) {
        const e = g.spawnEnemy(kind, x, z);
        if (hp) e.hp = hp;
        this.tag[name] = e;
        return e;
      },
      view(name) {
        const e = this.tag[name];
        return { state: e.state, dead: !!e.dead, hp: e.hp,
          rival: e.rivalTarget ? Object.keys(this.tag).find((k) => this.tag[k] === e.rivalTarget) : null,
          x: +e.spr.position.x.toFixed(1), z: +e.spr.position.z.toFixed(1) };
      },
      drop(names) { for (const n of names) { const e = this.tag[n]; if (e && !e.dead) { g.npcs.release(e); g.scene.remove(e.spr); e.dead = "gone"; } } },
      dropCalls: 0,
    };
    const orig = g.loot.dropFor;
    g.loot.dropFor = function (npc) { window.__fq.dropCalls++; return orig.call(this, npc); };
    return true;`);

  // ---- 1. zones ----
  const zones = await js(`
    const count = (x0, x1, dx, z0, z1, dz) => {
      const c = {};
      for (let x = x0; x <= x1; x += dx) for (let z = z0; z <= z1; z += dz) {
        const k = g.spawnZones.zoneAt(x, z); c[k] = (c[k] || 0) + 1;
      }
      return c;
    };
    return { strip: count(4, 30, 2, -40, 40, 4), market: count(115, 180, 5, -30, 50, 10),
             trailerPark: g.spawnZones.zoneAt(-48, 116), stripPoint: g.spawnZones.zoneAt(10, 0) };`);
  pass("zones: the strip frontage is a border zone, the trailer park is not",
    zones.stripPoint === "border_strip" && zones.trailerPark === "residential" && (zones.strip.border_strip || 0) > 0, zones);

  // ---- 2. solid territory + out of sight ----
  await js(`g.state.hp = 100; g.teleport(-40, 125); q.clear(-40, 125, 90); q.clear(10, 0, 40);
    q.spawn("tpR", "redneck", -50, 112); q.spawn("tpH", "hoodrat", -46, 116);
    q.spawn("farR", "redneck", 8, 0); q.spawn("farH", "hoodrat", 12, 0);
    return true;`);
  await page.waitForTimeout(5000);
  const calm = await js(`return { tpR: q.view("tpR"), tpH: q.view("tpH"), farR: q.view("farR"), farH: q.view("farH"),
    farDist: Math.hypot(10 - -40, 0 - 125) };`);
  pass("solid territory: a redneck and a hoodrat in the trailer park stay calm",
    calm.tpR.state !== "hostile" && calm.tpH.state !== "hostile", calm);
  pass("out of sight: a border pair 130 m from the player doesn't start a fight",
    calm.farR.state !== "hostile" && calm.farH.state !== "hostile", calm);
  await js(`q.drop(["tpR", "tpH", "farR", "farH"]); return true;`);

  // ---- 3. a border fight near the player ----
  const before = await js(`g.state.hp = 100; g.teleport(6, 24); q.clear(8, 10, 90);
    q.dropCalls = 0;
    q.spawn("r", "redneck", 8, 0); q.spawn("h", "hoodrat", 13, 2);
    return { kills: { ...g.kills }, wanted: g.state.wanted, heat: g.state.heat, hp: g.state.hp };`);
  const engaged = await until(`const r = q.view("r"), h = q.view("h");
    return (r.rival === "h" && h.rival === "r") || r.dead || h.dead ? { r, h } : null;`, 20000);
  pass("border zone: the pair spot each other and target each other", engaged.ok, engaged);
  const settled = await until(`const r = q.view("r"), h = q.view("h"); return r.dead || h.dead ? { r, h } : null;`, 30000);
  // the winner notices on its next decision tick, so give it a moment
  const calmed = await until(`const w = [q.view("r"), q.view("h")].find((v) => !v.dead);
    return !w || w.state !== "hostile" ? { winner: w || null } : null;`, 4000);
  const after = await js(`return { kills: { ...g.kills }, wanted: g.state.wanted, heat: g.state.heat, hp: g.state.hp,
    dropCalls: q.dropCalls, winner: [q.view("r"), q.view("h")].find((v) => !v.dead) || null };`);
  pass("border zone: one of them dies in the fight", settled.ok, settled);
  pass("turf kill: the loser drops loot (loot.dropFor called)", after.dropCalls >= 1, { dropCalls: after.dropCalls });
  pass("turf kill: kill tally, wanted level and heat don't move",
    JSON.stringify(before.kills) === JSON.stringify(after.kills) && after.wanted === before.wanted && after.heat <= before.heat + 1e-6,
    { before, after });
  pass("the player standing nearby isn't touched (HP 100)", after.hp === 100, { hp: after.hp });
  pass("the winner stops fighting once the rival is dead", calmed.ok, { calmed, winner: after.winner });
  await js(`q.drop(["r", "h"]); return true;`);

  // ---- 4. provoked mid-fight ----
  // test 3's kill left a 4 s noise event (r 30) at (10, 2): a fresh pair there just flees
  // and wanders apart, so wait it out and use another stretch of the strip border
  await page.waitForTimeout(4500);
  await js(`g.state.hp = 100; g.teleport(6, -4); q.clear(8, -20, 90);
    q.spawn("pr", "redneck", 8, -28, 1000); q.spawn("ph", "hoodrat", 13, -26, 1000); return true;`);
  const fighting = await until(`const a = q.view("pr"), b = q.view("ph"); return a.rival === "ph" && b.rival === "pr" ? { a, b } : null;`, 20000);
  const setupState = fighting.ok ? null : await js(`return { pr: q.view("pr"), ph: q.view("ph"), hostileCount: g.npcs.hostileCount,
    player: [+g.state.hp, !!g.state.veh], zonePr: g.spawnZones.zoneAt(q.tag.pr.spr.position.x, q.tag.pr.spr.position.z) };`);
  pass("provoke setup: a long fight starts", fighting.ok, { ...fighting, setupState });
  if (fighting.ok) {
    const d0 = await js(`const e = q.tag.pr; g.npcs.provoke(e);
      return Math.hypot(e.spr.position.x - 6, e.spr.position.z + 4);`);
    const turned = await until(`const v = q.view("pr"); return v.state === "hostile" && v.rival === null ? v : null;`, 5000);
    await page.waitForTimeout(1500);
    const d1 = await js(`const e = q.tag.pr; return Math.hypot(e.spr.position.x - 6, e.spr.position.z + 4);`);
    pass("provoked mid-fight: the NPC drops its rival and comes for the player", turned.ok && d1 < d0,
      { turned, distBefore: +d0.toFixed(1), distAfter: +d1.toFixed(1) });
  }
  await js(`q.drop(["pr", "ph"]); g.state.hp = 100; return true;`);

  // ---- 5. hostile budget ----
  await js(`g.teleport(-2, 0); q.clear(8, 0, 90);
    [-30, -18, -6, 6, 18, 30].forEach((z, i) => { q.spawn("br" + i, "redneck", 6, z, 1000); q.spawn("bh" + i, "hoodrat", 10, z, 1000); });
    return true;`);
  await page.waitForTimeout(6000);
  const budget = await js(`let ours = 0;
    for (const [k, e] of Object.entries(q.tag)) if (/^b[rh]\\d$/.test(k) && !e.dead && e.state === "hostile") ours++;
    return { ours, hostileCount: g.npcs.hostileCount };`);
  pass("budget: turf fights hold at most MAX_HOSTILE - 2 (5) slots, and do start",
    budget.ours >= 2 && budget.ours <= 5 && budget.hostileCount <= 7, budget);
  await js(`q.drop(Object.keys(q.tag).filter((k) => /^b[rh]\\d$/.test(k))); return true;`);
}
