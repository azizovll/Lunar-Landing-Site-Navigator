import { SectionTitle } from "./ui";

/**
 * "Moon vs Earth": the conditions that make lunar mission planning so different, side by side.
 * Values are rounded, textbook-level figures; temperatures from NASA LRO Diviner measurements and
 * WMO world records. Horizon distance = sqrt(2 R h) for an eye 1.7 m above the ground.
 */
const ROWS: { label: string; moon: string; earth: string; why: string }[] = [
  { label: "Length of a day", moon: "29.5 Earth days", earth: "24 hours", why: "About two weeks of sunlight, then about two weeks of night at most places." },
  { label: "Highest Sun at the pole", moon: "about 1.5°", earth: "23.4° (midsummer)", why: "The Moon’s axis is tilted only 1.5°, so the polar Sun skims the horizon." },
  { label: "Atmosphere", moon: "none", earth: "1 bar of air", why: "No refraction (Earth adds about 0.5° at the horizon), no twilight, no weather." },
  { label: "Daytime sky", moon: "black", earth: "blue", why: "Without air nothing scatters sunlight; shadows are pitch black." },
  { label: "Horizon for a standing person", moon: "about 2.4 km away", earth: "about 4.7 km away", why: "A smaller sphere curves away faster, so nearby hills block more of the sky." },
  { label: "Surface temperature", moon: "+120 °C to −170 °C, −240 °C in polar craters", earth: "+57 °C to −89 °C (all-time records)", why: "No air to hold heat: sunlight or shadow decides everything." },
  { label: "The other world in the sky", moon: "Earth stays put, wobbling a few degrees", earth: "The Moon rises and sets daily", why: "The Moon always shows Earth the same face, so Earth barely moves in its sky." },
];

export function MoonVsEarth() {
  return (
    <section className="flex flex-col gap-10" aria-labelledby="moon-vs-earth">
      <SectionTitle center eyebrow="Not like home" title={<span id="moon-vs-earth">Moon vs Earth</span>} />
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr] border-b border-line text-xs uppercase tracking-[0.2em] text-muted sm:grid-cols-[1.1fr_1.2fr_1fr_1.6fr]">
          <div className="hidden p-4 sm:block" />
          <div className="p-4 text-sun">On the Moon</div>
          <div className="p-4">On Earth</div>
          <div className="hidden p-4 sm:block">Why it matters</div>
        </div>
        {ROWS.map((r) => (
          <div key={r.label} className="grid grid-cols-[1fr_1fr] border-b border-line last:border-b-0 sm:grid-cols-[1.1fr_1.2fr_1fr_1.6fr]">
            <div className="col-span-2 px-4 pt-4 text-sm text-foreground sm:col-span-1 sm:p-4">{r.label}</div>
            <div className="px-4 py-2 sm:p-4">
              <span className="num text-base text-sun sm:text-lg">{r.moon}</span>
            </div>
            <div className="px-4 py-2 text-sm text-muted sm:p-4">{r.earth}</div>
            <div className="col-span-2 px-4 pb-4 text-xs leading-relaxed text-muted sm:col-span-1 sm:p-4">{r.why}</div>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-2xl text-center text-xs text-muted">
        Rounded figures. Lunar temperatures from NASA LRO{" "}
        <a href="https://www.diviner.ucla.edu/" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
          Diviner
        </a>{" "}
        measurements; Earth extremes are WMO world records.
      </p>
    </section>
  );
}
