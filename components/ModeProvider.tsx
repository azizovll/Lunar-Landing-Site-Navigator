"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Mode = "explain" | "expert";

const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "explain", setMode: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("explain");

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("mode");
      const saved = fromUrl ?? localStorage.getItem("lsn-mode");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from browser-only storage after hydration
      if (saved === "expert" || saved === "explain") setModeState(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("lsn-mode", m);
    } catch {
      /* ignore */
    }
  }, []);

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);

/** Plain-language tip shown only in Explain mode. */
export function Tip({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  if (mode !== "explain") return null;
  return (
    <p className="border border-l-2 border-line border-l-muted bg-panel/70 px-4 py-3 text-sm leading-relaxed text-muted">
      <span className="eyebrow mr-2 !text-[0.62rem] !tracking-[0.3em] text-foreground">Tip</span>
      {children}
    </p>
  );
}

export function ExpertOnly({ children }: { children: React.ReactNode }) {
  const { mode } = useMode();
  return mode === "expert" ? <>{children}</> : null;
}
