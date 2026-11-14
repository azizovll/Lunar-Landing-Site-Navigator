# Lunar Site Navigator: presentation notes

Team **infinium** · NASA Space Apps Challenge 2026 · Challenge: *Lunar Landing Site Navigator*

Texts for the submission page are in [SUBMISSION.md](SUBMISSION.md).

## 1. Problem

Landing near the lunar south pole is attractive: there is water ice in permanently shadowed craters and long sunlit periods on nearby ridges. But the conditions are extreme.

- **The Sun skims the horizon.** The Moon's axis is tilted only ~1.5°, so at the pole the Sun circles the horizon and never climbs more than about 1.5°. A ridge a few hundred metres away can block it for days.
- **Earth hangs low and wobbles.** Earth never rises or sets the normal way; it wobbles by several degrees (libration). Near the pole that wobble decides whether terrain blocks the direct radio link.
- **There is no atmosphere.** No refraction and no twilight: the horizon is only terrain and the curve of the Moon.
- **Small changes have large effects.** Moving a few hundred metres, or slipping the launch a few days, can change power and comms completely. Schedules slip all the time.

Mission planners need a fast, trustworthy way to re-plan; students and the public need a way to see why this is hard.

## 2. Solution

A web app that computes everything in the browser from NASA data.

**For planners**
- **Mission Rescue.** Planned site, date and launch delay in; every south-pole site on every day within ±3/7/14 days of the new date out, ranked. The result shows the 3 best alternatives, each with a 0–100 score, a traffic light, a one-line reason and the gain over landing late at the original site.
- **Compare.** Up to 4 site-and-date scenarios side by side, the best value per row highlighted, and a launch-delay slider (0–60 days) with ▲/▼ against the on-time plan.
- **Site view.**
  - A 360° sky panorama over the real terrain horizon, with the Sun and Earth at their true sizes.
  - The solar elevation shown large, with countdowns to sunset and Earthset.
  - A 30-day light/comms timeline.
  - The battery of a reference lander.
- **Landing precision.** Full-resolution horizons at 6 points 250 m and 1 km from each site show whether a target needs a precise landing.
- **Who else is here.** Hardware already on the surface near the site and planned missions targeting the same region, each with a source and a 2 km plume safety zone. Linked to the Lunar Ledger registry.
- **Calendar, CSV, PDF, links.** A 12-month heatmap with the best 14-day starts, CSV export, a PDF report and shareable URLs.

**For everyone**
- **3D south-pole terrain.**
  - Built from LOLA and lit by the real Sun with long shadows.
  - A lunar-day timelapse and a “stand on the surface” view facing Earth.
  - Lander models whose panels track the Sun.
  - NASA images of every station on hover.
