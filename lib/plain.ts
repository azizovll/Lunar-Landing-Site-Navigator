/**
 * Plain-language wording for Simple mode: turns metrics into short phrases a non-specialist can
 * read at a glance. Ratings use the same thresholds as the Good/Marginal/Poor verdicts.
 */
import { THRESHOLDS, type Events, type Sample, type WindowMetrics } from "./metrics";
import { compass } from "./format";

export type Rating = "great" | "ok" | "poor";

export function sunRating(m: WindowMetrics): Rating {
  const t = THRESHOLDS.power;
  if (m.illuminationPct >= t.goodPct && m.longestNightH <= t.goodNightH) return "great";
  if (m.illuminationPct < t.poorPct || m.longestNightH > t.poorNightH) return "poor";
  return "ok";
}

export function commsRating(m: WindowMetrics): Rating {
  const t = THRESHOLDS.comms;
  if (m.commsPct >= t.goodPct && m.longestBlackoutH <= t.goodBlackoutH) return "great";
  if (m.commsPct < t.poorPct || m.longestBlackoutH > t.poorBlackoutH) return "poor";
  return "ok";
}

export const RATING_WORD: Record<Rating, string> = { great: "Good", ok: "OK", poor: "Poor" };

/** "4 days 17 hours", "9 hours", "none" */
export function plainDuration(hours: number): string {
  if (hours < 0.5) return "none";
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} hour${h === 1 ? "" : "s"}` : ""}`;
}

/** "about 9 days out of 14" */
export function plainShare(pct: number, windowDays: number): string {
  const days = (pct / 100) * windowDays;
  if (pct >= 99.5) return `all ${windowDays} days`;
  if (pct < 0.5) return "never";
  const r = days < 1 ? `${Math.round(days * 24)} hours` : `about ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
  return `${r} out of ${windowDays}`;
}

/** One-sentence verdict for the whole mission window. */
export function headline(m: WindowMetrics): string {
  const s = sunRating(m);
  const c = commsRating(m);
  const sun =
    s === "great" ? "Plenty of sunlight for solar panels" : s === "ok" ? "Sunlight comes and goes" : "Mostly dark, solar power will struggle";
  const earth =
    c === "great"
      ? "Earth stays in view, so talking to home is easy"
      : c === "ok"
        ? `Earth drops behind the hills now and then (longest gap ${plainDuration(m.longestBlackoutH)})`
        : `Earth is hidden much of the time (longest gap ${plainDuration(m.longestBlackoutH)}), so a relay satellite would be needed`;
  return `${sun}. ${earth}.`;
}

/** "about 3 Sun-widths above the hills" */
function sunWidths(deg: number): string {
  const w = Math.abs(deg) / 0.53;
  if (w < 0.5) return "just touching";
  return `about ${w < 1.5 ? "1 Sun-width" : `${Math.round(w)} Sun-widths`}`;
}

export function sunNow(s: Sample, ev: Events, now: number, fmtWhen: (t: number, now: number) => string): string {
  const clear = s.sunEl - s.sunHz;
  if (s.sunFrac >= 0.999) {
    const set = ev.sunset ? ` It will set behind the terrain ${fmtWhen(ev.sunset, now)}.` : " It will not set in the coming weeks.";
    return `The Sun is up in the ${dir(s.sunAz)}, ${sunWidths(clear)} above the hills.${set}`;
  }
  if (s.sunFrac > 0) {
    return `The Sun is half-hidden: only ${Math.round(s.sunFrac * 100)}% of it peeks over the hills in the ${dir(s.sunAz)}.`;
  }
  const rise = ev.sunrise ? ` It comes back ${fmtWhen(ev.sunrise, now)}.` : " It does not come back in the coming weeks.";
  return `The Sun is behind the hills, so it is dark here.${rise}`;
}

export function earthNow(s: Sample, ev: Events, now: number, marginDeg: number, fmtWhen: (t: number, now: number) => string): string {
  if (s.earthClear >= marginDeg) {
    const set = ev.earthset ? ` The link is lost ${fmtWhen(ev.earthset, now)}.` : " It stays in view for the coming weeks.";
    return `Earth is in view in the ${dir(s.earthAz)}, so a radio link home works.${set}`;
  }
  const back = ev.earthrise ? ` It comes back ${fmtWhen(ev.earthrise, now)}.` : " It does not come back in the coming weeks.";
  return s.earthClear > 0
    ? `Earth is just above the hills, too low for a reliable radio link.${back}`
    : `Earth is hidden behind the hills, so there is no direct link home.${back}`;
}

function dir(az: number): string {
  const c = compass(az);
  const names: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
  return names[c] ?? c;
}

/** "in 3 days", "in 5 hours", "in 20 minutes" (future) or "2 days ago" (past). */
export function plainWhen(t: number, now: number): string {
  const diff = t - now;
  const abs = Math.abs(diff);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let s: string;
  if (abs >= 2 * 86_400_000) s = plural(Math.round(abs / 86_400_000), "day");
  else if (abs >= 86_400_000) s = `1 day ${plural(Math.round((abs - 86_400_000) / 3_600_000), "hour")}`;
  else if (abs >= 3_600_000) s = plural(Math.round(abs / 3_600_000), "hour");
  else s = plural(Math.max(1, Math.round(abs / 60_000)), "minute");
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}
