import sitesJson from "@/public/data/sites.json";
import horizonsJson from "@/public/data/horizons/all.json";
import type { Horizon, SiteInput } from "./metrics";

export interface SiteMeta {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  note: string;
  source: string;
  sourceLabel: string;
}

interface HorizonEntry {
  terrainHeightM: number;
  dem: string;
  azStepDeg: number;
  horizon: number[];
}

export const SITES: SiteMeta[] = sitesJson as SiteMeta[];
const HORIZONS = horizonsJson as unknown as Record<string, HorizonEntry>;

export const DEFAULT_SITE_ID = "shackleton-rim";

export function getSite(id: string | null | undefined): SiteMeta | undefined {
  return SITES.find((s) => s.id === id);
}

export interface ResolvedSite extends SiteInput {
  id: string;
  name: string;
  /** Where the horizon came from, shown to the user. */
  terrain: "lola" | "approx" | "flat";
  dem?: string;
  meta?: SiteMeta;
}

export function horizonFor(id: string): Horizon | null {
  const h = HORIZONS[id];
  return h ? { azStepDeg: h.azStepDeg, el: h.horizon } : null;
}

export function resolvePreset(meta: SiteMeta): ResolvedSite {
  const h = HORIZONS[meta.id];
  return {
    id: meta.id,
    name: meta.name,
    lat: meta.lat,
    lon: meta.lon,
    heightM: h?.terrainHeightM ?? 0,
    horizon: h ? { azStepDeg: h.azStepDeg, el: h.horizon } : null,
    terrain: h ? "lola" : "flat",
    dem: h?.dem,
    meta,
  };
}

export function fmtLatLon(lat: number, lon: number): string {
  const l = ((lon + 540) % 360) - 180;
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"} ${Math.abs(l).toFixed(3)}°${l < 0 ? "W" : "E"}`;
}
