"use client";

import { useEffect, useMemo, useState } from "react";
import fixture from "@/tests/fixtures/horizons.json";
import { skyAt } from "@/lib/astro";
import { angleDiff, parseHorizonsUtc } from "@/lib/horizonsFixture";
import { SITES, getSite, resolvePreset, fmtLatLon } from "@/lib/sites";
import { sampleSeries, windowMetrics } from "@/lib/metrics";
import { ExpertOnly, Tip } from "./ModeProvider";
import { SectionTitle, StatBox, Step } from "./ui";

interface Cmp {
  site: string;
  body: "sun" | "earth";
  utc: string;
  hAz: number;
  hEl: number;
  az: number;
  el: number;
  dEl: number;
  dAz: number; // az difference scaled by cos(el): true angular error along the horizon
}

function compare(siteId: string, lat: number, lon: number, body: "sun" | "earth", rows: { utc: string; az: number; el: number }[]): Cmp[] {
  return rows.map((r) => {
    const s = skyAt(lat, lon, 0, parseHorizonsUtc(r.utc))[body];
    return { site: siteId, body, utc: r.utc, hAz: r.az, hEl: r.el, az: s.az, el: s.el, dEl: s.el - r.el, dAz: angleDiff(s.az, r.az) * Math.cos((r.el * Math.PI) / 180) };
  });
}

const LITERATURE = [
  { id: "connecting-ridge", label: "Connecting Ridge (C1)", published: 88.0 },
  { id: "shackleton-rim", label: "Shackleton rim (S)", published: 82.1 },
  { id: "shackleton-floor", label: "Shackleton floor (PSR)", published: 0 },
];

