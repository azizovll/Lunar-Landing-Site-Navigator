"use client";

import { useState } from "react";
import { shareUrl } from "@/lib/useUrlState";
import { useMode } from "./ModeProvider";

/** Copies the current scenario URL (including Explain/Expert mode) and confirms it. */
export function CopyLinkButton() {
  const { mode } = useMode();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(shareUrl(mode));
          setState("ok");
        } catch {
          setState("fail");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
      aria-live="polite"
    >
      {state === "ok" ? "✓ Link copied" : state === "fail" ? "Copy failed: use the address bar" : "Copy shareable link"}
    </button>
  );
}
