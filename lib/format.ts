export function fmtUtc(t: number, withTime = true): string {
  const d = new Date(t);
  const iso = d.toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso.slice(0, 10);
}

/** "in 3 d 4 h", "in 25 min", "2 d 1 h ago" */
export function fmtRelative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  let s: string;
  if (d > 0) s = `${d} d ${h} h`;
  else if (h > 0) s = `${h} h ${m} min`;
  else s = `${m} min`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export function fmtHours(h: number): string {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export const fmtDeg = (v: number, digits = 2) => `${v.toFixed(digits)}°`;
export const fmtPct = (v: number) => `${v.toFixed(0)}%`;

export function compass(az: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as UTC. */
export function parseUtc(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export function toUtcInput(t: number, withTime = true): string {
  const iso = new Date(t).toISOString();
  return withTime ? iso.slice(0, 16) : iso.slice(0, 10);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => (typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
