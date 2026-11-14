"use client";

import { useEffect, useState } from "react";

/** Button that opens the browser's print dialog ("Save as PDF"); print styles live in globals.css. */
export function PrintButton({ label = "Save report (PDF)" }: { label?: string }) {
  return (
    <button className="btn no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/** Header that only appears on paper: title, time of generation and the link to this exact scenario. */
export function PrintHeader({ title }: { title: string }) {
  const [info, setInfo] = useState<{ url: string; at: string } | null>(null);
  useEffect(() => {
    const update = () => setInfo({ url: window.location.href, at: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" });
    update();
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  return (
    <div className="print-only mb-4 border-b border-line pb-3">
      <div className="display text-lg">Lunar Site Navigator · {title}</div>
      <div className="mt-1 text-xs text-muted">
        Generated {info?.at} · Team infinium, NASA Space Apps 2026 · Scenario link: {info?.url}
      </div>
    </div>
  );
}
