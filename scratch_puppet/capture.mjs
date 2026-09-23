import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  console.log("Loading game...");
  await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  console.log("Waiting for startBtn...");
  await page.waitForSelector("#startBtn:not([disabled])", { timeout: 60000 });
  
  console.log("Bypassing menu and starting game manually...");
  await page.evaluate(() => {
    window.__game.state.running = true;
    document.getElementById("overlay").style.display = "none";
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  await page.evaluate(() => { window.__game.state.dusk = true; }); 
  await new Promise(r => setTimeout(r, 1000));

  console.log("Teleporting to Safehouse 1 (Bayou Noir General Store)...");
  await page.evaluate(() => {
    window.__game.teleport(-272, 10);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_1.png" });

  console.log("Teleporting to Safehouse 2 (Chatboro Strip)...");
  await page.evaluate(() => {
    window.__game.teleport(-30, 90); 
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_2.png" });

  console.log("Teleporting to Safehouse 3 (Port Mercer Yard)...");
  await page.evaluate(() => {
    window.__game.teleport(206, -70);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_3.png" });

  console.log("Teleporting to Safehouse 4 (OrleaRouge Refuge)...");
  await page.evaluate(() => {
    window.__game.teleport(92, 280);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_4.png" });

  console.log("Done.");
  await browser.close();
})();
