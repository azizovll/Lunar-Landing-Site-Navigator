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
- **Mission rescue** (`/rescue`): enter the planned site, date and launch delay; the tool scores every south-pole site on every day within ±3/7/14 days of the new date and shows the 3 best alternatives with a 0–100 score, a traffic light, a one-line reason and the gain over simply landing late at the planned site.
- **Lunar day timelapse** (▶ Lunar day in the 3D view): the real Sun circles low over the pole and long shadows sweep across the craters; Earth wobbles and lander panels track the Sun.
- **Stand on the surface**: puts the camera on the ground at a station, facing Earth's real direction, so you see whether the LOLA horizon hides Earth.
- **30-second guided tour** (home page): overview → Shackleton rim → a lunar day in seconds → standing where Earth is best visible right now → Mission rescue, with captions. Screen-record it for the demo video.
- **Battery of a reference lander** (300 W panels, 2 kWh battery, 120 W load; editable in Pro): state of charge over the mission window driven by the real illumination series, lowest charge and hours without power; also a Compare row.
- **“Why the south pole is tricky”**: three illustrated steps on the home page (low Sun, terrain decides light or dark, Earth wobbles near the horizon).
- **Report as PDF**: “Save report (PDF)” on the Site and Mission rescue pages prints a light, one-to-two page report with the scenario link.
- **Score 0–100:** 0.4 × illumination% (minus up to half for nights longer than 120 h) + 0.4 × comms% (minus up to half for blackouts longer than 96 h) + 0.2 × light-and-comms%. Green ≥ 70, amber 40–69, red < 40. Shown on the Site header, in Compare and in Mission rescue.
- **Calendar:** a 12-month heatmap of daily light and comms, plus the best 14-day mission starts.
- **Validation:** a live comparison with NASA JPL Horizons, and a terrain check against a published illumination study.
- **Simple / Pro mode:** Simple (default) turns the numbers into plain language for the public: a one-sentence verdict, tiles rated in words, “Sun right now / Earth right now” sentences and a day-by-day strip. Pro shows every number, azimuths, CSV export and shareable URLs for planners.
- **3D terrain on the home page:** an interactive **3D view of the south-polar terrain** (three.js): NASA LOLA relief (×2) on the true lunar curvature, lit by the real Sun at the selected time with long shadows, Earth in the sky at its real direction (phase from the same Sun), and pins for every site; clicking a pin flies the camera there. Fine relief comes from a ~430 m/px LOLA normal map lit by the same Sun; lander models (built from primitives, no model files, ~300× real size) turn their solar panels to the real Sun and point their dishes at the real Earth. Edges fade into the background; tilt springs back after a drag. A decorative Moon in the hero is rendered offline from the NASA LROC mosaic (68 KB WebP). Hovering a pin (or tapping it on a phone) shows a thumbnail with the NASA image and a one-line description; clicking flies the camera there, and a "Photo & details" button opens the full station card: a NASA image of the site, a plain-language description, sunlight and Earth-visibility for the next 14 days, previous/next buttons and a list of all stations.
- **Custom points:** click the polar map or type coordinates, on the Site, Compare and Calendar screens. An approximate terrain horizon is computed in a Web Worker in about a second.
- **Separate verdicts:** each site shows a Power verdict and a Comms verdict next to the overall one, because near the pole a perfectly lit site can still have poor direct-to-Earth comms.

Demo story (30 s): *“We planned Shackleton rim for 1 December. The launch slips 30 days. Open Mission rescue, set +30 days: the delayed plan drops to amber, and the tool ranks every south-pole site on every nearby day and proposes the three best alternatives, each with a score and a one-line reason. One click opens the sky view to see why.”* (Check the actual numbers in the app before recording.)

## 3. Technologies and why

