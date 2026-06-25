import type { CSSProperties } from "react";
import type { Track, Album, Artist } from "./types";

// ============================================================
// AURALIS BRAND IDENTITY
// ============================================================
export const brand = {
  name: "Auralis",
  system: "Auralis Core",
  promise: "A private, label-grade listening desk for local music collections.",
  version: "1.3.0",
  vocabulary: {
    home: "Home",
    search: "Explore",
    library: "Library",
    favorites: "Favorites",
    recommendations: "Curated",
    history: "Recents",
    folders: "Folders",
    stats: "Insights",
    player: "Now Playing",
  },
} as const;

// Project funding & contact. Auralis is free and self-hosted; a single,
// dismissible reminder invites users who self-host or install it to chip in.
export const DONATE_URL = "https://paypal.me/AdamMezerai";
export const CONTACT_EMAIL = "volt@webtvmedia.net";
export const PROJECT_REPO = "https://github.com/ybenyedder/auralis";

// Signature palettes for deterministic artwork generation.
export const signalPalettes: [string, string, string][] = [
  ["#2A2821", "#D95F45", "#E5A184"],
  ["#1E2622", "#6EB29E", "#B5D6C7"],
  ["#282419", "#C6A15B", "#E5C985"],
  ["#252027", "#7F6A7C", "#C5AFC0"],
  ["#141411", "#8D6E52", "#D8C19E"],
  ["#22231C", "#A2A65E", "#D9D7A8"],
  ["#281E1A", "#B44A34", "#D8A076"],
  ["#1C2320", "#4C8C78", "#D95F45"],
];

export function hashString(s: string): number {
  return Math.abs(String(s || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
}

export function paletteForName(name: string): [string, string, string] {
  const value = name || brand.name;
  return signalPalettes[hashString(value) % signalPalettes.length];
}

/** CSS custom properties that drive the cover-derived hero wash (.hero-cover).
 *  Feeds the artwork's own colours into a radial glow over the animated theme. */
export function coverVars(colors?: [string, string, string]): CSSProperties {
  const [c1, c2] = colors ?? signalPalettes[0];
  return { "--cover-1": `${c1}cc`, "--cover-2": `${c2}3a` } as CSSProperties;
}

export function paletteFor(item: { title?: string; name?: string; album?: string; trackhash?: string; albumhash?: string; artisthash?: string } | undefined | null): [string, string, string] {
  if (!item) return signalPalettes[0];
  const key = item.trackhash || item.albumhash || item.artisthash || item.title || item.name || item.album || brand.name;
  return paletteForName(key);
}

// Initials fallback for artwork
export function initialsOf(name?: string): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Format helpers
export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function formatLongDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
}

export function formatCount(n?: number): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function trackArtist(t?: Partial<Track> | null): string {
  if (!t) return "Artiste inconnu";
  if (t.artist) return t.artist;
  if (Array.isArray(t.artists) && t.artists.length > 0) return t.artists.map((a) => a.name).filter(Boolean).join(", ");
  if (Array.isArray(t.albumartists) && t.albumartists.length > 0) return t.albumartists.map((a) => a.name).filter(Boolean).join(", ");
  return "Artiste inconnu";
}

export function trackTitle(t?: Partial<Track> | null): string {
  return t?.title || "Titre inconnu";
}

export function albumArtist(a?: Partial<Album> | null): string {
  if (!a) return "Artiste inconnu";
  if (Array.isArray(a.albumartists) && a.albumartists.length > 0) return a.albumartists.map((x) => x.name).filter(Boolean).join(", ");
  return "Artiste inconnu";
}

export function artistLabel(a?: Partial<Artist> | null): string {
  return a?.name || "Artiste inconnu";
}
