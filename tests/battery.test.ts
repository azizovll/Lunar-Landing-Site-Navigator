import { describe, expect, it } from "vitest";
import { DEFAULT_LANDER, darkEndurance, simulateBattery } from "@/lib/battery";
import { DEFAULT_SETTINGS, type Sample } from "@/lib/metrics";

const HOUR = 3_600_000;
const series = (fracs: number[]): Sample[] =>
  fracs.map((f, i) => ({ t: i * HOUR, sunEl: 2, sunAz: 0, sunR: 0.27, sunFrac: f, sunHz: 0, earthEl: 5, earthAz: 0, earthR: 0.95, earthHz: 0, earthClear: 5 }));

describe("battery simulation", () => {
  it("stays full in permanent sunlight (array > load)", () => {
    const r = simulateBattery(series(new Array(48).fill(1)), 0, 48 * HOUR, DEFAULT_SETTINGS);
    expect(r.minSoc).toBe(1);
    expect(r.deadHours).toBe(0);
  });

  it("drains at the load rate in darkness and runs flat after capacity / load hours", () => {
    const r = simulateBattery(series(new Array(48).fill(0)), 0, 48 * HOUR, DEFAULT_SETTINGS);
    const endurance = darkEndurance(); // 2000 Wh / 120 W ≈ 16.7 h
    expect(r.firstEmpty).not.toBeNull();
    expect(r.firstEmpty! / HOUR).toBeGreaterThanOrEqual(Math.floor(endurance) - 1);
    expect(r.firstEmpty! / HOUR).toBeLessThanOrEqual(Math.ceil(endurance) + 1);
    expect(r.deadHours).toBeGreaterThan(48 - endurance - 2);
    expect(r.minSoc).toBe(0);
  });

  it("recharges after a short night", () => {
    const fr = [...new Array(10).fill(0), ...new Array(30).fill(1)];
    const r = simulateBattery(series(fr), 0, 40 * HOUR, DEFAULT_SETTINGS);
    expect(r.minSoc).toBeCloseTo(1 - (10 * DEFAULT_LANDER.loadW) / DEFAULT_LANDER.batteryWh, 2);
    expect(r.endSoc).toBe(1);
    expect(r.deadHours).toBe(0);
  });
});
