/**
 * Terrain horizon from a polar-stereographic DEM grid (shared by the Web Worker and tests).
 * LOLA south-polar convention (verified on Shackleton): line = off - rho cos(lon), sample = off + rho sin(lon).
 */
const R_M = 1737400;
const D2R = Math.PI / 180;

export interface DemGrid {
  n: number;
  scaleM: number;
  offsetPx: number;
  maxLat: number;
  data: Int16Array;
}

export function demHeight(g: DemGrid, latDeg: number, lonDeg: number): number {
  if (latDeg > g.maxLat) return NaN;
  const rho = (2 * R_M * Math.tan(Math.PI / 4 + (latDeg * D2R) / 2)) / g.scaleM;
  const line = g.offsetPx - rho * Math.cos(lonDeg * D2R);
  const samp = g.offsetPx + rho * Math.sin(lonDeg * D2R);
  const l0 = Math.floor(line);
  const s0 = Math.floor(samp);
  if (l0 < 0 || s0 < 0 || l0 >= g.n - 1 || s0 >= g.n - 1) return NaN;
  const fl = line - l0;
  const fs = samp - s0;
  const d = g.data;
  const i = l0 * g.n + s0;
  return d[i] * (1 - fl) * (1 - fs) + d[i + g.n] * fl * (1 - fs) + d[i + 1] * (1 - fl) * fs + d[i + g.n + 1] * fl * fs;
}

/** Map pixel (fractional line/sample in a grid of size n) back to lat/lon. */
export function pixelToLatLon(line: number, samp: number, offsetPx: number, scaleM: number) {
  const x = (samp - offsetPx) * scaleM;
  const y = (offsetPx - line) * scaleM;
  const rho = Math.hypot(x, y);
  const lat = -(90 - 2 * Math.atan(rho / (2 * R_M)) / D2R);
  const lon = Math.atan2(x, y) / D2R;
  return { lat, lon };
}

export function latLonToPixel(lat: number, lon: number, offsetPx: number, scaleM: number) {
  const rho = (2 * R_M * Math.tan(Math.PI / 4 + (lat * D2R) / 2)) / scaleM;
  return { line: offsetPx - rho * Math.cos(lon * D2R), samp: offsetPx + rho * Math.sin(lon * D2R) };
}

export function computeHorizon(g: DemGrid, lat: number, lon: number, nAz = 720, maxDistM = 150_000, observerH = 2) {
  const h0 = demHeight(g, lat, lon);
  if (Number.isNaN(h0)) throw new Error("Point is outside the browser DEM coverage (south of 79°S only).");
  const rO = R_M + h0 + observerH;
  const step = g.scaleM / 2;
  const lat1 = lat * D2R;
  const lon1 = lon * D2R;
  const el = new Array<number>(nAz);
  for (let a = 0; a < nAz; a++) {
    const az = ((a * 360) / nAz) * D2R;
    let best = -90;
    for (let d = step; d <= maxDistM; d += d < 5000 ? step : step * 2) {
      const th = d / R_M;
      const sinLat2 = Math.sin(lat1) * Math.cos(th) + Math.cos(lat1) * Math.sin(th) * Math.cos(az);
      const lat2 = Math.asin(sinLat2);
      const lon2 = lon1 + Math.atan2(Math.sin(az) * Math.sin(th) * Math.cos(lat1), Math.cos(th) - Math.sin(lat1) * sinLat2);
      const h = demHeight(g, lat2 / D2R, lon2 / D2R);
      if (Number.isNaN(h)) break;
      const rT = R_M + h;
      const e = Math.atan2(rT * Math.cos(th) - rO, rT * Math.sin(th)) / D2R;
      if (e > best) best = e;
    }
    el[a] = best === -90 ? 0 : best;
  }
  return { terrainHeightM: h0, azStepDeg: 360 / nAz, horizon: el };
}
