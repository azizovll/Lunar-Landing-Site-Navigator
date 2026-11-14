"use client";

import { useMemo } from "react";
import { SITES, fmtLatLon, resolvePreset } from "@/lib/sites";
import { overallVerdict, sampleSeries, windowMetrics, type Settings } from "@/lib/metrics";
import { VerdictBadge } from "./MetricCards";

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
    const out: Record<string, { ill: number; comms: number; v: ReturnType<typeof overallVerdict> }> = {};
    for (const s of SITES) {
      const site = resolvePreset(s);
      const series = sampleSeries(site, from, to, 30 * 60_000);
      const m = windowMetrics(series, from, to, settings);
      out[s.id] = { ill: m.illuminationPct, comms: m.commsPct, v: overallVerdict(m) };
    }
    return out;
  }, [from, settings]);

  return (
    <div className="card max-h-[520px] overflow-y-auto">
      {GROUPS.map((g) => (
        <div key={g.kind}>
          <div className="sticky top-0 bg-panel px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.label}</div>
          <ul>
            {SITES.filter((s) => (g.kind === "south-pole" ? s.kind === "south-pole" : s.kind !== "south-pole")).map((s) => {
              const m = summary[s.id];
              const sel = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`w-full border-l-2 px-3 py-2 text-left hover:bg-panel2 ${sel ? "border-sun bg-panel2" : "border-transparent"}`}
                    aria-current={sel}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.name}</span>
                      {m && <VerdictBadge v={m.v} small />}
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
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#1b2440]">
        <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="tabular w-14 text-right">
        {value.toFixed(0)}% {label}
      </span>
    </div>
  );
}
