import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ModeProvider } from "@/components/ModeProvider";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lunar Site Navigator",
  description:
    "Compare lunar landing sites and dates: Sun and Earth over the real terrain horizon, solar power and direct-to-Earth communication windows. Team infinium, NASA Space Apps 2026.",
};

export const viewport: Viewport = { themeColor: "#070a12" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ModeProvider>
          <Nav />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">{children}</main>
          <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted">
            Team infinium · NASA Space Apps 2026 · Ephemeris: astronomy-engine, validated against JPL Horizons · Terrain: NASA LRO LOLA
          </footer>
        </ModeProvider>
      </body>
    </html>
  );
}
