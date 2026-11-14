"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DAY, DEFAULT_SETTINGS, alignTime, commsVerdict, powerVerdict, sampleAt, sampleSeries, windowMetrics, type Settings, type WindowMetrics } from "@/lib/metrics";
import { downloadCsv, fmtHours, parseUtc, toUtcInput } from "@/lib/format";
import { SITES, fmtLatLon, getSite, resolvePreset, type ResolvedSite } from "@/lib/sites";
import { useUrlState } from "@/lib/useUrlState";
import { parseLatLon, useCustomSites } from "@/lib/useResolvedSite";
import { ScoreBadge } from "./MetricCards";
import { Dot } from "./SiteList";
import { CopyLinkButton } from "./CopyLinkButton";
import { ExpertOnly, Tip, useMode } from "./ModeProvider";
import { plainDuration, plainShare } from "@/lib/plain";
import { score } from "@/lib/score";
import { simulateBattery } from "@/lib/battery";
import { SectionTitle } from "./ui";

const KEYS = ["a", "b", "c", "d"] as const;
const MAX_DELAY = 60;
const DEFAULT_COLS = ["shackleton-rim", "connecting-ridge", "malapert-massif", "apollo-11"];

interface Col {
  key: string;
  /** preset id, or "custom" with `custom` coordinates */
  siteId: string;
  custom?: { lat: number; lon: number };
  start: number;
}

/** URL form of a column: "presetId:YYYY-MM-DD" or "@lat,lon:YYYY-MM-DD" for a custom point. */
const colToParam = (c: Col) => `${c.custom ? `@${c.custom.lat},${c.custom.lon}` : c.siteId}:${toUtcInput(c.start, false)}`;

interface RowDef {
  label: string;
  get: (m: WindowMetrics, extra: { sunClear: number; earthClear: number; battery: number }) => number;
  fmt: (v: number) => string;
  better: "high" | "low";
  /** Simple mode: friendlier label and wording; rows without it are Pro-only */
  simple?: { label: string; fmt: (v: number, windowDays: number) => string };
}

const ROWS: RowDef[] = [
  { label: "Score (0–100)", get: (m) => score(m), fmt: (v) => `${v}`, better: "high", simple: { label: "Overall score", fmt: (v) => `${v} / 100` } },
  { label: "Illumination", get: (m) => m.illuminationPct, fmt: (v) => `${v.toFixed(1)}%`, better: "high", simple: { label: "☀ Sunlight", fmt: plainShare } },
  { label: "Longest night", get: (m) => m.longestNightH, fmt: fmtHours, better: "low", simple: { label: "Longest darkness", fmt: (v) => plainDuration(v) } },
  { label: "Power index", get: (m) => m.powerIndex * 100, fmt: (v) => `${v.toFixed(1)}%`, better: "high" },
  { label: "Comms available", get: (m) => m.commsPct, fmt: (v) => `${v.toFixed(1)}%`, better: "high", simple: { label: "⊕ Earth in view", fmt: plainShare } },
  { label: "Longest blackout", get: (m) => m.longestBlackoutH, fmt: fmtHours, better: "low", simple: { label: "Longest silence", fmt: (v) => plainDuration(v) } },
  { label: "Light + comms", get: (m) => m.combinedH, fmt: fmtHours, better: "high", simple: { label: "Sun and Earth together", fmt: (v) => plainDuration(v) } },
  { label: "Battery, lowest (reference lander)", get: (_m, e) => e.battery, fmt: (v) => `${Math.round(v)}%`, better: "high", simple: { label: "Battery at its lowest", fmt: (v) => (v <= 0 ? "runs flat" : `${Math.round(v)}%`) } },
  { label: "Sun over terrain at landing", get: (_m, e) => e.sunClear, fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`, better: "high" },
  { label: "Earth over terrain at landing", get: (_m, e) => e.earthClear, fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`, better: "high" },
];

