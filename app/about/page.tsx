import type { Metadata } from "next";
import Link from "next/link";
import { SITES } from "@/lib/sites";
import { THRESHOLDS } from "@/lib/metrics";

export const metadata: Metadata = { title: "About · Lunar Site Navigator" };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-earth underline decoration-dotted hover:decoration-solid">
    {children}
  </a>
);

export default function AboutPage() {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 leading-relaxed">
      <header>
        <h1 className="text-2xl font-semibold">About Lunar Site Navigator</h1>
        <p className="mt-2 text-muted">
          A browser tool that answers one mission-planning question in seconds: <em>if we land at this site on this date, or slip the launch by a few weeks, will we have enough sunlight and a
          direct radio link to Earth?</em> It shows the Sun and Earth over the real terrain horizon of lunar south-pole candidate sites, and turns that geometry into power and communication metrics
          you can compare side by side.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Who it is for</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Mission planners:</b> compare backup sites and dates, see the effect of a launch delay (<Link className="text-earth underline" href="/compare">Compare</Link>), export CSV, share a link to an exact scenario (Expert mode).
          </li>
          <li>
            <b>Educators:</b> animate a lunar day and show why the pole is special. Explain mode adds plain-language tips.
          </li>
          <li>
            <b>Everyone:</b> look at the sky from the Moon’s surface, with the Sun skimming the ridges and Earth hanging over the horizon.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sun and Earth positions are computed in your browser (astronomy-engine + IAU lunar rotation model with libration) and checked against NASA JPL Horizons to ≤ 0.004° (<Link className="text-earth underline" href="/validation">Validation</Link>).</li>
          <li>Each preset site has a terrain horizon: 720 rays through NASA LOLA elevation models out to 200 km, including lunar curvature, for an observer 2 m above the ground.</li>
          <li>The share of the solar disk above that horizon gives power; Earth’s height above the horizon (plus a 2° margin) gives comms.</li>
          <li>Everything runs client-side. No accounts, no database: the URL is the saved state.</li>
        </ol>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Metric definitions</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><b>Illumination %</b>: time-average of the visible fraction of the solar disk over the mission window (default 14 days).</li>
          <li><b>Longest night</b>: longest continuous time with the whole disk below terrain.</li>
          <li><b>Power index</b>: average visible fraction (sun-tracking panel) or visible fraction × sin(elevation) (horizontal panel).</li>
          <li><b>Comms</b>: Earth’s centre at least <i>margin</i> (default 2°) above the terrain horizon at Earth’s azimuth; <b>longest blackout</b> is the longest continuous time without it.</li>
          <li><b>Combined window</b>: hours that are lit and have comms at the same time.</li>
          <li>
            <b>Verdict</b>: Power is Good with ≥ {THRESHOLDS.power.goodPct}% illumination and nights ≤ {THRESHOLDS.power.goodNightH} h, Poor below {THRESHOLDS.power.poorPct}% or with nights over {THRESHOLDS.power.poorNightH} h. Comms is Good with ≥ {THRESHOLDS.comms.goodPct}% and blackouts ≤ {THRESHOLDS.comms.goodBlackoutH} h, Poor below {THRESHOLDS.comms.poorPct}% or with blackouts over {THRESHOLDS.comms.poorBlackoutH} h. Otherwise Marginal; overall is the worse of the two.
          </li>
          <li><b>Azimuth</b>: degrees clockwise from lunar north (N 0°, E 90°). At a south-polar site “north” points away from the pole, so Earth (toward the 0° meridian) appears across the pole.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">NASA data and other sources</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            <A href="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/">LRO LOLA polar gridded elevation models (PDS)</A>: LDEM_875S_20M, LDEM_85S_40M, LDEM_80S_80M, LDEM_75S_240M.
          </li>
          <li>
            <A href="https://ssd.jpl.nasa.gov/horizons/">NASA JPL Horizons</A>: reference ephemerides for validation (saved fixtures + live re-check).
          </li>
          <li>
            <A href="https://ntrs.nasa.gov/citations/20170007365">Gläser et al., illumination conditions at the lunar poles (NASA NTRS)</A>: site coordinates and published illumination for the terrain check.
          </li>
          <li>
            <A href="https://svs.gsfc.nasa.gov/5013">NASA SVS: Artemis III landing region candidates</A>, <A href="https://www.lroc.asu.edu/">LROC (Lunar Reconnaissance Orbiter Camera)</A> and the{" "}
            <A href="https://planetarynames.wr.usgs.gov/">IAU/USGS Gazetteer of Planetary Nomenclature</A> for site locations.
          </li>
          <li>
            <A href="https://github.com/cosinekitty/astronomy">astronomy-engine</A> (MIT licence) for Sun/Moon/Earth ephemerides and the IAU lunar rotation model.
          </li>
        </ul>
        <h3 className="mt-3 mb-1 font-semibold">Preset sites</h3>
        <ul className="grid gap-x-4 text-sm sm:grid-cols-2">
          {SITES.map((s) => (
            <li key={s.id}>
              {s.name}: <A href={s.source}>{s.sourceLabel}</A>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Region-level coordinates (Nobile rim, Haworth, Malapert, Leibnitz β, Mons Mouton) are snapped to the local crest in the LOLA DEM within 2–6 km; see each site’s note.</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Limitations</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Terrain masks are exact only for preset south-polar sites. Custom points use a 480 m/px browser DEM (lower accuracy); sites north of 75°S use a flat horizon.</li>
          <li>Comms is geometric line-of-sight to Earth’s centre; it ignores ground-station schedules, antenna patterns and relay satellites.</li>
          <li>Power ignores dust, panel temperature, Earthshine and battery state; it is a geometric index.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Team infinium</h2>
        <p>Built for the NASA Space Apps Challenge 2026, challenge “Lunar Landing Site Navigator”.</p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">How AI tools were used</h2>
        <p className="text-sm">
          The team wrote the specification, chose the method and data, and reviewed the results. An AI coding assistant (Claude Code by Anthropic) generated most of the source code, the terrain
          pipeline and the documentation under that specification. Every number the app shows is computed from NASA data and checked independently: Sun and Earth positions against saved JPL Horizons
          responses in automated tests, the DEM orientation against five known craters, and the terrain masks against published illumination values. No AI-generated images, voices or data are used.
        </p>
      </section>
    </article>
  );
}
