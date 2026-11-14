/**
 * One 0–100 score for a "site + date" scenario, with a traffic light and a one-line reason.
 *
 *   power  P = illumination% × (1 − 0.5 · min(1, longestNight / 120 h))
 *   comms  C = comms%        × (1 − 0.5 · min(1, longestBlackout / 96 h))
 *   score    = 0.4 P + 0.4 C + 0.2 · (share of the window with light AND comms, %)
 *
 * The 120 h and 96 h limits are the "Poor" thresholds of the Good/Marginal/Poor verdicts, so a
 * site that would be Poor on nights or blackouts loses up to half of that part of the score.
 * Light: ≥ 70 green, 40–69 amber, < 40 red.
 */
import { THRESHOLDS, type Verdict, type WindowMetrics } from "./metrics";
import { plainDuration } from "./plain";

export type Light = "green" | "amber" | "red";

/** Display words for the power and comms ratings, the same in every mode and screen. */
export const VERDICT_LABEL: Record<Verdict, string> = { Good: "Good", Marginal: "OK", Poor: "Poor" };

export function powerPart(m: WindowMetrics): number {
  return m.illuminationPct * (1 - 0.5 * Math.min(1, m.longestNightH / THRESHOLDS.power.poorNightH));
}

export function commsPart(m: WindowMetrics): number {
  return m.commsPct * (1 - 0.5 * Math.min(1, m.longestBlackoutH / THRESHOLDS.comms.poorBlackoutH));
}

export function rawScore(m: WindowMetrics): number {
  return Math.max(0, Math.min(100, 0.4 * powerPart(m) + 0.4 * commsPart(m) + 0.2 * m.combinedPct));
}

export function score(m: WindowMetrics): number {
  return Math.round(rawScore(m));
}

export function light(sc: number): Light {
  return sc >= 70 ? "green" : sc >= 40 ? "amber" : "red";
}

export const LIGHT_COLOR: Record<Light, string> = { green: "var(--good)", amber: "var(--marginal)", red: "var(--poor)" };

/** Short reason, e.g. "lots of sunlight, but Earth drops out for 4 days 16 hours". */
export function why(m: WindowMetrics): string {
  const sun =
    m.illuminationPct >= 85
      ? "lots of sunlight"
      : m.illuminationPct >= 60
        ? "good sunlight"
        : m.illuminationPct >= 35
          ? "sunlight comes and goes"
          : "mostly dark";
  const night = m.longestNightH >= 24 ? ` (longest night ${plainDuration(m.longestNightH)})` : "";
  let earth: string;
  if (m.commsPct >= 99.5) earth = "Earth always in view";
  else if (m.commsPct < 0.5) earth = "Earth never in view";
  else if (m.longestBlackoutH >= 24) earth = `Earth drops out for up to ${plainDuration(m.longestBlackoutH)}`;
  else earth = `Earth in view ${Math.round(m.commsPct)}% of the time`;
  const good = (m.illuminationPct >= 60 ? 1 : 0) + (m.commsPct >= 60 && m.longestBlackoutH < 48 ? 1 : 0);
  const joiner = good === 1 ? ", but " : good === 2 ? " and " : ", and ";
  return `${sun}${night}${joiner}${earth}`.replace(/^./, (c) => c.toUpperCase());
}
