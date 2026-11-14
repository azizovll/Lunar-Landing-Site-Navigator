"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { horizonEl, type Horizon, type Sample } from "@/lib/metrics";
import { compass } from "@/lib/format";

const W = 1200;
const H = 300;

interface Props {
  horizon: Horizon | null | undefined;
  now: Sample;
  sunTrack: Sample[];
  earthTrack: Sample[];
  expert: boolean;
  marginDeg: number;
}

/** 360° sky panorama: azimuth on x (centred on north), elevation on y (vertically exaggerated). */
export function Panorama({ horizon, now, sunTrack, earthTrack, expert, marginDeg }: Props) {
  const clipId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens the panorama scrolls sideways: start centred on Earth (the middle of the view).
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  // Centre the view on Earth's mean azimuth (rounded to 15°): Earth barely moves in the lunar sky,
  // so the comms-critical part of the horizon is always in the middle. (At a south-polar site Earth
  // lies across the pole, i.e. roughly toward azimuth 180° - longitude.)
  const center = useMemo(() => {
    let sx = 0, sy = 0;
    for (const s of earthTrack) {
      sx += Math.sin((s.earthAz * Math.PI) / 180);
      sy += Math.cos((s.earthAz * Math.PI) / 180);
    }
    const mean = earthTrack.length ? (Math.atan2(sx, sy) * 180) / Math.PI : 0;
    return ((Math.round(mean / 15) * 15) % 360 + 360) % 360;
  }, [earthTrack]);
  const { elMin, elMax } = useMemo(() => {
    let hi = 6;
    for (const s of sunTrack) hi = Math.max(hi, s.sunEl);
    for (const s of earthTrack) hi = Math.max(hi, s.earthEl);
    let hzMax = 0;
    if (horizon) for (let i = 0; i < horizon.el.length; i++) hzMax = Math.max(hzMax, horizon.el[i]);
    hi = Math.max(hi, hzMax);
    return { elMin: -4, elMax: Math.min(90, Math.ceil(hi + 2)) };
  }, [sunTrack, earthTrack, horizon]);

  const xOf = (az: number) => ((((az - center + 180) % 360) + 360) % 360) * (W / 360);
  const pyd = H / (elMax - elMin);
  const yOf = (el: number) => H - (el - elMin) * pyd;
  const exaggeration = pyd / (W / 360);

  const { terrainPath, skyPath } = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 1440; i++) {
      const az = center - 180 + i * 0.25;
      pts.push(`${(i * 0.25 * (W / 360)).toFixed(1)},${(H - (horizonEl(horizon, az) - elMin) * (H / (elMax - elMin))).toFixed(1)}`);
    }
    const line = pts.join(" L");
    return { terrainPath: `M0,${H} L${line} L${W},${H} Z`, skyPath: `M0,0 L${line} L${W},0 Z` };
  }, [horizon, elMin, elMax, center]);

  const track = (samples: Sample[], get: (s: Sample) => [number, number]) => {
    let d = "";
    let prevX: number | null = null;
    for (const s of samples) {
      const [az, el] = get(s);
      const x = xOf(az);
      const y = yOf(el);
      d += prevX === null || Math.abs(x - prevX) > W / 2 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
      prevX = x;
    }
    return d;
  };

  const sunX = xOf(now.sunAz);
  const sunY = yOf(now.sunEl);
  const earthX = xOf(now.earthAz);
  const earthY = yOf(now.earthEl);
  const sunR = Math.max(3, now.sunR * pyd);
  const earthR = Math.max(4, now.earthR * pyd);

  const ticks = [];
  for (let az = 0; az < 360; az += expert ? 30 : 45) {
    ticks.push({ x: xOf(az), label: expert ? `${az}°` : compass(az) });
  }
  const elTicks = [];
  const stepEl = elMax - elMin > 40 ? 15 : elMax - elMin > 20 ? 5 : 2;
  for (let e = Math.ceil(elMin / stepEl) * stepEl; e <= elMax; e += stepEl) elTicks.push(e);

  return (
    <figure className="card overflow-hidden">
      <div className="overflow-x-auto" ref={scroller}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="block w-full min-w-[760px]" role="img" aria-label="Panoramic sky view with terrain horizon, Sun and Earth">
        <defs>
          <linearGradient id={`${clipId}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#05070d" />
            <stop offset="1" stopColor="#0b1222" />
          </linearGradient>
          <clipPath id={`${clipId}-above`}>
            <path d={skyPath} />
          </clipPath>
          <radialGradient id={`${clipId}-sun`}>
            <stop offset="0.6" stopColor="#fff3c4" />
            <stop offset="1" stopColor="#ffc23d" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${clipId}-sky)`} />
        {elTicks.map((e) => (
          <g key={e}>
            <line x1={0} x2={W} y1={yOf(e)} y2={yOf(e)} stroke={e === 0 ? "#3a4a6e" : "#1a2440"} strokeDasharray={e === 0 ? "" : "2 4"} />
            <text x={4} y={yOf(e) - 3} fontSize={11} fill="#5d6b8c">
              {e}°
            </text>
          </g>
        ))}
        {/* tracks */}
        <path d={track(earthTrack, (s) => [s.earthAz, s.earthEl])} fill="none" stroke="var(--earth)" strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="3 3" />
        <path d={track(sunTrack, (s) => [s.sunAz, s.sunEl])} fill="none" stroke="var(--sun)" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="1 3" />
        {/* bodies, clipped by terrain so partially hidden disks look partially hidden */}
        <g clipPath={`url(#${clipId}-above)`}>
          <circle cx={sunX} cy={sunY} r={sunR * 3} fill="var(--sun)" opacity={0.12} />
          <circle cx={sunX} cy={sunY} r={sunR} fill={`url(#${clipId}-sun)`} />
          <circle cx={earthX} cy={earthY} r={earthR} fill="#2a6fd6" stroke="var(--earth)" strokeWidth={1.5} />
          <ellipse cx={earthX - earthR * 0.25} cy={earthY - earthR * 0.2} rx={earthR * 0.45} ry={earthR * 0.3} fill="#6fbf73" opacity={0.6} />
        </g>
        {/* comms threshold line under Earth */}
        <line
          x1={earthX - 30}
          x2={earthX + 30}
          y1={yOf(now.earthHz + marginDeg)}
          y2={yOf(now.earthHz + marginDeg)}
          stroke="var(--earth)"
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <path d={terrainPath} fill="#1c2232" stroke="#8592ad" strokeWidth={1} />
        {/* outlines over terrain so hidden bodies are still findable */}
        <circle cx={sunX} cy={sunY} r={sunR} fill="none" stroke="var(--sun)" strokeOpacity={0.6} strokeDasharray="2 2" />
        <circle cx={earthX} cy={earthY} r={earthR} fill="none" stroke="var(--earth)" strokeOpacity={0.6} strokeDasharray="2 2" />
        <text x={Math.min(W - 40, Math.max(40, sunX))} y={Math.max(14, sunY - sunR - 8)} fontSize={13} fill="var(--sun)" textAnchor="middle" fontWeight={600}>
          Sun {expert ? `${now.sunEl.toFixed(2)}°` : ""}
        </text>
        <text x={Math.min(W - 40, Math.max(40, earthX))} y={Math.max(14, earthY - earthR - 8)} fontSize={13} fill="var(--earth)" textAnchor="middle" fontWeight={600}>
          Earth {expert ? `${now.earthEl.toFixed(2)}°` : ""}
        </text>
        {ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={H} y2={H + 5} stroke="#5d6b8c" />
            <text x={Math.min(W - 14, Math.max(14, t.x))} y={H + 18} fontSize={12} fill="#8b97b3" textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}
      </svg>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-muted">
        <span>
          <span className="text-sun">●</span> Sun track ±7 days
        </span>
        <span>
          <span className="text-earth">●</span> Earth track 30 days (libration wobble)
        </span>
        <span>Grey: terrain horizon{horizon ? "" : " (flat: no DEM here)"}</span>
        <span>
          Vertical scale ×{exaggeration.toFixed(1)};{" "}
          {now.sunR * pyd < 3 || now.earthR * pyd < 4
            ? "disks enlarged to stay visible at this scale (true sizes in the 1:1 close-ups)"
            : "disk sizes true on the vertical axis"}
        </span>
      </figcaption>
    </figure>
  );
}

