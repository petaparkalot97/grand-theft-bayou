// Headless check of klan.js — TASK-066, the answer to nolantis.js's anonymous
// caller. Verifies that they never turn up on their own, that the night ride on
// Emiko's lawn stages and turns hostile, that clearing the mob ends the beat and
// puts the cross out, and that Hoodrats square up to them while Rednecks do not.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/klan.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./klan).
//
// Two things this script has to work around, neither of which is a bug in the
// game and both of which cost a rewrite to find:
//   * A six-strong hostile mob kills Keseme in well under a minute, and death
//     runs endScreen() → state.running = false → the whole sim stops, klan.js
//     and factions.js with it. Healing afterwards does not undo it, so the
//     player is healed on a tight interval and kept clear of the turf staging.
//   * Killing NPCs in bulk trips main.js's heat escalation cutscene, and a
//     running cutscene pauses the sim too. Esc after any mass kill.
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

// `paused` matters as much as `hp`: Esc toggles main.js's pause menu, and a
// paused game skips simulate() — klan.update, the NPC think ticks and the
// faction tick with it. Spamming Esc to clear cutscenes was quietly pausing the
// run and making a live mob look like six idle men.
const HEAL = `const g = window.__game;
  g.state.hp = 100; g.state.sp = 100; g.state.paused = false;
  return { running: g.state.running, paused: g.state.paused };`;

const SNAP = `
  const g = window.__game;
  const k = g.klan;
  const robes = g.enemies.filter((e) => e.type === "klansman");
  const states = {};
  for (const e of robes) if (!e.dead) states[e.state] = (states[e.state] || 0) + 1;
  return {
    simRunning: g.state.running, running: k.running, fires: k.debug.fires,
    klansmen: robes.length, alive: robes.filter((e) => !e.dead).length, states,
    officers: robes.filter((e) => e.officer).length,
    hostileCount: g.npcs.hostileCount,
    objective: (function () { const el = document.getElementById("objective");
      return el ? el.textContent.trim().slice(0, 80) : null; })(),
    hour: +g.worldTime.hours.toFixed(2),
    perf: { calls: g.perf.calls, tris: g.perf.tris },
  };
`;

/** Wait `secs`, healing every 700 ms so a brawl never reaches the end screen. */
async function survive(page, secs) {
  for (let t = 0; t < secs * 1000; t += 700) {
    await page.waitForTimeout(700);
    await inPage(page, HEAL);
  }
}

