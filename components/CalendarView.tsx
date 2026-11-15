"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DAY, dailySummary } from "@/lib/metrics";
import { DEFAULT_SITE_ID, SITES, fmtLatLon, getSite, resolvePreset } from "@/lib/sites";
import { resolveCustom } from "@/lib/useResolvedSite";
import { useUrlState } from "@/lib/useUrlState";
import { toUtcInput } from "@/lib/format";
import { Tip } from "./ModeProvider";
import { SectionTitle } from "./ui";

type Day = ReturnType<typeof dailySummary>[number];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WINDOW = 14;

/** 12-month heatmap: per day, mean solar-disk visibility (yellow) and comms availability (blue). */
export function CalendarView() {
  const { params, set } = useUrlState();
  const siteId = getSite(params.get("site")) ? params.get("site")! : DEFAULT_SITE_ID;
  const margin = Number(params.get("margin") ?? 2);
  const cLat = params.get("lat");
  const cLon = params.get("lon");
  const custom = cLat !== null && cLon !== null && Number.isFinite(Number(cLat)) && Number.isFinite(Number(cLon)) ? { lat: Number(cLat), lon: Number(cLon) } : null;
  const [terrain, setTerrain] = useState<string>("");
  const [startMonth] = useState(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  });
  const [data, setData] = useState<{ key: string; days: Day[] } | null>(null);
  const key = `${custom ? `${custom.lat},${custom.lon}` : siteId}|${margin}|${startMonth}`;
  // Links into the Site screen for a given day keep the custom point when one is selected.
  const siteQuery = custom ? `lat=${custom.lat}&lon=${custom.lon}` : `site=${siteId}`;

  useEffect(() => {
    let alive = true;
    // yield first so the page paints before the year-long computation (~0.5 s)
    const id = setTimeout(async () => {
      const site = custom ? await resolveCustom(custom.lat, custom.lon) : resolvePreset(getSite(siteId)!);
      if (!alive) return;
      setTerrain(site.terrain);
      const end = new Date(startMonth);
      end.setUTCMonth(end.getUTCMonth() + 12);
      const days = dailySummary(site, startMonth, Math.round((end.getTime() - startMonth) / DAY) + WINDOW, margin);
      if (alive) setData({ key, days });
    }, 30);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // `key` already encodes site/custom point, margin and start month
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <SectionTitle as="h1" eyebrow="Calendar" title="A year of light and signal" />
          {custom && (
            <p className="text-sm">
              Custom point {fmtLatLon(custom.lat, custom.lon)}
              {terrain === "approx" && <span className="ml-1 border border-marginal/40 px-1.5 text-marginal">lower accuracy: approximate horizon (480 m/px)</span>}
              {terrain === "flat" && <span className="ml-1 border border-line px-1.5">flat horizon (north of 79°S)</span>}
            </p>
          )}
          <p className="text-sm text-muted">Daily share of sunlight (solar disk visible over terrain) and of direct-to-Earth comms. Click a day to open the sky view with that mission start.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={custom ? "custom" : siteId}
            onChange={(e) => (e.target.value === "custom" ? set({ lat: -89, lon: 0 }) : set({ site: e.target.value, lat: null, lon: null }))}
            aria-label="Site"
          >
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="custom">Custom point…</option>
          </select>
          {custom && <CalendarCustomInputs key={`${custom.lat},${custom.lon}`} value={custom} onChange={(ll) => set({ lat: ll.lat, lon: ll.lon })} />}
          <label className="flex items-center gap-1">
            <span className="text-muted" title="How far Earth must clear the hills for a usable radio link">Earth margin (°)</span>
            <input type="number" min={0} max={10} step={0.5} value={margin} onChange={(e) => set({ margin: e.target.value })} className="w-16" />
          </label>
        </div>
      </header>
      <Tip>A lunar day lasts 29.5 Earth days, so the yellow pattern repeats about monthly. Near the pole it also changes with the lunar “seasons” (the 1.5° axial tilt), and the blue pattern follows Earth’s libration wobble.</Tip>

      {!days ? (
        <div className="card grid h-80 place-items-center text-muted">Computing 365 days…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="card overflow-x-auto p-5">
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
                      <td className={`pr-1 text-[11px] ${row === "lit" ? "text-sun" : "text-earth"}`}>{row === "lit" ? "light" : "comms"}</td>
                      {Array.from({ length: offset }, (_, i) => (
                        <td key={`pad${i}`} />
                      ))}
                      {m.days.map((d) => {
                        const v = d[row];
                        const a = (0.06 + 0.94 * v).toFixed(2);
                        const color = row === "lit" ? `rgba(226,189,106,${a})` : `rgba(126,174,224,${a})`;
                        return (
                          <td key={d.day} className="p-0">
                            <Link
                              href={`/?${siteQuery}&start=${toUtcInput(d.day, false)}`}
                              title={`${toUtcInput(d.day, false)}: light ${(d.lit * 100).toFixed(0)}%, comms ${(d.comms * 100).toFixed(0)}%, both ${(d.both * 100).toFixed(0)}%`}
                              className="block h-4 w-5 hover:outline hover:outline-1 hover:outline-white"
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
                <span className="mr-1.5 inline-block h-3 w-3 align-[-1px]" style={{ background: "rgba(226,189,106,1)" }} />
                lit all day
              </span>
              <span>
                <span className="mr-1.5 inline-block h-3 w-3 align-[-1px]" style={{ background: "rgba(126,174,224,1)" }} />
                Earth in view all day
              </span>
              <span>
                <span className="mr-1.5 inline-block h-3 w-3 align-[-1px]" style={{ background: "rgba(255,255,255,0.06)" }} />
                none
              </span>
            </div>
          </div>
          <aside className="card p-5">
            <h2 className="display mb-2 text-sm tracking-[0.2em]">Best {WINDOW}-day starts</h2>
            <p className="mb-2 text-xs text-muted">Ranked by hours with light and comms at the same time.</p>
            <ol className="space-y-2">
              {best.map((b) => (
                <li key={b.day}>
                  <Link href={`/?${siteQuery}&start=${toUtcInput(b.day, false)}`} className="block border border-line p-3 transition-colors hover:border-muted">
                    <div className="num text-sm">{toUtcInput(b.day, false)}</div>
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

function CalendarCustomInputs({ value, onChange }: { value: { lat: number; lon: number }; onChange: (v: { lat: number; lon: number }) => void }) {
  const [lat, setLat] = useState(String(value.lat));
  const [lon, setLon] = useState(String(value.lon));
  const commit = () => {
    const a = Number(lat);
    const b = Number(lon);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && (a !== value.lat || b !== value.lon)) onChange({ lat: a, lon: b });
  };
  return (
    <span className="flex items-center gap-1" onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}>
      <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="w-20" aria-label="Latitude (south negative)" title="Latitude, south negative" />
      <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="w-20" aria-label="Longitude (east positive)" title="Longitude, east positive" />
    </span>
  );
}
