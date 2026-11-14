"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DAY, DEFAULT_SETTINGS, alignTime, overallVerdict, sampleAt, sampleSeries, windowMetrics, type Settings, type WindowMetrics } from "@/lib/metrics";
import { downloadCsv, fmtHours, parseUtc, toUtcInput } from "@/lib/format";
import { SITES, getSite, resolvePreset } from "@/lib/sites";
import { useUrlState } from "@/lib/useUrlState";
import { VerdictBadge } from "./MetricCards";
import { ExpertOnly, Tip } from "./ModeProvider";

const KEYS = ["a", "b", "c", "d"] as const;
const MAX_DELAY = 60;
const DEFAULT_COLS = ["shackleton-rim", "connecting-ridge", "malapert-massif", "apollo-11"];

interface Col {
  key: string;
  siteId: string;
  start: number;
}

interface RowDef {
  label: string;
  get: (m: WindowMetrics, extra: { sunClear: number; earthClear: number }) => number;
  fmt: (v: number) => string;
  better: "high" | "low";
  tip?: string;
}

const ROWS: RowDef[] = [
  { label: "Illumination", get: (m) => m.illuminationPct, fmt: (v) => `${v.toFixed(1)}%`, better: "high" },
  { label: "Longest night", get: (m) => m.longestNightH, fmt: fmtHours, better: "low" },
  { label: "Power index", get: (m) => m.powerIndex * 100, fmt: (v) => `${v.toFixed(1)}%`, better: "high" },
  { label: "Comms available", get: (m) => m.commsPct, fmt: (v) => `${v.toFixed(1)}%`, better: "high" },
  { label: "Longest blackout", get: (m) => m.longestBlackoutH, fmt: fmtHours, better: "low" },
  { label: "Light + comms", get: (m) => m.combinedH, fmt: fmtHours, better: "high" },
  { label: "Sun over terrain at landing", get: (_m, e) => e.sunClear, fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`, better: "high" },
  { label: "Earth over terrain at landing", get: (_m, e) => e.earthClear, fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`, better: "high" },
];

