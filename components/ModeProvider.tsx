"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Two audiences:
 * - "simple": plain-language summary, few numbers, explanations (default for first-time visitors)
 * - "pro": every number, azimuths, CSV export, share links
 * Old links with ?mode=explain / ?mode=expert map to simple / pro.
 */
export type Mode = "simple" | "pro";

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "simple", setMode: () => {} });

function normalise(v: string | null): Mode | null {
  if (v === "simple" || v === "explain") return "simple";
  if (v === "pro" || v === "expert") return "pro";
  return null;
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("simple");

  useEffect(() => {
    try {
      const saved = normalise(new URLSearchParams(window.location.search).get("mode")) ?? normalise(localStorage.getItem("lsn-mode"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from browser-only storage after hydration
      if (saved) setModeState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("lsn-mode", m);
      const u = new URL(window.location.href);
      if (u.searchParams.has("mode")) {
        u.searchParams.set("mode", m);
        window.history.replaceState(null, "", u.toString());
      }
    } catch {
      /* ignore */
    }
  }, []);

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);

/** Plain-language tip shown only in Simple mode. */
export function Tip({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  if (mode !== "simple") return null;
  return (
    <p className="border border-l-2 border-line border-l-muted bg-panel/70 px-4 py-3 text-sm leading-relaxed text-muted">
      <span className="eyebrow mr-2 !text-[0.62rem] !tracking-[0.3em] text-foreground">Tip</span>
      {children}
    </p>
  );
}

export function ProOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  return mode === "pro" ? <>{children}</> : null;
}

export function SimpleOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  return mode === "simple" ? <>{children}</> : null;
}

/** @deprecated kept for existing call sites; same as ProOnly */
export const ExpertOnly = ProOnly;
