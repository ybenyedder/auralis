import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { PwaRegistrar } from "@/components/auralis/PwaRegistrar";
import "./globals.css";

// Inter as a legal, redistributable approximation of SF Pro. On Apple platforms
// the --font-sans stack in globals.css still resolves to the native SF Pro first
// (via -apple-system); Inter fills in everywhere else and powers --font-inter.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AURALIS_PUBLIC_URL ?? "http://localhost:3000"),
  title: "Auralis — Ton coffre musical personnel",
  description:
    "Auralis est un lecteur de musique personnel haute-fidélité : confidentialité totale, esthétique soignée, lecture 100% locale.",
  keywords: ["Auralis", "musique", "lecteur", "bibliothèque", "local", "auto-hébergé", "PWA"],
  authors: [{ name: "Auralis" }],
  applicationName: "Auralis",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "Auralis — Ton coffre musical personnel",
    description:
      "Ton serveur, ta musique : lecture locale haute-fidélité, paroles synchronées, radio intelligente et installation en un geste.",
    type: "website",
    siteName: "Auralis",
    locale: "fr_FR",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Auralis — coffre musical personnel" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Auralis — Ton coffre musical personnel",
    description: "Lecteur de musique auto-hébergé : privé, élégant, installable.",
    images: ["/og-image.png"],
  },
  formatDetection: { telephone: false },
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
  // No maximumScale/userScalable here: they blocked pinch-zoom (WCAG 1.4.4
  // resize-text failure; Android honors the meta tag). The OS default —
  // user-scalable — applies instead.
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
        <PwaRegistrar />
      </body>
    </html>
  );
}
