import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computeHorizon, type DemGrid } from "@/lib/horizonCore";
import { SITES, resolvePreset } from "@/lib/sites";
import { horizonEl, sampleSeries, windowMetrics } from "@/lib/metrics";

/**
 * The browser (custom-point) horizon uses a 480 m/px DEM. This checks it against the
 * precise pipeline masks at preset sites, so the "lower accuracy" label in the UI
 * (illumination / comms within about ±6 pp) stays honest.
 */
const dir = path.resolve(__dirname, "../public/data/dem");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "south_480m.json"), "utf8"));
const buf = fs.readFileSync(path.join(dir, "south_480m.bin"));
const grid: DemGrid = { n: meta.n, scaleM: meta.scaleM, offsetPx: meta.offsetPx, maxLat: meta.maxLat, data: new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2) };

describe("browser DEM horizon vs precise LOLA mask", () => {
  it("covers everything south of 79°S", () => {
    expect(meta.maxLat).toBeLessThanOrEqual(-79);
    expect(() => computeHorizon(grid, -79.5, 0)).not.toThrow();
  });

  const from = Date.UTC(2026, 0, 1);
  const to = Date.UTC(2027, 0, 1);
  for (const id of ["connecting-ridge", "shackleton-rim", "malapert-massif", "de-gerlache-rim"]) {
    it(`${id}: horizon RMS < 1.2°, illumination and comms within 8 pp`, () => {
      const precise = resolvePreset(SITES.find((s) => s.id === id)!);
      const approx = computeHorizon(grid, precise.lat, precise.lon);
      let ss = 0;
      for (let i = 0; i < 720; i++) {
        const d = approx.horizon[i] - horizonEl(precise.horizon, i * 0.5);
        ss += d * d;
      }
      expect(Math.sqrt(ss / 720)).toBeLessThan(1.2);
      const m = (h: typeof precise.horizon, hm: number) =>
        windowMetrics(sampleSeries({ lat: precise.lat, lon: precise.lon, heightM: hm, horizon: h }, from, to, 6 * 3_600_000), from, to);
      const a = m({ azStepDeg: approx.azStepDeg, el: approx.horizon }, approx.terrainHeightM);
      const p = m(precise.horizon, precise.heightM ?? 0);
      expect(Math.abs(a.illuminationPct - p.illuminationPct)).toBeLessThan(8);
      expect(Math.abs(a.commsPct - p.commsPct)).toBeLessThan(8);
    });
  }
});
