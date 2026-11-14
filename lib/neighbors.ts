/**
 * Who else is there: hardware already on the surface and planned missions (public/data/neighbors.json).
 *
 * Landing plumes blast regolith outward at high speed (Apollo 12 sandblasted Surveyor 3 from 160 m),
 * so missions are expected to keep clear of existing hardware; the Artemis Accords call these
 * "safety zones". We use a default keep-out radius of 2 km around landers and impact sites.
 */
import data from "@/public/data/neighbors.json";

export type NeighborKind = "lander" | "impact" | "planned";

export interface Neighbor {
  id: string;
  name: string;
  kind: NeighborKind;
  lat?: number;
  lon?: number;
  nearSites?: string[];
  date: string;
  note: string;
  source: string;
  sourceLabel: string;
}

export const NEIGHBORS = data.items as Neighbor[];
export const NEIGHBORS_CHECKED = data.checked;
export const REGISTRY = data.registry;
export const KEEP_OUT_KM = 2;

const R_KM = 1737.4;
const D2R = Math.PI / 180;

/** Great-circle distance on the 1737.4 km sphere. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface NearbyHardware extends Neighbor {
  km: number;
}

export interface SiteNeighbors {
  /** landers and impact sites within `radiusKm`, nearest first */
  hardware: NearbyHardware[];
  /** hardware inside the keep-out radius */
  inKeepOut: NearbyHardware[];
  /** planned missions that target this site's region */
  planned: Neighbor[];
}

export function neighborsOf(siteId: string | null, lat: number, lon: number, keepOutKm = KEEP_OUT_KM, radiusKm = 50): SiteNeighbors {
  const hardware = NEIGHBORS.filter((n) => n.kind !== "planned" && n.lat !== undefined && n.lon !== undefined)
    .map((n) => ({ ...n, km: distanceKm(lat, lon, n.lat!, n.lon!) }))
    .filter((n) => n.km <= radiusKm && n.km > 0.05) // skip the site's own lander entry
    .sort((a, b) => a.km - b.km);
  return {
    hardware,
    inKeepOut: hardware.filter((n) => n.km < keepOutKm),
    planned: siteId ? NEIGHBORS.filter((n) => n.kind === "planned" && n.nearSites?.includes(siteId)) : [],
  };
}

export const fmtKm = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
