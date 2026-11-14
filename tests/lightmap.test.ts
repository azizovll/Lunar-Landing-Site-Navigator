import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { frameVectors } from "@/lib/astro";
import { computeLightMap, lightAt } from "@/lib/lightmapCore";
import { SITES, resolvePreset } from "@/lib/sites";
import { DAY, DEFAULT_SETTINGS, sampleSeries, windowMetrics } from "@/lib/metrics";

describe("3D sunlight map", () => {
  it("agrees with the exact per-site illumination over a lunar month (coarse grid, so a loose bound)", () => {
    const meta = JSON.parse(readFileSync("public/data/terrain/south.json", "utf8"));
    const buf = readFileSync("public/data/terrain/south.bin");
    const grid = { data: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2), n: meta.n, scaleM: meta.scaleM };
    const from = Date.UTC(2026, 10, 15);
    const to = from + 29.5 * DAY;
    const STEP = 6 * 3_600_000;
    const sun: number[] = [];
    for (let t = from; t < to; t += STEP) {
      const s = frameVectors(new Date(t)).sun;
      const len = Math.hypot(s[0], s[1], s[2]);
      sun.push(s[0] / len, s[1] / len, s[2] / len);
    }
    const lit = computeLightMap(grid, Float64Array.from(sun));
    const errs: number[] = [];
    for (const s of SITES.filter((x) => x.kind === "south-pole")) {
      const exact = windowMetrics(sampleSeries(resolvePreset(s), from, to, STEP), from, to).illuminationPct;
      const approx = lightAt(lit, grid, s.lat, s.lon) * 100;
      if (s.id === "shackleton-floor") expect(approx, s.id).toBeLessThan(5);
      else expect(Math.abs(approx - exact), `${s.id}: exact ${exact.toFixed(0)}%, map ${approx.toFixed(0)}%`).toBeLessThan(30);
      errs.push(Math.abs(approx - exact));
    }
    // on average within ~12 percentage points of the 20 m / 1440-ray site horizons
    expect(errs.reduce((a, b) => a + b, 0) / errs.length).toBeLessThan(12);

    // the same map for Earth (2° comms margin) against the exact comms share
    const earth: number[] = [];
    for (let t = from; t < to; t += STEP) {
      const e = frameVectors(new Date(t)).earth;
      const len = Math.hypot(e[0], e[1], e[2]);
      earth.push(e[0] / len, e[1] / len, e[2] / len);
    }
    const seen = computeLightMap(grid, Float64Array.from(earth), { marginDeg: DEFAULT_SETTINGS.marginDeg });
    const eErrs: number[] = [];
    for (const s of SITES.filter((x) => x.kind === "south-pole")) {
      const exact = windowMetrics(sampleSeries(resolvePreset(s), from, to, STEP), from, to, DEFAULT_SETTINGS).commsPct;
      const approx = lightAt(seen, grid, s.lat, s.lon) * 100;
      expect(Math.abs(approx - exact), `${s.id} Earth: exact ${exact.toFixed(0)}%, map ${approx.toFixed(0)}%`).toBeLessThan(35);
      eErrs.push(Math.abs(approx - exact));
    }
    expect(eErrs.reduce((a, b) => a + b, 0) / eErrs.length).toBeLessThan(15);
  }, 120_000);
});
