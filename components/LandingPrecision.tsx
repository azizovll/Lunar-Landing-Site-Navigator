"use client";

import { useEffect, useMemo, useState } from "react";
import { sampleSeries, windowMetrics, type Settings, type WindowMetrics } from "@/lib/metrics";
import { LIGHT_COLOR, light, score } from "@/lib/score";

/**
 * Landing precision: a real lander touches down somewhere in an ellipse, not on a point.
 * public/data/ellipse.json (pipeline/build_ellipse.py) holds full-resolution LOLA horizons at
 * 6 points on a 250 m ring and on a 1 km ring around every south-polar preset; this card shows
 * how much the score changes if the landing is off target by that much.
 */
interface RingPoint {
  bearing: number;
  lat: number;
  lon: number;
  heightM: number;
  horizon: number[];
}
type EllipseData = Record<string, { rings: { ringKm: number; points: RingPoint[] }[] }>;

let cache: Promise<EllipseData> | null = null;
const load = () => (cache ??= fetch("/data/ellipse.json").then((r) => r.json()));

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const dirName = (b: number) => COMPASS[Math.round(b / 45) % 8];

interface Props {
  siteId: string;
  from: number;
  to: number;
  settings: Settings;
  centre: WindowMetrics;
  simple: boolean;
}

export function LandingPrecision({ siteId, from, to, settings, centre, simple }: Props) {
  const [data, setData] = useState<EllipseData | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  const [ringIdx, setRingIdx] = useState(0);
  const rings = data?.[siteId]?.rings;
  const ring = rings?.[Math.min(ringIdx, (rings?.length ?? 1) - 1)];
  const pts = useMemo(() => {
    if (!ring) return [];
    return ring.points.map((p) => {
      const m = windowMetrics(sampleSeries({ lat: p.lat, lon: p.lon, heightM: p.heightM, horizon: { azStepDeg: 360 / p.horizon.length, el: p.horizon } }, from, to, 30 * 60_000), from, to, settings);
      return { ...p, m, score: score(m) };
    });
  }, [ring, from, to, settings]);

  if (!data) return <section className="card p-5 text-sm text-muted">Loading landing-precision data…</section>;
  if (!ring || !pts.length) return null; // custom points and sites outside the polar DEM

  const c = score(centre);
  const lo = pts.reduce((a, b) => (b.score < a.score ? b : a));
  const hi = pts.reduce((a, b) => (b.score > a.score ? b : a));
  const spread = hi.score - lo.score;
  const worstDrop = c - lo.score;
  const robust = worstDrop <= 10;
  const col = (v: number) => LIGHT_COLOR[light(v)];

  const dist = ring.ringKm < 1 ? `${Math.round(ring.ringKm * 1000)} m` : `${ring.ringKm} km`;
  const sentence = robust
    ? `Robust: landing ${dist} off target in any direction keeps the score within ${Math.max(worstDrop, 0)} points (${lo.score}–${hi.score}).`
    : `Sensitive: ${dist} to the ${dirName(lo.bearing)} the score falls from ${c} to ${lo.score}` +
      (lo.m.illuminationPct < centre.illuminationPct - 10 ? ` (sunlight ${Math.round(centre.illuminationPct)}% → ${Math.round(lo.m.illuminationPct)}%)` : "") +
      (lo.m.commsPct < centre.commsPct - 10 ? ` (Earth in view ${Math.round(centre.commsPct)}% → ${Math.round(lo.m.commsPct)}%)` : "") +
      `. The lander would be on a slope below the crest, so this target needs a precise landing.`;

  return (
    <section className="card flex flex-col gap-4 p-5" style={{ borderTop: `1px solid ${robust ? "var(--good)" : "var(--marginal)"}` }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="display text-xs tracking-[0.3em]">Landing precision · {dist} off target</h3>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Miss distance</span>
          <div className="flex border border-line" role="group" aria-label="Miss distance">
            {rings!.map((r, i) => (
              <button key={r.ringKm} onClick={() => setRingIdx(i)} aria-pressed={i === ringIdx} className={`px-2.5 py-1 ${i === ringIdx ? "bg-panel3 text-foreground" : "hover:text-foreground"}`}>
                {r.ringKm < 1 ? `${Math.round(r.ringKm * 1000)} m` : `${r.ringKm} km`}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
        <svg viewBox="-100 -100 200 200" className="mx-auto w-40" role="img" aria-label={`Score at the target ${c}; between ${lo.score} and ${hi.score} at ${dist} away`}>
          <circle r="62" fill="none" stroke="var(--border-strong)" strokeDasharray="3 5" />
          <text y="-84" textAnchor="middle" fontSize="11" fill="var(--muted)">
            N
          </text>
          <circle r="20" fill="none" stroke={col(c)} strokeWidth="1.5" />
          <text y="5" textAnchor="middle" fontSize="15" fill="var(--foreground)" style={{ fontFamily: "var(--font-orbitron)" }}>
            {c}
          </text>
          {pts.map((p) => {
            const a = (p.bearing * Math.PI) / 180;
            const x = 62 * Math.sin(a);
            const y = -62 * Math.cos(a);
            return (
              <g key={p.bearing}>
                <circle cx={x} cy={y} r="14" fill="var(--panel)" stroke={col(p.score)} strokeWidth="1.5" />
                <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="var(--foreground)" style={{ fontFamily: "var(--font-orbitron)" }}>
                  {p.score}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed">{sentence}</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="frame p-2.5">
              <div className="text-muted">On target</div>
              <div className="num mt-1 text-lg" style={{ color: col(c) }}>
                {c}
              </div>
            </div>
            <div className="frame p-2.5">
              <div className="text-muted">Worst, {dist} off</div>
              <div className="num mt-1 text-lg" style={{ color: col(lo.score) }}>
                {lo.score}
              </div>
            </div>
            <div className="frame p-2.5">
              <div className="text-muted">Spread</div>
              <div className="num mt-1 text-lg">{spread}</div>
            </div>
          </div>
          {simple ? (
            <p className="text-xs leading-relaxed text-muted">
              Landers do not hit a point exactly: Odysseus came down about 1.5 km from its target. The numbers around the circle are the scores you would get {dist} to the north,
              south-east and so on. Big differences mean a risky target.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Six points on a {dist} ring, each with its own full-resolution LOLA horizon: {pts.map((p) => `${dirName(p.bearing)} ${p.score} (☀ ${Math.round(p.m.illuminationPct)}%, ⊕ ${Math.round(p.m.commsPct)}%, ${Math.round(p.heightM)} m)`).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
