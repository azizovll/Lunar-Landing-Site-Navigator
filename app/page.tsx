import { Suspense } from "react";
import { SiteView } from "@/components/SiteView";

export default function Home() {
  return (
    <Suspense fallback={<div className="card grid h-96 place-items-center text-muted">Loading sky…</div>}>
      <SiteView />
    </Suspense>
  );
}
