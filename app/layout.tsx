import type { Metadata, Viewport } from "next";
import { Geist_Mono, Orbitron, Outfit } from "next/font/google";
import "./globals.css";
import { ModeProvider } from "@/components/ModeProvider";
import { Nav } from "@/components/Nav";
import { Pulse } from "@/components/ui";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lunar Site Navigator",
  description:
    "Compare lunar landing sites and dates: Sun and Earth over the real terrain horizon, solar power and direct-to-Earth communication windows. Team infinium, NASA Space Apps 2026.",
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${orbitron.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ModeProvider>
          <Nav />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
          <footer className="no-print border-t border-line">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-3">
                <Pulse className="text-faint" />
                <span className="eyebrow !tracking-[0.35em] text-muted">Team infinium</span>
              </div>
              <span>NASA Space Apps 2026 · Ephemeris: astronomy-engine, validated against JPL Horizons · Terrain: NASA LRO LOLA</span>
            </div>
          </footer>
        </ModeProvider>
      </body>
    </html>
  );
}
