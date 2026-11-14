/// <reference lib="webworker" />
/**
 * Approximate terrain horizon for a custom point from the ~480 m/px browser DEM
 * (downsampled LOLA LDEM_75S_240M). Same geometry as pipeline/build_horizons.py, with
 * coarser sampling, so the result is flagged "lower accuracy" in the UI.
 */
import { computeHorizon, type DemGrid } from "./horizonCore";

let dem: Promise<DemGrid> | null = null;

async function loadDem(): Promise<DemGrid> {
  const [meta, buf] = await Promise.all([
    fetch("/data/dem/south_480m.json").then((r) => r.json()),
    fetch("/data/dem/south_480m.bin").then((r) => r.arrayBuffer()),
  ]);
  return { n: meta.n, scaleM: meta.scaleM, offsetPx: meta.offsetPx, maxLat: meta.maxLat, data: new Int16Array(buf) };
}

self.onmessage = async (e: MessageEvent<{ id: number; lat: number; lon: number }>) => {
  try {
    dem ??= loadDem();
    const grid = await dem;
    const res = computeHorizon(grid, e.data.lat, e.data.lon);
    (self as unknown as Worker).postMessage({ id: e.data.id, ok: true, ...res });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, ok: false, error: String(err) });
  }
};
