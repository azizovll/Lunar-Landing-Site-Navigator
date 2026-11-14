"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SITE_ID, SITES, getSite, resolvePreset, type ResolvedSite } from "./sites";

let worker: Worker | null = null;
let seq = 0;
const cache = new Map<string, ResolvedSite>();

function computeCustom(lat: number, lon: number): Promise<ResolvedSite> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  worker ??= new Worker(new URL("./horizon.worker.ts", import.meta.url));
  const id = ++seq;
  return new Promise((resolve) => {
    const w = worker!;
    const onMsg = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      const base: ResolvedSite = { id: "custom", name: "Custom point", lat, lon, heightM: 0, horizon: null, terrain: "flat" };
      const site: ResolvedSite = e.data.ok
        ? { ...base, heightM: e.data.terrainHeightM, horizon: { azStepDeg: e.data.azStepDeg, el: e.data.horizon }, terrain: "approx", dem: "LOLA 480 m/px (browser)" }
        : base;
      cache.set(key, site);
      resolve(site);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, lat, lon });
  });
}

/** Custom points use the browser DEM south of 79°S and a flat horizon elsewhere. */
export function useResolvedSite(siteId: string | null, lat: number | null, lon: number | null) {
  const isCustom = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon);
  const preset = useMemo(() => resolvePreset(getSite(siteId) ?? getSite(DEFAULT_SITE_ID) ?? SITES[0]), [siteId]);
  const [custom, setCustom] = useState<{ key: string; site: ResolvedSite } | null>(null);
  const key = isCustom ? `${lat},${lon}` : "";

  useEffect(() => {
    if (!isCustom) return;
    let alive = true;
    if (lat! <= -79) {
      computeCustom(lat!, lon!).then((s) => alive && setCustom({ key, site: s }));
    } else {
      const s: ResolvedSite = { id: "custom", name: "Custom point", lat: lat!, lon: lon!, heightM: 0, horizon: null, terrain: "flat" };
      Promise.resolve().then(() => alive && setCustom({ key, site: s }));
    }
    return () => {
      alive = false;
    };
  }, [isCustom, key, lat, lon]);

  if (!isCustom) return { site: preset, loading: false };
  if (custom && custom.key === key) return { site: custom.site, loading: false };
  return { site: null, loading: true };
}
