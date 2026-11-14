# Lunar Site Navigator: presentation notes

Team **infinium** · NASA Space Apps Challenge 2026 · Challenge: *Lunar Landing Site Navigator*

## 1. Problem

Landing near the lunar south pole is attractive (water ice in permanently shadowed craters, long sunlit periods on nearby ridges), but the lighting is extreme:

- The Moon's spin axis is tilted only ~1.5° to the ecliptic, so at the pole the Sun circles the horizon and never climbs more than a degree or two. A ridge a few hundred metres away can block it for days.
- Earth never rises or sets the normal way. It hangs in one part of the sky and wobbles by several degrees (libration). Near the pole, that wobble decides whether terrain blocks the direct radio link.
- A change of site by a few kilometres, or a launch slip of a few days, can change power and comms dramatically.

Mission planners, educators and the public need a quick, trustworthy way to see this and to compare options.

## 2. Solution

A web app that runs entirely in the browser:

- **Site view:**
  - 360° panoramic sky with the real terrain horizon, the Sun and Earth drawn at their true angular sizes, and their tracks.
  - A time scrubber with playback.
  - Power, Comms and Combined cards with countdowns (“sunset over terrain in 3 d 4 h”).
  - A 30-day timeline with shaded *light*, *comms* and *both* windows.
- **Compare:** up to four “site + date” scenarios, with the best value per metric highlighted. A **launch-delay slider (0–60 days)** shows instantly what a slip does, with ▲/▼ arrows against the on-time plan.
- **Calendar:** a 12-month heatmap of daily light and comms, plus the best 14-day mission starts.
- **Validation:** a live comparison with NASA JPL Horizons, and a terrain check against a published illumination study.
- **Explain / Expert mode:** plain-language tips for newcomers; exact numbers, CSV export and a shareable URL for planners.
- **Custom points:** click the polar map. An approximate terrain horizon is computed in a Web Worker in about a second.

Demo story (30 s): *“We plan Shackleton rim and Connecting Ridge for 1 December. The launch slips two weeks. Drag the slider: every number updates, the arrows show what got worse, and the table highlights which site is now best.”* (Check the actual numbers in the app before recording.)

## 3. Technologies and why