- **A 30-second guided tour with captions**, ready to screen-record.
- **Simple mode (default).**
  - A one-sentence verdict and tiles rated Good / OK / Poor.
  - “Sun right now” with an Earth comparison (“as low as the Sun 6 minutes after sunrise at Earth's equator”).
  - A day-by-day strip.
- **Explainers.** “Why the south pole is tricky” in three illustrated steps and **Moon vs Earth** in seven comparisons.

**Trust**
- **Validation page.** Our values against NASA JPL Horizons, a live re-check and a comparison with a published illumination study.

## 3. Technologies and why

| Technology | Why |
| --- | --- |
| **Next.js 16 + React 19 + TypeScript** | Static prerendered pages (fast first load on Vercel), typed maths code, one small serverless route for the live Horizons check. |
| **Tailwind CSS 4** | Consistent dark design down to phone width. |
| **astronomy-engine** (MIT) | Sun, Moon and the IAU lunar rotation model (with libration) in the browser, no server. |
| **SVG** | Panorama, timeline, maps, heatmap, charts: crisp and accessible. |
| **three.js** | 3D terrain with real-Sun shadows; loaded after first paint; 2D fallback without WebGL. |
| **Web Worker** | Horizons for custom points without freezing the UI. |
| **Python + numpy** | Offline terrain pipeline: reads the 115 MB LOLA rasters and ray-marches horizons. |
| **Vitest** | 42 automated tests: Horizons fixtures, metrics, terrain acceptance, score, rescue, battery, neighbours. |
| **puppeteer-core** | Headless checks on desktop and phone: console errors, overflow, screenshots. |
| **Vercel** | Hosting. |

## 4. Data

**NASA**
- **LRO LOLA polar DEMs** (20, 40, 80, 240 m/px): horizons, 3D terrain, maps.
- **JPL Horizons API**: reference ephemerides.
- **Gläser et al.** (NASA NTRS 20170007365): coordinates and validation.
- **NASA SVS** (Artemis III regions, Shackleton, Mons Mouton, CGI Moon Kit): images and textures.
- **LROC** landing-site images and coordinates.
- **Blue Marble** (Earth texture) and **LRO Diviner** (temperatures).
- **Artemis site-selection update**, LPSC 2026.

**Partners and others**
- **KARI:** ShadowCam on Danuri.
- **JAXA:** Kaguya-based coordinates.
- **ISRO:** Chandrayaan-3 site and the Chandrayaan-1 impact probe.
- **Other:** astronomy-engine; the Open Lunar Foundation Lunar Ledger.

## 5. The math

**Frames.**
- astronomy-engine gives Earth→Moon and Earth→Sun in J2000. Moon→Earth = −GeoMoon; Moon→Sun = GeoSun − GeoMoon, with the Sun at the light-time-retarded epoch.
- The IAU rotation model gives the Moon body-fixed frame: z = pole; node Q = [cos(α+90°), sin(α+90°), 0]; x = Q cos W + (z×Q) sin W; y = z×x.
- The topocentric east/north/up frame sits on a 1737.4 km sphere. Azimuth is clockwise from lunar north, as in Horizons. At a south-polar site Earth appears across the pole, at azimuth ≈ 180° − longitude.

**Libration.** Earth's direction moves up to ±7° in latitude and ±8° in longitude over a month, so near the pole Earth dips in and out behind the terrain.

**Terrain horizon.**
- 1440 rays every 0.25°, out to 200 km, from an observer 2 m above the ground, using the finest DEM at each sample.
- The elevation of a terrain point is el = atan2(r_t cos θ − r_o, r_t sin θ). This is exact sphere geometry, so curvature is included. There is no atmosphere, so there is no refraction term.
- The DEM orientation was verified on five craters; for example, Shackleton comes out 4.0 km deep.

**Partial Sun.** The disk is cut into 24 strips, each compared with the horizon at its own azimuth.

**Metrics (14-day window, 10-minute steps).**
- Illumination % is the mean visible fraction of the Sun; the longest night is the longest run with no Sun visible.
- Comms means Earth's centre is at least the terrain horizon + 2°; also reported: comms % and the longest blackout.
- Light + comms counts the hours with both at once.
- Countdowns are refined by bisection to under 30 s.

**Ratings.**
- Power is Good at ≥ 70% illumination with nights ≤ 48 h, and Poor below 40% or with nights over 120 h.
- Comms is Good at ≥ 80% with blackouts ≤ 24 h, and Poor below 40% or with blackouts over 96 h.
- Everything in between is OK.
- **Score 0–100** = 0.4·illumination% × (1 − 0.5·min(1, night/120 h)) + 0.4·comms% × (1 − 0.5·min(1, blackout/96 h)) + 0.2·light-and-comms%. Green ≥ 70, amber 40–69, red < 40.

**Rescue ranking.**
- Each site gets its best day within the window, then sites are ranked by score.
- Ties are broken by the unrounded score, then Earth's lowest elevation, then the date closest to the new launch date.
- Sites inside another mission's 2 km safety zone can be pushed down the list.

**Battery.** A reference lander: 300 W sun-tracking array, 2 kWh, 120 W load, 90% charge efficiency, driven by the real illumination series.

## 6. Validation results

| Check | Result |
| --- | --- |
| Sun and Earth az/el vs JPL Horizons: 5 sites, 1969 and 2026, 130 comparisons | **max 0.0038°** (target ≤ 0.1°), **RMS 5.6″** |
| Apollo 11 landing, 1969-07-20 20:17 UTC | Sun az 88.8°, el 10.7°, low in the east, matching Horizons within 0.004° |
| Annual illumination, Connecting Ridge C1 | **85.4%** vs 88.0% published (Gläser et al., 20-year mean) |
| Annual illumination, Shackleton rim S | **84.3%** vs 82.1% published; longest night 64 h vs ~65 h |
| Shackleton crater floor | **0%**, a permanently shadowed region |
| Custom-point horizons (480 m/px) vs precise masks | within 7 percentage points |
| Pages on desktop and phone | 0 console errors, no horizontal overflow |

## 7. Limitations

- **Horizon precision.** Exact horizons exist only for the presets. Custom points use a 480 m/px DEM (labelled), and sites north of 75°S use a flat horizon.
- **Comms.** Comms is line-of-sight to Earth's centre: no DSN schedules, antennas or relays.
- **Power and battery.** Power and the battery are a geometric model of a reference lander: no dust or temperature effects.
- **Planned missions.** Their targets are region-level and their schedules change; the live source is the Lunar Ledger.
- **Snapped coordinates.** Region-level site coordinates are snapped to the local crest (documented per site).

## 8. Future work

- **Finer terrain:** 5 m/px LOLA site DEMs (PGDA product 78) for the top candidate sites.
- **Full landing ellipses** instead of rings, using real dispersion statistics.
- **Comms beyond line of sight:** relay satellites (Lunar Pathfinder, Queqiao-2) and DSN availability.
- **North-pole mode**, using the same pipeline.
- **Live data:** a Lunar Ledger API integration once available.
- **Interface languages:** Russian and Kyrgyz.

## 9. Seven-slide outline

1. **“The launch slipped. Now what?”** One sentence of problem, one screenshot of the 3D terrain with the low Sun.
2. **Why the pole is hard.** Sun ≤ 1.5°, Earth wobbling at the horizon, no atmosphere (use the “Why it is tricky” and “Moon vs Earth” visuals).
3. **Mission Rescue.** Shackleton rim + 30 days → 44/100; the tool proposes Malapert 80/100 with the reason. This is the core value.
4. **Why a few hundred metres matter.** The Landing precision ring: Shackleton rim 71 → 1 at 250 m; the Mons Mouton plateau stays 90–100.
5. **Real data, real terrain.** LOLA horizons (1440 rays, 200 km, curvature), 3D view, who else is there (Chandrayaan-1 probe 5 km from Connecting Ridge; Chang’e-7 and Blue Moon target the same ridge).
6. **Can you trust it?** 0.004° vs JPL Horizons over 130 comparisons; 85.4% vs 88.0% published illumination; 42 automated tests.
7. **For whom, and next.** Planners (Rescue, Compare, PDF, links), students and the public (Simple mode, tour). Next: 5 m DEMs, relays, Lunar Ledger. Team infinium.

## 10. Video (30 s)

- **Recording:** press **▶ 30-second tour** on the home page and screen-record it (Win+G or OBS). The tour flies over the pole, shows Shackleton rim, plays a lunar day, stands on the surface where Earth is best visible and ends on Mission Rescue.
- **If there is time, add 5 seconds of the Rescue page:** set +30 days, and show the three alternatives appearing.
- **Rules:** English only; no faces or voices of minors.
- **Before recording:** check that the numbers on screen match the slides.

## 11. Use of AI

The team defined the problem, wrote the specification, chose the methods and data, and reviewed the results. An AI coding assistant (Claude Code by Anthropic) generated most of the code, the terrain pipeline and the documentation. Every number is checked independently against NASA data. No AI-generated images, video or voices are used.

---

## Краткое резюме для команды (RU)

**Что это.** Веб‑приложение, которое за секунды отвечает: если сядем здесь и в этот день или пуск сдвинется, хватит ли Солнца для энергии и будет ли видна Земля для связи? Всё считается в браузере по данным NASA.

**Главное для жюри**
- **Mission Rescue.** Вводим план и задержку пуска; инструмент перебирает все 10 южных станций на каждый день рядом и даёт три лучшие альтернативы с баллом 0–100 и объяснением. Пример: Shackleton rim с задержкой 30 дней — 44 балла, предложен Malapert — 80.
- **Точность посадки.** В 250 м от гребня Shackleton балл падает с 71 до 1, а плато Mons Mouton держит 90–100. Это объясняет, почему малые изменения решают всё.
- **Соседи.** Уже лежащее оборудование (зонд Chandrayaan‑1 в 5 км от Connecting Ridge, LCROSS, IM‑1, IM‑2) и планы других миссий (Chang’e‑7, Blue Moon MK1, Griffin‑1, Artemis), зона безопасности 2 км, ссылка на реестр Lunar Ledger.
- **Точность расчёта.** Против JPL Horizons максимум 0,004° на 130 сравнениях. Освещённость за год: 85,4% против 88,0% и 84,3% против 82,1% опубликованных. 42 автотеста.
- **Для всех.** Режим Simple, 3D‑рельеф полюса с настоящими тенями, таймлапс лунного дня, вид с поверхности на Землю, тур на 30 секунд, «Moon vs Earth».

**Видео.** Нажать «▶ 30-second tour» на главной и записать экран. По желанию добавить 5 секунд страницы Rescue (+30 дней).

**Слайды.** План из 7 слайдов в разделе 9. Тексты для страницы сдачи — в `SUBMISSION.md`.

**Ограничения.**
- Точные горизонты есть только для готовых станций.
- Связь считается только по геометрии, без DSN и ретрансляторов.
- Батарея — упрощённая модель.
- Планы других миссий указаны по регионам.
