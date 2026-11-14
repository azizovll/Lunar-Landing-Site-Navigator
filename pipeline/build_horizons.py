"""Build terrain horizon masks for preset sites and a downsampled DEM for the browser.

Usage:  python -I pipeline/build_horizons.py
Inputs: LOLA polar DEMs in pipeline/cache (see pipeline/README.md)
Output: public/data/horizons/<id>.json, public/data/dem/south_480m.bin(+.json), public/data/polar-map.png

Horizon mask: for 1440 azimuths (0.25 deg step, clockwise from north) march along the
great circle out to MAX_DIST and keep the maximum elevation angle of the terrain seen
from an observer 2 m above the local surface. Lunar curvature is exact (sphere geometry):
for a terrain point at radius r_t and central angle theta from an observer at radius r_o,
    el = atan2(r_t cos(theta) - r_o, r_t sin(theta)).
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lola import R_M, Dem, destination, load_dems, sample_best  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data")
MAX_DIST = 200_000.0
OBSERVER_H = 2.0
N_AZ = 1440  # 0.25 deg: finer than the 0.53 deg solar disk, so narrow peaks are not skipped


def ray_distances() -> np.ndarray:
    """Dense near the observer (where small bumps subtend large angles), sparser far away."""
    d = [10.0]
    while d[-1] < MAX_DIST:
        d.append(d[-1] + min(200.0, max(10.0, d[-1] * 0.004)))
    return np.array(d)


def horizon_mask(dems: list[Dem], lat: float, lon: float):
    dist = ray_distances()
    az = np.arange(N_AZ) * (360.0 / N_AZ)
    h0, used0 = sample_best(dems, np.array([lat]), np.array([lon]))
    if np.isnan(h0[0]):
        return None
    r_o = R_M + h0[0] + OBSERVER_H
    theta = dist / R_M
    mask = np.empty(N_AZ)
    reach = np.empty(N_AZ)
    for i, a in enumerate(az):
        la, lo = destination(lat, lon, a, dist)
        h, _ = sample_best(dems, la, lo)
        r_t = R_M + h
        el = np.degrees(np.arctan2(r_t * np.cos(theta) - r_o, r_t * np.sin(theta)))
        valid = ~np.isnan(el)
        mask[i] = np.nanmax(el) if valid.any() else 0.0
        reach[i] = dist[valid][-1] if valid.any() else 0.0
    return {
        "terrainHeightM": round(float(h0[0]), 1),
        "dem": dems[int(used0[0])].name,
        "horizon": [round(float(v), 3) for v in mask],
        "minReachKm": round(float(reach.min()) / 1000, 1),
    }


def snap_to_high_ground(dems: list[Dem], lat: float, lon: float, radius_km: float):
    """Region-level coordinates (e.g. an Artemis III candidate region) are moved to the highest
    DEM point within radius_km: landers target the rim/ridge crest, not the slope below it."""
    best = (-1e9, lat, lon)
    for r in np.arange(0, radius_km * 1000 + 1, 100.0):
        n = max(1, int(2 * math.pi * r / 100))
        az = np.arange(n) * 360.0 / n
        la, lo = destination(lat, lon, az, np.full(n, r))
        h, _ = sample_best(dems, la, lo)
        i = int(np.nanargmax(h))
        if h[i] > best[0]:
            best = (float(h[i]), float(la[i]), float(lo[i]))
    return best[1], best[2]


def verify_orientation(dems: list[Dem]) -> None:
    """Shackleton (89.67S, 129.2E, D~21 km) must be a deep bowl: centre ~4 km below its rim."""
    lat, lon = -89.67, 129.2
    c, _ = sample_best(dems, np.array([lat]), np.array([lon]))
    ring_az = np.arange(0, 360, 10.0)
    la, lo = destination(lat, lon, ring_az, np.full(ring_az.shape, 10_500.0))
    rim, _ = sample_best(dems, la, lo)
    la2, lo2 = destination(lat, lon, ring_az, np.full(ring_az.shape, 4000.0))
    inner, _ = sample_best(dems, la2, lo2)
    print(f"Shackleton check: centre {c[0]:.0f} m, inner ring mean {np.nanmean(inner):.0f} m, rim ring mean {np.nanmean(rim):.0f} m")
    # A wrong orientation (swapped or flipped axes) would sample an unrelated spot.
    if not (np.nanmean(rim) - c[0] > 2500):
        raise SystemExit("Orientation check FAILED: Shackleton is not a deep bowl at its catalogued position")


def write_png(path: str, img: np.ndarray) -> None:
    """Minimal 8-bit greyscale PNG writer (no Pillow dependency)."""
    h, w = img.shape
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(t: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + t + data
        return c + struct.pack(">I", zlib.crc32(t + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def browser_dem(dems: list[Dem]) -> None:
    """~480 m/px int16 DEM of 79-90S for approximate custom-point horizons in a Web Worker."""
    src = next((d for d in dems if d.name == "LDEM_75S_240M"), None) or next(d for d in dems if d.name == "LDEM_80S_80M")
    factor = max(1, int(round(480.0 / src.scale)))
    scale = src.scale * factor
    # Crop at 79S, or at the source's own coverage edge if that is further south (80S for the 80 m DEM).
    bound = min(-79.0, src.max_lat)
    half_m = 2 * R_M * math.tan(math.pi / 4 + math.radians(bound) / 2)
    half_px = min(int(half_m / scale), int(src.offset // factor) - 1)
    n = 2 * half_px + 1
    # Output pixel centres sit at source coordinates offset + (j - half_px) * factor.
    first_centre = src.offset - half_px * factor
    start = int(round(first_centre - (factor - 1) / 2))
    block = np.asarray(src.data[start:start + n * factor, start:start + n * factor], dtype=np.float32)
    block = block.reshape(n, factor, n, factor).mean(axis=(1, 3)) * 0.5
    out = np.round(block).astype("<i2")
    os.makedirs(os.path.join(OUT, "dem"), exist_ok=True)
    out.tofile(os.path.join(OUT, "dem", "south_480m.bin"))
    meta = {
        "n": n, "scaleM": scale, "offsetPx": (n - 1) / 2, "maxLat": bound, "source": src.name,
        "units": "metres above the 1737.4 km sphere, int16 little-endian, row-major (line, sample)",
        "projection": "south polar stereographic; line = off - rho cos(lon), sample = off + rho sin(lon), rho = 2R tan(pi/4 + lat/2)/scale",
    }
    with open(os.path.join(OUT, "dem", "south_480m.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"browser DEM {n}x{n} at {scale:.0f} m/px from {src.name}")

    # Hillshade image for the clickable polar map (80-90S), light from the upper left.
    m80 = 2 * R_M * math.tan(math.pi / 4 + math.radians(-80.0) / 2)
    k = min(int(m80 / scale), half_px)
    sub = block[half_px - k:half_px + k + 1, half_px - k:half_px + k + 1]
    gy, gx = np.gradient(sub, scale)
    slope = np.arctan(np.hypot(gx, gy) * 2.0)
    aspect = np.arctan2(-gx, gy)
    alt, azr = math.radians(35), math.radians(315)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(azr - aspect)
    lo_p, hi_p = np.percentile(sub, 1), np.percentile(sub, 99)
    elev = (sub - lo_p) / (hi_p - lo_p)
    img = np.clip(0.7 * np.clip(shade, 0, 1) + 0.3 * np.clip(elev, 0, 1), 0, 1)
    # Every second pixel (~960 m/px): keeps the PNG small for a fast first screen.
    # The grid stays symmetric about the pole, so offset = (size - 1) / 2 still holds.
    img = img[::2, ::2]
    write_png(os.path.join(OUT, "polar-map.png"), (img * 255).astype(np.uint8))
    with open(os.path.join(OUT, "polar-map.json"), "w") as f:
        json.dump({"sizePx": int(img.shape[0]), "scaleM": scale * 2, "maxLat": -80.0, "source": src.name}, f)


def main() -> None:
    dems = load_dems()
    print("DEMs:", ", ".join(d.name for d in dems))
    verify_orientation(dems)
    if "--skip-map" not in sys.argv:
        browser_dem(dems)
    with open(os.path.join(OUT, "sites.json"), encoding="utf-8") as f:
        sites = json.load(f)
    os.makedirs(os.path.join(OUT, "horizons"), exist_ok=True)
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    for s in sites:
        if s["lat"] > -75 or (only and s["id"] not in only):
            continue
        if s.get("snapKm"):
            origin = s.get("snappedFrom") or [s["lat"], s["lon"]]
            lat, lon = snap_to_high_ground(dems, origin[0], origin[1], s["snapKm"])
            s["snappedFrom"] = origin
            s["lat"], s["lon"] = round(lat, 4), round(((lon + 180) % 360) - 180, 4)
            print(f"  snapped {s['id']} from {origin} to {s['lat']}, {s['lon']}")
        res = horizon_mask(dems, s["lat"], s["lon"])
        if res is None:
            continue
        res.update({"id": s["id"], "lat": s["lat"], "lon": s["lon"], "azStepDeg": 360 / N_AZ,
                    "observerHeightM": OBSERVER_H, "maxDistKm": MAX_DIST / 1000,
                    "demsUsed": [d.name for d in dems]})
        with open(os.path.join(OUT, "horizons", s["id"] + ".json"), "w") as f:
            json.dump(res, f, separators=(",", ":"))
        hz = np.array(res["horizon"])
        print(f"{s['id']:22s} h={res['terrainHeightM']:7.0f} m  dem={res['dem']}  horizon min/mean/max "
              f"{hz.min():5.2f}/{hz.mean():5.2f}/{hz.max():5.2f} deg  reach>={res['minReachKm']} km", flush=True)
    if not only:
        with open(os.path.join(OUT, "sites.json"), "w", encoding="utf-8") as f:
            json.dump(sites, f, indent=1, ensure_ascii=False)
    # Bundle every mask into one file that the app imports statically (fast first paint).
    bundle = {}
    for fn in sorted(os.listdir(os.path.join(OUT, "horizons"))):
        if fn.endswith(".json") and fn not in ("all.json", "index.json"):
            with open(os.path.join(OUT, "horizons", fn)) as f:
                d = json.load(f)
            bundle[d["id"]] = {"terrainHeightM": d["terrainHeightM"], "dem": d["dem"], "azStepDeg": d["azStepDeg"],
                               "horizon": [round(v, 2) for v in d["horizon"]]}
    with open(os.path.join(OUT, "horizons", "all.json"), "w") as f:
        json.dump(bundle, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
