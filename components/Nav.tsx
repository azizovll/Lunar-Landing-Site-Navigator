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

export function Nav() {
  const path = usePathname();
  const { mode, setMode } = useMode();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            <circle cx="11" cy="11" r="9" fill="#c9cfdb" />
            <circle cx="8" cy="8" r="2" fill="#9aa3b5" />
            <circle cx="14" cy="13" r="2.6" fill="#9aa3b5" />
            <path d="M2 11 A9 9 0 0 0 20 11 Z" fill="#070a12" opacity="0.55" />
          </svg>
          <span>Lunar Site Navigator</span>
        </Link>
        <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel2 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Display mode">
          {(["explain", "expert"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 capitalize ${mode === m ? "bg-panel2 text-foreground" : "text-muted"}`}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
