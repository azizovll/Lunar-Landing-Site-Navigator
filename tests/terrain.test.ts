import { describe, expect, it } from "vitest";
import { SITES, resolvePreset } from "@/lib/sites";
import { latLonToPixel, pixelToLatLon } from "@/lib/horizonCore";
import { sampleSeries, windowMetrics } from "@/lib/metrics";

describe("polar stereographic projection", () => {
  it("round-trips lat/lon through pixel coordinates", () => {
    for (const [lat, lon] of [[-89.78, -155.3], [-85, 30], [-80.1, 1.4], [-88, 179]]) {
      const p = latLonToPixel(lat, lon, 3799.5, 80);
      const back = pixelToLatLon(p.line, p.samp, 3799.5, 80);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(((back.lon - lon + 540) % 360) - 180).toBeCloseTo(0, 6);
    }
  });
  it("puts lon 0 above the pole (smaller line) as in the LOLA products", () => {
    expect(latLonToPixel(-85, 0, 100, 1000).line).toBeLessThan(100);
    expect(latLonToPixel(-85, 90, 100, 1000).samp).toBeGreaterThan(100);
  });
});

describe("terrain horizon masks (acceptance)", () => {
  const south = SITES.filter((s) => s.lat <= -80);
  it("has LOLA masks for at least 8 south-polar sites", () => {
    const withMask = south.filter((s) => resolvePreset(s).terrain === "lola");
    expect(withMask.length).toBeGreaterThanOrEqual(8);
    for (const s of withMask) expect(resolvePreset(s).horizon!.el.length).toBe(720);
  });

  it("Shackleton rim and Connecting Ridge are lit far more than the Shackleton floor", () => {
    const from = Date.UTC(2026, 0, 1);
    const to = Date.UTC(2027, 0, 1);
    const ill = (id: string) => {
      const site = resolvePreset(SITES.find((s) => s.id === id)!);
      return windowMetrics(sampleSeries(site, from, to, 6 * 3_600_000), from, to).illuminationPct;
    };
    const floor = ill("shackleton-floor");
    expect(floor).toBeLessThan(1);
    expect(ill("shackleton-rim")).toBeGreaterThan(60);
    expect(ill("connecting-ridge")).toBeGreaterThan(70);
  });
});
