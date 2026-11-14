"use client";

import { LIGHT_COLOR, VERDICT_LABEL, light, score, why } from "@/lib/score";
import { commsVerdict, powerVerdict, THRESHOLDS, type Events, type Sample, type Settings, type Verdict, type WindowMetrics } from "@/lib/metrics";
import { compass, fmtHours, fmtRelative, fmtUtc } from "@/lib/format";
import { Tip, useMode } from "./ModeProvider";

export function VerdictBadge({ v, small }: { v: Verdict; small?: boolean }) {
  const color = v === "Good" ? "var(--good)" : v === "Marginal" ? "var(--marginal)" : "var(--poor)";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-normal uppercase tracking-[0.12em] ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ color, borderColor: color }}
    >
      <span aria-hidden>{v === "Good" ? "●" : v === "Marginal" ? "◐" : "○"}</span>
      {VERDICT_LABEL[v]}
    </span>
  );
}

/** The single overall rating: 0–100 score with a traffic-light colour. */
export function ScoreBadge({ m, small }: { m: WindowMetrics; small?: boolean }) {
  const sc = score(m);
  const color = LIGHT_COLOR[light(sc)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border uppercase tracking-[0.12em] ${small ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ color, borderColor: color }}
      title={`Overall score 0–100. ${why(m)}`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
      Score {sc}
    </span>
  );
}

