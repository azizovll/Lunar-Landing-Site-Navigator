"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Launch point on the Moon's limb, as % of the hero Moon image (disk centre 50/50, radius 50).
 * At 225° the local vertical points exactly up-left, so the rocket stands at −45°, square to the surface.
 */
const LIMB_DEG = 225;
const TILT = LIMB_DEG - 270; // −45°
const LAUNCH = { x: 50 + 50 * Math.cos((LIMB_DEG * Math.PI) / 180), y: 50 + 50 * Math.sin((LIMB_DEG * Math.PI) / 180) };
/** The hero eyebrow ornament (ui.tsx, Pulse): viewBox 96×24, drawn right to left by the rocket. */
const PULSE = [
  [96, 12],
  [53, 12],
  [48, 20],
  [43, 4],
  [38, 12],
  [0, 12],
];
const LIFT_START = 1400; // ms after mount: ignition at 900, lift-off at 1400
const LIFT_MS = 900; // slow, heavy climb along the local vertical
const BURN_MS = 2300; // constant acceleration for the rest of the flight
const LIFT_PX = 30;

interface Flight {
  d: string; // full flight path, relative to the pad
  approach: string; // the part before the ornament (its length is where drawing starts)
  pulse: string; // the ornament, relative to the pad
  strokeW: number;
}
const SEEN_KEY = "lsn-rocket-intro";

/** Builds the flight from the pad (the intro box) to the hero ornament, in px relative to the pad. */
function buildFlight(target: SVGSVGElement, box: DOMRect): Flight {
  const L = { x: box.left + (box.width * LAUNCH.x) / 100, y: box.top + (box.height * LAUNCH.y) / 100 };
  const t = target.getBoundingClientRect();
  const P = PULSE.map(([x, y]) => [t.left + (x / 96) * t.width - L.x, t.top + (y / 24) * t.height - L.y]);
  const [rx, ry] = P[0];
  const lx = P[P.length - 1][0];
  const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  const cruise = Math.max(ry - 26, header + 14 - L.y); // above the eyebrow text, under the sticky header
  const f = (n: number) => n.toFixed(1);
  const approach = `M0 0 L-20 -20 C-34 -34 -60 ${f(cruise)} -110 ${f(cruise)} L${f(rx + 60)} ${f(cruise)} C${f(rx + 28)} ${f(cruise)} ${f(rx + 22)} ${f(ry)} ${f(rx)} ${f(ry)}`;
  const pulse = `M${P.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")}`;
  const exit = `C${f(lx - 40)} ${f(ry)} ${f(lx - 90)} ${f(ry - 14)} ${f(lx - 260)} ${f(ry - 40)}`;
  return { d: `${approach} ${pulse.replace(/^M[^L]+/, "")} ${exit}`, approach, pulse, strokeW: (1.2 * t.width) / 96 };
}

/** Shows the real ornament (end of the intro, or no intro at all). */
const showPulse = () => document.querySelector(".hero-pulse")?.classList.add("hero-pulse-shown");

/**
 * Hero intro: a line-art rocket on a pad at the Moon's edge blinks, ignites and lifts off square to the
 * surface, turns left, flies over the headline and draws the eyebrow's pulse line as its trail. The
 * real ornament is hidden until then (globals.css, .hero-pulse) and stays afterwards. Desktop only,
 * skipped for reduced motion and when the page does not open at the top; plays once per browser session
 * (~5 s) and never blocks clicks. Any failure shows the ornament at once.
 */
