"""Data for the 3D south-pole terrain on the home page (components/Terrain3D.tsx).

Usage:  python -I pipeline/build_terrain3d.py pipeline/cache/earth/earth.jpg pipeline/cache/svs/lroc_color_poles_4k.tif
Inputs: LOLA polar DEMs in pipeline/cache; NASA Blue Marble "land ocean ice" image (public domain,
        via Wikimedia Commons) for the small Earth in the sky.
Output: public/data/terrain/south.bin   int16 little-endian heights (m above the 1737.4 km sphere),
                                        N x N grid, south polar stereographic, row = line
        public/data/terrain/south.json  metadata
        public/data/terrain/earth.jpg   512 x 256 equirectangular Earth texture
        public/data/terrain/normal.jpg  1536 x 1536 normal map of the same area (~430 m/px, relief x2), in the
                                        scene frame of components/Terrain3D.tsx: X = body x, Y = -body z, Z = body y
        public/data/terrain/regolith.jpg 512 x 512 tileable fine-grain albedo variation (procedural)
        public/images/moon-hero.webp    decorative Moon for the hero section, rendered from the NASA SVS
                                        CGI Moon Kit LROC mosaic (south pole tilted toward the viewer)

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
NORMAL_N = 1536
EXAGGERATION = 2.0  # must match EXAG in components/Terrain3D.tsx
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


def polar_grid(n: int):
    scale = 2 * HALF_M / (n - 1)
    off = (n - 1) / 2
    j, i = np.meshgrid(np.arange(n), np.arange(n))
    x = (j - off) * scale
    y = (off - i) * scale
    rho = np.hypot(x, y)
    lat = np.degrees(2 * np.arctan(rho / (2 * R_M))) - 90
    lon = np.degrees(np.arctan2(x, y))
    return lat, lon


def normal_map() -> None:
    """Object-space normals at ~430 m/px so the shader shows relief finer than the 1.3 km mesh."""
    dems = load_dems()
    lat, lon = polar_grid(NORMAL_N)
    h, _ = sample_best(dems, lat, lon)
    h = np.nan_to_num(h, nan=float(np.nanmedian(h)))
    la, lo = np.radians(lat), np.radians(lon)
    up = np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)
    pos = up * (R_M + EXAGGERATION * h)[..., None]
    n = np.cross(np.gradient(pos, axis=1), np.gradient(pos, axis=0))
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = np.where((np.sum(n * up, axis=-1) < 0)[..., None], -n, n)
    scene = np.stack([n[..., 0], -n[..., 2], n[..., 1]], axis=-1)  # body -> scene frame
    rgb = np.clip((scene + 1) * 127.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(os.path.join(OUT, "normal.jpg"), quality=86, optimize=True)


def regolith() -> None:
    """Tileable 1/f noise: subtle albedo grain so close-ups do not look like plastic."""
    rng = np.random.default_rng(7)
    n = 512
    f = np.fft.fftfreq(n)
    fx, fy = np.meshgrid(f, f)
    k = np.hypot(fx, fy)
    k[0, 0] = 1
    spec = (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n))) / k**1.1
    spec[0, 0] = 0
    img = np.real(np.fft.ifft2(spec))  # periodic, so it tiles seamlessly
    img = (img - img.mean()) / img.std()
    img = np.clip(0.9 + 0.06 * img, 0.72, 1.0)
    Image.fromarray((img * 255).astype(np.uint8), "L").save(os.path.join(OUT, "regolith.jpg"), quality=85, optimize=True)


def hero_moon(tif_path: str) -> None:
    """Orthographic render of the Moon with the south pole tilted toward the viewer, lit from the upper left."""
    Image.MAX_IMAGE_PIXELS = None
    albedo = np.asarray(Image.open(tif_path).convert("L"), dtype=np.float32) / 255.0
    H, W = albedo.shape
    size = 900
    u = (np.arange(size) + 0.5) / size * 2 - 1
    X, Y = np.meshgrid(u, -u)  # screen x right, y up
    r2 = X**2 + Y**2
    inside = r2 <= 1
    Z = np.sqrt(np.clip(1 - r2, 0, 1))  # toward the viewer
    # view direction: from lat -38, lon 15 (south pole visible in the lower half)
    vlat, vlon = np.radians(-38), np.radians(15)
    fwd = np.array([np.cos(vlat) * np.cos(vlon), np.cos(vlat) * np.sin(vlon), np.sin(vlat)])  # body, toward viewer
    north = np.array([0.0, 0.0, 1.0])
    right = np.cross(north, fwd)
    right /= np.linalg.norm(right)
    upv = np.cross(fwd, right)
    P = X[..., None] * right + Y[..., None] * upv + Z[..., None] * fwd  # body coords on the unit sphere
    lat = np.degrees(np.arcsin(np.clip(P[..., 2], -1, 1)))
    lon = np.degrees(np.arctan2(P[..., 1], P[..., 0]))
    px = np.clip(((lon + 180) / 360 * W).astype(int), 0, W - 1)
    py = np.clip(((90 - lat) / 180 * H).astype(int), 0, H - 1)
    a = albedo[py, px]
    light = np.array([-0.62, 0.42, 0.66])  # screen space: upper left, toward the viewer
    light /= np.linalg.norm(light)
    lam = np.clip(X * light[0] + Y * light[1] + Z * light[2], 0, 1)
    shade = np.clip(a * (lam**0.85) * 1.15 + a * 0.03, 0, 1)  # faint Earthshine on the night side
    lum = (shade * 255).astype(np.uint8)
    edge = np.clip((1 - np.sqrt(r2)) * size / 2, 0, 1)  # 1-px antialiased limb
    alpha = (edge * inside * 255).astype(np.uint8)
    out = Image.fromarray(np.dstack([lum, lum, lum, alpha]), "RGBA")
    os.makedirs(os.path.join(ROOT, "public", "images"), exist_ok=True)
    out.save(os.path.join(ROOT, "public", "images", "moon-hero.webp"), quality=82, method=6)


def earth(path: str) -> None:
    Image.open(path).convert("RGB").resize((512, 256), Image.LANCZOS).save(os.path.join(OUT, "earth.jpg"), quality=85, optimize=True)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: build_terrain3d.py <earth image> <lroc_color_poles_4k.tif>")
    os.makedirs(OUT, exist_ok=True)
    meta = terrain()
    earth(sys.argv[1])
    normal_map()
    regolith()
    hero_moon(sys.argv[2])
    meta["normalMap"] = {"size": NORMAL_N, "exaggeration": EXAGGERATION}
    meta["earth"] = "NASA Blue Marble (land, ocean, ice), public domain, via Wikimedia Commons"
    with open(os.path.join(OUT, "south.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps(meta, indent=1))
    for fn in sorted(os.listdir(OUT)):
        print(fn, os.path.getsize(os.path.join(OUT, fn)))
    hero = os.path.join(ROOT, "public", "images", "moon-hero.webp")
    print("moon-hero.webp", os.path.getsize(hero))


if __name__ == "__main__":
    main()
