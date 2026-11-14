// Annual illumination at preset sites vs published LOLA-based studies (terrain sanity check).
import { SITES, resolvePreset } from "../lib/sites";
import { sampleSeries, windowMetrics } from "../lib/metrics";
const from = Date.UTC(2026, 0, 1), to = Date.UTC(2027, 0, 1);
for (const id of ["connecting-ridge", "shackleton-rim", "de-gerlache-rim", "malapert-massif", "haworth", "shackleton-floor"]) {
  const site = resolvePreset(SITES.find((s) => s.id === id)!);
  const m = windowMetrics(sampleSeries(site, from, to, 3_600_000), from, to);
  console.log(id.padEnd(18), "illum", m.illuminationPct.toFixed(1), "% longest night", m.longestNightH.toFixed(0), "h  comms", m.commsPct.toFixed(1), "%");
}
