import fixture from "../tests/fixtures/horizons.json";
import { skyAt } from "../lib/astro";
import { angleDiff, parseHorizonsUtc } from "../lib/horizonsFixture";
let all = 0;
for (const site of fixture.sites) for (const body of ["sun", "earth"] as const) {
  let mEl = 0, mAz = 0;
  for (const r of site[body]) {
    const s = skyAt(site.lat, site.lon, 0, parseHorizonsUtc(r.utc))[body];
    mEl = Math.max(mEl, Math.abs(s.el - r.el));
    mAz = Math.max(mAz, Math.abs(angleDiff(s.az, r.az)) * Math.cos(r.el * Math.PI / 180));
  }
  all = Math.max(all, mEl, mAz);
  console.log(site.id.padEnd(22), body.padEnd(6), "max dEl", mEl.toFixed(4), "max dAz*cos(el)", mAz.toFixed(4));
}
console.log("overall max", all.toFixed(4));
{
  let n = 0, ss = 0;
  for (const site of fixture.sites) for (const body of ["sun", "earth"] as const) for (const r of site[body]) {
    const s = skyAt(site.lat, site.lon, 0, parseHorizonsUtc(r.utc))[body];
    const dEl = s.el - r.el, dAz = angleDiff(s.az, r.az) * Math.cos(r.el * Math.PI / 180);
    ss += dEl * dEl + dAz * dAz; n += 2;
  }
  console.log("comparisons", n / 2, "rms", Math.sqrt(ss / n).toFixed(5), "deg =", (Math.sqrt(ss / n) * 3600).toFixed(1), "arcsec");
}
