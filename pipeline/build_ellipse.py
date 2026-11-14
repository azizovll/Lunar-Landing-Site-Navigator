"""Landing-precision data: terrain horizons on a ring around every south-polar preset.

Usage:  python -I pipeline/build_ellipse.py
Output: public/data/ellipse.json  {siteId: {rings: [{ringKm, points: [{bearing, lat, lon, heightM, horizon[720]}]}]}}

A real lander touches down somewhere inside an ellipse, not on a point. For each preset we
compute full-resolution LOLA horizon masks at 6 points (bearings 0, 60, ... 300 deg) on a 250 m ring
(precision landing) and a 1 km ring (IM-1 Odysseus missed its target by about 1.5 km), so the app can
show how much the score changes if the landing is off target.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_horizons import OUT, horizon_mask  # noqa: E402
from lola import destination, load_dems  # noqa: E402

RINGS_KM = [0.25, 1.0]
BEARINGS = [0, 60, 120, 180, 240, 300]


def main() -> None:
    dems = load_dems()
    with open(os.path.join(OUT, "sites.json"), encoding="utf-8") as f:
        sites = json.load(f)
    out = {}
    for s in sites:
        if s["lat"] > -80:
            continue
        rings = []
        for ring_km in RINGS_KM:
            pts = []
            for b in BEARINGS:
                la, lo = destination(s["lat"], s["lon"], np.array([float(b)]), np.array([ring_km * 1000]))
                res = horizon_mask(dems, float(la[0]), float(lo[0]))
                if res is None:
                    continue
                hz = res["horizon"][::2]  # 0.5 deg step keeps the file small
                pts.append({"bearing": b, "lat": round(float(la[0]), 5), "lon": round(float(lo[0]), 4),
                            "heightM": res["terrainHeightM"], "horizon": [round(v, 2) for v in hz]})
            rings.append({"ringKm": ring_km, "points": pts})
        out[s["id"]] = {"rings": rings}
        print(s["id"], [[round(p["heightM"]) for p in r["points"]] for r in rings], flush=True)
    path = os.path.join(OUT, "ellipse.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("ellipse.json", os.path.getsize(path))


if __name__ == "__main__":
    main()
