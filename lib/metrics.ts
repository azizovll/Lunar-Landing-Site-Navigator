/**
 * Power and communication metrics for a lunar surface site.
 *
 * Definitions (all documented on the About/Validation pages):
 * - Terrain horizon h(az): max elevation angle of terrain along azimuth az (from LOLA, 0.5 deg bins).
 *   Sites without a DEM use a flat horizon h = 0.
 * - Visible solar fraction f: area fraction of the solar disk above the terrain horizon. The disk is
 *   cut into vertical strips; each strip uses the horizon at its own azimuth, so a peak that hides
 *   half the Sun is handled correctly.
 * - Lit: f > 0. Night: f = 0.
 * - Illumination %: time-average of f over the mission window (partial disk counts proportionally).
 * - Power index: time-average of f (sun-tracking panel) or f * max(0, sin(sunEl)) (horizontal panel).
 * - Comms: Earth centre elevation >= h(earthAz) + margin (default 2 deg).
 * - Combined window: hours where lit AND comms.
 */
import { DEG, MOON_RADIUS_KM, cachedFrameVectors, siteFrame, topocentric, SUN_RADIUS_KM, EARTH_RADIUS_KM, skyAt } from "./astro";

export interface Horizon {
  azStepDeg: number;
  el: ArrayLike<number>;
}

export interface SiteInput {
  lat: number;
  lon: number;
  /** terrain height above the 1737.4 km sphere (m); the observer stands 2 m above it */
  heightM?: number;
  horizon?: Horizon | null;
}

export interface Settings {
  marginDeg: number;
  panel: "tracking" | "horizontal";
  windowDays: number;
}

export const DEFAULT_SETTINGS: Settings = { marginDeg: 2, panel: "tracking", windowDays: 14 };

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const STEP_MS = 10 * 60_000; // 10-minute sampling

export function horizonEl(h: Horizon | null | undefined, azDeg: number): number {
  if (!h) return 0;
  const n = h.el.length;
  const x = (((azDeg % 360) + 360) % 360) / h.azStepDeg;
  const i0 = Math.floor(x) % n;
  const i1 = (i0 + 1) % n;
  const f = x - Math.floor(x);
  return h.el[i0] * (1 - f) + h.el[i1] * f;
}

/** Fraction of a disk (centre el/az, angular radius r, all deg) above the terrain horizon. */
export function visibleFraction(el: number, az: number, r: number, h: Horizon | null | undefined, strips = 24): number {
  const cosEl = Math.max(Math.cos(el * DEG), 1e-3);
  // Quick exits when the whole disk is clear of (or hidden by) the horizon across its azimuth span.
  const span = r / cosEl;
  const hs = [horizonEl(h, az - span), horizonEl(h, az), horizonEl(h, az + span)];
  if (el - r > Math.max(...hs) + 0.5) return 1;
  if (el + r < Math.min(...hs) - 0.5) return 0;
  let vis = 0;
  let total = 0;
  for (let k = 0; k < strips; k++) {
    const x = -r + ((k + 0.5) * 2 * r) / strips; // angular offset across the disk
    const half = Math.sqrt(Math.max(0, r * r - x * x));
    const top = el + half;
    const bottom = el - half;
    const hz = horizonEl(h, az + x / cosEl);
    vis += Math.max(0, top - Math.max(bottom, hz));
    total += top - bottom;
  }
  return total > 0 ? vis / total : 0;
}

export interface Sample {
  t: number;
  sunEl: number;
  sunAz: number;
  sunR: number;
  sunFrac: number;
  /** terrain horizon elevation at the Sun's azimuth */
  sunHz: number;
  earthEl: number;
  earthAz: number;
  earthR: number;
  /** terrain horizon elevation at Earth's azimuth */
  earthHz: number;
  /** Earth centre clearance above the terrain horizon (deg) */
  earthClear: number;
}

export function alignTime(t: number, step = STEP_MS): number {
  return Math.floor(t / step) * step;
}

