"use client";

import { useRef } from "react";
import mapMeta from "@/public/data/polar-map.json";
import { latLonToPixel, pixelToLatLon } from "@/lib/horizonCore";
import { SITES } from "@/lib/sites";

const SIZE = mapMeta.sizePx as number;
const OFF = (SIZE - 1) / 2;
const SCALE = mapMeta.scaleM as number;

interface Props {
  selectedId: string;
  custom: { lat: number; lon: number } | null;
  onSelect: (id: string) => void;
  onCustom: (lat: number, lon: number) => void;
}

/** South-polar (80–90°S) LOLA hillshade. Click a dot to choose a preset, anywhere else for a custom point. */
export function PolarMap({ selectedId, custom, onSelect, onCustom }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const pts = SITES.filter((s) => s.lat <= -80).map((s) => ({ ...s, ...latLonToPixel(s.lat, s.lon, OFF, SCALE) }));
  const rings = [-88, -85, -82].map((lat) => ({ lat, r: OFF - latLonToPixel(lat, 0, OFF, SCALE).line }));
  const spokes = [0, 90, 180, 270].map((lon) => ({ lon, ...latLonToPixel(-80, lon, OFF, SCALE) }));
  const cust = custom ? latLonToPixel(custom.lat, custom.lon, OFF, SCALE) : null;

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const samp = ((e.clientX - box.left) / box.width) * SIZE;
    const line = ((e.clientY - box.top) / box.height) * SIZE;
    const near = pts
      .map((p) => ({ p, d: Math.hypot(p.samp - samp, p.line - line) }))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d < SIZE * 0.025) return onSelect(near.p.id);
    const { lat, lon } = pixelToLatLon(line, samp, OFF, SCALE);
    if (lat <= -80) onCustom(Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4);
  };

  return (
    <figure className="card overflow-hidden">
      <svg ref={ref} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block aspect-square w-full cursor-crosshair" onClick={click} role="img" aria-label="South polar map 80 to 90 degrees south">
        <defs>
          <clipPath id="polar-disk">
            <circle cx={OFF} cy={OFF} r={OFF} />
          </clipPath>
        </defs>
        <image href="/data/polar-map.png" width={SIZE} height={SIZE} clipPath="url(#polar-disk)" preserveAspectRatio="none" />
        <g fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={SIZE / 600}>
          {rings.map((r) => (
            <circle key={r.lat} cx={OFF} cy={OFF} r={r.r} />
          ))}
          {spokes.map((s) => (
            <line key={s.lon} x1={OFF} y1={OFF} x2={s.samp} y2={s.line} />
          ))}
        </g>
        {spokes.map((s) => (
          <text key={s.lon} x={OFF + (s.samp - OFF) * 0.93} y={OFF + (s.line - OFF) * 0.93} fontSize={SIZE / 30} fill="#c8d0e0" textAnchor="middle" dominantBaseline="middle">
            {s.lon === 0 ? "0°" : s.lon === 180 ? "180°" : s.lon === 90 ? "90°E" : "90°W"}
          </text>
        ))}
        {rings.map((r) => (
          <text key={r.lat} x={OFF + 4} y={OFF - r.r - 4} fontSize={SIZE / 40} fill="#c8d0e0" opacity={0.7}>
            {Math.abs(r.lat)}°S
          </text>
        ))}
        {pts.map((p) => {
          const sel = p.id === selectedId && !custom;
          return (
            <g key={p.id}>
              <circle cx={p.samp} cy={p.line} r={SIZE / (sel ? 70 : 100)} fill={sel ? "var(--sun)" : "#ffffff"} stroke="#05070d" strokeWidth={SIZE / 400} />
              {sel && (
                <text x={p.samp + SIZE / 50} y={p.line + SIZE / 120} fontSize={SIZE / 28} fill="var(--sun)" stroke="#05070d" strokeWidth={SIZE / 300} style={{ paintOrder: "stroke" }} fontWeight={600}>
                  {p.name}
                </text>
              )}
            </g>
          );
        })}
        {cust && (
          <g>
            <circle cx={cust.samp} cy={cust.line} r={SIZE / 60} fill="none" stroke="var(--sun)" strokeWidth={SIZE / 250} />
            <circle cx={cust.samp} cy={cust.line} r={SIZE / 200} fill="var(--sun)" />
          </g>
        )}
      </svg>
      <figcaption className="border-t border-line px-3 py-2 text-xs text-muted">LOLA 80–90°S hillshade. Click a dot or anywhere for a custom point.</figcaption>
    </figure>
  );
}
