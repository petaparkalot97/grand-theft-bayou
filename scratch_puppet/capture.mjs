import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 }); page.on('console', msg => console.log('PAGE LOG:', msg.text())); page.on('pageerror', err => console.error('PAGE ERROR:', err));
  
  console.log("Loading game...");
  await page.goto('http://localhost:8899/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
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

  console.log("Teleporting to Safehouse 1...");
  await page.evaluate(() => {
    window.__game.teleport(-44, -260);
    
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_1.png" });

  console.log("Teleporting to Safehouse 2...");
  await page.evaluate(() => {
    window.__game.teleport(26, 114); 
    
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_2.png" });

  console.log("Teleporting to Safehouse 3...");
  await page.evaluate(() => {
    window.__game.teleport(190, -340);
    
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_3.png" });

  console.log("Teleporting to Safehouse 4...");
  await page.evaluate(() => {
    window.__game.teleport(92, 260);
    
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "../tools/qa/out/safehouse_4.png" });

  console.log("Done.");
  await browser.close();
})();
