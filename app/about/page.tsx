import type { Metadata } from "next";
import Link from "next/link";
import { SITES } from "@/lib/sites";
import { THRESHOLDS } from "@/lib/metrics";
import { Eyebrow, SectionTitle, StatBox, Step } from "@/components/ui";

export const metadata: Metadata = { title: "About · Lunar Site Navigator" };

const A = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground">
    {children}
  </a>
);

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-6">
      <h3 className="display text-sm tracking-[0.2em]">{title}</h3>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <article className="flex flex-col gap-20 leading-relaxed sm:gap-28">
      {/* ---------- intro ---------- */}
      <section className="flex flex-col gap-10">
        <SectionTitle
          as="h1"
          center
          eyebrow="About us"
          title={<>Connecting mission plans<br />to the lunar sky</>}
          sub={
            <>
              One mission-planning question, answered in seconds: <em>if we land at this site on this date, or the launch slips by a few weeks, will we have enough sunlight and a direct
              radio link to Earth?</em> The app shows the Sun and Earth over the real terrain horizon of lunar south-pole sites and turns that geometry into power and communication metrics.
            </>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatBox value="0.004°" label="Max position error" sub="130 comparisons with JPL Horizons" />
          <StatBox value="4" label="NASA LOLA elevation models" sub="20, 40, 80 and 240 m per pixel" />
          <StatBox value="0" label="Servers needed for the maths" sub="everything runs in your browser" />
        </div>
      </section>

      {/* ---------- audiences ---------- */}
      <section className="flex flex-col gap-10">
        <SectionTitle center eyebrow="Our users" title="Built for three audiences" />
        <div className="grid gap-4 md:grid-cols-3">
          <Panel title="Mission planners">
            Compare backup sites and dates, see what a launch delay does (<Link className="text-foreground underline underline-offset-4" href="/compare">Compare</Link>), export CSV and share a link to an exact scenario in Pro mode.
          </Panel>
          <Panel title="Educators">Animate a lunar day and show why the pole is special. Simple mode explains every number in plain language.</Panel>
          <Panel title="Everyone">Spin the 3D Moon, then look at the sky from its surface: the Sun skimming the ridges and Earth hanging low over the horizon. Simple mode is on by default.</Panel>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="flex flex-col gap-10">
        <SectionTitle center eyebrow="How it works" title="How we power the answer" />
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <Step n={1} title="Sky positions">
            Sun and Earth are computed in your browser (astronomy-engine plus the IAU lunar rotation model with libration) and checked against NASA JPL Horizons to ≤ 0.004° (
            <Link className="text-foreground underline underline-offset-4" href="/validation">
              Validation
            </Link>
            ).
          </Step>
          <Step n={2} title="Real terrain">
            Each preset site has a terrain horizon: 1440 rays (every 0.25°) through NASA LOLA elevation models out to 200 km, with lunar curvature, for an observer 2 m above the ground.
          </Step>
          <Step n={3} title="Power and comms">
            The share of the solar disk above that horizon gives power. Earth’s height above the horizon, with a 2° margin, gives comms.
          </Step>
          <Step n={4} title="No backend">
            Everything runs client-side. No accounts and no database: the URL is the saved state, so any scenario can be shared as a link.
          </Step>
        </div>
      </section>

      {/* ---------- definitions ---------- */}
      <section className="flex flex-col gap-10">
        <SectionTitle center eyebrow="Definitions" title="What the numbers mean" />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Illumination and nights">
            <b className="text-foreground">Illumination %</b> is the time-average of the visible fraction of the solar disk over the mission window (default 14 days).{" "}
            <b className="text-foreground">Longest night</b> is the longest continuous time with the whole disk below terrain.
          </Panel>
          <Panel title="Power index">
            Average visible fraction for a <b className="text-foreground">sun-tracking panel</b>, or visible fraction × sin(elevation) for a <b className="text-foreground">horizontal panel</b>.
          </Panel>
          <Panel title="Comms and blackouts">
            Comms means Earth’s centre is at least the margin (default 2°) above the terrain horizon at Earth’s azimuth. <b className="text-foreground">Longest blackout</b> is the longest time
            without it. <b className="text-foreground">Combined window</b> counts hours that are lit and have comms at once.
          </Panel>
          <Panel title="Verdicts">
            Power is Good with ≥ {THRESHOLDS.power.goodPct}% illumination and nights ≤ {THRESHOLDS.power.goodNightH} h; Poor below {THRESHOLDS.power.poorPct}% or with nights over{" "}
            {THRESHOLDS.power.poorNightH} h. Comms is Good with ≥ {THRESHOLDS.comms.goodPct}% and blackouts ≤ {THRESHOLDS.comms.goodBlackoutH} h; Poor below {THRESHOLDS.comms.poorPct}% or with
            blackouts over {THRESHOLDS.comms.poorBlackoutH} h. Otherwise Marginal. Overall is the worse of the two; both are shown separately too.
          </Panel>
          <Panel title="Azimuth">
            Degrees clockwise from lunar north (N 0°, E 90°). At a south-polar site “north” points away from the pole, so Earth (toward the 0° meridian) appears across the pole.
          </Panel>
          <Panel title="Limitations">
            Terrain masks are exact only for preset south-polar sites. Custom points use a 480 m/px browser DEM (within about 7 percentage points); sites north of 75°S use a flat horizon. Comms
            is geometric line-of-sight to Earth’s centre, without ground-station schedules, antennas or relays. Power is a geometric index without dust, temperature or batteries.
          </Panel>
        </div>
      </section>

      {/* ---------- sources ---------- */}
      <section className="flex flex-col gap-10">
        <SectionTitle center eyebrow="Data" title="NASA data and sources" />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Terrain">
            <A href="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/">LRO LOLA polar gridded elevation models (PDS)</A>: LDEM_875S_20M, LDEM_85S_40M, LDEM_80S_80M, LDEM_75S_240M.
          </Panel>
          <Panel title="Ephemerides">
            <A href="https://ssd.jpl.nasa.gov/horizons/">NASA JPL Horizons</A> for validation (saved fixtures and a live re-check), and{" "}
            <A href="https://github.com/cosinekitty/astronomy">astronomy-engine</A> (MIT licence) for the in-browser computation.
          </Panel>
          <Panel title="3D Moon">
            <A href="https://svs.gsfc.nasa.gov/4720">NASA SVS CGI Moon Kit</A> (LROC colour mosaic with polar fill) for the globe; the south-polar relief is a normal map computed from LOLA
            (×3 for visibility), lit by the real Sun direction at the selected time.
          </Panel>
          <Panel title="Published illumination">
            <A href="https://ntrs.nasa.gov/citations/20170007365">Gläser et al., illumination conditions at the lunar poles (NASA NTRS)</A>: site coordinates and reference values for the terrain
            check.
          </Panel>
          <Panel title="Site locations">
            <A href="https://svs.gsfc.nasa.gov/5013">NASA SVS: Artemis III candidate regions</A>, <A href="https://www.lroc.asu.edu/">LROC</A> and the{" "}
            <A href="https://planetarynames.wr.usgs.gov/">IAU/USGS Gazetteer of Planetary Nomenclature</A>. Region-level coordinates are snapped to the local crest within 2–6 km.
          </Panel>
        </div>
        <div className="card p-6">
          <h3 className="display mb-4 text-sm tracking-[0.2em]">Preset sites</h3>
          <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {SITES.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-2">
                <span>{s.name}</span>
                <A href={s.source}>{s.sourceLabel}</A>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- team + AI ---------- */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-4 p-6">
          <Eyebrow>Team</Eyebrow>
          <h2 className="display text-2xl">Team infinium</h2>
          <p className="text-sm text-muted">Built for the NASA Space Apps Challenge 2026, challenge “Lunar Landing Site Navigator”.</p>
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <Eyebrow>AI use</Eyebrow>
          <h2 className="display text-2xl">How AI tools were used</h2>
          <p className="text-sm text-muted">
            The team wrote the specification, chose the method and data, and reviewed the results. An AI coding assistant (Claude Code by Anthropic) generated most of the source code, the terrain
            pipeline and the documentation under that specification. Every number is computed from NASA data and checked independently: positions against saved JPL Horizons responses in
            automated tests, the DEM orientation against five known craters, and the terrain masks against published illumination values. No AI-generated images, voices or data are used.
          </p>
        </div>
      </section>
    </article>
  );
}
