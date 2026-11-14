/**
 * Sun and Earth positions as seen from a point on the lunar surface.
 *
 * Pipeline (all vectors in km):
 *  1. astronomy-engine gives geocentric J2000 (EQJ) vectors Earth->Moon and Earth->Sun.
 *  2. Moon->Earth = -GeoMoon, Moon->Sun = GeoSun - GeoMoon.
 *  3. Rotate into the Moon body-fixed frame using the IAU rotation model
 *     (RotationAxis(Body.Moon)): pole RA/Dec + prime-meridian angle W. This includes
 *     physical libration terms, so Earth's apparent wobble in the lunar sky is reproduced.
 *  4. Topocentric azimuth/elevation at (lat, lon east-positive, height) on a 1737.4 km sphere.
 *
 * Azimuth convention: degrees clockwise from lunar north (N=0, E=90, S=180, W=270),
 * identical to JPL Horizons observer-table quantity 4 (which is also measured N->E).
 */
import { Body, GeoMoon, GeoVector, RotationAxis, KM_PER_AU, type Vector } from "astronomy-engine";

export const MOON_RADIUS_KM = 1737.4;
export const SUN_RADIUS_KM = 695700;
export const EARTH_RADIUS_KM = 6378.137;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export type Vec3 = [number, number, number];

export interface FrameVectors {
  /** Moon-center -> Sun, Moon body-fixed frame, km */
  sun: Vec3;
  /** Moon-center -> Earth, Moon body-fixed frame, km */
  earth: Vec3;
}

export interface TopoPosition {
  az: number; // deg, clockwise from north
  el: number; // deg, above the local (sphere) horizontal plane
  dist: number; // km
  angRadius: number; // deg
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vec = (v: Vector): Vec3 => [v.x * KM_PER_AU, v.y * KM_PER_AU, v.z * KM_PER_AU];

/** Sun light-time from the Moon is ~499 s; we evaluate the Sun at the retarded time. */
const SUN_LIGHT_TIME_MS = 499_000;

/** Unit axes of the Moon body-fixed frame expressed in EQJ. */
export function moonAxes(date: Date): { x: Vec3; y: Vec3; z: Vec3 } {
  const axis = RotationAxis(Body.Moon, date);
  const z: Vec3 = [axis.north.x, axis.north.y, axis.north.z];
  const nodeAngle = (axis.ra * 15 + 90) * DEG;
  const q: Vec3 = [Math.cos(nodeAngle), Math.sin(nodeAngle), 0];
  const zq = cross(z, q);
  const w = axis.spin * DEG;
  const x: Vec3 = [
    q[0] * Math.cos(w) + zq[0] * Math.sin(w),
    q[1] * Math.cos(w) + zq[1] * Math.sin(w),
    q[2] * Math.cos(w) + zq[2] * Math.sin(w),
  ];
  const y = cross(z, x);
  return { x, y, z };
}

/** Sun and Earth position vectors from the Moon's center in the body-fixed frame. */
export function frameVectors(date: Date): FrameVectors {
  const moon = vec(GeoMoon(date));
  const sunGeo = vec(GeoVector(Body.Sun, new Date(date.getTime() - SUN_LIGHT_TIME_MS), false));
  const { x, y, z } = moonAxes(date);
  const toFixed = (v: Vec3): Vec3 => [dot(v, x), dot(v, y), dot(v, z)];
  const moonToSun: Vec3 = [sunGeo[0] - moon[0], sunGeo[1] - moon[1], sunGeo[2] - moon[2]];
  const moonToEarth: Vec3 = [-moon[0], -moon[1], -moon[2]];
  return { sun: toFixed(moonToSun), earth: toFixed(moonToEarth) };
}

export interface SiteFrame {
  pos: Vec3;
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

export function siteFrame(latDeg: number, lonDeg: number, heightM = 0): SiteFrame {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const r = MOON_RADIUS_KM + heightM / 1000;
  const up: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  return { pos: [up[0] * r, up[1] * r, up[2] * r], east, north, up };
}

export function topocentric(site: SiteFrame, target: Vec3, radiusKm: number): TopoPosition {
  const v: Vec3 = [target[0] - site.pos[0], target[1] - site.pos[1], target[2] - site.pos[2]];
  const dist = Math.hypot(v[0], v[1], v[2]);
  const el = Math.asin(dot(v, site.up) / dist) * RAD;
  let az = Math.atan2(dot(v, site.east), dot(v, site.north)) * RAD;
  if (az < 0) az += 360;
  return { az, el, dist, angRadius: Math.asin(radiusKm / dist) * RAD };
}

export interface SkyState {
  time: number; // ms since epoch
  sun: TopoPosition;
  earth: TopoPosition;
}

export function skyAt(lat: number, lon: number, heightM: number, date: Date): SkyState {
  const fv = frameVectors(date);
  const sf = siteFrame(lat, lon, heightM);
  return {
    time: date.getTime(),
    sun: topocentric(sf, fv.sun, SUN_RADIUS_KM),
    earth: topocentric(sf, fv.earth, EARTH_RADIUS_KM),
  };
}

/** Shared cache of frame vectors keyed by timestamp, so many sites can reuse one ephemeris pass. */
const frameCache = new Map<number, FrameVectors>();
export function cachedFrameVectors(t: number): FrameVectors {
  let fv = frameCache.get(t);
  if (!fv) {
    if (frameCache.size > 200_000) frameCache.clear();
    fv = frameVectors(new Date(t));
    frameCache.set(t, fv);
  }
  return fv;
}

/** Sky positions over a time series [start, start+step, ...). */
export function skySeries(lat: number, lon: number, heightM: number, startMs: number, stepMs: number, count: number): SkyState[] {
  const sf = siteFrame(lat, lon, heightM);
  const out: SkyState[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = startMs + i * stepMs;
    const fv = cachedFrameVectors(t);
    out[i] = {
      time: t,
      sun: topocentric(sf, fv.sun, SUN_RADIUS_KM),
      earth: topocentric(sf, fv.earth, EARTH_RADIUS_KM),
    };
  }
  return out;
}
