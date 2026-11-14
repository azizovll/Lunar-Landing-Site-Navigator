/// <reference lib="webworker" />
/** Computes a band of rows of the 3D sunlight map (see lightmapCore.ts) off the main thread. */
import { frameVectors } from "./astro";
import { computeLightMap, type LightGrid } from "./lightmapCore";

let grid: Promise<LightGrid> | null = null;

async function loadGrid(): Promise<LightGrid> {
  const [meta, buf] = await Promise.all([fetch("/data/terrain/south.json").then((r) => r.json()), fetch("/data/terrain/south.bin").then((r) => r.arrayBuffer())]);
  return { data: new Int16Array(buf), n: meta.n, scaleM: meta.scaleM };
}

self.onmessage = async (
  e: MessageEvent<{ id: number; body: "sun" | "earth"; marginDeg: number; from: number; to: number; stepMs: number; rowFrom: number; rowTo: number; grid?: LightGrid }>,
) => {
  const { id, body, marginDeg, from, to, stepMs, rowFrom, rowTo } = e.data;
  try {
    // the page sends its already-downloaded heights with the first job; fetch only as a fallback
    if (e.data.grid) grid = Promise.resolve(e.data.grid);
    grid ??= loadGrid();
    const g = await grid;
    const sun: number[] = [];
    for (let t = from; t < to; t += stepMs) {
      const s = frameVectors(new Date(t))[body];
      const len = Math.hypot(s[0], s[1], s[2]);
      sun.push(s[0] / len, s[1] / len, s[2] / len);
    }
    const lit = computeLightMap(g, Float64Array.from(sun), { rowFrom, rowTo, marginDeg });
    (self as unknown as Worker).postMessage({ id, body, ok: true, lit, rowFrom, rowTo }, [lit.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
