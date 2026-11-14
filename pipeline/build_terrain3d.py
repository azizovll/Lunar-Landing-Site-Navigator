"""Data for the 3D south-pole terrain on the home page (components/Terrain3D.tsx).

Usage:  python -I pipeline/build_terrain3d.py pipeline/cache/earth/earth.jpg
Inputs: LOLA polar DEMs in pipeline/cache; NASA Blue Marble "land ocean ice" image (public domain,
        via Wikimedia Commons) for the small Earth in the sky.
Output: public/data/terrain/south.bin   int16 little-endian heights (m above the 1737.4 km sphere),
                                        N x N grid, south polar stereographic, row = line
        public/data/terrain/south.json  metadata
        public/data/terrain/earth.jpg   512 x 256 equirectangular Earth texture

Grid convention (same as the rest of the project, verified on five craters):
    line = off - rho cos(lon) / scale,  sample = off + rho sin(lon) / scale,  rho = 2 R tan(pi/4 + lat/2)
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lola import R_M, load_dems, sample_best  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "terrain")
N = 513
HALF_M = 330_000.0  # covers every south-polar preset, including IM-1 Odysseus at 80.1°S (~303 km)


def terrain() -> dict:
    dems = load_dems()
    scale = 2 * HALF_M / (N - 1)
    off = (N - 1) / 2
    j, i = np.meshgrid(np.arange(N), np.arange(N))
    x = (j - off) * scale
    y = (off - i) * scale
    rho = np.hypot(x, y)
    lat = np.degrees(2 * np.arctan(rho / (2 * R_M))) - 90
    lon = np.degrees(np.arctan2(x, y))
    h, _ = sample_best(dems, lat, lon)
    missing = int(np.isnan(h).sum())
    h = np.nan_to_num(h, nan=float(np.nanmedian(h)))
    h.round().astype("<i2").tofile(os.path.join(OUT, "south.bin"))
    return {"n": N, "halfM": HALF_M, "scaleM": scale, "minH": float(h.min()), "maxH": float(h.max()), "missing": missing,
            "dems": [d.name for d in dems], "units": "int16 LE metres above 1737.4 km sphere, row-major (line, sample)"}


def earth(path: str) -> None:
    Image.open(path).convert("RGB").resize((512, 256), Image.LANCZOS).save(os.path.join(OUT, "earth.jpg"), quality=85, optimize=True)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: build_terrain3d.py <earth image>")
    os.makedirs(OUT, exist_ok=True)
    meta = terrain()
    earth(sys.argv[1])
    meta["earth"] = "NASA Blue Marble (land, ocean, ice), public domain, via Wikimedia Commons"
    with open(os.path.join(OUT, "south.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta, indent=1))
    for fn in sorted(os.listdir(OUT)):
        print(fn, os.path.getsize(os.path.join(OUT, fn)))


if __name__ == "__main__":
    main()
