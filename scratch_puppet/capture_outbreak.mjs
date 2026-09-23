import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));
  
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

  console.log("Teleporting to Beat 1 (Luggage/Blood)...");
  await page.evaluate(() => { window.__game.teleport(-20, 115); window.__game.camCtl.yaw = Math.PI; });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/outbreak_beat1.png" });

  console.log("Teleporting to Beat 2 (Gas Station Barricade)...");
  await page.evaluate(() => { window.__game.teleport(12, 103); window.__game.camCtl.yaw = Math.PI; });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/outbreak_beat2.png" });

  console.log("Teleporting to Beat 3 (Burned out car)...");
  await page.evaluate(() => { window.__game.teleport(-22, 90); window.__game.camCtl.yaw = Math.PI; });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/outbreak_beat3.png" });

  console.log("Teleporting to Beat 4 (Trash/Scavenged)...");
  await page.evaluate(() => { window.__game.teleport(12, 51); window.__game.camCtl.yaw = Math.PI; });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/outbreak_beat4.png" });

  console.log("Done.");
  await browser.close();
})();
