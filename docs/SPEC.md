# Technical brief: Lunar Site Navigator (team infinium)

NASA Space Apps 2026 challenge "Lunar Landing Site Navigator". Deadline: Sunday 2026-11-15 12:00 (Asia/Bishkek).
Repo: https://github.com/azizovll/Lunar-Landing-Site-Navigator. A Next.js scaffold may already exist here: check `git status` and reuse it if it builds. Deploy: Vercel.

## Setup
1. Next.js (App Router, TypeScript, Tailwind). Read node_modules/next/dist/docs before writing code: this Next.js version has breaking changes. Install astronomy-engine and vitest. Whole UI in English (submission rule).
2. Commit and push to main once `npm run build` works, then after each working milestone.

## Goal
An intuitive web app that lets mission planners, educators and the public compare lunar landing sites and dates quickly, showing Sun and Earth positions relative to the local horizon to assess solar power and direct-to-Earth communication windows. Accuracy beats flashy 3D. Everything computes in the browser; no database.

## Astronomy (lib/astro.ts)
- astronomy-engine: GeoMoon(t) and GeoVector(Body.Sun,t,false) give Earth->Moon and Earth->Sun in J2000 (AU). Moon->Earth = -GeoMoon; Moon->Sun = GeoSun - GeoMoon.
- Moon body-fixed frame via RotationAxis(Body.Moon,t): z = axis.north; node Q = [cos(ra*15deg+90deg), sin(ra*15deg+90deg), 0]; x = Q*cos(W) + (z x Q)*sin(W) with W = axis.spin; y = z x x. Includes libration.
- Topocentric az/el at (lat, lon east-positive, height) on a 1737.4 km sphere; azimuth clockwise from lunar north; angular radius asin(R/dist), Sun R=695700 km, Earth R=6378.137 km.
- Validate against JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api, EPHEM_TYPE=OBSERVER, CENTER='coord@301', COORD_TYPE=GEODETIC, SITE_COORD='Elon,lat,alt_km', QUANTITIES='4', COMMAND='10' Sun and '399' Earth, APPARENT=AIRLESS). Target <=0.1 deg for 5 sites x several times. Save responses as fixtures in tests/fixtures, write vitest tests. If accuracy fails, use precomputed Horizons tables for preset sites. Document the azimuth convention.
- Sanity: Apollo 11 landing 1969-07-20 20:17 UTC at 0.674N 23.473E should have the Sun low in the east (~10 deg).

## Terrain / horizon (pipeline/ + public/data/)
- LOLA polar DEMs at https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ : LDEM_875S_20M.IMG (87.5-90S, 20 m/px, 7584x7584), LDEM_85S_40M.IMG (85-90S, 40 m/px, 7584x7584), LDEM_80S_80M.IMG (80-90S, 80 m/px, 7600x7600). ~115 MB each, raw little-endian int16, height_m = DN*0.5 relative to the 1737.4 km sphere. Polar stereographic centered on the south pole, planetocentric lat, east-positive lon, projection offset (N-1)/2 px. Read the .LBL files to confirm x/y orientation; verify on Shackleton crater.
- Python (numpy) script: horizon mask per preset site, 720 azimuths (0.5 deg), max terrain elevation angle along each ray to ~150-200 km incl. lunar curvature, observer height 2 m, finest DEM covering each sample. Output public/data/horizons/<id>.json.
- Downsampled DEM (~240-500 m/px) for the browser; custom coordinates get an approximate mask in a Web Worker with a "lower accuracy" note.
- Optional: https://pgda.gsfc.nasa.gov/products/78 (5 m/px site DEMs).

## Preset sites (public/data/sites.json, source link per site, verify coordinates)
Shackleton rim, Connecting Ridge, de Gerlache rim, Nobile rim, Malapert massif, Leibnitz beta plateau, Haworth, Mons Mouton, IM-1 Odysseus, Chandrayaan-3 Vikram, Apollo 11 and Apollo 17 for contrast.

## Metrics (lib/metrics.ts)
Sun elevation; visible fraction of the solar disk above the terrain horizon; time to sunset/sunrise over terrain; illumination % over a mission window (default 14 days); longest night (h); power index (sun-tracking panel = visible fraction; horizontal = fraction x sin(el), toggle); Earth elevation over terrain; comms if Earth center >= terrain horizon + margin (default 2 deg); time to Earthset; comms % and longest blackout; combined window (light AND comms) hours. Verdict Good / Marginal / Poor with documented thresholds.

## Screens
- Site (home, zero clicks): site list + clickable south-polar map; 360 deg panoramic sky (SVG) with terrain profile, Sun and Earth disks at correct angular size and tracks; 30-day timeline with shaded light / comms / both windows; time scrubber + play; Power (warm yellow) and Comms (blue) cards with countdowns. UTC plus "in N d M h".
- Compare: up to 4 "site + date" columns, best value per row highlighted, launch-delay slider 0-60 days with better/worse indicators.
- Calendar: 12-month heatmap (illumination + comms rows); click a day opens Site at that date.
- Validation: our values vs saved JPL Horizons values, differences in degrees, method, NASA data used.
- About: team infinium, data sources with links, how AI tools were used.
- Explain/Expert toggle (plain-language tips vs exact numbers, azimuths, CSV export, shareable URL state).
- Dark theme, responsive to phone width.

## Priority
Cut in this order if short on time: 3D view, CSV export, custom coordinates, yearly calendar. Never cut: panorama, metrics, compare, Horizons validation.

## Quality
`npm run build` and tests pass before each push; check pages in a browser; small English commits to main.

## Final
PRESENTATION_NOTES.md (English): problem, solution, every technology and why, NASA data used, the math, validation results with numbers, limitations, future work, 7-slide outline, short Russian summary at the end.
