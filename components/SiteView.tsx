"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { DAY, DEFAULT_SETTINGS, HOUR, alignTime, nextEvents, sampleAt, sampleSeries, windowMetrics, type Settings } from "@/lib/metrics";
import { downloadCsv, fmtRelative, fmtUtc, parseUtc, toUtcInput } from "@/lib/format";
import { SITES, fmtLatLon, resolvePreset } from "@/lib/sites";
import { rankSites } from "@/lib/rescue";
import { SafeBoundary } from "./SafeBoundary";
import { RocketIntro } from "./RocketIntro";
import { useUrlState } from "@/lib/useUrlState";
import { useResolvedSite } from "@/lib/useResolvedSite";
import { Lens, Panorama } from "./Panorama";
import { Timeline } from "./Timeline";
import { MetricCards, ScoreBadge } from "./MetricCards";
import { commsVerdict, powerVerdict } from "@/lib/metrics";
import { PolarMap } from "./PolarMap";
import { Terrain3D } from "./Terrain3D";
import { Dot, SiteList } from "./SiteList";
import { LIGHT_COLOR, light, why } from "@/lib/score";
import { ExpertOnly, Tip, useMode } from "./ModeProvider";
import { CopyLinkButton } from "./CopyLinkButton";
import { SimpleSummary, SummaryHeadline } from "./SimpleSummary";
import { BatteryPanel } from "./BatteryPanel";
import { LandingPrecision } from "./LandingPrecision";
import { NeighborsPanel } from "./NeighborsPanel";
import { PoleExplainer } from "./PoleExplainer";
import { MoonVsEarth } from "./MoonVsEarth";
import { PrintButton, PrintHeader } from "./PrintReport";
import { Eyebrow, Pulse, StatBox } from "./ui";

const TIMELINE_DAYS = 30;
const SERIES_DAYS = 45; // extra 15 days so countdowns near the end of the timeline still resolve
const PLAY_SPEEDS = [
  { label: "1 h/s", msPerSec: HOUR },
  { label: "6 h/s", msPerSec: 6 * HOUR },
  { label: "1 d/s", msPerSec: DAY },
];

