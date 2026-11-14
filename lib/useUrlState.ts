"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Read/write query parameters (shareable URL state). Writes use the native
 * history.replaceState, which Next.js integrates with useSearchParams: no server
 * round-trip, no scroll, no new history entry.
 */
export function useUrlState() {
  const params = useSearchParams();
  const set = useCallback((patch: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);
  return { params, set };
}

/** Current URL with the display mode included, for "Copy shareable link". */
export function shareUrl(mode: string): string {
  const u = new URL(window.location.href);
  u.searchParams.set("mode", mode);
  return u.toString();
}