export function CompareView() {
  const { params, set } = useUrlState();
  const { mode } = useMode();
  const [today] = useState(() => alignTime(Date.now(), DAY));
  const delay = Math.max(0, Math.min(MAX_DELAY, Number(params.get("delay") ?? 0)));
  const marginDeg = Number(params.get("margin") ?? 2);
  const windowDays = Number(params.get("window") ?? 14);
  const panel: Settings["panel"] = params.get("panel") === "horizontal" ? "horizontal" : "tracking";
  const settings: Settings = useMemo(() => ({ ...DEFAULT_SETTINGS, marginDeg, windowDays, panel }), [marginDeg, windowDays, panel]);

  const anyParam = KEYS.some((k) => params.get(k));
  const cols: Col[] = KEYS.map((k, i): Col | null => {
    const raw = params.get(k);
    if (!raw) return anyParam ? null : { key: k, siteId: DEFAULT_COLS[i], start: today };
    const [id, date] = raw.split(":");
    const start = parseUtc(date) ?? today;
    if (id.startsWith("@")) {
      const ll = parseLatLon(id.slice(1));
      return ll ? { key: k, siteId: "custom", custom: ll, start } : null;
    }
    return getSite(id) ? { key: k, siteId: id, start } : null;
  }).filter((c): c is Col => c !== null);

  const customPts = cols.flatMap((c) => (c.custom ? [c.custom] : []));
  const lookupCustom = useCustomSites(customPts);
  const sites: (ResolvedSite | undefined)[] = cols.map((c) => (c.custom ? lookupCustom(c.custom.lat, c.custom.lon) : resolvePreset(getSite(c.siteId)!)));

  const colKey = cols.map((c, i) => `${colToParam(c)}${sites[i] ? "" : "?"}`).join("|");
  const computed = useMemo(
    () =>
      cols.map((c, i) => {
        const site = sites[i];
        if (!site) return null;
        const series = sampleSeries(site, c.start, c.start + (MAX_DELAY + settings.windowDays) * DAY, 20 * 60_000);
        const sweep = Array.from({ length: MAX_DELAY + 1 }, (_, d) => {
          const from = c.start + d * DAY;
          return windowMetrics(series, from, from + settings.windowDays * DAY, settings);
        });
        return { site, series, sweep };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colKey, settings],
  );

  const writeCols = (next: Col[]) => {
    const patch: Record<string, string | null> = {};
    KEYS.forEach((k, i) => (patch[k] = next[i] ? colToParam(next[i]) : null));
    set(patch);
  };

  const simple = mode === "simple";
  // battery low point per column, for the delayed and the on-time window
  const battery = computed.map((c, i) => {
    if (!c) return { now: NaN, onTime: NaN };
    const at = (start: number) => simulateBattery(c.series, start, start + settings.windowDays * DAY, settings).minSoc * 100;
    return { now: at(cols[i].start + delay * DAY), onTime: at(cols[i].start) };
  });
  const rows = ROWS.filter((r) => !simple || r.simple).map((r) => {
    const vals = computed.map((c, i) => {
      if (!c) return { v: NaN, v0: NaN };
      const m = c.sweep[delay];
      const s = sampleAt(c.site, alignTime(cols[i].start + delay * DAY));
      const v = r.get(m, { sunClear: s.sunEl - s.sunHz, earthClear: s.earthClear, battery: battery[i].now });
      const m0 = c.sweep[0];
      const s0 = sampleAt(c.site, alignTime(cols[i].start));
      const v0 = r.get(m0, { sunClear: s0.sunEl - s0.sunHz, earthClear: s0.earthClear, battery: battery[i].onTime });
      return { v, v0 };
    });
    const ready = vals.map((x) => x.v).filter((v) => !Number.isNaN(v));
    const best = r.better === "high" ? Math.max(...ready) : Math.min(...ready);
    // No highlight when every column has the same value: nothing is "best".
    const allEqual = ready.every((v) => Math.abs(v - ready[0]) < 1e-9);
    return { r, vals, best: allEqual ? NaN : best };
  });

  const exportCsv = () =>
    downloadCsv(`compare-delay${delay}d.csv`, [
      ["metric", ...cols.map((c) => `${c.custom ? fmtLatLon(c.custom.lat, c.custom.lon) : c.siteId} ${toUtcInput(c.start + delay * DAY, false)}`)],
      ...rows.map(({ r, vals }) => [r.label, ...vals.map((x) => (Number.isNaN(x.v) ? "" : r.fmt(x.v)))]),
      ["power / comms", ...computed.map((c) => (c ? `${powerVerdict(c.sweep[delay])} / ${commsVerdict(c.sweep[delay])}` : ""))],
    ]);

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle
        as="h1"
        center
        eyebrow="Compare"
        title={<>What if the launch<br />slips?</>}
        sub={`Up to four “site + date” scenarios over a ${settings.windowDays}-day mission window. The best value in each row is highlighted; the delay slider shifts every landing date at once.`}
      />

      <div className="card flex flex-wrap items-center gap-5 p-5">
        <label className="flex flex-1 items-center gap-3">
          <span className="eyebrow whitespace-nowrap !text-[0.65rem] !tracking-[0.3em]">Launch delay</span>
          <input type="range" min={0} max={MAX_DELAY} value={delay} onChange={(e) => set({ delay: Number(e.target.value) || null })} className="flex-1" aria-label="Launch delay in days" />
          <span className="num w-20 text-right text-2xl">+{delay} d</span>
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
      {simple && <QuickAnswer names={cols.map((c, i) => sites[i]?.name ?? (c.custom ? "Custom point" : c.siteId))} metrics={computed.map((c) => c?.sweep[delay] ?? null)} delay={delay} />}
      <p className="-mt-4 text-center text-sm text-muted">
        Want the tool to pick for you?{" "}
        <Link className="text-foreground underline underline-offset-4" href={`/rescue?site=${cols[0]?.siteId && !cols[0].custom ? cols[0].siteId : "shackleton-rim"}&date=${toUtcInput(cols[0]?.start ?? today, false)}&delay=${delay || 14}`}>
          Mission rescue finds the 3 best alternatives →
        </Link>
      </p>
      <Tip>Drag the delay slider: if the launch slips by N days, every scenario’s landing date shifts by N days. Arrows show whether each number got better (▲) or worse (▼) than the on-time plan.</Tip>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-44"></th>
              {cols.map((c, i) => (
                <th key={c.key} className="card p-3 text-left align-top font-normal">
                  <select
                    value={c.siteId}
                    onChange={(e) =>
                      writeCols(
                        cols.map((x, j) =>
                          j === i ? (e.target.value === "custom" ? { ...x, siteId: "custom", custom: x.custom ?? { lat: -89, lon: 0 } } : { ...x, siteId: e.target.value, custom: undefined }) : x,
                        ),
                      )
                    }
                    className="mb-1.5 w-full"
                    aria-label={`Site for column ${i + 1}`}
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="custom">Custom point…</option>
                  </select>
                  {c.custom && (
                    <CustomInputs
                      key={`${c.custom.lat},${c.custom.lon}`}
                      value={c.custom}
                      onChange={(ll) => writeCols(cols.map((x, j) => (j === i ? { ...x, custom: ll } : x)))}
                    />
                  )}
                  {c.custom && sites[i]?.terrain === "approx" && <div className="mb-1 text-[11px] text-marginal">approximate horizon (480 m/px)</div>}
                  {c.custom && sites[i]?.terrain === "flat" && <div className="mb-1 text-[11px] text-muted">flat horizon (north of 79°S)</div>}
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
              <td className="py-2 pr-2 text-muted">Verdict<div className="text-xs">score · power · comms</div></td>
              {computed.map((c, i) =>
                !c ? (
                  <td key={i} className="p-2 text-xs text-muted">
                    computing terrain…
                  </td>
                ) : (
                <td key={i} className="p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <ScoreBadge m={c.sweep[delay]} small />
                    <Dot v={powerVerdict(c.sweep[delay])} label="Power" color="var(--sun)" />
                    <Dot v={commsVerdict(c.sweep[delay])} label="Comms" color="var(--earth)" />
                  </div>
                </td>
                ),
              )}
            </tr>
            {rows.map(({ r, vals, best }) => (
              <tr key={r.label}>
                <td className="border-t border-line py-2 pr-2 text-muted">{simple && r.simple ? r.simple.label : r.label}</td>
                {vals.map((x, i) => {
                  const isBest = Math.abs(x.v - best) < 1e-9 && vals.length > 1;
                  const diff = x.v - x.v0;
                  const improved = r.better === "high" ? diff > 1e-6 : diff < -1e-6;
                  const worse = r.better === "high" ? diff < -1e-6 : diff > 1e-6;
                  if (Number.isNaN(x.v))
                    return (
                      <td key={i} className="border-t border-line p-2 text-muted">
                        …
                      </td>
                    );
                  return (
                    <td key={i} className={`tabular border-t border-line p-2 ${isBest ? "bg-white/[0.04] text-foreground" : "text-muted"}`}>
                      {simple && r.simple ? r.simple.fmt(x.v, settings.windowDays) : r.fmt(x.v)}
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
                {simple ? "How a launch delay changes it" : "Light + comms vs delay"}
                <div className="text-xs">{simple ? `higher = better, delay 0 → ${MAX_DELAY} days` : `0 → ${MAX_DELAY} days`}</div>
              </td>
              {computed.map((c, i) => (
                <td key={i} className="border-t border-line p-2">
                  {c && <Sweep values={c.sweep.map((m) => m.combinedH)} max={settings.windowDays * 24} delay={delay} onPick={(d) => set({ delay: d || null })} />}
                </td>
              ))}
            </tr>
            <tr>
              <td></td>
              {cols.map((c, i) => (
                <td key={i} className="p-2 text-xs">
                  <Link className="underline decoration-dotted hover:text-foreground text-muted" href={`/?${c.custom ? `lat=${c.custom.lat}&lon=${c.custom.lon}` : `site=${c.siteId}`}&start=${toUtcInput(c.start + delay * DAY, false)}`}>
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
          <CopyLinkButton />
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
      <rect width={w} height={h} fill="#060607" />
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="var(--both)" opacity={0.15} />
      <path d={d} fill="none" stroke="var(--both)" strokeWidth={1.5} />
      <line x1={x(delay)} x2={x(delay)} y1={0} y2={h} stroke="#fff" />
    </svg>
  );
}

/** Lat/lon inputs for a custom column; commits on Enter or when focus leaves. */
function CustomInputs({ value, onChange }: { value: { lat: number; lon: number }; onChange: (v: { lat: number; lon: number }) => void }) {
  const [lat, setLat] = useState(String(value.lat));
  const [lon, setLon] = useState(String(value.lon));
  const commit = () => {
    const a = Number(lat);
    const b = Number(lon);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && (a !== value.lat || b !== value.lon)) onChange({ lat: a, lon: b });
  };
  return (
    <div className="mb-1 flex gap-1" onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}>
      <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="w-1/2" aria-label="Latitude (south negative)" title="Latitude, south negative" />
      <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="w-1/2" aria-label="Longitude (east positive)" title="Longitude, east positive" />
    </div>
  );
}

/** Simple mode: who wins, in one card. */
function QuickAnswer({ names, metrics, delay }: { names: string[]; metrics: (WindowMetrics | null)[]; delay: number }) {
  const ready = metrics.map((m, i) => ({ m, name: names[i] })).filter((x): x is { m: WindowMetrics; name: string } => x.m !== null);
  if (ready.length < 2) return null;
  const best = (f: (m: WindowMetrics) => number) => {
    const top = Math.max(...ready.map((x) => f(x.m)));
    const winners = ready.filter((x) => Math.abs(f(x.m) - top) < 1e-6).map((x) => x.name);
    return winners.length === ready.length ? "all the same" : winners.join(" and ");
  };
  return (
    <section className="card grid gap-4 p-6 md:grid-cols-3">
      <div className="md:col-span-3">
        <div className="eyebrow !text-[0.62rem] !tracking-[0.3em] text-muted">Quick answer{delay ? ` · launch ${delay} days late` : ""}</div>
      </div>
      <div>
        <div className="text-xs text-muted">☀ Most sunlight</div>
        <div className="mt-1 text-lg">{best((m) => m.illuminationPct)}</div>
      </div>
      <div>
        <div className="text-xs text-muted">⊕ Easiest to talk to Earth</div>
        <div className="mt-1 text-lg">{best((m) => m.commsPct)}</div>
      </div>
      <div>
        <div className="text-xs text-muted">Best of both (Sun and Earth together)</div>
        <div className="mt-1 text-lg">{best((m) => m.combinedH)}</div>
      </div>
    </section>
  );
}