export function CompareView() {
  const { params, set } = useUrlState();
  const [today] = useState(() => alignTime(Date.now(), DAY));
  const delay = Math.max(0, Math.min(MAX_DELAY, Number(params.get("delay") ?? 0)));
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    marginDeg: Number(params.get("margin") ?? 2),
    windowDays: Number(params.get("window") ?? 14),
    panel: params.get("panel") === "horizontal" ? "horizontal" : "tracking",
  };

  const anyParam = KEYS.some((k) => params.get(k));
  const cols: Col[] = KEYS.map((k, i): Col | null => {
    const raw = params.get(k);
    if (!raw) return anyParam ? null : { key: k, siteId: DEFAULT_COLS[i], start: today };
    const [id, date] = raw.split(":");
    return getSite(id) ? { key: k, siteId: id, start: parseUtc(date) ?? today } : null;
  }).filter((c): c is Col => c !== null);

  const colKey = cols.map((c) => `${c.siteId}@${c.start}`).join("|");
  const computed = useMemo(
    () =>
      cols.map((c) => {
        const site = resolvePreset(getSite(c.siteId)!);
        const series = sampleSeries(site, c.start, c.start + (MAX_DELAY + settings.windowDays) * DAY, 20 * 60_000);
        const sweep = Array.from({ length: MAX_DELAY + 1 }, (_, d) => {
          const from = c.start + d * DAY;
          return windowMetrics(series, from, from + settings.windowDays * DAY, settings);
        });
        return { site, series, sweep };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colKey, settings.windowDays, settings.marginDeg, settings.panel],
  );

  const writeCols = (next: Col[]) => {
    const patch: Record<string, string | null> = {};
    KEYS.forEach((k, i) => (patch[k] = next[i] ? `${next[i].siteId}:${toUtcInput(next[i].start, false)}` : null));
    set(patch);
  };

  const rows = ROWS.map((r) => {
    const vals = computed.map((c, i) => {
      const m = c.sweep[delay];
      const s = sampleAt(c.site, alignTime(cols[i].start + delay * DAY));
      const v = r.get(m, { sunClear: s.sunEl - s.sunHz, earthClear: s.earthClear });
      const m0 = c.sweep[0];
      const s0 = sampleAt(c.site, alignTime(cols[i].start));
      const v0 = r.get(m0, { sunClear: s0.sunEl - s0.sunHz, earthClear: s0.earthClear });
      return { v, v0 };
    });
    const best = r.better === "high" ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
    return { r, vals, best };
  });

  const exportCsv = () =>
    downloadCsv(`compare-delay${delay}d.csv`, [
      ["metric", ...cols.map((c) => `${c.siteId} ${toUtcInput(c.start + delay * DAY, false)}`)],
      ...rows.map(({ r, vals }) => [r.label, ...vals.map((x) => r.fmt(x.v))]),
      ["verdict", ...computed.map((c) => overallVerdict(c.sweep[delay]))],
    ]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Compare scenarios</h1>
        <p className="text-sm text-muted">Up to four “site + date” columns over a {settings.windowDays}-day mission window. Best value per row is highlighted.</p>
      </header>

      <div className="card flex flex-wrap items-center gap-4 p-3">
        <label className="flex flex-1 items-center gap-3">
          <span className="whitespace-nowrap text-sm font-semibold">Launch delay</span>
          <input type="range" min={0} max={MAX_DELAY} value={delay} onChange={(e) => set({ delay: Number(e.target.value) || null })} className="flex-1" aria-label="Launch delay in days" />
          <span className="tabular w-16 text-right text-lg font-semibold text-sun">+{delay} d</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Window
          <select value={settings.windowDays} onChange={(e) => set({ window: e.target.value })}>
            {[3, 7, 14, 21, 28].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>
      <Tip>Drag the delay slider: if the launch slips by N days, every scenario’s landing date shifts by N days. Arrows show whether each number got better (▲) or worse (▼) than the on-time plan.</Tip>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-44"></th>
              {cols.map((c, i) => (
                <th key={c.key} className="card p-2 text-left align-top font-normal">
                  <select
                    value={c.siteId}
                    onChange={(e) => writeCols(cols.map((x, j) => (j === i ? { ...x, siteId: e.target.value } : x)))}
                    className="mb-1 w-full font-semibold"
                    aria-label={`Site for column ${i + 1}`}
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={toUtcInput(c.start, false)}
                    onChange={(e) => e.target.value && writeCols(cols.map((x, j) => (j === i ? { ...x, start: parseUtc(e.target.value)! } : x)))}
                    className="w-full"
                    aria-label={`Planned landing date for column ${i + 1}`}
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{delay ? `lands ${toUtcInput(c.start + delay * DAY, false)}` : "on time"}</span>
                    {cols.length > 1 && (
                      <button className="hover:text-poor" onClick={() => writeCols(cols.filter((_, j) => j !== i))} aria-label="Remove column">
                        remove ✕
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {cols.length < 4 && (
                <th className="p-2 align-top">
                  <button className="btn" onClick={() => writeCols([...cols, { key: KEYS[cols.length], siteId: SITES[cols.length + 2].id, start: today }])}>
                    + Add
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-2 text-muted">Verdict</td>
              {computed.map((c, i) => (
                <td key={i} className="p-2">
                  <VerdictBadge v={overallVerdict(c.sweep[delay])} />
                </td>
              ))}
            </tr>
            {rows.map(({ r, vals, best }) => (
              <tr key={r.label}>
                <td className="border-t border-line py-2 pr-2 text-muted">{r.label}</td>
                {vals.map((x, i) => {
                  const isBest = Math.abs(x.v - best) < 1e-9 && vals.length > 1;
                  const diff = x.v - x.v0;
                  const improved = r.better === "high" ? diff > 1e-6 : diff < -1e-6;
                  const worse = r.better === "high" ? diff < -1e-6 : diff > 1e-6;
                  return (
                    <td key={i} className={`tabular border-t border-line p-2 ${isBest ? "bg-both/10 font-semibold text-both" : ""}`}>
                      {r.fmt(x.v)}
                      {delay > 0 && (improved || worse) && (
                        <span className={`ml-1.5 text-xs ${improved ? "text-good" : "text-poor"}`} title={`on time: ${r.fmt(x.v0)}`}>
                          {improved ? "▲" : "▼"}
                          <ExpertOnly> {r.fmt(Math.abs(diff)).replace("-", "")}</ExpertOnly>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="border-t border-line py-2 pr-2 align-top text-muted">
                Light + comms vs delay
                <div className="text-xs">0 → {MAX_DELAY} days</div>
              </td>
              {computed.map((c, i) => (
                <td key={i} className="border-t border-line p-2">
                  <Sweep values={c.sweep.map((m) => m.combinedH)} max={settings.windowDays * 24} delay={delay} onPick={(d) => set({ delay: d || null })} />
                </td>
              ))}
            </tr>
            <tr>
              <td></td>
              {cols.map((c, i) => (
                <td key={i} className="p-2 text-xs">
                  <Link className="underline decoration-dotted hover:text-foreground text-muted" href={`/?site=${c.siteId}&start=${toUtcInput(c.start + delay * DAY, false)}`}>
                    Open sky view →
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ExpertOnly>
        <div className="flex gap-2">
          <button className="btn" onClick={exportCsv}>
            Export table as CSV
          </button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
            Copy shareable link
          </button>
        </div>
      </ExpertOnly>
    </div>
  );
}

/** Small sparkline of combined light+comms hours for each launch delay; click to jump to that delay. */
function Sweep({ values, max, delay, onPick }: { values: number[]; max: number; delay: number; onPick: (d: number) => void }) {
  const w = 180;
  const h = 44;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block w-full max-w-[200px] cursor-pointer"
      onClick={(e) => {
        const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onPick(Math.round(((e.clientX - box.left) / box.width) * (values.length - 1)));
      }}
      role="img"
      aria-label="Combined hours by launch delay"
    >
      <rect width={w} height={h} fill="#0a0f1c" rx={4} />
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--both)" opacity={0.15} />
      <path d={d} fill="none" stroke="var(--both)" strokeWidth={1.5} />
      <line x1={x(delay)} x2={x(delay)} y1={0} y2={h} stroke="#fff" />
    </svg>
  );
}
