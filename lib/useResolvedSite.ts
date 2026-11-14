"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SITE_ID, SITES, getSite, resolvePreset, type ResolvedSite } from "./sites";

/** Custom points get a terrain horizon from the browser DEM south of this latitude, a flat one elsewhere. */
export const CUSTOM_DEM_MAX_LAT = -79;

let worker: Worker | null = null;
let seq = 0;
const cache = new Map<string, Promise<ResolvedSite>>();

const flatSite = (lat: number, lon: number): ResolvedSite => ({ id: "custom", name: "Custom point", lat, lon, heightM: 0, horizon: null, terrain: "flat" });

/**
 * Resolve a custom coordinate into a site with an approximate terrain horizon, computed in a Web Worker
 * from the ~480 m/px LOLA browser DEM. Results are cached per coordinate.
 */
export function resolveCustom(lat: number, lon: number): Promise<ResolvedSite> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (lat > CUSTOM_DEM_MAX_LAT) {
    const p = Promise.resolve(flatSite(lat, lon));
    cache.set(key, p);
    return p;
  }
  worker ??= new Worker(new URL("./horizon.worker.ts", import.meta.url));
  const id = ++seq;
  const p = new Promise<ResolvedSite>((resolve) => {
    const w = worker!;
    const onMsg = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      resolve(
        e.data.ok
          ? { ...flatSite(lat, lon), heightM: e.data.terrainHeightM, horizon: { azStepDeg: e.data.azStepDeg, el: e.data.horizon }, terrain: "approx", dem: "LOLA 480 m/px (browser)" }
          : flatSite(lat, lon),
      );
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, lat, lon });
  });
  cache.set(key, p);
  return p;
}

/** Synchronous lookup of an already-resolved custom point (for render code). */
export function useCustomSites(points: { lat: number; lon: number }[]) {
  const key = points.map((p) => `${p.lat},${p.lon}`).join("|");
  const [resolved, setResolved] = useState<Record<string, ResolvedSite>>({});
  useEffect(() => {
    let alive = true;
    for (const p of points) {
      const k = `${p.lat},${p.lon}`;
      resolveCustom(p.lat, p.lon).then((s) => alive && setResolved((r) => (r[k] ? r : { ...r, [k]: s })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures `points`
  }, [key]);
  return (lat: number, lon: number): ResolvedSite | undefined => resolved[`${lat},${lon}`];
}

/** Site screen: a preset by id, or a custom coordinate when lat/lon are given. */
export function useResolvedSite(siteId: string | null, lat: number | null, lon: number | null) {
  const isCustom = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon);
  const preset = useMemo(() => resolvePreset(getSite(siteId) ?? getSite(DEFAULT_SITE_ID) ?? SITES[0]), [siteId]);
  const lookup = useCustomSites(isCustom ? [{ lat: lat!, lon: lon! }] : []);
  if (!isCustom) return { site: preset, loading: false };
  const site = lookup(lat!, lon!);
  return site ? { site, loading: false } : { site: null, loading: true };
}

/** Parse "lat,lon" (e.g. "-89.2,45") into numbers, or null. */
export function parseLatLon(s: string | null | undefined): { lat: number; lon: number } | null {
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 360 ? { lat, lon } : null;
}
