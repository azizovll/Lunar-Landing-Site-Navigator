"""Textures for the 3D Moon on the home page.

Usage:  python -I pipeline/build_moon.py pipeline/cache/svs/lroc_color_poles_4k.tif
Inputs: NASA SVS CGI Moon Kit colour map (https://svs.gsfc.nasa.gov/4720, LROC WAC mosaic with
        polar fill), LOLA polar DEMs in pipeline/cache.
Output: public/data/moon/moon_2k.jpg       greyscale equirectangular albedo, lon -180..180, north up
        public/data/moon/south_normal.jpg  object-space normal map of the 79.5-90S cap
        public/data/moon/moon.json         metadata

The normal map lets the browser light the south-polar relief with the *real* Sun direction of the
selected time. Normals are expressed in the three.js frame used by components/Moon3D.tsx:
X = body x (lon 0), Y = body z (north), Z = -body y. Relief is exaggerated (see EXAGGERATION) so
craters are visible from orbit; normals blend smoothly into the sphere at the cap edge.
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lola import R_M, load_dems, sample_best  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "moon")
CAP_LAT = -79.5
N = 768
EXAGGERATION = 3.0

Image.MAX_IMAGE_PIXELS = None


def albedo(tif_path: str) -> None:
    img = Image.open(tif_path).convert("L").resize((2048, 1024), Image.LANCZOS)
    img.save(os.path.join(OUT, "moon_2k.jpg"), quality=85, optimize=True, progressive=True)


def normal_map() -> dict:
    dems = [d for d in load_dems() if d.name in ("LDEM_80S_80M", "LDEM_75S_240M", "LDEM_85S_40M")]
    rho_max = 2 * R_M * math.tan(math.pi / 4 + math.radians(CAP_LAT) / 2)
    scale = 2 * rho_max / N  # metres per pixel
    off = (N - 1) / 2
    j, i = np.meshgrid(np.arange(N), np.arange(N))  # i = line, j = sample
    x = (j - off) * scale
    y = (off - i) * scale  # line = off - rho cos(lon)  =>  rho cos(lon) = (off - line) * scale
    rho = np.hypot(x, y)
    lat = np.degrees(2 * np.arctan(rho / (2 * R_M))) - 90
    lon = np.degrees(np.arctan2(x, y))
    inside = rho <= rho_max
    h, _ = sample_best(dems, np.where(inside, lat, -89.0), lon)
    h = np.nan_to_num(np.where(inside, h, 0.0))

    la, lo = np.radians(lat), np.radians(lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)
    pos = up * (R_M + EXAGGERATION * h)[..., None]
    d_line = np.gradient(pos, axis=0)
    d_samp = np.gradient(pos, axis=1)
    n = np.cross(d_samp, d_line)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = np.where((np.sum(n * up, axis=-1) < 0)[..., None], -n, n)

    # fade to the smooth sphere normal over the outer 12 % of the cap (no lighting seam)
    w = np.clip((1 - rho / rho_max) / 0.12, 0, 1)[..., None]
    n = n * w + up * (1 - w)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)

    three = np.stack([n[..., 0], n[..., 2], -n[..., 1]], axis=-1)  # body -> three.js frame
    rgb = np.clip((three + 1) * 127.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(os.path.join(OUT, "south_normal.jpg"), quality=92, optimize=True)
    return {"capLat": CAP_LAT, "sizePx": N, "scaleM": scale, "exaggeration": EXAGGERATION, "dems": [d.name for d in dems]}


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: build_moon.py <lroc_color_poles_4k.tif>")
    os.makedirs(OUT, exist_ok=True)
    albedo(sys.argv[1])
    meta = normal_map()
    meta["albedo"] = "NASA SVS CGI Moon Kit (LROC WAC colour mosaic with polar fill), greyscale 2048x1024"
    with open(os.path.join(OUT, "moon.json"), "w") as f:
        json.dump(meta, f, indent=1)
    for fn in sorted(os.listdir(OUT)):
        print(fn, os.path.getsize(os.path.join(OUT, fn)))


if __name__ == "__main__":
    main()
