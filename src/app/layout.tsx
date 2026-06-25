import type { ReactNode } from "react";
import "./globals.css";

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
  // Matches the default theme so the OS chrome doesn't pop a different colour on
  // first paint (applyTheme overrides this at runtime per selected theme).
  themeColor: "#100b0a",
  width: "device-width",
  initialScale: 1,
  // Cover the notch / home-indicator so the mobile chrome can paint into the
  // safe-area insets instead of leaving system letterboxing.
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="dark">
      <body className="bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
