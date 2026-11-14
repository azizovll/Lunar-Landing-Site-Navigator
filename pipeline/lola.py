"""LOLA polar stereographic DEM access (PDS LOLA_GDR/POLAR/IMG).

Products are raw little-endian int16, height_m = DN * 0.5 relative to a 1737.4 km sphere,
south-polar stereographic centered on -90 deg, planetocentric latitude, east-positive longitude.
From the PDS label (DSMAP_POLAR.CAT), with 0-based line/sample and offset (N-1)/2:

    rho    = 2 R tan(pi/4 + lat/2)            (lat negative in the south)
    sample = S0 + rho * sin(lon) / scale
    line   = L0 - rho * cos(lon) / scale

so lon = 0 points "up" the image (decreasing line) and lon = 90E points right.
Verified empirically (pipeline/README.md): of the 8 possible axis sign/swap variants only this one
turns Shackleton (4.0 km), Haworth (3.1 km), Shoemaker (3.2 km), Faustini (2.0 km) and
de Gerlache (1.5 km) into bowls at their IAU positions. See verify_orientation().
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass

import numpy as np

R_M = 1737400.0
CACHE = os.path.join(os.path.dirname(__file__), "cache")


@dataclass
class Dem:
    name: str
    n: int
    scale: float  # m / px
    max_lat: float  # northern-most (least negative) latitude of nominal coverage
    data: np.ndarray  # (n, n) int16 memmap

    @property
    def offset(self) -> float:
        return (self.n - 1) / 2.0

    def to_pixel(self, lat_deg, lon_deg):
        lat = np.radians(lat_deg)
        lon = np.radians(lon_deg)
        rho = 2.0 * R_M * np.tan(np.pi / 4.0 + lat / 2.0) / self.scale
        return self.offset - rho * np.cos(lon), self.offset + rho * np.sin(lon)  # line, sample

    def sample(self, lat_deg, lon_deg):
        """Bilinear height (m). NaN where outside the nominal coverage."""
        line, samp = self.to_pixel(lat_deg, lon_deg)
        l0 = np.floor(line).astype(np.int64)
        s0 = np.floor(samp).astype(np.int64)
        ok = (l0 >= 0) & (s0 >= 0) & (l0 < self.n - 1) & (s0 < self.n - 1) & (np.asarray(lat_deg) <= self.max_lat)
        l0c = np.clip(l0, 0, self.n - 2)
        s0c = np.clip(s0, 0, self.n - 2)
        fl = line - l0c
        fs = samp - s0c
        d = self.data
        h = (
            d[l0c, s0c] * (1 - fl) * (1 - fs)
            + d[l0c + 1, s0c] * fl * (1 - fs)
            + d[l0c, s0c + 1] * (1 - fl) * fs
            + d[l0c + 1, s0c + 1] * fl * fs
        ) * 0.5
        return np.where(ok, h, np.nan)


def open_dem(name: str, n: int, scale: float, max_lat: float) -> Dem | None:
    path = os.path.join(CACHE, name + ".IMG")
    if not os.path.exists(path) or os.path.getsize(path) != n * n * 2:
        return None
    data = np.memmap(path, dtype="<i2", mode="r", shape=(n, n))
    return Dem(name, n, scale, max_lat, data)


def load_dems() -> list[Dem]:
    """Finest first."""
    specs = [
        ("LDEM_875S_20M", 7584, 20.0, -87.5),
        ("LDEM_85S_40M", 7584, 40.0, -85.0),
        ("LDEM_80S_80M", 7600, 80.0, -80.0),
        ("LDEM_75S_240M", 3812, 240.0, -75.0),
    ]
    dems = [d for d in (open_dem(*s) for s in specs) if d is not None]
    if not dems:
        raise SystemExit("No DEMs found in pipeline/cache")
    return dems


def sample_best(dems: list[Dem], lat, lon):
    """Height from the finest DEM covering each point; also returns the index of the DEM used."""
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    out = np.full(lat.shape, np.nan)
    used = np.full(lat.shape, -1, dtype=np.int8)
    for i, dem in enumerate(dems):
        need = np.isnan(out)
        if not need.any():
            break
        h = dem.sample(lat[need], lon[need])
        sub = out[need]
        sub_used = used[need]
        good = ~np.isnan(h)
        sub[good] = h[good]
        sub_used[good] = i
        out[need] = sub
        used[need] = sub_used
    return out, used


def destination(lat_deg: float, lon_deg: float, az_deg, dist_m):
    """Great-circle destination on the sphere; az clockwise from north."""
    lat1 = math.radians(lat_deg)
    lon1 = math.radians(lon_deg)
    th = np.asarray(dist_m) / R_M
    az = np.radians(az_deg)
    sin_lat2 = np.sin(lat1) * np.cos(th) + np.cos(lat1) * np.sin(th) * np.cos(az)
    lat2 = np.arcsin(np.clip(sin_lat2, -1, 1))
    y = np.sin(az) * np.sin(th) * np.cos(lat1)
    x = np.cos(th) - np.sin(lat1) * sin_lat2
    lon2 = lon1 + np.arctan2(y, x)
    return np.degrees(lat2), np.degrees(lon2)
