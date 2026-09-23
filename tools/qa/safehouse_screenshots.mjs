import { testRun } from "./lib/runner.mjs";

testRun("safehouses", async (page, log) => {
  log("Waiting for game to load...");
  await page.waitForSelector("#startBtn:not([disabled])", { timeout: 15000 });
  await page.click("#freeBtn");
  
  await page.waitForFunction(() => window.__game && window.__game.state.running, { timeout: 10000 });
  
  // Safehouse 1: Bayou Noir General Store
  log("Teleporting to Safehouse 1: Bayou Noir General Store (-44, -270)");
  await page.evaluate(() => {
    window.__game.teleport(-44, -260); // slightly north of it
    window.__game.camCtl.setAngles(Math.PI, -0.2); // look south
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "tools/qa/out/safehouse_1.png" });

  // Safehouse 2: Chatboro Strip Storefront
  log("Teleporting to Safehouse 2: Chatboro Strip Storefront (26, 124)");
  await page.evaluate(() => {
    window.__game.teleport(26, 114); 
    window.__game.camCtl.setAngles(Math.PI, -0.2);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "tools/qa/out/safehouse_2.png" });

  // Safehouse 3: Port Mercer Yard
  log("Teleporting to Safehouse 3: Port Mercer Yard (190, -350)");
  await page.evaluate(() => {
    window.__game.teleport(190, -340);
    window.__game.camCtl.setAngles(Math.PI, -0.2);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "tools/qa/out/safehouse_3.png" });

  // Safehouse 4: OrleaRouge Refuge
  log("Teleporting to Safehouse 4: OrleaRouge Refuge (92, 270)");
  await page.evaluate(() => {
    window.__game.teleport(92, 260);
    window.__game.camCtl.setAngles(Math.PI, -0.2);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "tools/qa/out/safehouse_4.png" });

  log("Screenshots captured to tools/qa/out/safehouse_*.png");
});
