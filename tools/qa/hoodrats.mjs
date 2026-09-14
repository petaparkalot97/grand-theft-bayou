// Headless lineup of the four crew looks from the reference sheets:
//   red man, red woman, blue woman, blue man
// Screenshots: full lineup (front), back view (knots, pocket bandanas, hair),
// faces, and feet. Compare against the GTA-style character sheets.
//
//   node <browser-automation>/browser.mjs http://localhost:8899/ --script tools/qa/hoodrats.mjs
//
// SHOT_PREFIX sets the screenshot path prefix (default: ./hr).
async function inPage(page, body) {
  await page.addScriptTag({
    content: `try { document.body.dataset.r = JSON.stringify((function(){ ${body} })()); }
              catch (e) { document.body.dataset.r = JSON.stringify({ error: String(e && e.stack || e) }); }`,
  });
  return JSON.parse(await page.evaluate(() => document.body.dataset.r || "null"));
}

export default async function run(page) {
  const out = process.env.SHOT_PREFIX || "hr";
  const log = {};
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => { const b = document.getElementById("freeBtn"); return b && !b.disabled; }, null, { timeout: 240000 });
  await page.click("#freeBtn");
  // the title buttons open the character select: confirm the default pick (Keseme Nadia)
  await page.waitForFunction(() => { const s = document.getElementById("characterSelect"); return !s || !s.hidden; }, null, { timeout: 20000 });
  if (await page.$("#characterSelect:not([hidden]) #confirmCharacter")) await page.click("#confirmCharacter");
  await page.waitForFunction(() => window.__game && window.__game.state.running, null, { timeout: 60000 });

  // the game's own module instances (same URLs), plus three for a work light
  await page.addScriptTag({ type: "module", content: `
    import * as THREE from "three";
    import * as C from "/src/characters.js";
    window.__T = THREE; window.__C = C; window.__ready = true;` });
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });

  log.setup = await inPage(page, `
    const g = window.__game, THREE = window.__T, C = window.__C;
    g.teleport(-6, 30);                          // the player out of shot
    const X = 6.5, Z = 70;
    const specs = [["m", "red", 11], ["f", "red", 12], ["f", "blue", 13], ["m", "blue", 14]];
    window.__lineup = specs.map(([sex, crew, seed], i) => {
      const a = C.makeHoodrat({ sex, crew, seed, yaw: 0 });
      a.position.set(X - 3 + i * 2, 0, Z);
      g.scene.add(a);
      a.update(0.016);
      return a;
    });
    const light = new THREE.PointLight(0xfff1dc, 90, 24, 2);
    light.position.set(X, 4.5, Z + 5);
    g.scene.add(light);
    const back = new THREE.PointLight(0xdfe8ff, 40, 20, 2);
    back.position.set(X, 4, Z - 5);
    g.scene.add(back);
    return { callsBefore: g.perf.calls };`);

  const shot = async (name, from, look, wait = 1400) => {
    await inPage(page, `window.__game.cine.shot({ from: ${JSON.stringify(from)}, look: ${JSON.stringify(look)}, dur: 0.1 }); for (const a of window.__lineup) a.update(0.016); return true;`);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}-${name}.png` });
  };
  await shot("1-lineup-front", [6.5, 1.6, 76.5], [6.5, 1.05, 70], 2500);
  await shot("2-lineup-back", [6.5, 1.8, 63.8], [6.5, 1.15, 70]);
  await shot("3-red-man-face", [3.5, 1.95, 71.3], [3.5, 1.8, 70]);
  await shot("4-blue-man-face", [9.5, 1.95, 71.3], [9.5, 1.8, 70]);
  await shot("5-women-faces", [6.5, 1.8, 72.4], [6.5, 1.65, 70]);
  await shot("6-feet", [6.5, 0.45, 72.6], [6.5, 0.15, 70]);
  log.calls = await inPage(page, `return window.__game.perf.calls;`);
  await inPage(page, `window.__game.cine.releaseCamera(); return true;`);
  return log;
}
