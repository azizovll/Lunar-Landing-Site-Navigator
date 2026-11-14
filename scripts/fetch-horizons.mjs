// Fetch JPL Horizons topocentric az/el of the Sun and Earth for lunar surface sites.
// Usage: node scripts/fetch-horizons.mjs   (writes tests/fixtures/horizons-*.json)
import { writeFileSync } from "node:fs";

const SITES = [
  { id: "apollo-11", lat: 0.67408, lon: 23.47297 },
  { id: "shackleton-rim", lat: -89.7815, lon: 204.70 },
  { id: "malapert-massif", lat: -86.04, lon: 2.7 },
  { id: "chandrayaan3-vikram", lat: -69.373, lon: 32.319 },
  { id: "apollo-17", lat: 20.1908, lon: 30.7717 },
];
const WINDOWS = [
  { start: "1969-07-20 20:17", stop: "1969-07-21 20:17", step: "6 h" },
  { start: "2026-12-01 00:00", stop: "2026-12-29 00:00", step: "4 d" },
];
const BODIES = { sun: "10", earth: "399" };

function q(s) { return `'${s}'`; }

async function fetchOne(site, body, win) {
  const lonE = ((site.lon % 360) + 360) % 360;
  const p = new URLSearchParams({
    format: "json", EPHEM_TYPE: "OBSERVER", CENTER: q("coord@301"), COORD_TYPE: "GEODETIC",
    SITE_COORD: q(`${lonE},${site.lat},0`), COMMAND: q(BODIES[body]), QUANTITIES: q("4"),
    APPARENT: "AIRLESS", ANG_FORMAT: "DEG", CSV_FORMAT: "YES", TIME_DIGITS: "MINUTES",
    START_TIME: q(win.start), STOP_TIME: q(win.stop), STEP_SIZE: q(win.step), OBJ_DATA: "NO",
  });
  const url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + p.toString();
  const res = await fetch(url);
  const json = await res.json();
  const text = json.result;
  const block = text.split("$$SOE")[1]?.split("$$EOE")[0];
  if (!block) throw new Error(`No ephemeris for ${site.id} ${body}: ${text.slice(0, 2000)}`);
  const rows = block.trim().split(/\r?\n/).map((line) => {
    const c = line.split(",").map((s) => s.trim());
    // columns: date, solar-presence flag, interfering-body flag, azimuth, elevation
    return { utc: c[0], az: Number(c[3]), el: Number(c[4]) };
  });
  return { url, rows };
}

const out = { source: "JPL Horizons API https://ssd.jpl.nasa.gov/api/horizons.api", fetched: new Date().toISOString(), settings: "EPHEM_TYPE=OBSERVER CENTER=coord@301 COORD_TYPE=GEODETIC QUANTITIES=4 APPARENT=AIRLESS", sites: [] };
for (const site of SITES) {
  const entry = { ...site, sun: [], earth: [], urls: [] };
  for (const win of WINDOWS) for (const body of ["sun", "earth"]) {
    const r = await fetchOne(site, body, win);
    entry[body].push(...r.rows);
    entry.urls.push(r.url);
  }
  out.sites.push(entry);
  console.log(site.id, entry.sun.length, entry.earth.length, entry.sun[0]);
}
writeFileSync("tests/fixtures/horizons.json", JSON.stringify(out, null, 1));
