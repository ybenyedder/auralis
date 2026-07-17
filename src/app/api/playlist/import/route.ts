// POST /api/playlist/import — resolve a shared playlist LINK (Spotify / Deezer /
// Apple Music / YouTube, or a direct .m3u/.json URL) to a plain tracklist. The
// client then matches those { title, artist } pairs against the local library and
// creates the playlist (see LibraryView + playlistIO.matchLibraryTracks), mirroring
// the existing file-import flow but with the source being a URL fetched server-side.

import { getRequestUser } from "@/server/auth";
import { json, checkCsrf, readJsonBody } from "@/server/http";
import { rateLimitWindow } from "@/server/rateLimit";
import { importPlaylistFromUrl, PlaylistImportError } from "@/server/library/externalPlaylist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  url?: string;
}

export async function POST(request: Request) {
  // Cookie-authed mutation that makes an outbound request on the user's behalf —
  // guard against a cross-site page driving it (CSRF), same as the state route.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  // Each import fires an outbound fetch, so throttle per account (10 / minute) to
  // keep the server from being turned into a request amplifier.
  if (rateLimitWindow(`plimport:${user.id}`, 10, 60_000)) {
    return json({ error: "Trop d'imports. Réessayez dans un instant." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;
  const url = typeof parsed.body.url === "string" ? parsed.body.url.trim() : "";
  if (!url || url.length > 2048) return json({ error: "Adresse manquante ou trop longue." }, { status: 400 });

  try {
    const result = await importPlaylistFromUrl(url);
    return json({ ok: true, name: result.name, source: result.source, total: result.tracks.length, tracks: result.tracks });
  } catch (error) {
    if (error instanceof PlaylistImportError) return json({ error: error.message }, { status: error.status });
    return json({ error: "Échec de l'import." }, { status: 500 });
  }
}
