import { Suspense } from "react";
import type { Metadata } from "next";
import { CompareView } from "@/components/CompareView";

export const metadata: Metadata = { title: "Compare · Lunar Site Navigator" };

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="card grid h-96 place-items-center text-muted">Computing scenarios…</div>}>
      <CompareView />
    </Suspense>
  );
}
