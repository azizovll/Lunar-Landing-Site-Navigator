import { Suspense } from "react";
import type { Metadata } from "next";
import { CalendarView } from "@/components/CalendarView";

export const metadata: Metadata = { title: "Calendar · Lunar Site Navigator" };

export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="card grid h-96 place-items-center text-muted">Loading calendar…</div>}>
      <CalendarView />
    </Suspense>
  );
}
