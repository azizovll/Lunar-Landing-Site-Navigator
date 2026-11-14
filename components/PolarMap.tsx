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
  /** "planet": large hero globe with glow; "card": compact framed map */
  variant?: "planet" | "card";
}

/** South-polar (80–90°S) LOLA hillshade. Click a dot to choose a preset, anywhere else for a custom point. */
export function PolarMap({ selectedId, custom, onSelect, onCustom, variant = "card" }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const pts = SITES.filter((s) => s.lat <= -80).map((s) => ({ ...s, ...latLonToPixel(s.lat, s.lon, OFF, SCALE) }));
  const rings = [-88, -85, -82].map((lat) => ({ lat, r: OFF - latLonToPixel(lat, 0, OFF, SCALE).line }));
  const spokes = [0, 90, 180, 270].map((lon) => ({ lon, ...latLonToPixel(-80, lon, OFF, SCALE) }));
  const cust = custom ? latLonToPixel(custom.lat, custom.lon, OFF, SCALE) : null;
  const selected = !custom ? pts.find((p) => p.id === selectedId) : undefined;
  const planet = variant === "planet";

  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const samp = ((e.clientX - box.left) / box.width) * SIZE;
    const line = ((e.clientY - box.top) / box.height) * SIZE;
    const near = pts.map((p) => ({ p, d: Math.hypot(p.samp - samp, p.line - line) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d < SIZE * 0.025) return onSelect(near.p.id);
    const { lat, lon } = pixelToLatLon(line, samp, OFF, SCALE);
    if (lat <= -80) onCustom(Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4);
  };

  // Label sits on the side of the dot facing away from the map centre, so it stays inside the disk.
  const labelLeft = selected ? selected.samp > OFF : false;

  return (
    <figure className={planet ? "flex flex-col items-center gap-4" : "card overflow-hidden"}>
      <div className={planet ? "planet relative aspect-square w-full overflow-hidden" : ""}>
        <svg ref={ref} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block aspect-square w-full cursor-crosshair" onClick={click} role="img" aria-label="South polar map, 80 to 90 degrees south. Click a site or any point.">
          <defs>
            <clipPath id={`polar-disk-${variant}`}>
              <circle cx={OFF} cy={OFF} r={OFF} />
            </clipPath>
            <radialGradient id={`polar-shade-${variant}`} cx="38%" cy="34%" r="75%">
              <stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.7" />
            </radialGradient>
          </defs>
          <g clipPath={`url(#polar-disk-${variant})`}>
            <image href="/data/polar-map.png" width={SIZE} height={SIZE} preserveAspectRatio="none" style={{ filter: "grayscale(1) contrast(1.08) brightness(0.92)" }} />
            {planet && <circle cx={OFF} cy={OFF} r={OFF} fill={`url(#polar-shade-${variant})`} />}
          </g>
          <g fill="none" stroke="#ffffff" strokeOpacity={0.14} strokeWidth={SIZE / 700}>
            {rings.map((r) => (
              <circle key={r.lat} cx={OFF} cy={OFF} r={r.r} strokeDasharray={`${SIZE / 200} ${SIZE / 150}`} />
            ))}
            {spokes.map((s) => (
              <line key={s.lon} x1={OFF} y1={OFF} x2={s.samp} y2={s.line} />
            ))}
          </g>
          {spokes.map((s) => (
            <text key={s.lon} x={OFF + (s.samp - OFF) * 0.86} y={OFF + (s.line - OFF) * 0.86} fontSize={SIZE / 40} fill="#d4d4d8" textAnchor="middle" dominantBaseline="middle" letterSpacing={SIZE / 400}>
              {s.lon === 0 ? "0°" : s.lon === 180 ? "180°" : s.lon === 90 ? "90°E" : "90°W"}
            </text>
          ))}
          {rings.map((r) => (
            <text key={r.lat} x={OFF + SIZE / 120} y={OFF - r.r - SIZE / 120} fontSize={SIZE / 42} fill="#d4d4d8" opacity={0.6}>
              {Math.abs(r.lat)}°S
            </text>
          ))}
          {pts.map((p) => {
            const sel = p.id === selectedId && !custom;
            return (
              <g key={p.id}>
                {sel && <circle cx={p.samp} cy={p.line} r={SIZE / 38} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={SIZE / 500} />}
                <circle cx={p.samp} cy={p.line} r={SIZE / (sel ? 85 : 120)} fill={sel ? "#ffffff" : "#bdbdc3"} stroke="#000" strokeWidth={SIZE / 450} />
              </g>
            );
          })}
          {selected && (
            <text
              x={selected.samp + (labelLeft ? -1 : 1) * (SIZE / 28)}
              y={selected.line + SIZE / 110}
              textAnchor={labelLeft ? "end" : "start"}
              fontSize={SIZE / 40}
              fill="#ffffff"
              stroke="#000"
              strokeWidth={SIZE / 260}
              style={{ paintOrder: "stroke", fontFamily: "var(--font-orbitron)", textTransform: "uppercase" }}
              letterSpacing={SIZE / 500}
            >
              {selected.name}
            </text>
          )}
          {cust && (
            <g>
              <circle cx={cust.samp} cy={cust.line} r={SIZE / 55} fill="none" stroke="#fff" strokeWidth={SIZE / 300} />
              <circle cx={cust.samp} cy={cust.line} r={SIZE / 220} fill="#fff" />
            </g>
          )}
        </svg>
      </div>
      <figcaption className={planet ? "text-center text-xs text-muted" : "border-t border-line px-3 py-2 text-xs text-muted"}>
        NASA LRO LOLA, 80–90°S. Click a dot for a site, or anywhere for a custom point.
      </figcaption>
    </figure>
  );
}
