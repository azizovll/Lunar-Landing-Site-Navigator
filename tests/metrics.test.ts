import { describe, expect, it } from "vitest";
import {
  DAY, DEFAULT_SETTINGS, HOUR, commsVerdict, horizonEl, nextEvents, powerVerdict,
  sampleSeries, visibleFraction, windowMetrics, type Horizon,
} from "@/lib/metrics";

const flat: Horizon = { azStepDeg: 0.5, el: new Array(720).fill(0) };

describe("horizon interpolation", () => {
  it("interpolates and wraps around 360", () => {
    const el = new Array(720).fill(0);
    el[0] = 2;
    el[719] = 1;
    const h = { azStepDeg: 0.5, el };
    expect(horizonEl(h, 0)).toBeCloseTo(2);
    expect(horizonEl(h, 0.25)).toBeCloseTo(1);
    expect(horizonEl(h, 359.75)).toBeCloseTo(1.5);
    expect(horizonEl(h, -0.25)).toBeCloseTo(1.5);
    expect(horizonEl(null, 123)).toBe(0);
  });
});

describe("visible solar fraction", () => {
  const r = 0.267;
  it("is 1 well above, 0 well below, 0.5 when centred on a flat horizon", () => {
    expect(visibleFraction(5, 90, r, flat)).toBe(1);
    expect(visibleFraction(-5, 90, r, flat)).toBe(0);
    expect(visibleFraction(0, 90, r, flat)).toBeCloseTo(0.5, 2);
  });
  it("is monotonic in elevation", () => {
    let prev = -1;
    for (let e = -0.3; e <= 0.3; e += 0.02) {
      const f = visibleFraction(e, 10, r, flat);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
  it("handles a step in the horizon across the disk (half hidden by a peak)", () => {
    // Fine 0.01 deg bins so the wall edge is sharp compared with the 0.53 deg disk.
    const el = new Array(36000).fill(0);
    for (let i = 9000; i < 10000; i++) el[i] = 5; // 90..100 deg az blocked by a 5 deg wall
    const h = { azStepDeg: 0.01, el };
    // Sun centred at az 90.0 at el 1: the western half (az<90) is free, the eastern half is blocked.
    const f = visibleFraction(1, 90, r, h, 200);
    expect(f).toBeGreaterThan(0.35);
    expect(f).toBeLessThan(0.65);
  });
});

describe("window metrics", () => {
  it("equatorial site: ~50% illumination over a lunar month, comms always (near side)", () => {
    const site = { lat: 0.674, lon: 23.473, horizon: null };
    const start = Date.UTC(2026, 11, 1);
    const end = start + 29.53 * DAY;
    const series = sampleSeries(site, start, end, 30 * 60_000);
    const m = windowMetrics(series, start, end, { ...DEFAULT_SETTINGS, windowDays: 29.53 });
    expect(m.illuminationPct).toBeGreaterThan(45);
    expect(m.illuminationPct).toBeLessThan(55);
    expect(m.commsPct).toBe(100);
    expect(m.longestNightH).toBeGreaterThan(300);
    expect(m.longestNightH).toBeLessThan(380);
    expect(commsVerdict(m)).toBe("Good");
  });

  it("finds sunrise/sunset ~29.5 days apart at the equator", () => {
    const site = { lat: 0.674, lon: 23.473, horizon: null };
    const t = Date.UTC(2026, 11, 1);
    const series = sampleSeries(site, t, t + 60 * DAY, 30 * 60_000);
    const ev = nextEvents(site, series, t, 2);
    expect(ev.sunrise).not.toBeNull();
    expect(ev.sunset).not.toBeNull();
    const ev2 = nextEvents(site, series, ev.sunrise! + HOUR, 2);
    const period = (ev2.sunrise ?? 0) - ev.sunrise!;
    expect(period / DAY).toBeGreaterThan(29);
    expect(period / DAY).toBeLessThan(30.1);
    expect(ev.earthset).toBeNull(); // Earth never sets at the near-side centre
  });

  it("far-side-like geometry: comms verdict Poor when Earth below horizon", () => {
    const site = { lat: 0, lon: 180, horizon: null };
    const t = Date.UTC(2026, 11, 1);
    const series = sampleSeries(site, t, t + 14 * DAY);
    const m = windowMetrics(series, t, t + 14 * DAY);
    expect(m.commsPct).toBe(0);
    expect(commsVerdict(m)).toBe("Poor");
    expect(["Good", "Marginal", "Poor"]).toContain(powerVerdict(m));
  });
});
