import { Suspense } from "react";
import type { Metadata } from "next";
import { RescueView } from "@/components/RescueView";

export const metadata: Metadata = { title: "Mission rescue · Lunar Site Navigator" };

export default function RescuePage() {
  return (
    <Suspense fallback={<div className="card grid h-96 place-items-center text-muted">Searching alternatives…</div>}>
      <RescueView />
    </Suspense>
  );
}
