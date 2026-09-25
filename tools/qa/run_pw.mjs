// Runs the repo's Playwright-style QA scripts (tools/qa/gameplay.mjs, eastbank.mjs, roads.mjs ...)
// on puppeteer, for machines without the external browser harness they were written for.
//
//   node serve.mjs 8899          (in another shell)
//   node tools/qa/run_pw.mjs tools/qa/gameplay.mjs [http://localhost:8899/]
//
// Needs puppeteer: `npm install puppeteer --no-save` at the repo root. SHOT_PREFIX still
// sets where a script's screenshots go. Prints the script's return value as JSON.
import puppeteer from "puppeteer";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [script, url = "http://localhost:8899/"] = process.argv.slice(2);
if (!script) { console.error("usage: node tools/qa/run_pw.mjs <script.mjs> [url]"); process.exit(2); }

const browser = await puppeteer.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|403/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String((e && e.stack) || e).slice(0, 700)));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });

// the subset of Playwright's Page API the scripts use
const pw = {
  evaluate: (fn, ...a) => page.evaluate(fn, ...a),
  addScriptTag: (o) => page.addScriptTag(o),
  waitForFunction: (fn, arg, opts) => page.waitForFunction(fn, opts || {}, arg),
  click: (sel) => page.click(sel),
  waitForTimeout: (ms) => new Promise((r) => setTimeout(r, ms)),
  setViewportSize: ({ width, height }) => page.setViewport({ width, height }),
  screenshot: (o) => page.screenshot(o),
  keyboard: page.keyboard,
  mouse: page.mouse,
};
const mod = await import(pathToFileURL(path.resolve(script)).href);
const log = await mod.default(pw);
console.log(JSON.stringify(log, null, 1));
console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
await browser.close();
const failed = Array.isArray(log.failed) ? log.failed.length : 0;
process.exit(log.crash || failed ? 1 : 0);
