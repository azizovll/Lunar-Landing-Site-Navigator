import { describe, expect, it } from "vitest";
import fixture from "./fixtures/horizons.json";
import { skyAt } from "@/lib/astro";
import { angleDiff, parseHorizonsUtc } from "@/lib/horizonsFixture";

const TOL = 0.1; // degrees

describe("Sun/Earth topocentric positions vs JPL Horizons", () => {
  for (const site of fixture.sites) {
    for (const body of ["sun", "earth"] as const) {
      it(`${site.id} ${body}`, () => {
        let maxEl = 0, maxAz = 0;
        for (const row of site[body]) {
          const s = skyAt(site.lat, site.lon, 0, parseHorizonsUtc(row.utc))[body];
          const dEl = Math.abs(s.el - row.el);
          // azimuth error matters less near the zenith; scale by cos(el)
          const dAz = Math.abs(angleDiff(s.az, row.az)) * Math.cos((row.el * Math.PI) / 180);
          maxEl = Math.max(maxEl, dEl);
          maxAz = Math.max(maxAz, dAz);
        }
        console.log(`${site.id} ${body}: max |dEl|=${maxEl.toFixed(4)} max |dAz|cos(el)=${maxAz.toFixed(4)}`);
        expect(maxEl).toBeLessThan(TOL);
        expect(maxAz).toBeLessThan(TOL);
      });
    }
  }

  it("Apollo 11 landing: Sun low in the east (~10 deg)", () => {
    const s = skyAt(0.67408, 23.47297, 0, new Date(Date.UTC(1969, 6, 20, 20, 17))).sun;
    expect(s.el).toBeGreaterThan(8);
    expect(s.el).toBeLessThan(13);
    expect(s.az).toBeGreaterThan(70);
    expect(s.az).toBeLessThan(110);
  });
});