export function RocketIntro() {
  const root = useRef<HTMLDivElement>(null);
  const geo = useRef<SVGPathElement>(null);
  const rocket = useRef<HTMLDivElement>(null);
  const hot = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [done, setDone] = useState(false);

  // 1. decide whether to play, measure the pad and the ornament, build the path
  useEffect(() => {
    const target = document.querySelector<SVGSVGElement>(".hero-pulse");
    const box = root.current?.getBoundingClientRect();
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    let next: Flight | null = null;
    const play =
      target &&
      box &&
      box.width > 0 &&
      !seen &&
      window.scrollY <= 40 && // opened scrolled down (e.g. a reload mid-page): the hero is not on screen
      window.matchMedia("(min-width: 640px) and (prefers-reduced-motion: no-preference)").matches;
    if (play) {
      try {
        next = buildFlight(target, box);
      } catch {
        next = null;
      }
    }
    if (!next) showPulse();
    const id = requestAnimationFrame(() => (next ? setFlight(next) : setDone(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // 2. fly: position, attitude, hot streak and the ornament drawn behind the engine
  useEffect(() => {
    if (!flight || !geo.current) return;
    const path = geo.current;
    let total: number, pulseFrom: number, pulseLen: number;
    try {
      // measure on paths that are in the document (detached SVG paths are not measurable everywhere)
      const probe = (d: string) => {
        const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("d", d);
        path.parentNode!.appendChild(el);
        const len = el.getTotalLength();
        el.remove();
        return len;
      };
      total = path.getTotalLength();
      pulseFrom = probe(flight.approach);
      pulseLen = probe(flight.pulse);
      if (trail.current) {
        trail.current.style.strokeDasharray = String(pulseLen);
        trail.current.style.strokeDashoffset = String(pulseLen);
      }
    } catch {
      showPulse();
      const id = requestAnimationFrame(() => setDone(true));
      return () => cancelAnimationFrame(id);
    }
    // mark as seen only once the flight really starts (effects can run twice in development)
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const accel = (2 * (total - LIFT_PX - ((2 * LIFT_PX) / LIFT_MS) * BURN_MS)) / (BURN_MS * BURN_MS);
    const v0 = (2 * LIFT_PX) / LIFT_MS;
    const at = (s: number) => path.getPointAtLength(Math.max(0, Math.min(total, s)));
    let angle = TILT;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0 - LIFT_START;
      const s = t <= 0 ? 0 : t < LIFT_MS ? LIFT_PX * (t / LIFT_MS) ** 2 : LIFT_PX + v0 * (t - LIFT_MS) + 0.5 * accel * (t - LIFT_MS) ** 2;
      const p = at(s);
      // attitude from a chord around the rocket, smoothed so the blip makes it wobble, not flip
      const a = at(s - 8);
      const b = at(s + 8);
      const target = s < 1 ? TILT : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
      const diff = ((target - angle + 540) % 360) - 180;
      angle += diff * 0.22;
      if (rocket.current) {
        rocket.current.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)`;
        rocket.current.style.opacity = String(Math.max(0, Math.min(1, (total - s) / 120)));
      }
      if (hot.current) hot.current.style.strokeDashoffset = String(18 - s);
      if (trail.current) {
        const k = Math.max(0, Math.min(1, (s - pulseFrom) / pulseLen));
        trail.current.style.strokeDashoffset = String(pulseLen * (1 - k));
      }
      if (s >= total) {
        // hand over to the real ornament (same shape and place), then remove the intro
        showPulse();
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [flight]);

  if (done) return null;
  return (
    <div ref={root} className="rocket-intro pointer-events-none absolute inset-0" aria-hidden>
      {flight && (
        <div className="absolute" style={{ left: `${LAUNCH.x}%`, top: `${LAUNCH.y}%` }}>
          <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1">
            <path ref={geo} d={flight.d} fill="none" stroke="none" />
            <path ref={trail} d={flight.pulse} fill="none" stroke="#a8a8b0" strokeWidth={flight.strokeW} strokeLinejoin="round" strokeDasharray="0 100000" />
            <path ref={hot} className="ri-hot" d={flight.d} fill="none" strokeDasharray="18 100000" strokeDashoffset="18" />
          </svg>

          {/* pad, tower and blast, tilted with the surface */}
          <div className="ri-base" style={{ transform: `rotate(${TILT}deg)` }}>
            <svg className="ri-tower" viewBox="0 0 14 74" width="8" height="42">
              <g fill="none" stroke="#a8a8b0" strokeWidth="0.8">
                <path d="M2 74V4M12 74V4M2 4h10" />
                <path d="M2 14l10 10M12 14L2 24M2 34l10 10M12 34L2 44M2 54l10 10M12 54L2 64" strokeOpacity="0.6" />
                <path className="ri-arm" d="M12 22h9" />
              </g>
            </svg>
            <span className="ri-pad" />
            {/* regolith blasted out in straight lines: no air to make a cloud */}
            <span className="ri-spray" />
            <span className="ri-spray ri-spray-r" />
            <span className="ri-flash" />
          </div>

          {/* the rocket: its tail sits on the path point; JS sets position and attitude */}
          <div ref={rocket} className="ri-rocket" style={{ transform: `rotate(${TILT}deg)` }}>
            <div className="ri-shake">
              <span className="ri-plume" />
              <span className="ri-plume ri-plume-core" />
              <svg viewBox="0 0 30 84" width="14" height="39" className="relative block overflow-visible">
                <g fill="#0a0a0c" stroke="#ececee" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round">
                  <path d="M9 56 L2 70 L2 77 L9 72 Z" />
                  <path d="M21 56 L28 70 L28 77 L21 72 Z" />
                  <path d="M15 2 C21 11 22.5 24 22.5 36 L22.5 74 L7.5 74 L7.5 36 C7.5 24 9 11 15 2 Z" />
                  <path d="M10.5 74 L19.5 74 L21 80 L9 80 Z" />
                </g>
                <path d="M9.4 20 H20.6" stroke="#ececee" strokeWidth="0.8" />
                <circle cx="15" cy="31" r="3.2" fill="#050506" stroke="#e2bd6a" strokeWidth="1.1" />
                <circle cx="14" cy="30" r="0.9" fill="#e2bd6a" fillOpacity="0.6" />
                <path d="M7.8 61 H22.2" stroke="#e2bd6a" strokeWidth="1.6" />
                <path d="M15 64 V79" stroke="#ececee" strokeWidth="1.1" />
                <path d="M19.6 26 V54" stroke="#ececee" strokeOpacity="0.28" strokeWidth="1" strokeLinecap="round" />
                <circle className="ri-beacon" cx="15" cy="2.6" r="1.5" fill="#e2bd6a" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
