/**
 * Thin, validated proxy to the JPL Horizons API (the browser cannot call it directly: no CORS).
 * Only topocentric az/el (QUANTITIES=4) of the Sun or Earth from a lunar surface point is allowed.
 * GET /api/horizons?lat=-89.78&lon=204.7&body=sun&start=2026-12-01&stop=2026-12-05&step=1d
 */
const BODIES: Record<string, string> = { sun: "10", earth: "399" };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const body = q.get("body") ?? "";
  const start = q.get("start") ?? "";
  const stop = q.get("stop") ?? "";
  const step = q.get("step") ?? "1d";
  const dateRe = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || !BODIES[body] || !dateRe.test(start) || !dateRe.test(stop) || !/^\d{1,3}[hdm]$/.test(step)) {
    return Response.json({ error: "invalid parameters" }, { status: 400 });
  }
  const lonE = ((lon % 360) + 360) % 360;
  const params = new URLSearchParams({
    format: "json",
    EPHEM_TYPE: "OBSERVER",
    CENTER: "'coord@301'",
    COORD_TYPE: "GEODETIC",
    SITE_COORD: `'${lonE},${lat},0'`,
    COMMAND: `'${BODIES[body]}'`,
    QUANTITIES: "'4'",
    APPARENT: "AIRLESS",
    ANG_FORMAT: "DEG",
    CSV_FORMAT: "YES",
    OBJ_DATA: "NO",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
  });
  try {
    const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`, { signal: AbortSignal.timeout(20_000) });
    const json = (await res.json()) as { result?: string };
    const block = json.result?.split("$$SOE")[1]?.split("$$EOE")[0];
    if (!block) return Response.json({ error: "Horizons returned no ephemeris", detail: json.result?.slice(0, 500) }, { status: 502 });
    const rows = block
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const c = line.split(",").map((s) => s.trim());
        return { utc: c[0], az: Number(c[3]), el: Number(c[4]) };
      });
    return Response.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
  } catch (e) {
    return Response.json({ error: "Horizons unavailable", detail: String(e) }, { status: 503 });
  }
}
