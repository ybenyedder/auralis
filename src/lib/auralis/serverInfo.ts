"use client";

// One-shot client cache of the server's public runtime flags. /api/health is
// the cheapest always-available endpoint (open CORS, no auth for the flag
// fields), so the UI can adapt to how the operator configured their instance
// without a dedicated config route.
//
// Currently consumed for `lyricsOnline`: when a self-hoster runs with
// AURALIS_LYRICS_ONLINE=false the lyrics pane must NOT offer "Chercher en
// ligne" (the server would refuse the network call anyway) and instead hints
// at the .lrc sidecar path.

export interface ServerInfo {
  /** Online lyrics providers (LRCLIB/Musixmatch) enabled on this server. */
  lyricsOnline: boolean;
}

const FALLBACK: ServerInfo = { lyricsOnline: true };

let cached: Promise<ServerInfo> | null = null;

/** Fetch (once per page load) and memoize the public server flags. */
export function serverInfo(): Promise<ServerInfo> {
  if (!cached) {
    // Imported lazily-free: api is a tiny synchronous module, but keeping the
    // import top-level would pull it into every consumer's bundle — fine here.
    cached = import("@/lib/auralis/api")
      .then(({ api }) =>
        api.get<Partial<ServerInfo>>("/api/health").then(
          (res) => ({ lyricsOnline: res.lyricsOnline !== false }),
          () => FALLBACK,
        ),
      )
      // A failed dynamic import (extremely unlikely) must never break callers.
      .catch(() => FALLBACK);
  }
  return cached;
}
