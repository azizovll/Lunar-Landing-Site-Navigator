"use client";

import { useMemo } from "react";
import { SITES, fmtLatLon, resolvePreset } from "@/lib/sites";
import { commsVerdict, powerVerdict, sampleSeries, windowMetrics, type Settings, type Verdict } from "@/lib/metrics";

const GROUPS = [
  { kind: "south-pole", label: "South-pole candidates" },
  { kind: "lander", label: "Landers & contrast" },
];

interface Props {
  selectedId: string | null;
  from: number;
  settings: Settings;
  onSelect: (id: string) => void;
}

/** Preset list with a live mini-summary (illumination and comms over the mission window) for every site. */
export function SiteList({ selectedId, from, settings, onSelect }: Props) {
  const summary = useMemo(() => {
    const to = from + settings.windowDays * 86_400_000;
    const out: Record<string, { ill: number; comms: number; pv: Verdict; cv: Verdict }> = {};
    for (const s of SITES) {
      const site = resolvePreset(s);
      const series = sampleSeries(site, from, to, 30 * 60_000);
      const m = windowMetrics(series, from, to, settings);
      out[s.id] = { ill: m.illuminationPct, comms: m.commsPct, pv: powerVerdict(m), cv: commsVerdict(m) };
    }
    return out;
  }, [from, settings]);

  return (
    <div className="card max-h-[560px] overflow-y-auto">
      {GROUPS.map((g) => (
        <div key={g.kind}>
          <div className="eyebrow sticky top-0 z-10 border-b border-line bg-panel px-4 py-3 !text-[0.6rem] !tracking-[0.3em] text-muted">{g.label}</div>
          <ul>
            {SITES.filter((s) => (g.kind === "south-pole" ? s.kind === "south-pole" : s.kind !== "south-pole")).map((s) => {
              const m = summary[s.id];
              const sel = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`w-full border-b border-l-2 border-b-line px-4 py-3 text-left transition-colors hover:bg-panel2 ${sel ? "border-l-foreground bg-panel2" : "border-l-transparent"}`}
                    aria-current={sel}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-normal">{s.name}</span>
                      {m && (
                        <span className="flex gap-1">
                          <Dot v={m.pv} label="Power" color="var(--sun)" />
                          <Dot v={m.cv} label="Comms" color="var(--earth)" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{fmtLatLon(s.lat, s.lon)}</div>
                    {m && (
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <Bar value={m.ill} color="var(--sun)" label="light" />
                        <Bar value={m.comms} color="var(--earth)" label="comms" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <div className="h-[3px] flex-1 overflow-hidden bg-panel3">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="tabular w-14 text-right">
        {value.toFixed(0)}% {label}
      </span>
    </div>
  );
}

const VCOLOR: Record<Verdict, string> = { Good: "var(--good)", Marginal: "var(--marginal)", Poor: "var(--poor)" };

/** Compact per-aspect verdict: power and comms are shown separately so a well-lit site is not hidden behind its comms verdict. */
export function Dot({ v, label, color }: { v: Verdict; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 border px-1.5 text-[10px] uppercase tracking-[0.1em]" style={{ borderColor: VCOLOR[v], color: VCOLOR[v] }} title={`${label}: ${v}`}>
      <span style={{ color }}>{label === "Power" ? "☀" : "⊕"}</span>
      {v}
    </span>
  );
}
