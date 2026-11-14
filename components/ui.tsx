/** Shared visual primitives of the "space tech" design (no client state; usable from server components). */

/** Thin line with a heartbeat spike, used before section labels. */
export function Pulse({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 24" className={`h-5 w-20 shrink-0 ${className}`} aria-hidden>
      <polyline points="0,12 38,12 43,4 48,20 53,12 96,12" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** "—/\— S P A C E   T E C H" label. */
export function Eyebrow({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-4 text-muted ${center ? "justify-center" : ""}`}>
      <Pulse />
      <span className="eyebrow">{children}</span>
    </div>
  );
}

/** Section header: eyebrow label + large uppercase display title. */
export function SectionTitle({ eyebrow, title, sub, center = false, as: Tag = "h2" }: { eyebrow: string; title: React.ReactNode; sub?: React.ReactNode; center?: boolean; as?: "h1" | "h2" }) {
  return (
    <header className={`flex flex-col gap-4 ${center ? "items-center text-center" : ""}`}>
      <Eyebrow center={center}>{eyebrow}</Eyebrow>
      <Tag className={`display ${Tag === "h1" ? "text-3xl sm:text-5xl" : "text-2xl sm:text-4xl"}`}>{title}</Tag>
      {sub && <p className={`max-w-2xl text-sm leading-relaxed text-muted sm:text-base ${center ? "mx-auto" : ""}`}>{sub}</p>}
    </header>
  );
}

/** Bordered box with a big number and a caption (the "120+ Satellites" tile). */
export function StatBox({ value, label, sub, tone }: { value: React.ReactNode; label: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "poor" }) {
  return (
    <div className="frame flex min-w-0 flex-col justify-between gap-3 bg-panel/60 p-3 sm:p-5">
      <div className={`num break-words text-xl sm:text-4xl ${tone === "good" ? "text-good" : tone === "poor" ? "text-poor" : ""}`}>{value}</div>
      <div>
        <div className="text-sm text-foreground">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/** "Ø1  Mission planning" step with an outlined big number. */
export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-t border-line pt-5">
      <div className="num row-span-2 text-4xl text-transparent sm:text-5xl" style={{ WebkitTextStroke: "1px var(--muted)" }}>
        {String(n).padStart(2, "0").replace("0", "Ø")}
      </div>
      <h3 className="display text-sm tracking-[0.12em]">{title}</h3>
      <div className="text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