export function SiteView() {
  const { params, set } = useUrlState();
  const { mode, setMode } = useMode();
  const expert = mode === "pro";

  // "now" is fixed once per page load so the page renders deterministically.
  const [loadTime] = useState(() => alignTime(Date.now(), 60_000));
  // Memoised on the primitive values: a fresh object on every render (e.g. each playback frame)
  // would make the site list recompute 13 sites per frame.
  const marginDeg = Number(params.get("margin") ?? DEFAULT_SETTINGS.marginDeg);
  const panel: Settings["panel"] = params.get("panel") === "horizontal" ? "horizontal" : "tracking";
  const windowDays = Number(params.get("window") ?? DEFAULT_SETTINGS.windowDays);
  const settings: Settings = useMemo(() => ({ marginDeg, panel, windowDays }), [marginDeg, panel, windowDays]);

  // "Best site right now": every south-pole candidate scored for a mission starting today.
  const today = alignTime(loadTime, DAY);
  const ranking = useMemo(
    () => rankSites(SITES.filter((s) => s.kind === "south-pole").map((s) => ({ ...resolvePreset(s), id: s.id })), today, settings, 2 * HOUR),
    [today, settings],
  );
  const best = ranking[0];
  const siteName = (id: string) => SITES.find((s) => s.id === id)?.name ?? id;
  // With no ?site in the URL, open on today's best site rather than a fixed one.
  const siteId = params.get("site") ?? best.siteId;
  const cLat = params.get("lat");
  const cLon = params.get("lon");
  const customLat = cLat !== null ? Number(cLat) : null;
  const customLon = cLon !== null ? Number(cLon) : null;
  const { site, loading } = useResolvedSite(siteId, customLat, customLon);

  const start = parseUtc(params.get("start")) ?? today;
  const urlT = parseUtc(params.get("t"));
  const [t, setT] = useState<number>(() => urlT ?? Math.min(Math.max(loadTime, start), start + TIMELINE_DAYS * DAY));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // keep the cursor inside the timeline if the start date changes
  const clampedT = Math.min(Math.max(t, start), start + TIMELINE_DAYS * DAY);

  const series = useMemo(() => (site ? sampleSeries(site, start, start + SERIES_DAYS * DAY) : []), [site, start]);
  const windowFrom = start;
  const windowTo = start + settings.windowDays * DAY;
  const metrics = useMemo(() => windowMetrics(series, windowFrom, windowTo, settings), [series, windowFrom, windowTo, settings]);
  const now = useMemo(() => (site ? sampleAt(site, Math.round(clampedT)) : null), [site, clampedT]);
  // Events only need minute resolution (hourly while playing): avoids recomputation on every animation frame.
  const eventStep = playing ? HOUR : 60_000;
  const eventT = Math.floor(clampedT / eventStep) * eventStep;
  const events = useMemo(
    () => (site && series.length ? nextEvents(site, series, eventT, settings.marginDeg) : { sunset: null, sunrise: null, earthset: null, earthrise: null }),
    [site, series, eventT, settings.marginDeg],
  );
  const sunTrack = useMemo(() => series.filter((s) => Math.abs(s.t - clampedT) <= 7 * DAY && s.t % HOUR === 0), [series, clampedT]);
  const earthTrack = useMemo(() => series.filter((s) => s.t <= start + TIMELINE_DAYS * DAY && s.t % (2 * HOUR) === 0), [series, start]);

  // play loop
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (ts: number) => {
      const dt = (ts - last) / 1000;
      last = ts;
      setT((prev) => {
        const next = Math.max(prev, start) + dt * PLAY_SPEEDS[speed].msPerSec;
        if (next >= start + TIMELINE_DAYS * DAY) {
          setPlaying(false);
          return start + TIMELINE_DAYS * DAY;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, start]);

  // write the cursor to the URL when paused (shareable state)
  useEffect(() => {
    if (playing) return;
    const id = setTimeout(() => set({ t: toUtcInput(clampedT) }), 400);
    return () => clearTimeout(id);
  }, [clampedT, playing, set]);

  const selectSite = (id: string) => set({ site: id, lat: null, lon: null });
  const onSettings = (s: Partial<Settings>) =>
    set({
      margin: s.marginDeg ?? (params.get("margin") || null),
      panel: s.panel ?? (params.get("panel") || null),
      window: s.windowDays ?? (params.get("window") || null),
      // pin the current site: otherwise new settings could re-rank and silently swap the default site
      site: params.get("site") || (cLat !== null ? null : siteId),
    });

  const exportCsv = () => {
    if (!site) return;
    downloadCsv(`${site.id}-${toUtcInput(start, false)}.csv`, [
      ["utc", "sun_el_deg", "sun_az_deg", "terrain_at_sun_deg", "sun_visible_fraction", "earth_el_deg", "earth_az_deg", "terrain_at_earth_deg", "comms"],
      ...series
        .filter((s) => s.t <= start + TIMELINE_DAYS * DAY)
        .map((s) => [new Date(s.t).toISOString(), s.sunEl.toFixed(4), s.sunAz.toFixed(4), s.sunHz.toFixed(3), s.sunFrac.toFixed(4), s.earthEl.toFixed(4), s.earthAz.toFixed(4), s.earthHz.toFixed(3), s.earthClear >= settings.marginDeg ? 1 : 0]),
    ]);
  };

  const customPoint = customLat !== null && customLon !== null ? { lat: customLat, lon: customLon } : null;
  const bestCard = (
            <div className="card flex flex-col gap-3 p-5" style={{ borderTop: `1px solid ${LIGHT_COLOR[light(best.score)]}` }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="eyebrow !text-[0.6rem] !tracking-[0.3em] text-muted">Best site right now</span>
                <span className="text-xs text-muted">
                  {settings.windowDays}-day mission from {fmtUtc(today, false)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="display text-xl">{siteName(best.siteId)}</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{why(best.metrics)}</p>
                </div>
                <ScoreBadge m={best.metrics} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <button
                  className="btn !py-1 text-xs"
                  onClick={() => {
                    selectSite(best.siteId);
                    document.getElementById("sky")?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {siteId === best.siteId && customLat === null ? "See why ↓" : "Show this site"}
                </button>
                <span>
                  Next:{" "}
                  {ranking.slice(1, 3).map((r, i) => (
                    <span key={r.siteId}>
                      {i ? ", " : ""}
                      <button className="underline underline-offset-4 hover:text-foreground" onClick={() => selectSite(r.siteId)}>
                        {siteName(r.siteId)}
                      </button>{" "}
                      <span className="num">{r.score}</span>
                    </span>
                  ))}
                </span>
              </div>
            </div>
  );
  const map2d = <PolarMap variant="planet" selectedId={siteId} custom={customPoint} onSelect={selectSite} onCustom={(lat, lon) => set({ lat, lon, site: null })} />;

  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      {/* ---------- hero ---------- */}
      <section className="no-print relative flex flex-col gap-8">
        {/* decorative Moon (rendered from the NASA LROC mosaic, south pole toward the viewer) */}
        <div
          className="pointer-events-none absolute -right-[22%] -top-10 z-0 w-[78%] max-w-[620px] opacity-45 sm:-right-[6%] sm:-top-16 sm:w-[46%] sm:opacity-80"
          style={{ maskImage: "linear-gradient(to bottom, #000 45%, transparent 92%)", WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent 92%)" }}
          aria-hidden
        >
          <Image src="/images/moon-hero.webp" alt="" width={900} height={900} priority sizes="(min-width: 640px) 48vw, 78vw" className="h-auto w-full" />
        </div>
        {/* intro: rocket lifting off the Moon (same box as the Moon, but unmasked so it can fly out of it) */}
        <div className="pointer-events-none absolute -right-[6%] -top-16 z-[5] hidden aspect-square w-[46%] max-w-[620px] sm:block">
          <RocketIntro />
        </div>
        <div className="relative z-10 grid items-end gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-7">
          {/* the pulse ornament here is drawn by the rocket intro (RocketIntro), then stays */}
          <div className="flex items-center gap-4 text-muted">
            <Pulse className="hero-pulse" />
            <span className="eyebrow">Lunar south pole</span>
          </div>
          <h1 className="display text-4xl sm:text-6xl">Find light and signal on the Moon</h1>
          <p className="max-w-xl text-base leading-relaxed text-muted">
            Compare landing sites and dates near the lunar south pole. See the Sun and Earth over the real LOLA terrain horizon, with solar-power and direct-to-Earth
            communication windows, computed in your browser.
          </p>
          <div className="lg:hidden">{bestCard}</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <EntryCard
              kicker="Learning"
              title="30-second tour"
              text="The south pole explained in a few stops."
              cta="▶ Start tour"
              solid
              onClick={() => {
                document.getElementById("terrain3d")?.scrollIntoView({ behavior: "smooth", block: "center" });
                window.dispatchEvent(new Event("lsn-tour"));
              }}
            />
            <EntryCard kicker="Exploring" title="Stand on a site" text="Watch the Sun and Earth move over the real horizon." cta="Open sky view" href="#sky" />
            <EntryCard
              kicker="Planning"
              title="Pick a site and date"
              text="Rank sites, or rescue a mission whose launch slipped."
              cta="Rescue →"
              href={`/rescue?site=${siteId}`}
              extra={{ href: "/compare", label: "Compare sites" }}
            />
          </div>
          <p className="text-xs text-muted">
            {mode === "simple" ? (
              <>
                <b className="text-foreground">Simple mode</b>: plain-language answers. Planner or scientist?{" "}
                <button className="underline underline-offset-4 hover:text-foreground" onClick={() => setMode("pro")}>
                  Switch to Pro
                </button>{" "}
                for every number.
              </>
            ) : (
              <>
                <b className="text-foreground">Pro mode</b>: exact angles, azimuths, CSV export.{" "}
                <button className="underline underline-offset-4 hover:text-foreground" onClick={() => setMode("simple")}>
                  Switch to Simple
                </button>{" "}
                for a plain-language view.
              </>
            )}
          </p>
        </div>
          <div className="flex flex-col gap-3">
            <div className="hidden lg:block">{bestCard}</div>
            <div className="grid grid-cols-3 gap-3">
            <StatBox value="0.004°" label="Max error" sub="vs JPL Horizons" />
            <StatBox value={SITES.length} label="Sites" sub="with sources" />
            <StatBox value="1440" label="Terrain rays" sub="per site, 200 km" />
            </div>
          </div>
        </div>
        <div id="terrain3d" className="relative z-10 w-full scroll-mt-24">
          <SafeBoundary fallback={map2d}>
            <Terrain3D
              selectedId={customPoint ? null : siteId}
              timeMs={clampedT}
              onSelect={selectSite}
              custom={customPoint}
              onCustom={(lat, lon) => set({ lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), site: null })}
              fallback={map2d}
            />
          </SafeBoundary>
        </div>
      </section>

      {/* ---------- sky view ---------- */}
      <section id="sky" className="flex scroll-mt-24 flex-col gap-6">
        <PrintHeader title={`Site report: ${site?.name ?? "custom point"}`} />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-4">
            <Eyebrow>Sky view</Eyebrow>
            <h2 className="display text-3xl sm:text-4xl">{site?.name ?? "Custom point"}</h2>
            {site && (
              <div className="flex flex-wrap items-center gap-2">
                <ScoreBadge m={metrics} />
                <Dot v={powerVerdict(metrics)} label="Power" color="var(--sun)" />
                <Dot v={commsVerdict(metrics)} label="Comms" color="var(--earth)" />
                <span className="text-sm text-muted">{why(metrics)}</span>
              </div>
            )}
            <p className="text-sm text-muted">
              {site ? fmtLatLon(site.lat, site.lon) : ""}
              {site?.terrain === "lola" && expert && ` · terrain ${Math.round(site.heightM ?? 0)} m · horizon from ${site.dem}`}
              {site?.terrain === "approx" && (
                <span className="ml-1 border border-marginal/40 px-1.5 text-marginal" title="Tested on 4 preset sites: horizon RMS error 0.6–1.0°, up to 3°; annual illumination and comms within 7 percentage points of the precise masks.">
                  lower accuracy: approximate horizon from 480 m/px DEM (illumination/comms ±7 pp)
                </span>
              )}
              {site?.terrain === "flat" && <span className="ml-1 border border-line px-1.5">flat horizon (outside the polar DEM)</span>}
              {site?.meta && (
                <>
                  {" · "}
                  <a href={site.meta.source} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-4 hover:text-foreground">
                    source
                  </a>
                </>
              )}
            </p>
            {site?.meta?.note && expert && (
              <p className="max-w-3xl text-sm text-muted">
                {site.meta.snapKm && (
                  <span className="mr-2 border border-line px-1.5 text-foreground" title="Region-level coordinate moved to the highest DEM point nearby: results describe the best local spot, not the whole region.">
                    crest point (snapped ≤{site.meta.snapKm} km)
                  </span>
                )}
                {site.meta.note}
              </p>
            )}
            {site && (
              <nav className="no-print flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="On this site">
                <span className="text-faint">Jump to:</span>
                <a href="#sky-summary" className="underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground">Summary</a>
                <a href="#neighbours" className="underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground">Who else is here</a>
                {site.terrain === "lola" && (
                  <a href="#precision" className="underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground">Landing precision</a>
                )}
                <a href="#battery" className="underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground">Battery</a>
              </nav>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="lg:hidden" value={customLat !== null ? "" : siteId} onChange={(e) => selectSite(e.target.value)} aria-label="Site">
              {customLat !== null && <option value="">Custom point</option>}
              {SITES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <span className="text-muted">Mission start</span>
              <input type="date" value={toUtcInput(start, false)} onChange={(e) => e.target.value && set({ start: e.target.value, t: null })} />
            </label>
            <button className="btn" onClick={() => set({ start: toUtcInput(alignTime(Date.now(), DAY), false), t: null })}>
              Today
            </button>
            <Link className="btn btn-solid" href={`/compare?a=${site?.id === "custom" ? best.siteId : siteId}:${toUtcInput(start, false)}`}>
              Compare
            </Link>
            <PrintButton />
          </div>
        </div>

        <div id="sky-summary" className="grid scroll-mt-24 gap-4 lg:grid-cols-[300px_1fr] print:block">
          <aside className="no-print order-2 flex flex-col gap-4 lg:order-none">
            <PolarMap selectedId={siteId} custom={customPoint} onSelect={selectSite} onCustom={(lat, lon) => set({ lat, lon, site: null })} />
            <SiteList selectedId={customLat !== null ? null : siteId} from={windowFrom} settings={settings} onSelect={selectSite} />
            <CustomForm key={customPoint ? `${customPoint.lat},${customPoint.lon}` : "none"} initial={customPoint} onSubmit={(lat, lon) => set({ lat, lon, site: null })} />
          </aside>

          <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-none">
            {loading || !site || !now ? (
              <div className="card grid h-72 place-items-center text-muted">Computing terrain horizon in the browser…</div>
            ) : (
              <>
                {mode === "simple" && <SummaryHeadline siteName={site.name} metrics={metrics} windowDays={settings.windowDays} className="flex sm:hidden" />}
                <Panorama horizon={site.horizon} now={now} sunTrack={sunTrack} earthTrack={earthTrack} expert={expert} marginDeg={settings.marginDeg} />

                {/* scrubber */}
                <div className="no-print card flex flex-wrap items-center gap-4 p-4">
                  <button className="btn btn-solid w-24" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? "❚❚ Pause" : "▶ Play"}
                  </button>
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
                    {PLAY_SPEEDS.map((s, i) => (
                      <option key={s.label} value={i}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    className="min-w-40 flex-1"
                    min={start}
                    max={start + TIMELINE_DAYS * DAY}
                    step={10 * 60_000}
                    value={clampedT}
                    onChange={(e) => {
                      setPlaying(false);
                      setT(Number(e.target.value));
                    }}
                    aria-label="Time"
                  />
                  <div className="text-right">
                    <div className="num text-sm">{fmtUtc(clampedT)}</div>
                    {/* depends on the clock, which differs between server render and browser by a moment */}
                    <div className="text-xs text-muted" suppressHydrationWarning>{Math.abs(clampedT - loadTime) < 60_000 ? "now" : fmtRelative(clampedT, loadTime).replace("in ", "now + ").replace(" ago", " before now")}</div>
                  </div>
                </div>

                {mode === "simple" ? (
                  <SimpleSummary
                    siteName={site.name}
                    now={now}
                    events={events}
                    metrics={metrics}
                    windowDays={settings.windowDays}
                    marginDeg={settings.marginDeg}
                    series={series}
                    start={start}
                    days={TIMELINE_DAYS}
                    t={clampedT}
                    onSeek={(v) => {
                      setPlaying(false);
                      setT(v);
                    }}
                  />
                ) : (
                  <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Lens horizon={site.horizon} az={now.sunAz} el={now.sunEl} r={now.sunR} kind="sun" fraction={now.sunFrac} />
                  <Lens horizon={site.horizon} az={now.earthAz} el={now.earthEl} r={now.earthR} kind="earth" clearance={now.earthClear} />
                </div>
                <Tip>
                  The Moon’s axis is tilted only ~1.5° to the Sun, so at the south pole the Sun never climbs high: it circles the whole horizon once a lunar day (29.5 Earth
                  days), skimming the ridges. A few metres of terrain decide light or shadow, which is why every site here uses a real LOLA horizon.
                </Tip>

                <MetricCards
                  now={now}
                  events={events}
                  searchDays={Math.max(0, Math.floor((start + SERIES_DAYS * DAY - clampedT) / DAY))}
                  metrics={metrics}
                  settings={settings}
                  onSettings={onSettings}
                />

                <Timeline
                  series={series}
                  start={start}
                  days={TIMELINE_DAYS}
                  t={clampedT}
                  windowFrom={windowFrom}
                  windowTo={windowTo}
                  marginDeg={settings.marginDeg}
                  onSeek={(v) => {
                    setPlaying(false);
                    setT(v);
                  }}
                />

                <ExpertOnly>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button className="btn" onClick={exportCsv}>
                      Export 30-day CSV (10-min steps)
                    </button>
                    <CopyLinkButton />
                    <span className="text-muted">Azimuth: degrees clockwise from lunar north (N 0°, E 90°). Elevations are topocentric, airless, relative to the local sphere horizontal.</span>
                  </div>
                </ExpertOnly>
                  </>
                )}
                <div id="neighbours" className="scroll-mt-24">
                  <NeighborsPanel siteId={site.id === "custom" ? null : site.id} lat={site.lat} lon={site.lon} simple={mode === "simple"} />
                </div>
                {site.terrain === "lola" && (
                  <Fold id="precision" simple={mode === "simple"} title="Landing precision" hint="What if the lander misses the target by 250 m?">
                    <LandingPrecision siteId={site.id} from={windowFrom} to={windowTo} settings={settings} centre={metrics} simple={mode === "simple"} />
                  </Fold>
                )}
                <Fold id="battery" simple={mode === "simple"} title="Battery" hint="Would a reference lander keep its power through the dark spells?">
                  <BatteryPanel series={series} from={windowFrom} to={windowTo} settings={settings} t={clampedT} simple={mode === "simple"} />
                </Fold>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="no-print flex flex-col gap-16 sm:gap-24">
        <PoleExplainer />
        <MoonVsEarth />
      </div>
    </div>
  );
}

function CustomForm({ initial, onSubmit }: { initial: { lat: number; lon: number } | null; onSubmit: (lat: number, lon: number) => void }) {
  // shows the point currently in the URL (e.g. one clicked on the 3D terrain)
  const [lat, setLat] = useState(initial ? String(initial.lat) : "-89.0");
  const [lon, setLon] = useState(initial ? String(initial.lon) : "0");
  return (
    <form
      className="card flex flex-wrap items-end gap-2 p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const a = Number(lat);
        const b = Number(lon);
        if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90) onSubmit(a, b);
      }}
    >
      <div className="eyebrow mb-1 w-full !text-[0.65rem] !tracking-[0.3em] text-muted">Custom coordinates</div>
      <label className="flex flex-col">
        <span className="text-xs text-muted">Lat (°, S negative)</span>
        <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="w-24" />
      </label>
      <label className="flex flex-col">
        <span className="text-xs text-muted">Lon (°E)</span>
        <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} className="w-24" />
      </label>
      <button className="btn" type="submit">
        Go
      </button>
      <p className="w-full text-xs text-muted">South of 79°S: approximate terrain horizon (480 m/px). Elsewhere: flat horizon.</p>
    </form>
  );
}

function EntryCard(p: { kicker: string; title: string; text: string; cta: string; href?: string; onClick?: () => void; solid?: boolean; extra?: { href: string; label: string } }) {
  const cls = `btn ${p.solid ? "btn-solid" : ""} !py-1.5 text-xs`;
  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="eyebrow !text-[0.6rem] !tracking-[0.3em] text-muted">{p.kicker}</span>
      <span className="text-base text-foreground">{p.title}</span>
      <span className="text-xs leading-relaxed text-muted">{p.text}</span>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        {p.href?.startsWith("#") ? (
          <a href={p.href} className={cls}>
            {p.cta}
          </a>
        ) : p.href ? (
          <Link href={p.href} className={cls}>
            {p.cta}
          </Link>
        ) : (
          <button className={cls} onClick={p.onClick}>
            {p.cta}
          </button>
        )}
        {p.extra && (
          <Link href={p.extra.href} className="text-xs text-muted underline underline-offset-4 hover:text-foreground">
            {p.extra.label}
          </Link>
        )}
      </div>
    </div>
  );
}

/** In Simple mode, a long panel starts folded behind a one-line question; in Pro mode it is always open. */
function Fold({ id, simple, title, hint, children }: { id: string; simple: boolean; title: string; hint: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // the PDF report must include folded panels
  useEffect(() => {
    const open = () => ref.current && (ref.current.open = true);
    // the anchor links under the site name open the panel they point to
    const onHash = () => window.location.hash === `#${id}` && open();
    window.addEventListener("beforeprint", open);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("beforeprint", open);
      window.removeEventListener("hashchange", onHash);
    };
  }, [id]);
  if (!simple)
    return (
      <div id={id} className="scroll-mt-24">
        {children}
      </div>
    );
  return (
    <details ref={ref} id={id} className="group scroll-mt-24">
      <summary className="card flex cursor-pointer list-none items-center justify-between gap-3 p-5 hover:bg-panel2 group-open:mb-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="display text-xs tracking-[0.3em]">{title}</span>
          <span className="mt-1 block text-sm text-muted">{hint}</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      {children}
    </details>
  );
}