/** True-scale (1:1) close-up of the terrain horizon around a body. */
export function Lens({ horizon, az, el, r, kind, fraction, clearance }: { horizon: Horizon | null | undefined; az: number; el: number; r: number; kind: "sun" | "earth"; fraction?: number; clearance?: number }) {
  const id = useId();
  const w = 480;
  const h = 240;
  const spanAz = 6; // half-width in degrees
  const pd = w / spanAz;
  const elC = el;
  const xOf = (a: number) => w / 2 + (((a - az + 540) % 360) - 180) * pd * Math.cos((el * Math.PI) / 180);
  const yOf = (e: number) => h / 2 - (e - elC) * pd;
  let terrain = `M0,${h}`;
  for (let i = 0; i <= 80; i++) {
    const a = az - spanAz + (i * 2 * spanAz) / 80;
    terrain += ` L${xOf(a).toFixed(1)},${Math.min(h + 5, Math.max(-5, yOf(horizonEl(horizon, a)))).toFixed(1)}`;
  }
  terrain += ` L${w},${h} Z`;
  const color = kind === "sun" ? "var(--sun)" : "var(--earth)";
  return (
    <div className="card overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full">
        <rect width={w} height={h} fill="#05070d" />
        <clipPath id={`${id}-c`}>
          <rect width={w} height={h} />
        </clipPath>
        <g clipPath={`url(#${id}-c)`}>
          <circle cx={w / 2} cy={h / 2} r={r * pd} fill={kind === "sun" ? "#ffe9a8" : "#2a6fd6"} stroke={color} />
          <path d={terrain} fill="#1c2232" stroke="#8592ad" />
        </g>
        <circle cx={w / 2} cy={h / 2} r={r * pd} fill="none" stroke={color} strokeDasharray="2 2" opacity={0.7} />
        <text x={8} y={18} fontSize={13} fill="#8b97b3">
          1:1 close-up, {spanAz * 2}° wide
        </text>
      </svg>
      <div className="flex justify-between px-3 py-1.5 text-xs">
        <span style={{ color }}>{kind === "sun" ? "Sun disk" : "Earth disk"}</span>
        <span className="tabular text-muted">
          {fraction !== undefined ? `${(fraction * 100).toFixed(0)}% visible` : clearance !== undefined ? `${clearance >= 0 ? "+" : ""}${clearance.toFixed(2)}° over terrain` : ""}
        </span>
      </div>
    </div>
  );
}
