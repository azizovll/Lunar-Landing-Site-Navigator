# Space Apps 2026 submission texts

Ready to paste into the project page.

---

## Project name

Lunar Site Navigator

## High-level summary

Lunar Site Navigator answers a mission planner's most urgent question in seconds: if we land at this site on this date, or the launch slips, will we still have sunlight for power and Earth in view for a direct radio link? For any south-pole site and date it shows the real Sun and Earth over the real terrain horizon, computed in the browser from NASA LOLA elevation data and checked against NASA JPL Horizons to within 0.004°. When the schedule changes, Mission Rescue scores every candidate site on every nearby day and proposes the three best alternatives, each with a 0–100 score and a one-line reason. It also shows why tiny changes matter: 250 m off the best ridge, a site can lose most of its sunlight. A plain-language Simple mode, a 3D view of the polar terrain and a 30-second guided tour make the same answers clear to students and the public.

## Links

- Live app: https://lunar-landing-site-navigator-psi.vercel.app
- Source code: https://github.com/azizovll/Lunar-Landing-Site-Navigator

## Detailed project description

**What it does**

- **Site view.** For any of 13 preset sites (10 near the south pole) or any custom point:
  - a 360° panorama of the sky over the real terrain horizon, with the Sun and Earth at their true angular sizes and their tracks;
  - the solar elevation, large;
  - countdowns to sunset and to “Earthset”;
  - a 30-day timeline of light, comms and both;
  - a battery simulation for a reference lander;
  - a one-line verdict.
- **Mission Rescue.** Enter the planned site, date and launch delay. The tool scores every south-pole site on every day within ±3, 7 or 14 days of the new date and ranks them. Example: Shackleton rim planned for 1 Dec 2026 and delayed 30 days scores 44/100; the tool proposes Malapert massif at 80/100 instead, with the reason in words.
- **Compare.** Up to four site-and-date scenarios side by side, the best value per row highlighted, and a launch-delay slider (0–60 days) showing what gets better or worse.
- **Landing precision.** Landers miss their targets (IM-1 Odysseus landed about 1.5 km away). For every polar site we computed full-resolution terrain horizons at six points 250 m and 1 km away. For a 14-day mission starting 15 Dec 2026, Shackleton rim drops from 71 to 1 just 250 m off the crest, while the Mons Mouton plateau stays at 90–100.
- **Who else is here.** Hardware already on the surface near each site and planned missions targeting the same regions, each with a source and a 2 km plume safety zone. For example, the Chandrayaan-1 impact probe lies 5 km from Connecting Ridge, and Chang’e-7 and Blue Moon MK1 both target that area.
- **3D south-pole terrain.** Built from LOLA and lit by the real Sun with long shadows:
  - a lunar-day timelapse;
  - a “stand on the surface” view facing Earth;
  - lander models whose panels track the Sun;
  - NASA images of every station;
  - a 30-second guided tour.
- **Calendar.** A 12-month heatmap of light and comms with the best 14-day mission starts.
- **Validation page.** Our numbers against JPL Horizons, plus a live re-check.
- **Simple and Pro modes.** Plain language for the public; every number, azimuths, CSV export, shareable links and PDF reports for planners.

**How it works**

- **Sun and Earth positions.** Computed with astronomy-engine and the IAU lunar rotation model, which includes libration, so Earth's wobble in the lunar sky is reproduced.
- **Terrain horizon for each site.** 1440 rays every 0.25°, out to 200 km, through NASA LOLA polar DEMs at 20, 40, 80 and 240 m per pixel. The geometry is exact on the curved Moon, with no atmosphere and therefore no refraction: the horizon is only terrain and curvature.
- **Partial Sun.** The solar disk is cut into strips, each tested against the horizon at its own azimuth, so a partly hidden Sun is handled correctly.
- **Comms.** Comms are available when Earth's centre is at least 2° above the terrain horizon.
- **Score.** The 0–100 score combines illumination, comms, the longest night and the longest blackout.
- **Runs in the browser.** No accounts, no database; the URL is the saved state.

**Accuracy**

- **Positions:** 130 comparisons against NASA JPL Horizons (5 sites, 1969 and 2026, Sun and Earth). Maximum error 0.004°, RMS 5.6 arcseconds. The target was 0.1°.
- **Apollo 11 check:** at the 1969 landing the Sun is low in the east at 10.7°, as recorded.
- **Annual illumination vs Gläser et al. (NASA):**

  | Site | Ours | Published |
  | --- | --- | --- |
  | Connecting Ridge | 85.4% | 88.0% |
  | Shackleton rim | 84.3% | 82.1% |

  The Shackleton crater floor gets 0%, as a permanently shadowed region should.
- **DEM orientation:** checked against five known craters.
- **Tests:** 42 automated tests.

**Why it matters**

Near the lunar pole the Sun skims the horizon and Earth hangs low and wobbles, so a few hundred metres or a few days can decide whether a lander has power and contact. Schedules slip all the time. Lunar Site Navigator turns a slip from days of re-analysis into seconds, shows engineers and scientists the same numbers, and shows students and the public why landing near the pole is so hard.

## Use of artificial intelligence

The team defined the problem, wrote the specification, chose the methods and data sources, and reviewed every result. An AI coding assistant (Claude Code by Anthropic) generated most of the source code, the Python terrain pipeline and the documentation under that specification. All numbers come from NASA data and are checked independently, not by AI:

- Sun and Earth positions are tested against saved JPL Horizons answers in automated tests.
- The DEM orientation is verified on five craters.
- Illumination results are compared with a published NASA study.

No AI-generated images, video or voices are used; all imagery is from NASA or computed from NASA data.

## NASA data

- **LRO LOLA polar gridded DEMs** (PDS LOLA_GDR/POLAR: LDEM_875S_20M, LDEM_85S_40M, LDEM_80S_80M, LDEM_75S_240M): terrain horizons, 3D terrain, maps.
- **NASA JPL Horizons API**: reference Sun and Earth positions (saved test fixtures and live re-check).
- **Gläser et al., Illumination conditions at the lunar poles** (NASA NTRS 20170007365): site coordinates and published illumination for validation.
- **NASA Scientific Visualization Studio**: Artemis III candidate regions (5013), Shackleton crater (4716), Mons Mouton (5074), CGI Moon Kit (4720).
- **LROC (Lunar Reconnaissance Orbiter Camera)**: landing-site images and coordinates (IM-1 Odysseus, IM-2, Chandrayaan-3).
- **NASA Blue Marble**: Earth texture in the 3D view.
- **NASA LRO Diviner**: lunar surface temperatures in the Moon vs Earth section.
- **NASA Artemis site-selection update** (LPSC 2026): candidate regions.

## Space agency partner and other data

- **KARI** (Korea): ShadowCam image of the permanently shadowed Shackleton crater floor, flown on KARI’s Danuri (KPLO) orbiter (NASA/KARI/ASU).
- **JAXA** (Japan): Kaguya (SELENE) topography-based site coordinates (Leibnitz β plateau, Noda et al. 2008).
- **ISRO** (India): Chandrayaan-3 Vikram landing site and the Chandrayaan-1 Moon Impact Probe impact location (Stooke et al. 2021).
- **Other**:
  - astronomy-engine (MIT licence);
  - Open Lunar Foundation’s Lunar Ledger (linked for live mission data);
  - published mission reports (SpaceNews, LPSC abstracts) for planned missions.