/** Esc only while a scene is actually playing, then make sure nothing is paused. */
async function skipCutscene(page) {
  for (let i = 0; i < 6; i++) {
    const active = await inPage(page, `return !!(window.__game && window.__game.cine.active);`);
    if (!active) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  await inPage(page, `window.__game.state.paused = false; return true;`);
}

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "klan";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => {
    const b = document.getElementById("freeBtn");
    return b && !b.disabled;
  }, null, { timeout: 240000 });
  // The menu nests now: root -> "Start Game" -> Story / Free Roam / Multiplayer,
  // so #freeBtn is zero-size until its submenu is open.
  await page.click('[data-menu="start"]');
  await page.waitForTimeout(300);
  await page.click("#freeBtn");
  await skipCutscene(page);
  await page.waitForTimeout(2000);

  // 1. They must not be part of the ambient world. Roam the parish at 02:00
  //    with the spawner running: klansmen stay at zero while the ordinary
  //    night population keeps churning.
  await inPage(page, `window.__game.worldTime.setTime(2); return true;`);
  const stops = [];
  for (const [x, z] of [[100, -100], [-6, -60], [-6, 60], [-26, 270], [-114, 350], [54, 310]]) {
    await inPage(page, `window.__game.teleport(${x}, ${z}); return true;`);
    await survive(page, 3);
    stops.push(await inPage(page, `
      const g = window.__game;
      const alive = g.enemies.filter((e) => !e.dead);
      const kinds = {};
      for (const e of alive) kinds[e.type] = (kinds[e.type] || 0) + 1;
      return { at: [${x}, ${z}], npcs: alive.length, klansmen: kinds.klansman || 0 };
    `));
  }
  log.neverAmbient = {
    totalKlansmenSeen: stops.reduce((n, a) => n + a.klansmen, 0),
    populationWasLive: stops.every((a) => a.npcs > 0),
    stops,
  };

  // 2. The night ride on Emiko's lawn, watched from the street.
  await inPage(page, `
    const g = window.__game;
    g.worldTime.setTime(1.5);
    g.teleport(100, -114);
    return true;
  `);
  await survive(page, 2);
  log.started = await inPage(page, `
    const g = window.__game;
    const r = g.klan.mamaNightRide();
    return { started: !!r, mob: r ? r.mob.length : 0,
             where: r ? [+r.cross.group.position.x.toFixed(1), +r.cross.group.position.z.toFixed(1)] : null };
  `);
  await survive(page, 3);
  log.riding = await inPage(page, SNAP);
  log.crossLit = await inPage(page, `
    const g = window.__game;
    const r = g.klan.debug.ride;
    return r ? { power: +r.cross.light.power.toFixed(1), burningOut: r.cross.out } : { error: "no ride" };
  `);
  await page.screenshot({ path: out + "-1-night-ride.png" });

  // 3. Clear the mob: the beat must end on its own (the `every dead` path).
  await inPage(page, `
    const g = window.__game;
    window.__cross = g.klan.debug.ride.cross;
    for (const e of g.enemies) if (e.type === "klansman" && !e.dead) g.killEnemy(e);
    return true;
  `);
  await survive(page, 2);
  log.clearedItself = await inPage(page, `
    const g = window.__game;
    const r = g.klan.debug.ride;
    return { simRunning: g.state.running, running: g.klan.running, hasRide: !!r,
             stillAliveInMob: r ? r.mob.filter((e) => !e.dead).length : 0,
             crossBurningOut: window.__cross ? window.__cross.out : null,
             objective: document.getElementById("objective").textContent.trim().slice(0, 90) };
  `);
  // the cross burns down and its light goes out, leaving the charred timber
  await survive(page, 7);
  log.crossOut = await inPage(page, `
    const c = window.__cross;
    return { power: c ? +c.light.power.toFixed(2) : null,
             flameVisible: c ? c.mat.visible : null,
             timberStillThere: c ? c.group.visible : null };
  `);
  await page.screenshot({ path: out + "-2-cleared.png" });

  // 4. Turf: a Hoodrat squares up to an unprovoked klansman, a Redneck does not.
  //    Unprovoked on purpose — a klansman already swinging at the player can
  //    never be a turf-fight instigator, and provoking them here would also
  //    saturate MAX_HOSTILE (7) so factions.js could not start anything at all.
  //    Staged 45 m out: inside factions.js's WATCH_RANGE (60) so the turf tick
  //    still considers them, far enough that neither side comes for Keseme.
  const turfCase = async (rival) => {
    // Somewhere quiet, and away from the redneck-heavy residential mix around
    // Emiko's house — two hoodrats dropped in there got jumped by the ambient
    // turf war before this could measure anything.
    await inPage(page, `
      const g = window.__game;
      g.teleport(-6, 20);
      for (const e of g.enemies) if (!e.dead && (e.type === "klansman" || e.type === "${rival}")) g.killEnemy(e);
      return true;
    `);
    await skipCutscene(page);
    await survive(page, 2);
    const set = await inPage(page, `
      const g = window.__game;
      const p = g.player.position;
      const pair = g.klan.callOut(p.x + 2, p.z + 42, 3, { radius: 3, provoke: false });
      const r = [0, 1, 2].map((i) => g.spawnEnemy("${rival}", p.x - 3 + i * 2, p.z + 40));
      return { klansmen: pair.length, rivals: r.filter(Boolean).length, hostileCount: g.npcs.hostileCount };
    `);
    // A turf fight is over in seconds, so poll rather than taking one late
    // snapshot: record the high-water mark of rivals pointed at a klansman.
    let best = { rivalsTargetingAKlansman: 0, klansmenTargetingTheRival: 0 };
    const trace = [];
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(700);
      await inPage(page, HEAL);
      const t = await inPage(page, `
        const g = window.__game;
        const rivals = g.enemies.filter((e) => e.type === "${rival}" && !e.dead);
        const robes = g.enemies.filter((e) => e.type === "klansman" && !e.dead);
        return {
          rivalsTargetingAKlansman: rivals.filter((e) => e.rivalTarget && e.rivalTarget.type === "klansman").length,
          klansmenTargetingTheRival: robes.filter((e) => e.rivalTarget && e.rivalTarget.type === "${rival}").length,
          rivalsAlive: rivals.length, klansmenAlive: robes.length,
          hostileCount: g.npcs.hostileCount,
          // the three gates factions.js applies, so a null result says which one
          turfOn: !!(g.__game_populationOn === undefined ? true : g.__game_populationOn),
          closestPair: (function () {
            let best = 1e9, sa = null, sb = null;
            for (const r of rivals) for (const k of robes) {
              const d = Math.hypot(r.spr.position.x - k.spr.position.x, r.spr.position.z - k.spr.position.z);
              if (d < best) { best = d; sa = r.state; sb = k.state; }
            }
            return best === 1e9 ? null : { d: +best.toFixed(1), rivalState: sa, klanState: sb };
          })(),
          distFromPlayer: (function () {
            const p = g.player.position;
            const k = robes[0];
            return k ? +Math.hypot(k.spr.position.x - p.x, k.spr.position.z - p.z).toFixed(1) : null;
          })(),
        };
      `);
      trace.push(t);
      if (t.rivalsTargetingAKlansman > best.rivalsTargetingAKlansman) best = t;
      if (!best.closestPair && t.closestPair) best.closestPair = t.closestPair;
      if (best.distFromPlayer == null) best.distFromPlayer = t.distFromPlayer;
      if (t.klansmenTargetingTheRival > best.klansmenTargetingTheRival) {
        best.klansmenTargetingTheRival = t.klansmenTargetingTheRival;
      }
    }
    return { set, best, everBothAlive: trace.some((t) => t.rivalsAlive > 0 && t.klansmenAlive > 0) };
  };
  log.hoodratVsKlan = await turfCase("hoodrat");
  log.redneckVsKlan = await turfCase("redneck");
  await page.screenshot({ path: out + "-3-turf.png" });

  return log;
}
