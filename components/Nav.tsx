"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "./ModeProvider";

const LINKS = [
  { href: "/", label: "Site" },
  { href: "/compare", label: "Compare" },
  { href: "/calendar", label: "Calendar" },
  { href: "/validation", label: "Validation" },
  { href: "/about", label: "About" },
];

/** Line-art lunar lander logo. */
function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M11 6h10l3 7H8z" />
      <path d="M8 13h16v5H8z" />
      <path d="M10 18l-4 8M22 18l4 8M4 26h4M24 26h4M16 18v5" />
      <circle cx="16" cy="9.5" r="1.4" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const { mode, setMode } = useMode();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-black/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="display text-sm tracking-[0.18em] sm:text-base">Lunar Site Navigator</span>
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto lg:order-none lg:mx-auto lg:w-auto lg:gap-6" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap border-b px-2 py-1.5 text-sm transition-colors ${active ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <div className="flex border border-line text-xs" role="group" aria-label="Display mode">
            {(["explain", "expert"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? "bg-panel3 text-foreground" : "text-muted hover:text-foreground"}`}
                aria-pressed={mode === m}
              >
                {m}
              </button>
            ))}
          </div>
          <Link href="/compare" className="btn btn-solid hidden sm:inline-flex">
            Compare sites
          </Link>
        </div>
      </div>
    </header>
  );
}
