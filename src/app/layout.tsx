import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter as a legal, redistributable approximation of SF Pro. On Apple platforms
// the --font-sans stack in globals.css still resolves to the native SF Pro first
// (via -apple-system); Inter fills in everywhere else and powers --font-inter.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Auralis — Ton coffre musical personnel",
  description:
    "Auralis est un lecteur de musique personnel haute-fidélité : confidentialité totale, esthétique soignée, lecture 100% locale.",
  keywords: ["Auralis", "musique", "lecteur", "bibliothèque", "local", "bureau"],
  authors: [{ name: "Auralis" }],
  applicationName: "Auralis",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent" as const,
    title: "Auralis",
  },
};

export const viewport = {
  // Dark by default so the OS chrome doesn't flash white on first paint;
  // applyMode overrides this at runtime when light/auto is chosen.
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // Cover the notch / home-indicator so the mobile chrome can paint into the
  // safe-area insets instead of leaving system letterboxing.
  viewportFit: "cover" as const,
};

// Inline script (runs before paint) to apply the persisted appearance mode from
// localStorage and avoid a FOUC flash of the wrong palette. Mirrors the logic in
// themes.ts#applyMode but without the React import graph. Keep it tiny.
const appearanceBootstrap = `(function(){try{var k='auralis-appearance';var m=localStorage.getItem(k)||'dark';if(m==='auto'){m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}var r=document.documentElement;r.dataset.mode=m;r.classList.toggle('light',m==='light');r.classList.toggle('dark',m==='dark');}catch(e){var r=document.documentElement;r.dataset.mode='dark';r.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body className={`${inter.variable} bg-background font-sans text-foreground antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
