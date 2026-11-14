# Lunar Site Navigator

**Team infinium · NASA Space Apps Challenge 2026 · “Lunar Landing Site Navigator”**

A web app that answers a mission planner's question in seconds: *if we land at this site on this date, or the launch slips a few weeks, will we have enough sunlight and a direct radio link to Earth?*

It shows the Sun and Earth over the **real terrain horizon** of lunar south-pole sites (from NASA LOLA elevation data) and turns that geometry into power and communication metrics that you can compare side by side. Everything runs in the browser. There is no database, and the URL holds the state.

## Screens

| Screen | What it does |
| --- | --- |
| **Site** (home) | Clickable south-polar map with site list; 360° panoramic sky with terrain profile, Sun and Earth disks and their tracks; 1:1 close-ups; time scrubber with playback; Power / Comms / Combined cards with countdowns; 30-day light/comms timeline |
| **Mission rescue** | Launch slipped by N days? Scores every south-pole site on every day around the new date (0–100 with a traffic light and a one-line reason) and shows the 3 best alternatives against the delayed plan |
| **Who else is here** (on Site, Rescue, 3D) | Hardware already on the surface and planned missions near each site, 2 km plume safety zone, link to the Lunar Ledger registry |
| **Landing precision** (on Site) | Score on target vs 250 m or 1 km off in six directions, from full-resolution LOLA horizons: shows whether a site needs a precise landing |
| **Battery** (on Site) | Reference lander (300 W panels, 2 kWh, 120 W load) charged by the real sunlight series: lowest charge and hours without power |
| **3D extras** | ▶ Lunar day timelapse (real Sun and shadows), “Stand on the surface” facing Earth, and a 30-second guided tour with captions |
| **Compare** | Up to 4 “site + date” scenarios, best value per row highlighted, launch-delay slider (0–60 days) with better/worse arrows |
| **Calendar** | 12-month heatmap of daily light and comms; best 14-day mission starts; click a day to open it |
| **Validation** | Our Sun/Earth positions vs saved JPL Horizons answers, a live Horizons re-check, and illumination compared with a published LOLA study |
| **About** | Method, metric definitions, data sources, use of AI |

**Simple / Pro** toggle (top right):
- **Simple** (default) is for everyone: a one-sentence verdict, four tiles rated in words (“all 14 days”, “4 days 16 hours”), what the Sun and Earth are doing right now in plain language, a day-by-day strip and a short “New to the Moon?” explainer. Compare shows a quick answer (“most sunlight: …”) and plain wording.
- **Pro** is for planners: every number, azimuths and elevations, power index, comms margin, 30-day clearance chart, CSV export and share links.

The home page opens with an interactive **3D view of the south-polar terrain** (three.js): NASA LOLA relief (×2) on the true lunar curvature, lit by the real Sun at the selected time with long shadows, Earth in the sky at its real direction (phase from the same Sun), and pins for every site; clicking a pin flies the camera there. Fine relief comes from a ~430 m/px LOLA normal map lit by the same Sun; lander models (built from primitives, no model files, ~300× real size) turn their solar panels to the real Sun and point their dishes at the real Earth. Hovering a pin (or tapping it on a phone) shows a thumbnail with the NASA image and a one-line description; clicking flies the camera there, and a "Photo & details" button opens the full station card: a NASA image of the site, a plain-language description, sunlight and Earth-visibility for the next 14 days, previous/next buttons and a list of all stations.

## Accuracy

- Sun and Earth topocentric az/el vs **JPL Horizons**: 130 comparisons across 5 sites × 13 epochs × Sun and Earth. Max error is **0.004°**, RMS 5.6″. The target was ≤ 0.1°.
- Apollo 11 landing (1969-07-20 20:17 UTC): Sun at az 88.8°, el 10.7°, low in the east as expected.
- Annual illumination from our LOLA horizon masks compared with Gläser et al. 2018:
  - Connecting Ridge: **85.4%** (published 88.0%)
  - Shackleton rim: **84.3%** (published 82.1%)
  - Shackleton floor (a permanently shadowed region): 0%.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: Horizons fixtures, metrics, terrain acceptance
npm run build
```

- Terrain pipeline (Python + numpy): see [pipeline/README.md](pipeline/README.md). Generated files are committed under `public/data/`, so the app needs no Python to run.
- Refresh the Horizons fixtures: `node scripts/fetch-horizons.mjs`.
- Headless page check: `node scripts/check-pages.mjs http://localhost:3000`.

## Code map

- `lib/astro.ts`: Sun and Earth positions from the Moon's surface (astronomy-engine plus the IAU lunar frame with libration).
- `lib/metrics.ts`: visible solar fraction, illumination, nights, power index, comms, blackouts, verdicts.
- `lib/horizonCore.ts` + `lib/horizon.worker.ts`: approximate horizon for custom points, computed in a Web Worker.
- `pipeline/`: horizon masks from LOLA polar DEMs (with an orientation check on five craters).
- `app/api/horizons/route.ts`: validated proxy to JPL Horizons for the live re-check.

See [PRESENTATION_NOTES.md](PRESENTATION_NOTES.md) for the full write-up.
