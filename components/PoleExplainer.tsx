import { SectionTitle } from "./ui";

/** "Why is the south pole so hard?" in three illustrated steps (static, no client JS). */
export function PoleExplainer() {
  return (
    <section className="flex flex-col gap-10" aria-labelledby="why-pole">
      <SectionTitle center eyebrow="Why it is hard" title={<span id="why-pole">Why the south pole is tricky</span>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card n={1} title="The Sun skims the horizon" text="The Moon’s axis is tilted only 1.5°. At the equator the Sun climbs high overhead; at the pole it circles the whole horizon once every 29.5 days and never rises more than about 1.5°.">
          <svg viewBox="0 0 240 120" className="w-full" aria-hidden>
            <rect width="240" height="120" fill="#060607" />
            <path d="M20 100 Q120 -10 220 100" fill="none" stroke="#55555c" strokeDasharray="4 4" />
            <text x="120" y="30" fill="#8b8b92" fontSize="10" textAnchor="middle">equator: Sun up to 90°</text>
            <line x1="10" x2="230" y1="100" y2="100" stroke="#b9b9bf" />
            <path d="M20 96 C80 93 160 93 220 96" fill="none" stroke="var(--sun)" strokeWidth="2" />
            <circle cx="150" cy="93.6" r="5" fill="#fbf3df" stroke="var(--sun)" />
            <text x="120" y="115" fill="var(--sun)" fontSize="10" textAnchor="middle">pole: Sun stays just above the horizon</text>
          </svg>
        </Card>
        <Card n={2} title="A few metres decide light or dark" text="With the Sun that low, a ridge can be lit for most of the year while a crater next to it has not seen sunlight for billions of years. Those dark craters can trap water ice.">
          <svg viewBox="0 0 240 120" className="w-full" aria-hidden>
            <rect width="240" height="120" fill="#060607" />
            <path d="M0 70 L50 64 L80 38 L100 44 L120 92 L170 96 L200 60 L240 66 L240 120 L0 120 Z" fill="#141416" stroke="#b9b9bf" />
            <path d="M100 44 L120 92 L170 96 L188 75 Z" fill="#000" opacity="0.9" />
            <path d="M50 64 L80 38 L100 44" fill="none" stroke="var(--sun)" strokeWidth="2.5" />
            {[0, 1, 2].map((k) => (
              <line key={k} x1={-10} y1={28 + k * 7} x2={86} y2={36 + k * 7} stroke="var(--sun)" strokeOpacity="0.5" strokeDasharray="3 3" />
            ))}
            <text x="78" y="28" fill="var(--sun)" fontSize="10" textAnchor="middle">lit ridge</text>
            <text x="148" y="88" fill="#8b8b92" fontSize="10" textAnchor="middle">never sunlit</text>
          </svg>
        </Card>
        <Card n={3} title="Earth wobbles near the horizon" text="Earth never rises or sets the normal way: it hangs low in one part of the sky and wobbles a few degrees (libration). Near the pole that small wobble decides whether hills block the radio link home.">
          <svg viewBox="0 0 240 120" className="w-full" aria-hidden>
            <rect width="240" height="120" fill="#060607" />
            <ellipse cx="128" cy="78" rx="34" ry="18" fill="none" stroke="var(--earth)" strokeDasharray="3 3" strokeOpacity="0.8" />
            <circle cx="104" cy="66" r="9" fill="#2f4c6e" stroke="var(--earth)" />
            <path d="M0 92 L60 88 L90 80 L118 86 L150 70 L178 82 L240 86 L240 120 L0 120 Z" fill="#141416" stroke="#b9b9bf" />
            <text x="104" y="48" fill="var(--earth)" fontSize="10" textAnchor="middle">Earth in view</text>
            <text x="190" y="64" fill="#8b8b92" fontSize="10" textAnchor="middle">…behind the hill</text>
          </svg>
        </Card>
      </div>
      <p className="mx-auto max-w-2xl text-center text-sm text-muted">
        That is why every site in this app uses a real NASA LOLA terrain horizon, and why a launch delay of a few days can change everything.
      </p>
    </section>
  );
}

function Card({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <article className="card flex flex-col gap-4 p-5">
      <div className="frame overflow-hidden">{children}</div>
      <div className="flex items-baseline gap-3">
        <span className="num text-3xl text-transparent" style={{ WebkitTextStroke: "1px var(--muted)" }}>
          {String(n).padStart(2, "0").replace("0", "Ø")}
        </span>
        <h3 className="display text-sm tracking-[0.12em]">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}
