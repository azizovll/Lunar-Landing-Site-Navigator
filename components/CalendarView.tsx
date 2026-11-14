"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DAY, dailySummary } from "@/lib/metrics";
import { DEFAULT_SITE_ID, SITES, getSite, resolvePreset } from "@/lib/sites";
import { useUrlState } from "@/lib/useUrlState";
import { toUtcInput } from "@/lib/format";
import { Tip } from "./ModeProvider";

type Day = ReturnType<typeof dailySummary>[number];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WINDOW = 14;

/** 12-month heatmap: per day, mean solar-disk visibility (yellow) and comms availability (blue). */
export function CalendarView() {
  const { params, set } = useUrlState();
  const siteId = getSite(params.get("site")) ? params.get("site")! : DEFAULT_SITE_ID;
  const margin = Number(params.get("margin") ?? 2);
  const [startMonth] = useState(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  });
  const [data, setData] = useState<{ key: string; days: Day[] } | null>(null);
  const key = `${siteId}|${margin}|${startMonth}`;

  useEffect(() => {
    let alive = true;
    // yield first so the page paints before the year-long computation (~0.5 s)
    const id = setTimeout(() => {
      const site = resolvePreset(getSite(siteId)!);
      const end = new Date(startMonth);
      end.setUTCMonth(end.getUTCMonth() + 12);
      const days = dailySummary(site, startMonth, Math.round((end.getTime() - startMonth) / DAY) + WINDOW, margin);
      if (alive) setData({ key, days });
    }, 30);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [key, siteId, margin, startMonth]);

  const days = data?.key === key ? data.days : null;

  const months = useMemo(() => {
    if (!days) return [];
    const out: { label: string; days: Day[] }[] = [];
    for (const d of days.slice(0, days.length - WINDOW)) {
      const dt = new Date(d.day);
      const label = `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, days: [] });
      out[out.length - 1].days.push(d);
    }
    return out;
  }, [days]);

  const best = useMemo(() => {
    if (!days) return [];
    const scores = days.slice(0, days.length - WINDOW).map((d, i) => {
      const w = days.slice(i, i + WINDOW);
      return { day: d.day, both: (w.reduce((a, x) => a + x.both, 0) / WINDOW) * 100, lit: (w.reduce((a, x) => a + x.lit, 0) / WINDOW) * 100, comms: (w.reduce((a, x) => a + x.comms, 0) / WINDOW) * 100 };
    });
    // pick the top starts at least 7 days apart
    const picked: typeof scores = [];
    for (const s of [...scores].sort((a, b) => b.both - a.both)) {
      if (picked.every((p) => Math.abs(p.day - s.day) >= 7 * DAY)) picked.push(s);
      if (picked.length === 5) break;
    }
    return picked;
  }, [days]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Yearly calendar</h1>
          <p className="text-sm text-muted">Daily share of sunlight (solar disk visible over terrain) and of direct-to-Earth comms. Click a day to open the sky view with that mission start.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={siteId} onChange={(e) => set({ site: e.target.value })} aria-label="Site">
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <span className="text-muted">margin</span>
            <input type="number" min={0} max={10} step={0.5} value={margin} onChange={(e) => set({ margin: e.target.value })} className="w-16" />°
          </label>
        </div>
      </header>
      <Tip>A lunar day lasts 29.5 Earth days, so the yellow pattern repeats about monthly. Near the pole it also changes with the lunar “seasons” (the 1.5° axial tilt), and the blue pattern follows Earth’s libration wobble.</Tip>

      {!days ? (
        <div className="card grid h-80 place-items-center text-muted">Computing 365 days…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="card overflow-x-auto p-3">
            <table className="border-separate border-spacing-[2px] text-xs">
              <thead>
                <tr>
                  <th></th>
                  <th></th>
                  {Array.from({ length: 31 }, (_, i) => (
                    <th key={i} className="w-5 font-normal text-muted">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const offset = new Date(m.days[0].day).getUTCDate() - 1;
                  return (["lit", "comms"] as const).map((row) => (
                    <tr key={m.label + row}>
                      {row === "lit" ? (
                        <th rowSpan={2} className="whitespace-nowrap pr-2 text-left font-medium">
                          {m.label}
                        </th>
                      ) : null}
                      <td className={`pr-1 text-[10px] ${row === "lit" ? "text-sun" : "text-earth"}`}>{row === "lit" ? "light" : "comms"}</td>
                      {Array.from({ length: offset }, (_, i) => (
                        <td key={`pad${i}`} />
                      ))}
                      {m.days.map((d) => {
                        const v = d[row];
                        const color = row === "lit" ? `rgba(255,194,61,${0.08 + 0.92 * v})` : `rgba(78,168,255,${0.08 + 0.92 * v})`;
                        return (
                          <td key={d.day} className="p-0">
                            <Link
                              href={`/?site=${siteId}&start=${toUtcInput(d.day, false)}`}
                              title={`${toUtcInput(d.day, false)}: light ${(d.lit * 100).toFixed(0)}%, comms ${(d.comms * 100).toFixed(0)}%, both ${(d.both * 100).toFixed(0)}%`}
                              className="block h-4 w-5 rounded-sm hover:outline hover:outline-1 hover:outline-white"
                              style={{ background: color }}
                              aria-label={`${toUtcInput(d.day, false)} ${row} ${(v * 100).toFixed(0)}%`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
              <span>
                <span className="mr-1 inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(255,194,61,1)" }} />
                lit all day
              </span>
              <span>
                <span className="mr-1 inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(78,168,255,1)" }} />
                Earth in view all day
              </span>
              <span>
                <span className="mr-1 inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(255,255,255,0.08)" }} />
                none
              </span>
            </div>
          </div>
          <aside className="card p-3">
            <h2 className="mb-2 font-semibold">Best {WINDOW}-day mission starts</h2>
            <p className="mb-2 text-xs text-muted">Ranked by hours with light and comms at the same time.</p>
            <ol className="space-y-2">
              {best.map((b) => (
                <li key={b.day}>
                  <Link href={`/?site=${siteId}&start=${toUtcInput(b.day, false)}`} className="block rounded-lg border border-line p-2 hover:border-muted">
                    <div className="font-medium">{toUtcInput(b.day, false)}</div>
                    <div className="tabular text-xs text-muted">
                      <span className="text-both">{b.both.toFixed(0)}% both</span> · <span className="text-sun">{b.lit.toFixed(0)}% light</span> · <span className="text-earth">{b.comms.toFixed(0)}% comms</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}
