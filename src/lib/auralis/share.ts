"use client";

import type { Track } from "./types";
import { trackArtist, trackTitle } from "./brand";

/**
 * Share the *current track as text* — word-of-mouth, the organic-growth loop the
 * app had no affordance for. Auralis is a private self-hosted server, so there is
 * no public deep link to share; we share "Title — Artist" via the native share
 * sheet (mobile) and fall back to the clipboard everywhere else. A user-cancelled
 * native share is not an error, so it never falls through to the clipboard.
 */
export async function shareTrack(track: Track, notify: (m: string) => void): Promise<void> {
  const label = `${trackTitle(track)} — ${trackArtist(track)}`;
  const text = `J’écoute ${label} sur Auralis 🎧`;

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title: trackTitle(track), text });
      return;
    } catch (err) {
      // User dismissed the share sheet — nothing to recover from.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Otherwise fall through to the clipboard path below.
    }
  }
  try {
    await nav?.clipboard?.writeText(text);
    notify("Titre copié dans le presse-papiers");
  } catch {
    notify("Partage indisponible");
  }
}
