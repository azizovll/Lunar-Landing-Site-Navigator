// Headless smoke test: loads each page in Edge/Chrome, records console errors, saves screenshots.
// Usage: node scripts/check-pages.mjs [baseUrl] [outDir] [path ...]
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const paths = process.argv.slice(4).length ? process.argv.slice(4) : ["/", "/compare", "/calendar", "/validation", "/about"];
// Any Chromium-based browser works: set BROWSER_PATH, or one of the usual install paths is used.
const exe = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => p && existsSync(p));
if (!exe) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH=/path/to/chrome.");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
let failures = 0;
for (const vp of [{ name: "desktop", width: 1440, height: 1000 }, { name: "phone", width: 390, height: 844, isMobile: true }]) {
  for (const p of paths) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
    const t0 = Date.now();
    await page.goto(base + p, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    const ms = Date.now() - t0;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const file = `${out}/${vp.name}${p.replace(/[/?&=:]/g, "_") || "_home"}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${vp.name} ${p}: ${ms} ms, errors=${errors.length}${overflow ? ", HORIZONTAL OVERFLOW" : ""} -> ${file}`);
    errors.forEach((e) => console.log("   ", e.slice(0, 300)));
    failures += errors.length;
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
