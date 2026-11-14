import { describe, expect, it } from "vitest";
import { NEIGHBORS, distanceKm, neighborsOf } from "@/lib/neighbors";
import { SITES } from "@/lib/sites";

describe("neighbours: hardware and planned missions", () => {
  it("measures great-circle distance on the lunar sphere", () => {
    // 1 degree of latitude = 2*pi*1737.4/360 = 30.32 km
    expect(distanceKm(-80, 0, -81, 0)).toBeCloseTo(30.32, 1);
    expect(distanceKm(-89.9, 0, -89.9, 180)).toBeCloseTo(2 * 0.1 * 30.32, 1);
  });

  it("finds the Chandrayaan-1 impact probe about 5 km from Connecting Ridge", () => {
    const cr = SITES.find((s) => s.id === "connecting-ridge")!;
    const n = neighborsOf(cr.id, cr.lat, cr.lon);
    const mip = n.hardware.find((h) => h.id === "chandrayaan1-mip")!;
    expect(mip.km).toBeGreaterThan(3);
    expect(mip.km).toBeLessThan(7);
    expect(n.inKeepOut).toHaveLength(0);
    expect(n.planned.map((p) => p.id)).toContain("blue-moon-mk1");
  });

  it("flags hardware inside the keep-out radius and ignores the site's own lander", () => {
    const n = neighborsOf(null, -84.7906, 29.25, 2); // ~150 m from Athena
    expect(n.inKeepOut.map((h) => h.id)).toContain("im2-athena");
    const own = neighborsOf("im1-odysseus", -80.13, 1.44);
    expect(own.hardware.find((h) => h.id === "im1-odysseus-hw")).toBeUndefined();
  });

  it("every entry has a source and planned missions point at real presets", () => {
    const ids = new Set(SITES.map((s) => s.id));
    for (const n of NEIGHBORS) {
      expect(n.source).toMatch(/^https:\/\//);
      if (n.kind === "planned") for (const s of n.nearSites ?? []) expect(ids.has(s)).toBe(true);
      else expect(Number.isFinite(n.lat) && Number.isFinite(n.lon)).toBe(true);
    }
  });
});