export function ValidationView() {
  const all = useMemo(() => fixture.sites.flatMap((s) => (["sun", "earth"] as const).flatMap((b) => compare(s.id, s.lat, s.lon, b, s[b]))), []);
  const maxEl = Math.max(...all.map((c) => Math.abs(c.dEl)));
  const maxAz = Math.max(...all.map((c) => Math.abs(c.dAz)));
  const rms = Math.sqrt(all.reduce((a, c) => a + c.dEl * c.dEl + c.dAz * c.dAz, 0) / (2 * all.length));
  const apollo = all.find((c) => c.site === "apollo-11" && c.body === "sun")!;

  const groups = fixture.sites.flatMap((s) =>
    (["sun", "earth"] as const).map((b) => {
      const rows = all.filter((c) => c.site === s.id && c.body === b);
      return { site: s, body: b, n: rows.length, maxEl: Math.max(...rows.map((r) => Math.abs(r.dEl))), maxAz: Math.max(...rows.map((r) => Math.abs(r.dAz))), rows };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <SectionTitle
        as="h1"
        center
        eyebrow="Validation"
        title={<>Checked against<br />JPL Horizons</>}
        sub="Every Sun and Earth position in this app is computed in your browser with astronomy-engine and a lunar body-fixed frame (IAU rotation model, including libration). Here we compare it with NASA JPL Horizons topocentric azimuth and elevation for the same surface points."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox value={`${all.length}`} label="Comparisons" sub={`${fixture.sites.length} sites × ${all.length / fixture.sites.length / 2} epochs × Sun & Earth`} />
        <StatBox value={`${maxEl.toFixed(4)}°`} label="Max elevation error" sub="target ≤ 0.1°" tone={maxEl <= 0.1 ? "good" : "poor"} />
        <StatBox value={`${maxAz.toFixed(4)}°`} label="Max azimuth error × cos(el)" sub="target ≤ 0.1°" tone={maxAz <= 0.1 ? "good" : "poor"} />
        <StatBox value={`${(rms * 3600).toFixed(1)}″`} label="RMS error" sub={`${rms.toFixed(4)}°; the Sun's disk is ~1900″`} />
      </div>

      <section className="card p-6">
        <h2 className="display mb-3 text-sm tracking-[0.2em]">Sanity case: Apollo 11 landing</h2>
        <p className="text-sm text-muted">1969-07-20 20:17 UTC at Tranquility Base (0.674°N, 23.473°E). The crew landed in the lunar morning with the Sun low in the east (~10°) to get long shadows.</p>
        <p className="tabular mt-2 text-sm">
          Horizons: Sun az {apollo.hAz.toFixed(3)}°, el {apollo.hEl.toFixed(3)}° · This app: az {apollo.az.toFixed(3)}°, el {apollo.el.toFixed(3)}° · difference {Math.abs(apollo.dEl).toFixed(4)}° in elevation
        </p>
      </section>

      <section className="card overflow-x-auto p-6">
        <h2 className="display mb-3 text-sm tracking-[0.2em]">Saved Horizons fixtures (tests/fixtures/horizons.json)</h2>
        <table className="tabular w-full min-w-[560px] text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1">Site</th>
              <th>Body</th>
              <th>Epochs</th>
              <th>Max |Δ el|</th>
              <th>Max |Δ az|·cos el</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.site.id + g.body} className="border-t border-line">
                <td className="py-1">
                  {getSite(g.site.id)?.name ?? g.site.id} <span className="text-xs text-muted">{fmtLatLon(g.site.lat, g.site.lon)}</span>
                  {getSite(g.site.id) && Math.abs(getSite(g.site.id)!.lat - g.site.lat) > 1e-3 && <span className="ml-1 text-xs text-muted">(nearby test point)</span>}
                </td>
                <td className={g.body === "sun" ? "text-sun" : "text-earth"}>{g.body === "sun" ? "Sun" : "Earth"}</td>
                <td>{g.n}</td>
                <td>{g.maxEl.toFixed(4)}°</td>
                <td>{g.maxAz.toFixed(4)}°</td>
                <td className={g.maxEl <= 0.1 && g.maxAz <= 0.1 ? "text-good" : "text-poor"}>{g.maxEl <= 0.1 && g.maxAz <= 0.1 ? "pass" : "fail"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ExpertOnly>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">All {all.length} epochs</summary>
            <table className="tabular mt-2 w-full min-w-[720px] text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th>Site</th>
                  <th>Body</th>
                  <th>UTC</th>
                  <th>Horizons az / el</th>
                  <th>App az / el</th>
                  <th>Δ el</th>
                  <th>Δ az·cos el</th>
                </tr>
              </thead>
              <tbody>
                {all.map((c, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td>{c.site}</td>
                    <td>{c.body}</td>
                    <td>{c.utc}</td>
                    <td>
                      {c.hAz.toFixed(4)} / {c.hEl.toFixed(4)}
                    </td>
                    <td>
                      {c.az.toFixed(4)} / {c.el.toFixed(4)}
                    </td>
                    <td>{c.dEl.toFixed(4)}</td>
                    <td>{c.dAz.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </ExpertOnly>
        <p className="mt-2 text-xs text-muted">
          Horizons settings: EPHEM_TYPE=OBSERVER, CENTER=coord@301, COORD_TYPE=GEODETIC, QUANTITIES=4, APPARENT=AIRLESS. Fixtures are re-checked by the automated test suite (vitest) on every build.
        </p>
      </section>

      <LiveCheck />
      <TerrainCheck />

      <section className="flex flex-col gap-8 pt-6">
        <SectionTitle center eyebrow="Method" title="How the numbers are made" />
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <Step n={1} title="Ephemeris">
            astronomy-engine gives geocentric J2000 vectors Earth→Moon (GeoMoon) and Earth→Sun (GeoVector). Moon→Earth = −GeoMoon; Moon→Sun = GeoSun − GeoMoon, with the Sun at the
            light-time-retarded epoch.
          </Step>
          <Step n={2} title="Lunar body-fixed frame">
            IAU rotation model (RotationAxis): z = pole, node Q = [cos(α+90°), sin(α+90°), 0], x = Q cos W + (z×Q) sin W, y = z×x. The pole and prime meridian include physical libration,
            which is why Earth wobbles in the lunar sky.
          </Step>
          <Step n={3} title="Local sky">
            East/north/up frame at (lat, lon east-positive, height) on a 1737.4 km sphere. Azimuth is clockwise from lunar north (N 0°, E 90°, S 180°, W 270°), as in Horizons. Angular
            radius = asin(R / distance), with Sun R = 695 700 km and Earth R = 6378.137 km.
          </Step>
          <Step n={4} title="Terrain horizon, no atmosphere">
            The Moon has no atmosphere, so there is no refraction lifting the Sun or Earth above the horizon (on Earth it adds about 0.5°) and no twilight: the horizon is set
            only by the terrain and the curvature of the lunar sphere. Horizons is queried in the same airless mode.{" "}
            1440 rays (0.25°) through NASA LOLA polar DEMs (20/40/80/240 m/px, finest available per sample) out to 200 km, with exact spherical geometry (lunar curvature), for an observer
            2 m above the ground.
          </Step>
        </div>
        <Tip>A 0.004° error is about 1/130 of the Sun’s diameter: far smaller than anything that matters for power or radio links.</Tip>
      </section>
    </div>
  );
}

function LiveCheck() {
  const [siteId, setSiteId] = useState("connecting-ridge");
  const [date, setDate] = useState("2026-12-01");
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; rows?: Cmp[]; msg?: string }>({ status: "idle" });

  const run = async () => {
    const site = getSite(siteId)!;
    setState({ status: "loading" });
    try {
      const stop = new Date(Date.parse(date) + 4 * 86_400_000).toISOString().slice(0, 10);
      const out: Cmp[] = [];
      for (const body of ["sun", "earth"] as const) {
        const res = await fetch(`/api/horizons?lat=${site.lat}&lon=${site.lon}&body=${body}&start=${date}&stop=${stop}&step=1d`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? res.statusText);
        out.push(...compare(site.id, site.lat, site.lon, body, json.rows));
      }
      setState({ status: "done", rows: out });
    } catch (e) {
      setState({ status: "error", msg: `${String(e)}. The saved fixtures above remain the reference.` });
    }
  };

  return (
    <section className="card p-6">
      <h2 className="display mb-3 text-sm tracking-[0.2em]">Live re-check</h2>
      <p className="mb-3 text-sm text-muted">Ask JPL Horizons right now (through a small server proxy) for any preset site and date, and compare with the in-browser computation.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site">
          {SITES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Start date" />
        <button className="btn btn-solid" onClick={run} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Asking Horizons…" : "Compare 5 days"}
        </button>
      </div>
      {state.status === "error" && <p className="mt-2 text-sm text-poor">{state.msg}</p>}
      {state.rows && (
        <table className="tabular mt-3 w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th>Body</th>
              <th>UTC</th>
              <th>Horizons el</th>
              <th>App el</th>
              <th>Δ el</th>
              <th>Δ az·cos el</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((r, i) => (
              <tr key={i} className="border-t border-line/50">
                <td className={r.body === "sun" ? "text-sun" : "text-earth"}>{r.body}</td>
                <td>{r.utc}</td>
                <td>{r.hEl.toFixed(4)}°</td>
                <td>{r.el.toFixed(4)}°</td>
                <td>{r.dEl.toFixed(4)}°</td>
                <td>{r.dAz.toFixed(4)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Annual average illumination from our LOLA horizon masks vs a published 20-year LOLA study. */
function TerrainCheck() {
  const [rows, setRows] = useState<{ id: string; label: string; published: number; ours: number }[] | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const from = Date.UTC(2026, 0, 1);
      const to = Date.UTC(2027, 0, 1);
      setRows(
        LITERATURE.map((l) => {
          const site = resolvePreset(getSite(l.id)!);
          const m = windowMetrics(sampleSeries(site, from, to, 2 * 3_600_000), from, to);
          return { ...l, ours: m.illuminationPct };
        }),
      );
    }, 50);
    return () => clearTimeout(id);
  }, []);
  return (
    <section className="card p-6">
      <h2 className="display mb-3 text-sm tracking-[0.2em]">Terrain check: illumination vs published study</h2>
      <p className="mb-3 text-sm text-muted">
        Average illumination (share of the solar disk visible, 2 m above ground) from our horizon masks for 2026, compared with Gläser et al. 2018 (20-year average, LOLA 20 m/px DEM, Table 2).
        The rim and ridge must be lit far more than the crater floor 10 km away.
      </p>
      {!rows ? (
        <p className="text-sm text-muted">Computing a full year…</p>
      ) : (
        <table className="tabular w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th>Site</th>
              <th>Published</th>
              <th>This app (2026)</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1">{r.label}</td>
                <td>{r.id === "shackleton-floor" ? "0% (PSR)" : `${r.published.toFixed(1)}%`}</td>
                <td>{r.ours.toFixed(1)}%</td>
                <td>{(r.ours - r.published >= 0 ? "+" : "") + (r.ours - r.published).toFixed(1)} pp</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-muted">
        Source:{" "}
        <a className="underline" href="https://ntrs.nasa.gov/citations/20170007365" target="_blank" rel="noreferrer">
          Gläser et al., Illumination conditions at the lunar poles: implications for future exploration (NASA NTRS 20170007365)
        </a>
        . Differences come from the single year vs 20-year average and DEM resolution.
      </p>
    </section>
  );
}