| Technology | Why |
| --- | --- |
| **Next.js 16 (App Router) + React 19 + TypeScript** | Static prerendered pages (fast first load on Vercel); typed maths code; one codebase for UI and the small Horizons proxy. |
| **Tailwind CSS 4** | Fast, consistent dark theme and responsive layout down to phone width. |
| **astronomy-engine** (MIT) | Small, well-tested ephemeris library that runs in the browser: Sun, Moon and the IAU lunar rotation model. It gives sub-arcminute accuracy with no server. |
| **SVG** | Panorama, timeline, map and heatmap. Crisp at any size, easy to make accessible, and accuracy matters more here than 3D effects. |
| **Web Worker** | Computes horizons for custom points without freezing the UI. |
| **Python + numpy** | Offline terrain pipeline: reads 115 MB LOLA rasters with memory mapping and ray-marches horizons. |
| **Vitest** | Automated tests: Horizons fixtures, metrics and terrain acceptance criteria. |
| **puppeteer-core** (with the system's Edge/Chrome) | Headless page checks on desktop and phone: console errors, overflow, screenshots. |
| **Vercel** | Free static hosting plus one serverless route (`/api/horizons`) for the live Horizons check. |

## 4. NASA data used

- **LRO LOLA polar gridded DEMs** (PDS, `LOLA_GDR/POLAR/IMG`): LDEM_875S_20M, LDEM_85S_40M, LDEM_80S_80M, LDEM_75S_240M. Used for terrain horizons, the browser DEM and the polar map.
- **JPL Horizons API**: reference Sun and Earth az/el from lunar surface points (saved fixtures and live re-check).
- **NASA NTRS: Gläser et al.**, *Illumination conditions at the lunar poles* (20170007365): site coordinates and published illumination for validation.
- **NASA SVS Artemis III candidate regions**, **LROC** site pages, and the **IAU/USGS Gazetteer**: site locations.

## 5. The math

### Frames

1. astronomy-engine gives geocentric J2000 vectors: Earth→Moon (`GeoMoon`) and Earth→Sun (`GeoVector(Sun)`, evaluated at the light-time-retarded epoch, about 499 s earlier).
   Moon→Earth = −GeoMoon, and Moon→Sun = GeoSun − GeoMoon.
2. **Moon body-fixed frame** from the IAU rotation model (`RotationAxis(Moon)`), which includes the physical libration terms:
   - z = pole direction;
   - node Q = [cos(α+90°), sin(α+90°), 0];
   - x = Q cos W + (z × Q) sin W;
   - y = z × x.
3. **Topocentric frame** at (lat, lon east-positive, height) on a 1737.4 km sphere:
   - up = radial;
   - east = (−sin λ, cos λ, 0);
   - north = up × east.
   - Elevation = asin(v·up / |v|). **Azimuth = atan2(v·east, v·north), clockwise from lunar north**, the same convention as Horizons.
   - Note: at a south-polar site “north” points *away* from the pole, so Earth (toward the 0° meridian) appears across the pole at azimuth ≈ 180° − longitude.
4. Angular radius = asin(R / d), with R_Sun = 695 700 km and R_Earth = 6378.137 km. The Sun's disk is ~0.53° across and Earth's ~1.9°.

### Libration

Earth's direction in the body-fixed frame drifts by up to about ±7° in latitude and ±8° in longitude over a month. That is why Earth traces a small loop in the panorama, and why comms near the pole come and go.

### Terrain horizon mask

- **720 azimuths** (0.5° steps). Each ray runs out to **200 km** with a step of 10 m near the observer, growing to 200 m.
- Each sample uses the **finest LOLA DEM** that covers it (20 → 40 → 80 → 240 m/px).
- The observer stands **2 m** above the ground. The elevation angle of a terrain point at radius r_t and central angle θ, seen from radius r_o, is

  `el = atan2(r_t cos θ − r_o, r_t sin θ)`

  This is exact sphere geometry, so lunar curvature is included. The mask is the maximum along the ray.
- **DEM orientation check:** the PDS label does not state the axis directions. We tested all 8 sign/swap variants against five craters (Shackleton, Haworth, Shoemaker, Faustini, de Gerlache). Only `line = off − ρ cos λ`, `sample = off + ρ sin λ` turns all five into bowls, for example Shackleton 4.0 km deep. The pipeline re-checks Shackleton on every run.
- **Region-level coordinates** (Nobile, Haworth, Malapert, Leibnitz β, Mons Mouton) are snapped to the highest DEM point within 2–6 km, and this is documented per site. Without it, a published point from another topography product can sit 500 m below a crest that blocks the whole northern sky.

### Partial solar disk

The disk is cut into 24 vertical strips. Each strip is compared with the horizon *at its own azimuth*, so a peak that hides half of the Sun is handled correctly. The visible fraction f is the visible chord length divided by the total chord length.

### Metrics (default 14-day mission window, 10-minute sampling)

- **Illumination %**: the time-average of f. **Longest night**: the longest run with f = 0.
- **Power index**:
  - sun-tracking panel: mean of f;
  - horizontal panel: mean of f · max(0, sin el).
- **Comms**: Earth's centre ≥ terrain horizon at Earth's azimuth + margin (default 2°). Also reported: **comms %** and **longest blackout**.
- **Combined window**: hours that are lit *and* have comms.
- **Countdowns**: the next transition is found on the sampled series, then refined by bisection to under 30 s.
- **Verdicts**:

  | Metric | Good | Poor |
  | --- | --- | --- |
  | Power | illumination ≥ 70% and night ≤ 48 h | < 40% or night > 120 h |
  | Comms | ≥ 80% and blackout ≤ 24 h | < 40% or blackout > 96 h |

  Anything in between is Marginal. The overall verdict is the worse of the two.

## 6. Validation results

| Check | Result |
| --- | --- |
| Sun and Earth az/el vs JPL Horizons: 5 sites (Apollo 11, Apollo 17, Shackleton, Malapert, Chandrayaan-3), 13 epochs in 1969 and 2026, Sun and Earth, 130 comparisons | **max error 0.0038°** (target ≤ 0.1°), **RMS 0.0016° = 5.6″** |
| Apollo 11 landing, 1969-07-20 20:17 UTC | Horizons: Sun az 88.81°, el 10.70°. Ours agrees within 0.004°. Sun low in the east ✔ |
| Annual illumination, Connecting Ridge C1 (2026, 40 m DEM) | **86.7%** vs 88.0% published (20-year mean, 20 m DEM) |
| Annual illumination, Shackleton rim S | **85.7%** vs 82.1% published; longest night 64 h vs ~65 h published |
| Shackleton floor (PSR, 10 km from the rim) | **0%** illumination; terrain walls 20–23° high |
| Equatorial site over a lunar month (unit test) | 45–55% light, nights of 300–380 h, Earth always in view |
| Pages on desktop and phone (headless Edge) | 0 console errors, no horizontal overflow |

All of these run as automated tests (`npm test`, 22 tests), except the page checks, which run with `scripts/check-pages.mjs`.

## 7. Limitations

- Terrain horizons are precise only for the preset south-polar sites. Custom points use a 480 m/px DEM (labelled “lower accuracy”). Sites north of 75°S (Chandrayaan-3, Apollo) use a flat horizon.
- LOLA polar DEMs have gaps and interpolation at the finest scales. Boulders and lander height are not modelled beyond a fixed 2 m observer.
- Comms is geometric line-of-sight to Earth's centre. It ignores Deep Space Network schedules, antenna patterns and relay satellites.
- Power is a geometric index. It ignores dust, temperature, Earthshine and battery state.
- Region-level site coordinates are approximations snapped to the DEM crest. Real landing ellipses are larger than one point.

## 8. Future work

- Add the 5 m/px LOLA site DEMs (PGDA product 78) for selected sites.
- Use landing ellipses instead of single points: show the distribution of illumination across the ellipse.
- Add relay-satellite visibility (for example Lunar Pathfinder, Queqiao-2) and DSN station availability.
- Add a 3D terrain view and an Earth-phase rendering.
- Add a north-pole mode (same pipeline, north-polar DEMs).

## 9. Seven-slide outline

1. **The question.** “If the landing slips by two weeks, will we still have Sun and Earth?” Photo-free title with the panorama screenshot.
2. **Why the pole is hard.** 1.5° tilt: the Sun skims the horizon. Libration: Earth wobbles. Show the panorama with the Sun track and Earth loop.
3. **What we built.** Site view: panorama, timeline, Power and Comms cards. One screenshot with callouts.
4. **Compare and delay.** The launch-delay slider moving from 0 to 14 days, with ▲/▼ indicators. This is the 30-second demo.
5. **Real terrain.** LOLA DEM to horizon mask (720 rays, 200 km, curvature), the orientation check on five craters, and Shackleton rim vs floor.
6. **Can you trust it?** Horizons comparison: max 0.004° over 130 comparisons. Illumination vs a published study: 86.7% vs 88.0%. The Apollo 11 check.
7. **Impact and next steps.** Who it is for (planners, educators, public); runs in any browser with no install. Next: site DEMs, landing ellipses, relays. Team infinium.

## 10. Use of AI

The team wrote the specification and chose the method and the data. An AI coding assistant (Claude Code by Anthropic) generated most of the code, the terrain pipeline and the documentation. All outputs are checked independently against NASA data (Horizons fixtures in automated tests, a DEM orientation check, published illumination values). No AI-generated images or voices are used.

---

## Краткое резюме для команды (RU)

**Что сделали.** Веб‑приложение Lunar Site Navigator: панорама неба с реальным горизонтом по рельефу LOLA, Солнце и Земля в истинном угловом размере, таймлайн на 30 дней (свет, связь, оба окна), карточки Power, Comms и Combined с обратным отсчётом. Также есть сравнение до 4 сценариев с ползунком задержки запуска 0–60 дней, годовой календарь, страница проверки и режимы Explain/Expert. Всё считается в браузере, базы данных нет.

**Точность.**
- Сверка с JPL Horizons: 130 сравнений, максимум 0,004°, RMS 5,6″ (цель была 0,1°).
- Apollo 11: Солнце на востоке на высоте 10,7°, как и должно быть.
- Освещённость за год по нашим маскам горизонта: Connecting Ridge 86,7% (в статье Gläser et al. 88,0%), Shackleton rim 85,7% (82,1%), дно Шеклтона 0%.

**Рельеф.** Используем DEM LOLA 20/40/80/240 м на пиксель. Строим 720 лучей на 200 км с учётом кривизны Луны, наблюдатель на высоте 2 м. Ориентацию растра проверили на пяти кратерах. Координаты регионального уровня привязаны к ближайшему гребню (до 2–6 км), это указано у каждой точки.

**Ограничения.** Для своих точек горизонт приблизительный (480 м на пиксель). У точек севернее 75°S (Chandrayaan‑3, Apollo) горизонт плоский. Связь оценивается только по геометрии, без расписания DSN.

**Демо (30 с).** Shackleton rim → Compare → двигаем задержку на +14 дней → показываем, как падают часы «свет + связь» и какая точка становится лучше.
