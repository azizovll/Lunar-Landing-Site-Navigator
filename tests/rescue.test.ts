import { describe, expect, it } from "vitest";
import { DAY, DEFAULT_SETTINGS, type WindowMetrics } from "@/lib/metrics";
import { light, score, why } from "@/lib/score";
import { rescue } from "@/lib/rescue";
import { SITES, resolvePreset } from "@/lib/sites";

const m = (p: Partial<WindowMetrics>): WindowMetrics => ({
  from: 0,
  to: 14 * DAY,
  illuminationPct: 100,
  longestNightH: 0,
  powerIndex: 1,
  commsPct: 100,
  longestBlackoutH: 0,
  combinedH: 336,
  combinedPct: 100,
  meanSunEl: 1,
  maxEarthEl: 5,
  minEarthEl: 1,
  ...p,
});

describe("score 0–100", () => {
  it("is 100 for perfect light and comms, 0 for nothing", () => {
    expect(score(m({}))).toBe(100);
    expect(score(m({ illuminationPct: 0, commsPct: 0, combinedPct: 0, longestNightH: 336, longestBlackoutH: 336 }))).toBe(0);
  });
  it("drops with long blackouts and nights", () => {
    const base = score(m({ commsPct: 70, combinedPct: 70 }));
    expect(score(m({ commsPct: 70, combinedPct: 70, longestBlackoutH: 100 }))).toBeLessThan(base);
    expect(score(m({ longestNightH: 130 }))).toBeLessThan(100);
  });
  it("maps to a traffic light", () => {
    expect(light(85)).toBe("green");
    expect(light(55)).toBe("amber");
    expect(light(10)).toBe("red");
  });
  it("explains itself in one line", () => {
    expect(why(m({ commsPct: 60, longestBlackoutH: 110 }))).toMatch(/^Lots of sunlight, but Earth drops out for up to 4 days/);
    expect(why(m({}))).toBe("Lots of sunlight and Earth always in view");
  });
});

describe("mission rescue search", () => {
  const sites = SITES.filter((s) => s.lat <= -80).map((s) => ({ ...resolvePreset(s), id: s.id }));
  const res = rescue({
    sites,
    planSiteId: "shackleton-rim",
    planStart: Date.UTC(2026, 11, 1),
    delayDays: 14,
    flexDays: 5,
    settings: DEFAULT_SETTINGS,
    stepMs: 2 * 3_600_000,
  });

  it("ranks one best date per site, best first", () => {
    expect(res.ranked).toHaveLength(sites.length);
    expect(new Set(res.ranked.map((c) => c.siteId)).size).toBe(sites.length);
    for (let i = 1; i < res.ranked.length; i++) expect(res.ranked[i - 1].score).toBeGreaterThanOrEqual(res.ranked[i].score);
  });

  it("only proposes dates within the flexibility window around the new date", () => {
    const newStart = Date.UTC(2026, 11, 15);
    for (const c of res.ranked) expect(Math.abs(c.start - newStart)).toBeLessThanOrEqual(5 * DAY);
  });

  it("the top alternative is at least as good as the delayed plan", () => {
    expect(res.delayedPlan.siteId).toBe("shackleton-rim");
    expect(res.delayedPlan.start).toBe(Date.UTC(2026, 11, 15));
    expect(res.ranked[0].score).toBeGreaterThanOrEqual(res.delayedPlan.score);
  });

  it("never ranks the permanently shadowed crater floor on top", () => {
    expect(res.ranked[0].siteId).not.toBe("shackleton-floor");
    expect(res.ranked.find((c) => c.siteId === "shackleton-floor")!.score).toBeLessThan(40);
  });
});
