"use client";

import { useState } from "react";
import { KEEP_OUT_KM, NEIGHBORS_CHECKED, REGISTRY, fmtKm, neighborsOf } from "@/lib/neighbors";

interface Props {
  siteId: string | null;
  lat: number;
  lon: number;
  simple: boolean;
}

const KIND_LABEL = { lander: "Lander", impact: "Impact site", planned: "Planned" } as const;

/** "Who else is here": existing hardware nearby, the plume keep-out zone and planned missions. */
export function NeighborsPanel({ siteId, lat, lon, simple }: Props) {
  const [keepOut, setKeepOut] = useState(KEEP_OUT_KM);
  const n = neighborsOf(siteId, lat, lon, keepOut);
  const clash = n.inKeepOut.length > 0;
  const busy = n.planned.length > 0;
  const tone = clash ? "var(--poor)" : busy ? "var(--marginal)" : "var(--good)";

  const headline = clash
    ? `${n.inKeepOut[0].name} is only ${fmtKm(n.inKeepOut[0].km)} away, inside the ${keepOut} km safety zone: landing exhaust would blast regolith onto it.`
    : busy
      ? `No hardware within ${keepOut} km, but ${n.planned.map((p) => p.name.split(" (")[0]).join(" and ")} ${n.planned.length > 1 ? "also target" : "also targets"} this area: the best spots may be taken.`
      : `No hardware within ${keepOut} km and no announced mission targets this area.`;

  return (
    <section className="card flex flex-col gap-4 p-5" style={{ borderTop: `1px solid ${tone}` }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="display text-xs tracking-[0.3em]">Who else is here</h3>
        <span className="text-xs text-muted">
          Checked {NEIGHBORS_CHECKED} ·{" "}
          <a href={REGISTRY.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            live registry: {REGISTRY.name}
          </a>
        </span>
      </header>
      <p className="text-sm leading-relaxed" style={{ color: clash ? "var(--poor)" : undefined }}>
        {headline}
      </p>
      {simple && (
        <p className="text-xs leading-relaxed text-muted">
          A landing rocket sprays dust and small rocks at high speed: Apollo 12 sandblasted the Surveyor 3 probe from 160 m away. Missions are expected to keep a safe distance from each
          other’s hardware, and the few best-lit ridges near the pole are wanted by several countries and companies.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs text-muted">On the surface within 50 km</div>
          {n.hardware.length === 0 ? (
            <p className="text-sm text-muted">Nothing known.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {n.hardware.map((h) => (
                <li key={h.id} className="frame flex items-start justify-between gap-3 p-2.5 text-sm">
                  <div className="min-w-0">
                    <div>
                      {h.name}{" "}
                      <span className="ml-1 border border-line px-1 text-[11px] uppercase tracking-[0.1em] text-muted">{KIND_LABEL[h.kind]}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {h.date} · {h.note}{" "}
                      <a href={h.source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                        {h.sourceLabel}
                      </a>
                    </div>
                  </div>
                  <div className="num shrink-0 text-base" style={{ color: h.km < keepOut ? "var(--poor)" : undefined }}>
                    {fmtKm(h.km)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs text-muted">Planned missions targeting this area</div>
          {n.planned.length === 0 ? (
            <p className="text-sm text-muted">{siteId ? "None announced." : "Not tracked for custom points."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {n.planned.map((p) => (
                <li key={p.id} className="frame p-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="text-xs text-marginal">{p.date}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {p.note}{" "}
                    <a href={p.source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                      {p.sourceLabel}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!simple && (
        <label className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
          Safety zone around existing hardware
          <input type="number" min={0.2} max={20} step={0.1} value={keepOut} onChange={(e) => setKeepOut(Math.min(20, Math.max(0.2, Number(e.target.value) || KEEP_OUT_KM)))} className="w-20" />
          km · planned landing points are region-level unless published; schedules change, so check the live registry.
        </label>
      )}
    </section>
  );
}
