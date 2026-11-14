"use client";

import { useMemo, useState } from "react";
import { DEFAULT_LANDER, darkEndurance, fmtDays, simulateBattery, type LanderSpec } from "@/lib/battery";
import { DAY, type Sample, type Settings } from "@/lib/metrics";
import { fmtUtc } from "@/lib/format";

interface Props {
  series: Sample[];
  from: number;
  to: number;
  settings: Settings;
  t: number;
  simple: boolean;
}

const W = 1000;
const H = 120;

/** Battery state of charge of a reference lander over the mission window (driven by real sunlight). */
export function BatteryPanel({ series, from, to, settings, t, simple }: Props) {
  const [spec, setSpec] = useState<LanderSpec>(DEFAULT_LANDER);
  const r = useMemo(() => simulateBattery(series, from, to, settings, spec), [series, from, to, settings, spec]);
  const now = r.soc.find((p) => p.t >= t) ?? r.soc[r.soc.length - 1];
  const nowPct = Math.round((now?.v ?? 1) * 100);
  const minPct = Math.round(r.minSoc * 100);
  const color = (v: number) => (v > 0.5 ? "var(--good)" : v > 0.2 ? "var(--marginal)" : "var(--poor)");

  const path = useMemo(() => {
    if (!r.soc.length) return { line: "", area: "" };
    const x = (tt: number) => ((tt - from) / (to - from)) * W;
    const y = (v: number) => H - 4 - v * (H - 8);
    const line = r.soc.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [r, from, to]);
  const cx = ((Math.min(Math.max(t, from), to) - from) / (to - from)) * W;

  const verdict =
    r.deadHours === 0
      ? minPct >= 50
        ? "The battery never drops below half: power is comfortable."
        : `The battery dips to ${minPct}% but never runs flat.`
      : `The battery runs flat ${r.firstEmpty ? `on ${fmtUtc(r.firstEmpty, false)}` : ""} and the lander is without power for ${fmtDays(r.deadHours)} in total; it would need a bigger battery or a survival mode.`;

  const days = Math.round((to - from) / DAY);
  return (
    <section className="card flex flex-col gap-4 p-5" style={{ borderTop: `1px solid ${color(r.minSoc)}` }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="display text-xs tracking-[0.3em]">Battery · reference lander</h3>
        <span className="text-xs text-muted">
          {spec.arrayW} W panels · {(spec.batteryWh / 1000).toFixed(1)} kWh battery · {spec.loadW} W load · full battery lasts {fmtDays(darkEndurance(spec))} in the dark
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex gap-6 md:flex-col md:gap-3">
          <div>
            <div className="text-[11px] text-muted">At the cursor</div>
            <div className="num text-3xl" style={{ color: color(now?.v ?? 1) }}>
              {nowPct}%
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Lowest in {days} days</div>
            <div className="num text-xl" style={{ color: color(r.minSoc) }}>
              {minPct}%
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Without power</div>
            <div className="num text-xl" style={{ color: r.deadHours ? "var(--poor)" : "var(--good)" }}>
              {r.deadHours ? fmtDays(r.deadHours) : "never"}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`Battery charge over ${days} days, lowest ${minPct}%`}>
            <defs>
              <linearGradient id="soc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--good)" stopOpacity="0.35" />
                <stop offset="0.6" stopColor="var(--marginal)" stopOpacity="0.2" />
                <stop offset="1" stopColor="var(--poor)" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            <rect width={W} height={H} fill="#060607" />
            {[0.2, 0.5].map((v) => (
              <line key={v} x1={0} x2={W} y1={H - 4 - v * (H - 8)} y2={H - 4 - v * (H - 8)} stroke="#2a2a30" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={path.area} fill="url(#soc-fill)" />
            <path d={path.line} fill="none" stroke="#ececee" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={cx} x2={cx} y1={0} y2={H} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between text-[11px] text-muted">
            <span>{fmtUtc(from, false)}</span>
            <span>dashed lines: 50% and 20%</span>
            <span>{fmtUtc(to, false)}</span>
          </div>
          <p className="text-sm">{verdict}</p>
          {simple && (
            <p className="text-xs leading-relaxed text-muted">
              Panels charge the battery while the Sun is above the hills; in shadow the lander lives on its battery. Long polar nights are why most landers do not survive the lunar
              night.
            </p>
          )}
        </div>
      </div>

      {!simple && (
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3 text-xs">
          <Num label="Solar array (W)" value={spec.arrayW} min={50} max={5000} step={50} onChange={(v) => setSpec({ ...spec, arrayW: v })} />
          <Num label="Battery (Wh)" value={spec.batteryWh} min={200} max={50000} step={100} onChange={(v) => setSpec({ ...spec, batteryWh: v })} />
          <Num label="Constant load (W)" value={spec.loadW} min={10} max={3000} step={10} onChange={(v) => setSpec({ ...spec, loadW: v })} />
          <button className="btn !py-1 text-xs" onClick={() => setSpec(DEFAULT_LANDER)}>
            Reset
          </button>
          <span className="text-muted">Charge efficiency {Math.round(spec.chargeEff * 100)}%; battery full at the start of the window; {settings.panel} panel.</span>
        </div>
      )}
    </section>
  );
}

function Num({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        className="w-28"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}
