"use client";

import { useMemo } from "react";
import { DAY, hasComms, type Events, type Sample, type WindowMetrics } from "@/lib/metrics";
import { RATING_WORD, commsRating, earthNow, headline, plainDuration, plainShare, plainWhen, sunHeightOnEarth, sunNow, sunRating, type Rating } from "@/lib/plain";

const RATING_COLOR: Record<Rating, string> = { great: "var(--good)", ok: "var(--marginal)", poor: "var(--poor)" };

interface Props {
  siteName: string;
  now: Sample;
  events: Events;
  metrics: WindowMetrics;
  windowDays: number;
  marginDeg: number;
  series: Sample[];
  start: number;
  days: number;
  t: number;
  onSeek: (t: number) => void;
}

/** Simple-mode summary: one sentence, four rated tiles, "right now" in words and a day strip. */
export function SimpleSummary({ siteName, now, events, metrics, windowDays, marginDeg, series, start, days, t, onSeek }: Props) {
  const sr = sunRating(metrics);
  const cr = commsRating(metrics);
  const when = plainWhen;

  const perDay = useMemo(() => {
    const out: { day: number; sun: number; earth: number }[] = [];
    for (let d = 0; d < days; d++) {
      const from = start + d * DAY;
      const ss = series.filter((s) => s.t >= from && s.t < from + DAY);
      const n = Math.max(1, ss.length);
      out.push({ day: from, sun: ss.reduce((a, s) => a + s.sunFrac, 0) / n, earth: ss.filter((s) => hasComms(s, marginDeg)).length / n });
    }
    return out;
  }, [series, start, days, marginDeg]);
  const cursorDay = Math.floor((t - start) / DAY);

  return (
    <div className="flex flex-col gap-4">
      {/* headline */}
      <section className="card flex flex-col gap-3 p-6">
        <div className="eyebrow !text-[0.62rem] !tracking-[0.3em] text-muted">In short · next {windowDays} days</div>
        <p className="text-lg leading-relaxed sm:text-xl">{headline(metrics)}</p>
        <p className="text-sm text-muted">
          Verdict for {siteName}: power is <b style={{ color: RATING_COLOR[sr] }}>{RATING_WORD[sr].toLowerCase()}</b>, staying in touch with Earth is{" "}
          <b style={{ color: RATING_COLOR[cr] }}>{RATING_WORD[cr].toLowerCase()}</b>.
        </p>
      </section>

      {/* four tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon="☀" color="var(--sun)" title="Sunlight" value={plainShare(metrics.illuminationPct, windowDays)} rating={sr} note="How often solar panels get light" />
        <Tile icon="⊕" color="var(--earth)" title="Earth in view" value={plainShare(metrics.commsPct, windowDays)} rating={cr} note="How often you can radio home" />
        <Tile icon="☾" color="var(--sun)" title="Longest darkness" value={plainDuration(metrics.longestNightH)} rating={metrics.longestNightH <= 48 ? "great" : metrics.longestNightH <= 120 ? "ok" : "poor"} note="Batteries must last this long" />
        <Tile icon="⊘" color="var(--earth)" title="Longest silence" value={plainDuration(metrics.longestBlackoutH)} rating={metrics.longestBlackoutH <= 24 ? "great" : metrics.longestBlackoutH <= 96 ? "ok" : "poor"} note="Longest time without a link" />
      </div>

      {/* right now */}
      <section className="card grid gap-4 p-6 md:grid-cols-2">
        <div className="flex gap-3">
          <span className="text-xl text-sun" aria-hidden>
            ☀
          </span>
          <div>
            <div className="eyebrow mb-1 !text-[0.6rem] !tracking-[0.3em] text-muted">Sun right now</div>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="num text-3xl text-sun">{now.sunEl.toFixed(1)}°</span>
              <span className="text-xs text-muted">above the horizon, {sunHeightOnEarth(now.sunEl)}</span>
            </div>
            <p className="text-sm leading-relaxed">{sunNow(now, events, now.t, when)}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="text-xl text-earth" aria-hidden>
            ⊕
          </span>
          <div>
            <div className="eyebrow mb-1 !text-[0.6rem] !tracking-[0.3em] text-muted">Earth right now</div>
            <p className="text-sm leading-relaxed">{earthNow(now, events, now.t, marginDeg, when)}</p>
          </div>
        </div>
      </section>

      {/* day strip */}
      <section className="card flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="display text-sm tracking-[0.2em]">Day by day</h3>
          <span className="text-xs text-muted">Brighter = more of that day. Click a day to jump there.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-[3px] text-xs">
            <tbody>
              {(["sun", "earth"] as const).map((row) => (
                <tr key={row}>
                  <th className="whitespace-nowrap pr-2 text-left font-normal text-muted">{row === "sun" ? "☀ Sunlight" : "⊕ Earth in view"}</th>
                  {perDay.map((d, i) => {
                    const v = d[row];
                    const rgb = row === "sun" ? "226,189,106" : "126,174,224";
                    return (
                      <td key={d.day} className="p-0">
                        <button
                          onClick={() => onSeek(d.day + DAY / 2)}
                          className={`print-keep block h-6 w-6 ${i === cursorDay ? "outline outline-1 outline-foreground" : ""}`}
                          style={{ background: `rgba(${rgb},${0.06 + 0.94 * v})` }}
                          title={`${new Date(d.day).toISOString().slice(0, 10)}: ${row === "sun" ? "sunlight" : "Earth in view"} ${Math.round(v * 100)}% of the day`}
                          aria-label={`${new Date(d.day).toISOString().slice(0, 10)} ${row} ${Math.round(v * 100)} percent`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {perDay.map((d, i) => (
                  <td key={d.day} className={`text-center ${i === cursorDay ? "text-foreground" : "text-faint"}`}>
                    {new Date(d.day).getUTCDate()}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details className="card p-6 text-sm leading-relaxed text-muted">
        <summary className="display cursor-pointer text-sm tracking-[0.2em] text-foreground">New to the Moon? Read this</summary>
        <ul className="mt-4 flex flex-col gap-3">
          <li>
            <b className="text-foreground">A lunar day is long.</b> The Moon turns once in 29.5 Earth days, so a “day” and a “night” each last about two weeks at most places.
          </li>
          <li>
            <b className="text-foreground">The south pole is special.</b> The Sun never climbs high there; it circles around the horizon. High ridges can stay sunny almost all
            the time while craters next to them stay dark for billions of years, keeping water ice frozen.
          </li>
          <li>
            <b className="text-foreground">Earth barely moves in the Moon’s sky.</b> It just wobbles a little (this is called libration). Near the pole that small wobble decides
            whether hills block the radio link home.
          </li>
          <li>
            <b className="text-foreground">Why both matter.</b> A lander needs sunlight to charge its batteries and Earth in view to send data. The best sites have both.
          </li>
          <li>Want exact angles, times and exports? Switch to Pro at the top right.</li>
        </ul>
      </details>
    </div>
  );
}

function Tile({ icon, color, title, value, rating, note }: { icon: string; color: string; title: string; value: string; rating: Rating; note: string }) {
  return (
    <div className="card flex flex-col justify-between gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">
          <span className="mr-1.5" style={{ color }} aria-hidden>
            {icon}
          </span>
          {title}
        </span>
        <span className="border px-1.5 text-[11px] uppercase tracking-[0.12em]" style={{ color: RATING_COLOR[rating], borderColor: RATING_COLOR[rating] }}>
          {RATING_WORD[rating]}
        </span>
      </div>
      <div className="text-lg leading-snug text-foreground sm:text-xl">{value}</div>
      <div className="text-xs text-muted">{note}</div>
    </div>
  );
}
