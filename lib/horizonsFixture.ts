/** Parse Horizons calendar strings like "1969-Jul-20 20:17" as UTC. */
const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export function parseHorizonsUtc(s: string): Date {
  const m = s.match(/^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/);
  if (!m) throw new Error("bad date " + s);
  return new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5]));
}

/** Smallest signed difference a-b in degrees, wrapped to [-180, 180). */
export function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}
