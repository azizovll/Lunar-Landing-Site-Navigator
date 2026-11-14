/**
 * Battery state of charge for a reference lander, driven by the real illumination series.
 *
 * Reference lander (editable in Pro mode):
 *   solar array 300 W at full Sun (sun-tracking; horizontal panels also lose sin(elevation)),
 *   battery 2 kWh usable, constant load 120 W (heaters, avionics, radio), charge efficiency 90 %.
 * Each step: net = array × visible-fraction [× sin el] × efficiency − load. The battery starts
 * full at the beginning of the window and is clamped to [0, capacity]. Time at 0 % means the
 * lander would be without power (it could not run its load).
 */
import { DAY, type Sample, type Settings } from "./metrics";

export interface LanderSpec {
  arrayW: number;
  batteryWh: number;
  loadW: number;
  chargeEff: number;
}

export const DEFAULT_LANDER: LanderSpec = { arrayW: 300, batteryWh: 2000, loadW: 120, chargeEff: 0.9 };

export interface BatteryResult {
  /** state of charge 0..1 for each sample in the window */
  soc: { t: number; v: number }[];
  minSoc: number;
  /** hours with an empty battery and not enough sunlight to run the load */
  deadHours: number;
  /** first time the battery runs flat, or null */
  firstEmpty: number | null;
  endSoc: number;
}

export function simulateBattery(series: Sample[], from: number, to: number, settings: Settings, spec: LanderSpec = DEFAULT_LANDER): BatteryResult {
  const win = series.filter((s) => s.t >= from && s.t < to);
  const stepH = win.length > 1 ? (win[1].t - win[0].t) / 3_600_000 : 1 / 6;
  let wh = spec.batteryWh;
  let minSoc = 1;
  let deadH = 0;
  let firstEmpty: number | null = null;
  const soc: { t: number; v: number }[] = [];
  for (const s of win) {
    const sunFactor = settings.panel === "tracking" ? s.sunFrac : s.sunFrac * Math.max(0, Math.sin((s.sunEl * Math.PI) / 180));
    const gen = spec.arrayW * sunFactor;
    const net = gen >= spec.loadW ? (gen - spec.loadW) * spec.chargeEff : gen - spec.loadW;
    wh = Math.min(spec.batteryWh, wh + net * stepH);
    if (wh <= 0) {
      wh = 0;
      deadH += stepH;
      if (firstEmpty === null) firstEmpty = s.t;
    }
    const v = wh / spec.batteryWh;
    minSoc = Math.min(minSoc, v);
    soc.push({ t: s.t, v });
  }
  return { soc, minSoc, deadHours: deadH, firstEmpty, endSoc: soc.length ? soc[soc.length - 1].v : 1 };
}

/** How long a full battery lasts in total darkness, in hours. */
export const darkEndurance = (spec: LanderSpec = DEFAULT_LANDER) => spec.batteryWh / spec.loadW;

export const fmtDays = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} hours`);
export const BATTERY_WINDOW_MS = (days: number) => days * DAY;
