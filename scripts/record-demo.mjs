// Records the 30-second demo video: drives the site through the scenes, burns in English
// subtitles and joins the clips into one 1920x1080 MP4.
//
// Usage:  node scripts/record-demo.mjs [baseUrl] [out.mp4]
//   baseUrl  default https://lunar-landing-site-navigator-psi.vercel.app
//   out      default demo.mp4
// Needs: a Chromium-based browser (set BROWSER_PATH if it is not found) and ffmpeg on PATH.
import puppeteer from "puppeteer-core";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] ?? "https://lunar-landing-site-navigator-psi.vercel.app").replace(/\/$/, "");
const out = path.resolve(process.argv[3] ?? "demo.mp4");
const tmp = path.resolve(".demo-clips");
const exe = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!exe) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH=/path/to/chrome.");
  process.exit(2);
}
if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
  console.error("ffmpeg not found on PATH.");
  process.exit(2);
}
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  // real GPU rendering for the 3D scene
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const page = await browser.newPage();
// 1280x720 CSS pixels at 1.5x = a 1920x1080 picture with comfortably large text
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });

/** Subtitle bar, re-created after every navigation. */
const sub = (text) =>
  page.evaluate((t) => {
    let el = document.getElementById("demo-sub");
    if (!el) {
      el = document.createElement("div");
      el.id = "demo-sub";
      el.style.cssText =
        "position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;max-width:1080px;padding:10px 22px;" +
        "background:rgba(0,0,0,.82);border:1px solid #3a3a40;color:#fff;font:500 27px/1.3 Outfit,Arial,sans-serif;text-align:center;" +
        "pointer-events:none;white-space:normal";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
const open = async (url) => {
  await page.goto(base + url, { waitUntil: "networkidle0", timeout: 120000 });
  await wait(800);
};
const click3d = (startsWith) =>
  page.evaluate((t) => [...document.querySelectorAll("#terrain3d button")].find((b) => b.textContent.trim().startsWith(t))?.click(), startsWith);

const clips = [];
/** Record `seconds` of the page while `action` runs. */
const record = async (name, seconds, action) => {
  const file = path.join(tmp, `${name}.webm`);
  const rec = await page.screencast({ path: file });
  const t0 = Date.now();
  await action?.();
  await wait(Math.max(0, seconds * 1000 + 400 - (Date.now() - t0))); // 0.4 s spare, trimmed when joining
  await rec.stop();
  clips.push({ file, seconds });
  console.log(`recorded ${name} (${seconds} s)`);
};

// ---- scenes 1-3: 3D terrain, lines of sight, light map (one take, 13 s)
await open("/");
await page.evaluate(() => document.querySelector("#terrain3d figure > div").scrollIntoView({ block: "center" }));
await page.waitForFunction(() => [...document.querySelectorAll("#terrain3d button")].some((b) => b.textContent.trim() === "☀ Light map"), { timeout: 120000 });
await wait(1500);
await sub("At the Moon’s south pole, the Sun never rises above 1.5°.");
await record("1-terrain", 13, async () => {
  await wait(4000);
  await sub("One hill can cut your solar power, or your radio link to Earth.");
  await page.evaluate(() => [...document.querySelectorAll("#terrain3d nav button")].find((b) => b.textContent.startsWith("Shackleton rim"))?.click());
  await wait(2200);
  await click3d("▶ Lunar day");
  await wait(2800);
  await click3d("❚❚ Pause");
  await click3d("← Overview");
  await click3d("☀ Light map");
  await sub("A month of sunlight, mapped from real NASA LOLA terrain.");
});

// ---- scene 4: Mission Rescue (8 s)
await open("/rescue?site=shackleton-rim&date=2026-11-15&delay=14");
await page.evaluate(() => {
  const card = [...document.querySelectorAll(".card")].find((c) => /Original plan/i.test(c.textContent));
  window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 330);
});
await sub("Launch slipped 14 days? The score drops from 70 to 40.");
await wait(500);
await record("2-rescue", 8, async () => {
  await wait(3600);
  await sub("Mission Rescue finds sites 30 points better, in seconds.");
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /Best alternatives/i.test(x.textContent));
    window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  });
});

// ---- scene 5: landing precision (4 s)
await open("/?site=shackleton-rim&start=2026-12-15");
await page.evaluate(() => {
  const d = document.getElementById("precision");
  if (d instanceof HTMLDetailsElement) d.open = true;
});
await wait(600);
await page.evaluate(() => {
  const d = document.getElementById("precision");
  const panel = d.querySelector("section") ?? d;
  window.scrollTo(0, panel.getBoundingClientRect().top + window.scrollY - 150);
});
await sub("Miss the crest by 250 m: 71 becomes 1.");
await wait(500);
await record("3-precision", 4);

// ---- scene 6: validation (3 s)
await open("/validation");
await sub("Checked against NASA JPL Horizons: 0.004° error.");
await record("4-validation", 3);

// ---- scene 7: title (2 s)
await open("/");
await sub("Lunar Site Navigator. Free, in your browser.");
await record("5-title", 2);

await browser.close();

// ---- join: trim every clip to its length, 30 fps, 1920x1080, H.264
const args = ["-y"];
for (const c of clips) args.push("-i", c.file);
const filters = clips.map((c, i) => `[${i}:v]trim=start=0.2:duration=${c.seconds},setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1[v${i}]`);
filters.push(`${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v]`);
args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", "-t", String(clips.reduce((n, c) => n + c.seconds, 0)), out);
const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
if (r.status !== 0) {
  console.error(String(r.stderr).split("\n").slice(-12).join("\n"));
  process.exit(1);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`done: ${out}`);
