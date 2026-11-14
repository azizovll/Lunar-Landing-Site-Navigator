/**
 * Sunlight map for the 3D view: the share of a time window during which the Sun's centre is above
 * the local terrain horizon, for every point of the ~1.3 km LOLA grid used by the 3D terrain.
 *
 * Per point: a horizon in `azimuths` fixed grid directions (marched to 150 km, with the drop of the
 * Moon's curvature d²/2R), then the Sun's elevation and azimuth at each time sample compared with
 * it. Full resolution within `innerKm` of the pole (where the stations are), every second point
 * farther out. Much coarser than the per-site horizons (20 m DEM, 1440 rays), so the UI labels it
 * approximate; the site numbers never come from here.
 */

const R_M = 1737.4e3;
const D2R = Math.PI / 180;

export interface LightGrid {
  /** heights in metres, row-major (line, sample), polar stereographic, south pole at the centre */
  data: Int16Array;
  n: number;
  scaleM: number;
}

export interface LightOptions {
  azimuths?: number;
  innerKm?: number;
  /** compute only grid lines [rowFrom, rowTo) (to split the work across workers); must be even */
  rowFrom?: number;
  rowTo?: number;
}

/**
 * @param sun Moon-fixed unit vectors to the Sun (x to lon 0, z to the north pole), 3 per sample
 * @returns lit fraction 0..1 per grid point (n×n, row-major; −1 outside the usable disc or not computed)
 */
export function computeLightMap(grid: LightGrid, sun: Float64Array, opts: LightOptions = {}): Float32Array {
  const { data, n, scaleM } = grid;
  const A = opts.azimuths ?? 48;
  const inner = (opts.innerKm ?? 190) * 1000;
  const rowFrom = opts.rowFrom ?? 0;
  const rowTo = opts.rowTo ?? n;
  const off = (n - 1) / 2;
  const out = new Float32Array(n * n).fill(-1);
  const T = sun.length / 3;
  const maxRho = off * scaleM * 0.97;

  // march offsets per fixed grid direction θ_k (θ measured from grid +y toward +x), deduplicated
  const di: Int16Array[] = [];
  const dj: Int16Array[] = [];
  const dd: Float32Array[] = []; // distance (m)
  const dr: Float32Array[] = []; // curvature drop (m)
  for (let k = 0; k < A; k++) {
    const th = (2 * Math.PI * k) / A;
    const si: number[] = [], sj: number[] = [], sd: number[] = [], sr: number[] = [];
    let last = "";
    for (let d = scaleM; d < 150e3; d *= 1.12) {
      const j = Math.round((Math.sin(th) * d) / scaleM);
      const i = -Math.round((Math.cos(th) * d) / scaleM);
      const key = `${i},${j}`;
      if (key === last) continue;
      last = key;
      const real = Math.hypot(i, j) * scaleM;
      si.push(i);
      sj.push(j);
      sd.push(real);
      sr.push((real * real) / (2 * R_M));
    }
    di.push(Int16Array.from(si));
    dj.push(Int16Array.from(sj));
    dd.push(Float32Array.from(sd));
    dr.push(Float32Array.from(sr));
  }
  const tanHz = new Float32Array(A);

  const cell = (i: number, j: number, x: number, y: number, rho: number) => {
    const lat = 2 * Math.atan(rho / (2 * R_M)) - Math.PI / 2;
    const lon = Math.atan2(x, y);
    const h0 = data[i * n + j] + 2;
    for (let k = 0; k < A; k++) {
      const I = di[k], J = dj[k], D = dd[k], DR = dr[k];
      let best = -10;
      for (let q = 0; q < I.length; q++) {
        const ii = i + I[q];
        const jj = j + J[q];
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) break;
        const t = (data[ii * n + jj] - h0 - DR[q]) / D[q];
        if (t > best) best = t;
      }
      tanHz[k] = best;
    }
    const sl = Math.sin(lon), cl = Math.cos(lon);
    const cla = Math.cos(lat), sla = Math.sin(lat);
    const ux = cla * cl, uy = cla * sl, uz = sla;
    const Ex = -sl, Ey = cl;
    const Nx = -sla * cl, Ny = -sla * sl, Nz = cla;
    let on = 0;
    for (let s = 0; s < T; s++) {
      const sx = sun[s * 3], sy = sun[s * 3 + 1], sz = sun[s * 3 + 2];
      const up = sx * ux + sy * uy + sz * uz;
      const e = sx * Ex + sy * Ey;
      const no = sx * Nx + sy * Ny + sz * Nz;
      const tanEl = up / Math.hypot(e, no);
      // geographic azimuth az maps to grid angle az + lon (conformal projection, south-polar aspect)
      let a = (Math.atan2(e, no) + lon) / (2 * Math.PI);
      a -= Math.floor(a);
      const fk = a * A;
      const k0 = Math.floor(fk) % A;
      const k1 = (k0 + 1) % A;
      const w = fk - Math.floor(fk);
      if (tanEl > tanHz[k0] * (1 - w) + tanHz[k1] * w) on++;
    }
    return on / T;
  };

  for (let i = rowFrom; i < rowTo; i++) {
    const y = (off - i) * scaleM;
    for (let j = 0; j < n; j++) {
      const x = (j - off) * scaleM;
      const rho = Math.hypot(x, y);
      if (rho > maxRho) continue;
      if (rho > inner) {
        // outer ring: every second point, copied to its 2×2 block
        if (i % 2 || j % 2) continue;
        const v = cell(i, j, x, y, rho);
        out[i * n + j] = v;
        if (j + 1 < n) out[i * n + j + 1] = v;
        if (i + 1 < rowTo) {
          out[(i + 1) * n + j] = v;
          if (j + 1 < n) out[(i + 1) * n + j + 1] = v;
        }
      } else if (out[i * n + j] < 0) {
        out[i * n + j] = cell(i, j, x, y, rho);
      }
    }
  }
  return out;
}

/** Lit fraction at a latitude/longitude, bilinear between grid points (for tests and readouts). */
export function lightAt(lit: Float32Array, grid: LightGrid, latDeg: number, lonDeg: number): number {
  const n = grid.n;
  const off = (n - 1) / 2;
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + (latDeg * D2R) / 2);
  const i = off - (rho * Math.cos(lonDeg * D2R)) / grid.scaleM;
  const j = off + (rho * Math.sin(lonDeg * D2R)) / grid.scaleM;
  const i0 = Math.floor(i), j0 = Math.floor(j);
  const fi = i - i0, fj = j - j0;
  const v = (a: number, b: number) => Math.max(0, lit[Math.min(n - 1, a) * n + Math.min(n - 1, b)]);
  return v(i0, j0) * (1 - fi) * (1 - fj) + v(i0, j0 + 1) * (1 - fi) * fj + v(i0 + 1, j0) * fi * (1 - fj) + v(i0 + 1, j0 + 1) * fi * fj;
}
