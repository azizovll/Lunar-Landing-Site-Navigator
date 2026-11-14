/**
 * "Rescue the mission": the launch slipped by N days. Search every south-polar site and every
 * landing date within ±flex days of the new date, and return the best alternatives.
 *
 * For each site we keep its best date (highest score); sites are then ranked by that score.
 * The original plan, simply delayed, is returned too so the UI can show how much better each
 * alternative is.
 */
import { DAY, HOUR, alignTime, sampleSeries, windowMetrics, type Settings, type SiteInput, type WindowMetrics } from "./metrics";
import { rawScore, score } from "./score";

export interface Candidate {
  siteId: string;
  start: number;
  metrics: WindowMetrics;
  score: number;
}

export interface RescueInput {
  sites: (SiteInput & { id: string })[];
  planSiteId: string;
  planStart: number;
  delayDays: number;
  flexDays: number;
  settings: Settings;
  /** sampling step; 1 hour is plenty for day-level ranking */
  stepMs?: number;
}

export interface RescueResult {
  onTime: Candidate;
  delayedPlan: Candidate;
  /** best date per site, best first (includes the planned site at its best date) */
  ranked: Candidate[];
}

export function rescue(input: RescueInput): RescueResult {
  const { sites, planSiteId, delayDays, flexDays, settings } = input;
  const step = input.stepMs ?? HOUR;
  const planStart = alignTime(input.planStart, DAY);
  const newStart = planStart + delayDays * DAY;
  const from = newStart - flexDays * DAY;
  const to = newStart + (flexDays + settings.windowDays) * DAY;

  const evalAt = (series: ReturnType<typeof sampleSeries>, siteId: string, start: number): Candidate => {
    const metrics = windowMetrics(series, start, start + settings.windowDays * DAY, settings);
    return { siteId, start, metrics, score: score(metrics) };
  };

  const ranked: Candidate[] = [];
  let delayedPlan: Candidate | null = null;
  for (const site of sites) {
    const series = sampleSeries(site, from, to, step);
    let best: Candidate | null = null;
    for (let d = -flexDays; d <= flexDays; d++) {
      const c = evalAt(series, site.id, newStart + d * DAY);
      // prefer the higher score; on ties prefer the date closest to the new launch date
      if (!best || c.score > best.score || (c.score === best.score && Math.abs(c.start - newStart) < Math.abs(best.start - newStart))) best = c;
      if (site.id === planSiteId && d === 0) delayedPlan = c;
    }
    ranked.push(best!);
  }
  // Ties on the rounded score are broken by the unrounded score, then by Earth's lowest elevation
  // during the mission (more link margin), then by the date closest to the new launch date.
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      rawScore(b.metrics) - rawScore(a.metrics) ||
      b.metrics.minEarthEl - a.metrics.minEarthEl ||
      Math.abs(a.start - newStart) - Math.abs(b.start - newStart),
  );

  const plan = sites.find((s) => s.id === planSiteId) ?? sites[0];
  const onTimeSeries = sampleSeries(plan, planStart, planStart + settings.windowDays * DAY, step);
  const onTime = evalAt(onTimeSeries, plan.id, planStart);
  if (!delayedPlan) {
    const s = sampleSeries(plan, newStart, newStart + settings.windowDays * DAY, step);
    delayedPlan = evalAt(s, plan.id, newStart);
  }
  return { onTime, delayedPlan, ranked };
}