| Technology | Why |
| --- | --- |
| **Next.js 16 (App Router) + React 19 + TypeScript** | Static prerendered pages (fast first load on Vercel); typed maths code; one codebase for UI and the small Horizons proxy. |
| **Tailwind CSS 4** | Fast, consistent dark theme and responsive layout down to phone width. |
| **astronomy-engine** (MIT) | Small, well-tested ephemeris library that runs in the browser: Sun, Moon and the IAU lunar rotation model. It gives sub-arcminute accuracy with no server. |
| **SVG** | Panorama, timeline, map and heatmap. Crisp at any size, easy to make accessible, and accuracy matters more here than 3D effects. |
| **three.js** | The 3D south-pole terrain on the home page (LOLA heightfield, real-Sun shadows). Loaded lazily after first paint, so it does not slow the first screen; falls back to the 2D polar map without WebGL. |
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
- **NASA Blue Marble** (land, ocean, ice; public domain, via Wikimedia Commons): texture of the small Earth in the 3D view. **NASA SVS CGI Moon Kit** (LROC mosaic): the decorative Moon image in the hero.
- **Station images** (shown only when a card is opened, ~570 KB in total): NASA Scientific Visualization Studio stills of the Artemis III candidate regions ([5013](https://svs.gsfc.nasa.gov/5013)), Shackleton crater ([4716](https://svs.gsfc.nasa.gov/4716)) and Mons Mouton ([5074](https://svs.gsfc.nasa.gov/5074)); the ShadowCam image of the Shackleton crater floor (NASA/KARI/ASU, [shadowcam.asu.edu/images/1284](https://www.shadowcam.asu.edu/images/1284)); and the LRO image of the IM-1 Odysseus lander (NASA/GSFC/ASU, [nasa.gov](https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/)). The 3D terrain itself is a 513×513 LOLA heightfield (~1.3 km grid, ±330 km around the pole).

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

- **1440 azimuths** (0.25° steps, finer than the 0.53° solar disk). Each ray runs out to **200 km** with a step of 10 m near the observer, growing to 200 m.
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
| Annual illumination, Connecting Ridge C1 (2026, 20 m DEM) | **85.4%** vs 88.0% published (20-year mean, 20 m DEM) |
| Annual illumination, Shackleton rim S | **84.3%** vs 82.1% published; longest night 64 h vs ~65 h published |
| Shackleton floor (PSR, 10 km from the rim) | **0%** illumination; terrain walls 20–23° high |
| Equatorial site over a lunar month (unit test) | 45–55% light, nights of 300–380 h, Earth always in view |
| Pages on desktop and phone (headless Edge) | 0 console errors, no horizontal overflow |

All of these run as automated tests (`npm test`, 27 tests), except the page checks, which run with `scripts/check-pages.mjs`.

## 7. Limitations

- Terrain horizons are precise only for the preset south-polar sites. Custom points use a 480 m/px DEM (labelled “lower accuracy”; tested on 4 preset sites: horizon RMS 0.6–1.0°, annual illumination and comms within 7 percentage points of the precise masks). Sites north of 75°S (Chandrayaan-3, Apollo) use a flat horizon.
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
4. **Mission rescue.** “Launch slipped 30 days”: the delayed plan turns amber, the tool proposes the 3 best alternative sites and dates with a 0–100 score and a reason. This is the 30-second demo.
5. **Real terrain.** LOLA DEM to horizon mask (1440 rays, 200 km, curvature), the orientation check on five craters, and Shackleton rim vs floor.
6. **Can you trust it?** Horizons comparison: max 0.004° over 130 comparisons. Illumination vs a published study: 85.4% vs 88.0% and 84.3% vs 82.1%. The Apollo 11 check.
7. **Impact and next steps.** Who it is for (planners, educators, public); runs in any browser with no install. Next: site DEMs, landing ellipses, relays. Team infinium.

## 10. Use of AI

The team wrote the specification and chose the method and the data. An AI coding assistant (Claude Code by Anthropic) generated most of the code, the terrain pipeline and the documentation. All outputs are checked independently against NASA data (Horizons fixtures in automated tests, a DEM orientation check, published illumination values). No AI-generated images or voices are used.

---

## Краткое резюме для команды (RU)

**Что сделали.** Веб‑приложение Lunar Site Navigator: панорама неба с реальным горизонтом по рельефу LOLA, Солнце и Земля в истинном угловом размере, таймлайн на 30 дней (свет, связь, оба окна), карточки Power, Comms и Combined с обратным отсчётом. Есть режим «Спасти миссию»: пользователь вводит план и задержку пуска, инструмент перебирает все южные станции и даты рядом и показывает три лучшие альтернативы с баллом 0–100 и объяснением. Также есть сравнение до 4 сценариев с ползунком задержки запуска 0–60 дней, годовой календарь, страница проверки режимы Simple (простой язык для всех, включён по умолчанию) и Pro (все цифры для специалистов), а на главной 3D‑рельеф южного полюса по данным LOLA с настоящими тенями от Солнца на выбранный момент, Землёй в небе и метками станций: при наведении (на телефоне при касании) появляется миниатюра со снимком NASA и коротким описанием, клик приближает камеру, а кнопка «Photo & details» открывает полную карточку станции с переключением между станциями. Всё считается в браузере, базы данных нет.

**Точность.**
- Сверка с JPL Horizons: 130 сравнений, максимум 0,004°, RMS 5,6″ (цель была 0,1°).
- Apollo 11: Солнце на востоке на высоте 10,7°, как и должно быть.
- Освещённость за год по нашим маскам горизонта: Connecting Ridge 85,4% (в статье Gläser et al. 88,0%), Shackleton rim 84,3% (82,1%), дно Шеклтона 0%.

**Рельеф.** Используем DEM LOLA 20/40/80/240 м на пиксель. Строим 1440 лучей (шаг 0,25°) на 200 км с учётом кривизны Луны, наблюдатель на высоте 2 м. Ориентацию растра проверили на пяти кратерах. Координаты регионального уровня привязаны к ближайшему гребню (до 2–6 км), это указано у каждой точки.

**Ограничения.** Для своих точек горизонт приблизительный (480 м на пиксель, расхождение с точными масками до 7 п.п. по освещённости и связи). У точек севернее 75°S (Chandrayaan‑3, Apollo) горизонт плоский. Связь оценивается только по геометрии, без расписания DSN.

**Видео.** На главной есть кнопка «▶ 30-second tour»: тур сам проходит облёт полюса, Shackleton, ускоренный лунный день, вид с поверхности на Землю и Mission rescue с субтитрами. Его можно просто записать с экрана.

**Демо (30 с).** Shackleton rim → Compare → двигаем задержку на +14 дней → показываем, как падают часы «свет + связь» и какая точка становится лучше.
