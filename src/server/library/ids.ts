// Deterministic, stable identifiers for tracks/albums/artists. Track identity is
// path-based so favorites and playlists survive rescans. Album/artist identity is
// derived from normalized names so files sharing tags group together.

import crypto from "crypto";

// Combining diacritical marks U+0300–U+036F (built via RegExp to keep the source ASCII).
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function sha1hex(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

export function normalizeName(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .trim();
}

export function artistHash(name: string): string {
  return "artist-" + sha1hex(normalizeName(name)).slice(0, 16);
}

export function albumHash(albumArtist: string, album: string): string {
  return "album-" + sha1hex(normalizeName(albumArtist) + "\n" + normalizeName(album)).slice(0, 16);
}

export function trackHashForPath(relativePath: string): string {
  return "track-" + sha1hex(relativePath).slice(0, 16);
}
