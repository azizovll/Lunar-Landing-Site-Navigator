"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DAY, DEFAULT_SETTINGS, alignTime, type WindowMetrics } from "@/lib/metrics";
import { rescue, type Candidate } from "@/lib/rescue";
import { LIGHT_COLOR, light, why } from "@/lib/score";
import { plainDuration, plainShare } from "@/lib/plain";
import { fmtHours, parseUtc, toUtcInput } from "@/lib/format";
import { SITES, getSite, resolvePreset } from "@/lib/sites";
import { useUrlState } from "@/lib/useUrlState";
import { ProOnly, Tip, useMode } from "./ModeProvider";
import { SectionTitle } from "./ui";
import { KEEP_OUT_KM, fmtKm, neighborsOf, type SiteNeighbors } from "@/lib/neighbors";
import { PrintButton, PrintHeader } from "./PrintReport";

const SOUTH = SITES.filter((s) => s.lat <= -80);
const FLEX = [3, 7, 14];

export function RescueView() {
  const { params, set } = useUrlState();
  const { mode } = useMode();
  const simple = mode === "simple";
  const [today] = useState(() => alignTime(Date.now(), DAY));

  const requested = getSite(params.get("site"));
  const planId = requested && requested.lat <= -80 ? requested.id : "shackleton-rim";
  const planStart = parseUtc(params.get("date")) ?? today;
  const delay = Math.max(0, Math.min(60, Number(params.get("delay") ?? 14)));
  const flex = FLEX.includes(Number(params.get("flex"))) ? Number(params.get("flex")) : 7;
  const windowDays = DEFAULT_SETTINGS.windowDays;

  const result = useMemo(
    () =>
      rescue({
        sites: SOUTH.map((s) => ({ ...resolvePreset(s), id: s.id })),
        planSiteId: planId,
        planStart,
        delayDays: delay,
        flexDays: flex,
        settings: DEFAULT_SETTINGS,
      }),
    [planId, planStart, delay, flex],
  );
  const newStart = planStart + delay * DAY;
  // Neighbours: hardware inside the plume safety zone, and planned missions targeting the same area.
  const avoid = params.get("avoid") !== "0";
  const nbOf = (id: string) => {
    const site = getSite(id)!;
    return neighborsOf(id, site.lat, site.lon);
  };
  const ranked = avoid
    ? [...result.ranked].sort((a, b) => Number(nbOf(a.siteId).inKeepOut.length > 0) - Number(nbOf(b.siteId).inKeepOut.length > 0))
    : result.ranked;
  const top = ranked.slice(0, 3);
  const name = (id: string) => getSite(id)?.name ?? id;
  const planName = name(planId);

  return (
    <div className="flex flex-col gap-10">
      <PrintHeader title={`Mission rescue: ${planName}, launch +${delay} days`} />
      <SectionTitle
        as="h1"
        center
        eyebrow="Mission rescue"
        title={
          <>
            Launch slipped?
            <br />
            Find the best alternative
          </>
        }
        sub="Tell us the original plan and how late the launch is. We check every south-pole site on every day around the new date and rank them by sunlight and contact with Earth."
      />

      {/* inputs */}
      <section className="card grid gap-5 p-5 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Planned site</span>
          <select value={planId} onChange={(e) => set({ site: e.target.value })}>
            {SOUTH.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Planned landing date (UTC)</span>
          <input type="date" value={toUtcInput(planStart, false)} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-baseline justify-between text-muted">
            Launch delay
            <span className="num text-xl text-foreground">+{delay} d</span>
          </span>
          <input type="range" min={0} max={60} value={delay} onChange={(e) => set({ delay: e.target.value })} aria-label="Launch delay in days" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Search dates</span>
          <select value={flex} onChange={(e) => set({ flex: e.target.value })} aria-label="Date flexibility">
            {FLEX.map((f) => (
              <option key={f} value={f}>
                ±{f} days
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted md:col-span-4">
          <input type="checkbox" checked={avoid} onChange={(e) => set({ avoid: e.target.checked ? null : "0" })} />
          Avoid the {KEEP_OUT_KM} km safety zone around hardware already on the surface (landers, impact sites)
        </label>
      </section>

      {/* the problem */}
      <section className="grid gap-3 md:grid-cols-2">
        <PlanTile label="Original plan" sub={`${planName} · ${toUtcInput(planStart, false)}`} c={result.onTime} />
        <PlanTile label={`Same site, ${delay} days later`} sub={`${planName} · ${toUtcInput(newStart, false)}`} c={result.delayedPlan} delta={result.delayedPlan.score - result.onTime.score} />
      </section>
      <Tip>
        The score (0–100) mixes three things: how much of the time the solar panels get light, how much of the time Earth is above the hills for a radio link, and how long the worst
        darkness and the worst silence last. 70+ is green, 40–69 amber, below 40 red.
      </Tip>

      {/* top 3 */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="display text-xl sm:text-2xl">Best alternatives</h2>
          <PrintButton />
          <span className="text-xs text-muted">
            {SOUTH.length} sites × {2 * flex + 1} landing days around {toUtcInput(newStart, false)}, {windowDays}-day mission
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {top.map((c, i) => (
            <AltCard
              key={c.siteId}
              rank={i + 1}
              c={c}
              name={name(c.siteId)}
              newStart={newStart}
              plan={result.delayedPlan}
              planId={planId}
              simple={simple}
              windowDays={windowDays}
              atEdge={Math.abs(Math.round((c.start - newStart) / DAY)) === flex && flex < 14}
              onWiden={() => set({ flex: 14 })}
              nb={nbOf(c.siteId)}
            />
          ))}
        </div>
      </section>

      {/* every site */}
      <section className="card overflow-x-auto p-5">
        <h2 className="display mb-3 text-sm tracking-[0.2em]">All sites, best day each</h2>
        <table className="w-full min-w-[620px] text-sm [&_td]:pr-4 [&_th]:pr-4 [&_td]:align-middle">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-normal">#</th>
              <th className="font-normal">Site</th>
              <th className="font-normal">Best landing day</th>
              <th className="font-normal">Score</th>
              <th className="font-normal">Why</th>
              <th className="font-normal">Neighbours</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => (
              <tr key={c.siteId} className={`border-t border-line ${c.siteId === planId ? "bg-white/[0.03]" : ""}`}>
                <td className="py-2 text-muted">{i + 1}</td>
                <td>
                  {name(c.siteId)}
                  {c.siteId === planId && <span className="ml-1.5 text-xs text-muted">(planned)</span>}
                </td>
                <td className="tabular">
                  {toUtcInput(c.start, false)} <span className="text-xs text-muted">{dayShift(c.start, newStart)}</span>
                </td>
                <td>
                  <ScoreChip value={c.score} />
                </td>
                <td className="py-2 text-xs leading-snug text-foreground/75">{why(c.metrics)}</td>
                <td className="py-2">
                  <NeighborTags nb={nbOf(c.siteId)} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ProOnly>
        <p className="text-xs text-muted">
          Score = 0.4 × illumination% × (1 − 0.5·min(1, longest night / 120 h)) + 0.4 × comms% × (1 − 0.5·min(1, longest blackout / 96 h)) + 0.2 × light-and-comms%. Sampling 1 h;
          comms margin {DEFAULT_SETTINGS.marginDeg}° above the LOLA terrain horizon; sun-tracking panel.
        </p>
      </ProOnly>
    </div>
  );
}

function dayShift(start: number, newStart: number): string {
  const d = Math.round((start - newStart) / DAY);
  return d === 0 ? "(new date)" : `(${d > 0 ? "+" : ""}${d} d)`;
}

function ScoreChip({ value, big = false }: { value: number; big?: boolean }) {
  const color = LIGHT_COLOR[light(value)];
  return (
    <span className={`inline-flex items-center gap-2 ${big ? "" : "tabular"}`}>
      <span className="inline-block rounded-full" style={{ background: color, width: big ? 12 : 8, height: big ? 12 : 8, boxShadow: `0 0 10px ${color}` }} aria-hidden />
      <span className={big ? "num text-4xl" : "num"}>{value}</span>
      {big && <span className="text-xs text-muted">/ 100</span>}
    </span>
  );
}

function PlanTile({ label, sub, c, delta }: { label: string; sub: string; c: Candidate; delta?: number }) {
  return (
    <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="eyebrow !text-[0.6rem] !tracking-[0.3em] text-muted">{label}</div>
        <div className="mt-1.5 text-sm">{sub}</div>
        <div className="mt-1 text-xs text-muted">{why(c.metrics)}</div>
      </div>
      <div className="text-right">
        <ScoreChip value={c.score} big />
        {delta !== undefined && delta !== 0 && (
          <div className={`mt-1 text-xs ${delta > 0 ? "text-good" : "text-poor"}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs on time
          </div>
        )}
      </div>
    </div>
  );
}

function AltCard({
  rank,
  c,
  name,
  newStart,
  plan,
  planId,
  simple,
  windowDays,
  atEdge,
  nb,
  onWiden,
}: {
  rank: number;
  c: Candidate;
  name: string;
  newStart: number;
  plan: Candidate;
  planId: string;
  simple: boolean;
  windowDays: number;
  atEdge: boolean;
  nb: SiteNeighbors;
  onWiden: () => void;
}) {
  const gain = c.score - plan.score;
  const m: WindowMetrics = c.metrics;
  const date = toUtcInput(c.start, false);
  return (
    <article className={`card flex flex-col gap-4 p-5 ${rank === 1 ? "border-line-strong" : ""}`} style={rank === 1 ? { borderTop: `1px solid ${LIGHT_COLOR[light(c.score)]}` } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="num text-4xl text-transparent" style={{ WebkitTextStroke: "1px var(--muted)" }}>
          {String(rank).padStart(2, "0").replace("0", "Ø")}
        </div>
        <ScoreChip value={c.score} big />
      </div>
      <div>
        <h3 className="display text-lg">{name}</h3>
        <div className="mt-1 text-sm text-muted">
          Land {date} <span className="text-xs">{dayShift(c.start, newStart)}</span>
          {c.siteId === planId && <span className="ml-1.5 text-xs">· same site, different day</span>}
        </div>
        {atEdge && (
          <button onClick={onWiden} className="mt-1 text-left text-xs text-marginal underline underline-offset-4">
            Best day is at the edge of the search window: search ±14 days
          </button>
        )}
      </div>
      <p className="text-sm leading-relaxed">{why(m)}.</p>
      <NeighborTags nb={nb} />
      {gain !== 0 && (
        <div className={`text-sm ${gain > 0 ? "text-good" : "text-poor"}`}>
          {gain > 0 ? "▲" : "▼"} {Math.abs(gain)} points vs keeping the plan and landing late
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Stat k="☀ Sunlight" v={simple ? plainShare(m.illuminationPct, windowDays) : `${m.illuminationPct.toFixed(1)}%`} />
        <Stat k="⊕ Earth in view" v={simple ? plainShare(m.commsPct, windowDays) : `${m.commsPct.toFixed(1)}%`} />
        <Stat k="Longest darkness" v={simple ? plainDuration(m.longestNightH) : fmtHours(m.longestNightH)} />
        <Stat k="Longest silence" v={simple ? plainDuration(m.longestBlackoutH) : fmtHours(m.longestBlackoutH)} />
      </dl>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link href={`/?site=${c.siteId}&start=${date}#sky`} className="btn btn-solid flex-1 !py-1.5 text-xs">
          Open sky view
        </Link>
        <Link href={`/compare?a=${planId}:${toUtcInput(newStart, false)}&b=${c.siteId}:${date}`} className="btn flex-1 !py-1.5 text-xs">
          Compare with plan
        </Link>
      </div>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="frame p-2.5">
      <dt className="text-muted">{k}</dt>
      <dd className="mt-1 text-foreground">{v}</dd>
    </div>
  );
}

/** Small tags: hardware inside the safety zone (red) and planned missions targeting the same area (amber). */
function NeighborTags({ nb, compact = false }: { nb: SiteNeighbors; compact?: boolean }) {
  const near = nb.hardware[0];
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "text-xs"}`}>
      {nb.inKeepOut.map((h) => (
        <span key={h.id} className="border border-poor/60 px-1.5 py-0.5 text-xs text-poor" title={h.note}>
          ⚠ {h.name.split(" (")[0]} {fmtKm(h.km)} away
        </span>
      ))}
      {nb.planned.length > 0 && (
        <span className="border border-marginal/50 px-1.5 py-0.5 text-xs text-marginal" title={nb.planned.map((p) => `${p.name}: ${p.date}`).join("; ")}>
          Also targeted by {nb.planned.map((p) => p.name.split(" (")[0]).join(", ")}
        </span>
      )}
      {!nb.inKeepOut.length && !nb.planned.length && (
        <span className="text-xs text-muted">{near ? `Nearest hardware ${fmtKm(near.km)}` : "No known neighbours"}</span>
      )}
    </div>
  );
}
