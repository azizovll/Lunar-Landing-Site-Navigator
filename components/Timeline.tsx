"use client";

import { useMemo, useRef } from "react";
import { DAY, hasComms, isLit, type Sample } from "@/lib/metrics";

const W = 1200;
const BAND = 14;
const TOP = 3 * (BAND + 3) + 6;
const CH = 170;
const H = TOP + CH + 22;

interface Props {
  series: Sample[];
  start: number;
  days: number;
  t: number;
  windowFrom: number;
  windowTo: number;
  marginDeg: number;
  onSeek: (t: number) => void;
}

/** 30-day timeline: shaded light / comms / both windows and Sun & Earth clearance over the terrain horizon. */
export function Timeline({ series, start, days, t, windowFrom, windowTo, marginDeg, onSeek }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const end = start + days * DAY;
  const visible = useMemo(() => series.filter((s) => s.t >= start && s.t <= end), [series, start, end]);

  const { yMin, yMax } = useMemo(() => {
    let hi = 6;
    for (const s of visible) hi = Math.max(hi, sunClear(s), s.earthClear);
    return { yMin: -8, yMax: Math.min(90, Math.ceil(hi + 1)) };
  }, [visible]);

  const xOf = (time: number) => ((time - start) / (end - start)) * W;
  const yOf = (v: number) => TOP + CH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * CH;

  const bands = useMemo(() => {
    const rows: { key: string; color: string; pred: (s: Sample) => boolean; label: string }[] = [
      { key: "light", color: "var(--sun)", pred: isLit, label: "Light" },
      { key: "comms", color: "var(--earth)", pred: (s) => hasComms(s, marginDeg), label: "Comms" },
      { key: "both", color: "var(--both)", pred: (s) => isLit(s) && hasComms(s, marginDeg), label: "Both" },
    ];
    return rows.map((r, idx) => {
      const rects: { x: number; w: number }[] = [];
      let runStart: number | null = null;
      for (let i = 0; i < visible.length; i++) {
        const on = r.pred(visible[i]);
        if (on && runStart === null) runStart = visible[i].t;
        if ((!on || i === visible.length - 1) && runStart !== null) {
          rects.push({ x: xOf(runStart), w: Math.max(1, xOf(visible[i].t) - xOf(runStart)) });
          runStart = null;
        }
      }
      return { ...r, y: 4 + idx * (BAND + 3), rects };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, marginDeg, start, end]);

  const line = (get: (s: Sample) => number) =>
    visible.map((s, i) => `${i ? "L" : "M"}${xOf(s.t).toFixed(1)},${yOf(get(s)).toFixed(1)}`).join("");

  const seek = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    onSeek(start + frac * (end - start));
  };

  const dayTicks = [];
  const firstDay = Math.ceil(start / DAY) * DAY;
  const tickEvery = days > 20 ? 3 : 1;
  for (let d = firstDay; d <= end; d += DAY) {
    const idx = Math.round((d - firstDay) / DAY);
    dayTicks.push({ x: xOf(d), label: idx % tickEvery === 0 ? new Date(d).toISOString().slice(5, 10) : "" });
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full min-w-[680px] cursor-crosshair select-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
        role="img"
        aria-label="30-day timeline of light and communication windows"
      >
        <rect x={xOf(windowFrom)} y={0} width={Math.max(0, xOf(windowTo) - xOf(windowFrom))} height={TOP + CH} fill="#ffffff" opacity={0.04} />
        {bands.map((b) => (
          <g key={b.key}>
            <rect x={0} y={b.y} width={W} height={BAND} fill="#121a2e" />
            {b.rects.map((r, i) => (
              <rect key={i} x={r.x} y={b.y} width={r.w} height={BAND} fill={b.color} opacity={0.8} />
            ))}
            <text x={6} y={b.y + BAND - 3} fontSize={11} fill="#05070d" fontWeight={700} style={{ paintOrder: "stroke" }} stroke="#ffffffaa" strokeWidth={2.5}>
              {b.label}
            </text>
          </g>
        ))}
        {/* clearance chart */}
        <rect x={0} y={TOP} width={W} height={CH} fill="#0a0f1c" />
        <rect x={0} y={yOf(0)} width={W} height={TOP + CH - yOf(0)} fill="#1c2232" opacity={0.7} />
        <line x1={0} x2={W} y1={yOf(0)} y2={yOf(0)} stroke="#8592ad" />
        <line x1={0} x2={W} y1={yOf(marginDeg)} y2={yOf(marginDeg)} stroke="var(--earth)" strokeDasharray="4 4" opacity={0.5} />
        <text x={W - 4} y={yOf(0) + 12} fontSize={11} fill="#8592ad" textAnchor="end">
          terrain horizon
        </text>
        <text x={W - 4} y={yOf(marginDeg) - 3} fontSize={11} fill="var(--earth)" textAnchor="end" opacity={0.8}>
          comms margin +{marginDeg}°
        </text>
        <text x={4} y={TOP + 12} fontSize={11} fill="#5d6b8c">
          +{yMax}°
        </text>
        <text x={4} y={TOP + CH - 4} fontSize={11} fill="#5d6b8c">
          {yMin}°
        </text>
        <path d={line((s) => s.earthClear)} fill="none" stroke="var(--earth)" strokeWidth={1.6} />
        <path d={line(sunClear)} fill="none" stroke="var(--sun)" strokeWidth={1.6} />
        {dayTicks.map((d) => (
          <g key={d.x}>
            <line x1={d.x} x2={d.x} y1={TOP + CH} y2={TOP + CH + (d.label ? 6 : 3)} stroke="#5d6b8c" />
            {d.label && (
              <text x={Math.min(W - 20, Math.max(20, d.x))} y={H - 4} fontSize={11} fill="#8b97b3" textAnchor="middle">
                {d.label}
              </text>
            )}
          </g>
        ))}
        <line x1={xOf(t)} x2={xOf(t)} y1={0} y2={TOP + CH} stroke="#ffffff" strokeWidth={1.5} />
        <circle cx={xOf(t)} cy={TOP + CH} r={4} fill="#ffffff" />
      </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-muted">
        <span>
          <span className="text-sun">━</span> Sun disk centre over terrain
        </span>
        <span>
          <span className="text-earth">━</span> Earth centre over terrain
        </span>
        <span>Light = any part of the solar disk visible · Comms = Earth ≥ horizon + margin · lighter band = mission window</span>
        <span>Click or drag to move the time cursor.</span>
      </div>
    </div>
  );
}

/** Sun centre elevation minus the terrain horizon at the Sun's azimuth. */
function sunClear(s: Sample): number {
  return s.sunEl - s.sunHz;
}
