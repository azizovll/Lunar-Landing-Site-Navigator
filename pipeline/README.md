# Terrain pipeline

Builds terrain horizon masks for the preset sites and the small DEM/map used by the browser.

```
# 1. download LOLA polar DEMs (PDS, MIT/GSFC LOLA GDR) into pipeline/cache/ (git-ignored, ~375 MB)
base=https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG
for f in LDEM_875S_20M LDEM_85S_40M LDEM_80S_80M LDEM_75S_240M; do
  curl -o pipeline/cache/$f.IMG $base/$f.IMG; curl -o pipeline/cache/$f.LBL $base/$f.LBL
done
# 2. build (numpy only)
python -I pipeline/build_horizons.py
```

| Product | Coverage | Resolution | Size |
| --- | --- | --- | --- |
| LDEM_875S_20M | 87.5–90°S | 20 m/px | 7584² |
| LDEM_85S_40M | 85–90°S | 40 m/px | 7584² |
| LDEM_80S_80M | 80–90°S | 80 m/px | 7600² |
| LDEM_75S_240M | 75–90°S | 240 m/px | 3812² |

Format (from the .LBL): raw `LSB_INTEGER` int16, `height_m = DN * 0.5` above a 1737.4 km sphere,
south polar stereographic, `LINE/SAMPLE_PROJECTION_OFFSET = (N-1)/2`.

## Orientation check

The label does not spell out the axis directions, so we tested all 8 sign/swap variants against
five well-known craters (catalogue centre must be a deep bowl). Only

    rho    = 2 R tan(pi/4 + lat/2)
    line   = off - rho cos(lon) / scale
    sample = off + rho sin(lon) / scale

works for all of them (80 m DEM, ring mean minus centre height):

| Crater (IAU centre) | Correct variant | Mirrored variant |
| --- | --- | --- |
| Shackleton 89.67°S 129.2°E | 4000 m | 3573 m |
| Haworth 87.45°S 5.0°W | 3068 m | 30 m |
| Shoemaker 88.1°S 44.9°E | 3177 m | 700 m |
| Faustini 87.3°S 77.0°E | 2016 m | −121 m |
| de Gerlache 88.5°S 87.1°W | 1498 m | 446 m |

`verify_orientation()` re-checks Shackleton on every run and aborts if it fails.

## 3D terrain (home page)

`python -I pipeline/build_terrain3d.py <earth image>` writes `public/data/terrain/south.bin` (513×513 int16 heights, same projection, ±330 km) and a 512×256 Earth texture.

## Horizon mask

1440 azimuths (0.25°, finer than the 0.53° solar disk), rays to 200 km, step 10 m near the observer growing to 200 m, observer 2 m
above the terrain, finest DEM covering each sample, exact spherical geometry
(`el = atan2(r_t cos θ − r_o, r_t sin θ)`), so lunar curvature is included.