export function sampleAt(site: SiteInput, t: number): Sample {
  const fv = cachedFrameVectors(t);
  const sf = siteFrame(site.lat, site.lon, (site.heightM ?? 0) + 2);
  const sun = topocentric(sf, fv.sun, SUN_RADIUS_KM);
  const earth = topocentric(sf, fv.earth, EARTH_RADIUS_KM);
  const earthHz = horizonEl(site.horizon, earth.az);
  return {
    t,
    sunEl: sun.el,
    sunAz: sun.az,
    sunR: sun.angRadius,
    sunFrac: visibleFraction(sun.el, sun.az, sun.angRadius, site.horizon),
    sunHz: horizonEl(site.horizon, sun.az),
    earthEl: earth.el,
    earthAz: earth.az,
    earthR: earth.angRadius,
    earthHz,
    earthClear: earth.el - earthHz,
  };
}

/** Sample on a fixed grid; timestamps are aligned so the ephemeris cache is shared across sites. */
export function sampleSeries(site: SiteInput, startMs: number, endMs: number, stepMs = STEP_MS): Sample[] {
  const t0 = alignTime(startMs, stepMs);
  const n = Math.ceil((endMs - t0) / stepMs) + 1;
  const out: Sample[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = sampleAt(site, t0 + i * stepMs);
  return out;
}

export const isLit = (s: Sample) => s.sunFrac > 0;
export const hasComms = (s: Sample, marginDeg: number) => s.earthClear >= marginDeg;

export interface WindowMetrics {
  from: number;
  to: number;
  illuminationPct: number;
  longestNightH: number;
  powerIndex: number; // 0..1
  commsPct: number;
  longestBlackoutH: number;
  combinedH: number;
  combinedPct: number;
  meanSunEl: number;
  maxEarthEl: number;
  minEarthEl: number;
}

function longestRun(samples: Sample[], pred: (s: Sample) => boolean, stepMs: number): number {
  let best = 0;
  let cur = 0;
  for (const s of samples) {
    if (pred(s)) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return (best * stepMs) / HOUR;
}

/** Metrics over samples whose t is in [from, to). */
export function windowMetrics(series: Sample[], from: number, to: number, settings: Settings = DEFAULT_SETTINGS): WindowMetrics {
  const win = series.filter((s) => s.t >= from && s.t < to);
  const stepMs = series.length > 1 ? series[1].t - series[0].t : STEP_MS;
  const n = Math.max(win.length, 1);
  let frac = 0, power = 0, comms = 0, both = 0, sunEl = 0;
  let maxE = -90, minE = 90;
  for (const s of win) {
    frac += s.sunFrac;
    power += settings.panel === "tracking" ? s.sunFrac : s.sunFrac * Math.max(0, Math.sin(s.sunEl * DEG));
    const c = hasComms(s, settings.marginDeg);
    if (c) comms++;
    if (c && isLit(s)) both++;
    sunEl += s.sunEl;
    maxE = Math.max(maxE, s.earthEl);
    minE = Math.min(minE, s.earthEl);
  }
  return {
    from,
    to,
    illuminationPct: (100 * frac) / n,
    longestNightH: longestRun(win, (s) => !isLit(s), stepMs),
    powerIndex: power / n,
    commsPct: (100 * comms) / n,
    longestBlackoutH: longestRun(win, (s) => !hasComms(s, settings.marginDeg), stepMs),
    combinedH: (both * stepMs) / HOUR,
    combinedPct: (100 * both) / n,
    meanSunEl: sunEl / n,
    maxEarthEl: maxE,
    minEarthEl: minE,
  };
}

export type Verdict = "Good" | "Marginal" | "Poor";

/**
 * Verdict thresholds (mission window, default 14 days):
 *  Power  Good:     illumination >= 70 % and longest night <= 48 h
 *         Poor:     illumination <  40 % or  longest night >  120 h
 *  Comms  Good:     comms >= 80 % and longest blackout <= 24 h
 *         Poor:     comms <  40 % or  longest blackout >  96 h
 *  Otherwise Marginal. Overall verdict = the worse of the two.
 */
export const THRESHOLDS = {
  power: { goodPct: 70, goodNightH: 48, poorPct: 40, poorNightH: 120 },
  comms: { goodPct: 80, goodBlackoutH: 24, poorPct: 40, poorBlackoutH: 96 },
};

export function powerVerdict(m: WindowMetrics): Verdict {
  const t = THRESHOLDS.power;
  if (m.illuminationPct >= t.goodPct && m.longestNightH <= t.goodNightH) return "Good";
  if (m.illuminationPct < t.poorPct || m.longestNightH > t.poorNightH) return "Poor";
  return "Marginal";
}

export function commsVerdict(m: WindowMetrics): Verdict {
  const t = THRESHOLDS.comms;
  if (m.commsPct >= t.goodPct && m.longestBlackoutH <= t.goodBlackoutH) return "Good";
  if (m.commsPct < t.poorPct || m.longestBlackoutH > t.poorBlackoutH) return "Poor";
  return "Marginal";
}

const RANK: Record<Verdict, number> = { Good: 2, Marginal: 1, Poor: 0 };
export function overallVerdict(m: WindowMetrics): Verdict {
  const p = powerVerdict(m);
  const c = commsVerdict(m);
  return RANK[p] <= RANK[c] ? p : c;
}

export interface Events {
  /** next time the Sun's disk fully disappears behind terrain (null: not within the horizon of the search) */
  sunset: number | null;
  sunrise: number | null;
  earthset: number | null;
  earthrise: number | null;
}

/** Bisection refine of a state change between t0 (state a) and t1 (state !a). */
function refine(site: SiteInput, t0: number, t1: number, pred: (s: Sample) => boolean): number {
  const a = pred(sampleAtExact(site, t0));
  for (let i = 0; i < 12 && t1 - t0 > 30_000; i++) {
    const mid = (t0 + t1) / 2;
    if (pred(sampleAtExact(site, mid)) === a) t0 = mid;
    else t1 = mid;
  }
  return Math.round((t0 + t1) / 2);
}

/** Uncached exact-time sample (for event refinement). */
function sampleAtExact(site: SiteInput, t: number): Sample {
  const sky = skyAt(site.lat, site.lon, (site.heightM ?? 0) + 2, new Date(t));
  const earthHz = horizonEl(site.horizon, sky.earth.az);
  return {
    t,
    sunEl: sky.sun.el,
    sunAz: sky.sun.az,
    sunR: sky.sun.angRadius,
    sunFrac: visibleFraction(sky.sun.el, sky.sun.az, sky.sun.angRadius, site.horizon),
    sunHz: horizonEl(site.horizon, sky.sun.az),
    earthEl: sky.earth.el,
    earthAz: sky.earth.az,
    earthR: sky.earth.angRadius,
    earthHz,
    earthClear: sky.earth.el - earthHz,
  };
}

/** Next transitions after time t, searched inside an existing series. */
export function nextEvents(site: SiteInput, series: Sample[], t: number, marginDeg: number): Events {
  const find = (pred: (s: Sample) => boolean, want: boolean): number | null => {
    let i = series.findIndex((s) => s.t > t);
    if (i < 0) return null;
    // Report the first transition into `want` from the opposite state after t.
    let prev = pred(sampleAtExact(site, t));
    let last = t;
    for (; i < series.length; i++) {
      const cur = pred(series[i]);
      if (cur === want && prev !== want) return refine(site, last, series[i].t, pred);
      prev = cur;
      last = series[i].t;
    }
    return null;
  };
  const lit = (s: Sample) => isLit(s);
  const comm = (s: Sample) => hasComms(s, marginDeg);
  return {
    sunset: find(lit, false),
    sunrise: find(lit, true),
    earthset: find(comm, false),
    earthrise: find(comm, true),
  };
}

/** Daily summary for the calendar heatmap: mean lit fraction, comms share and light+comms share per UTC day. */
export function dailySummary(site: SiteInput, startMs: number, days: number, marginDeg: number, stepMs = HOUR) {
  const out: { day: number; lit: number; comms: number; both: number }[] = [];
  const per = Math.round(DAY / stepMs);
  const t0 = alignTime(startMs, DAY);
  for (let d = 0; d < days; d++) {
    let lit = 0, comms = 0, both = 0;
    for (let k = 0; k < per; k++) {
      const s = sampleAt(site, t0 + d * DAY + k * stepMs);
      const c = hasComms(s, marginDeg);
      lit += s.sunFrac;
      if (c) comms++;
      if (c && isLit(s)) both++;
    }
    out.push({ day: t0 + d * DAY, lit: lit / per, comms: comms / per, both: both / per });
  }
  return out;
}

export { MOON_RADIUS_KM };