function Row({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <span className="tabular text-right">
        {value}
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function EventRow({ label, at, now, searchDays }: { label: string; at: number | null; now: number; searchDays: number }) {
  return (
    <Row
      label={label}
      value={at === null ? <span className="text-muted">not within {searchDays} days</span> : fmtRelative(at, now)}
      sub={at === null ? undefined : fmtUtc(at)}
    />
  );
}

interface Props {
  now: Sample;
  events: Events;
  /** how far ahead (days) the event search reaches from the cursor */
  searchDays: number;
  metrics: WindowMetrics;
  settings: Settings;
  onSettings: (s: Partial<Settings>) => void;
}

export function MetricCards({ now, events, searchDays, metrics, settings, onSettings }: Props) {
  const { mode } = useMode();
  const expert = mode === "pro";
  const lit = now.sunFrac > 0;
  const comms = now.earthClear >= settings.marginDeg;
  const pv = powerVerdict(metrics);
  const cv = commsVerdict(metrics);
  const wDays = Math.round((metrics.to - metrics.from) / 86_400_000);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* POWER */}
      <section className="card flex flex-col gap-1 p-5" style={{ borderTop: "1px solid var(--sun)" }}>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="display text-xs tracking-[0.3em] text-sun">Power</h3>
          <VerdictBadge v={pv} />
        </header>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="num text-xl leading-snug">{lit ? `${(now.sunFrac * 100).toFixed(0)}% of Sun visible` : "Sun hidden"}</div>
          <div className="text-right" title="Solar elevation above the local horizontal plane (no atmosphere, no refraction)">
            <div className="num text-3xl leading-none text-sun">{now.sunEl.toFixed(1)}°</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted">Sun elevation</div>
          </div>
        </div>
        <Row label="Sun elevation" value={`${now.sunEl.toFixed(2)}°`} sub={expert ? `az ${now.sunAz.toFixed(2)}° · terrain ${now.sunHz.toFixed(2)}°` : `toward ${compass(now.sunAz)}`} />
        {lit ? <EventRow label="Sunset over terrain" at={events.sunset} now={now.t} searchDays={searchDays} /> : <EventRow label="Sunrise over terrain" at={events.sunrise} now={now.t} searchDays={searchDays} />}
        <Row label={`Illumination (${wDays} d)`} value={`${metrics.illuminationPct.toFixed(1)}%`} />
        <Row label="Longest night" value={fmtHours(metrics.longestNightH)} />
        <Row
          label={
            <span className="flex items-center gap-2">
              Power index
              <select value={settings.panel} onChange={(e) => onSettings({ panel: e.target.value as Settings["panel"] })} aria-label="Panel type" className="!py-0 !text-xs">
                <option value="tracking">sun-tracking panel</option>
                <option value="horizontal">horizontal panel</option>
              </select>
            </span>
          }
          value={`${(metrics.powerIndex * 100).toFixed(1)}%`}
        />
        <Tip>
          {settings.panel === "tracking"
            ? "Power index = average share of the solar disk visible: a panel that always faces the Sun. At the pole a vertical, rotating panel is what landers really use."
            : "A flat panel only collects sin(elevation) of the light. Near the pole the Sun skims the horizon, so flat panels get almost nothing."}
        </Tip>
      </section>

      {/* COMMS */}
      <section className="card flex flex-col gap-1 p-5" style={{ borderTop: "1px solid var(--earth)" }}>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="display text-xs tracking-[0.3em] text-earth">Comms · direct to Earth</h3>
          <VerdictBadge v={cv} />
        </header>
        <div className="num mb-3 text-xl leading-snug">{comms ? "Earth in view" : now.earthClear > 0 ? "Earth too low" : "Earth hidden"}</div>
        <Row
          label="Earth over terrain"
          value={`${now.earthClear >= 0 ? "+" : ""}${now.earthClear.toFixed(2)}°`}
          sub={expert ? `el ${now.earthEl.toFixed(2)}° · az ${now.earthAz.toFixed(2)}° · terrain ${now.earthHz.toFixed(2)}°` : `toward ${compass(now.earthAz)}`}
        />
        {comms ? <EventRow label="Earthset (loss of link)" at={events.earthset} now={now.t} searchDays={searchDays} /> : <EventRow label="Earthrise (link back)" at={events.earthrise} now={now.t} searchDays={searchDays} />}
        <Row label={`Comms available (${wDays} d)`} value={`${metrics.commsPct.toFixed(1)}%`} />
        <Row label="Longest blackout" value={fmtHours(metrics.longestBlackoutH)} />
        <Row
          label="Margin above terrain"
          value={
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={settings.marginDeg}
              onChange={(e) => onSettings({ marginDeg: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
              className="w-16 text-right"
              aria-label="Comms margin in degrees"
            />
          }
        />
        <Tip>Earth never rises or sets the way the Sun does: it hangs in the same part of the sky and wobbles a few degrees (libration). Near the pole that wobble decides whether a ridge blocks the link.</Tip>
      </section>

      {/* COMBINED */}
      <section className="card flex flex-col gap-1 p-5" style={{ borderTop: "1px solid var(--both)" }}>
        <header className="mb-2 flex items-center justify-between">
          <h3 className="display text-xs tracking-[0.3em] text-both">Combined window</h3>
          <ScoreBadge m={metrics} />
        </header>
        <div className="num mb-3 text-xl leading-snug">{fmtHours(metrics.combinedH)} of light + comms</div>
        <Row label="Share of mission window" value={`${metrics.combinedPct.toFixed(1)}%`} />
        <Row label="Mission window" value={`${wDays} days`} sub={`${fmtUtc(metrics.from)} → ${fmtUtc(metrics.to)}`} />
        <Row
          label="Window length"
          value={
            <select value={settings.windowDays} onChange={(e) => onSettings({ windowDays: Number(e.target.value) })} aria-label="Mission window length">
              {[3, 7, 14, 21, 28].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          }
        />
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Verdict thresholds</summary>
          <ul className="mt-1 list-disc pl-4">
            <li>
              Power Good: illumination ≥ {THRESHOLDS.power.goodPct}% and longest night ≤ {THRESHOLDS.power.goodNightH} h. Poor: &lt; {THRESHOLDS.power.poorPct}% or night &gt; {THRESHOLDS.power.poorNightH} h.
            </li>
            <li>
              Comms Good: ≥ {THRESHOLDS.comms.goodPct}% and blackout ≤ {THRESHOLDS.comms.goodBlackoutH} h. Poor: &lt; {THRESHOLDS.comms.poorPct}% or blackout &gt; {THRESHOLDS.comms.poorBlackoutH} h.
            </li>
            <li>Otherwise OK. The overall rating is the 0–100 score: 70+ green, 40–69 amber, below 40 red.</li>
          </ul>
        </details>
        <Tip>A lander needs both: sunlight to charge and Earth in view to send data home. This counts the hours where both happen at once.</Tip>
      </section>
    </div>
  );
}
