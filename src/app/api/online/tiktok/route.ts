import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { rateLimitWindow } from "@/server/rateLimit";
import { onlineSearch } from "@/server/library/downloader";
import { upsertOnlineTrack } from "@/server/library/online";
import { invalidateSnapshotCache } from "@/server/library/repository";
import { identifyTikTokAudio, pickBestTikTokStreamHit, TikTokError } from "@/server/library/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  if (rateLimitWindow(`tiktok:${user.id}`, 15, 60_000)) {
    return json({ error: "Trop de requêtes TikTok. Réessayez dans un instant." }, { status: 429, headers: { "Retry-After": "60" } });
  }

  const parsed = await readJsonBody<{ url?: string }>(request);
  if (!parsed.ok) return parsed.response;

  const url = typeof parsed.body.url === "string" ? parsed.body.url.trim() : "";
  if (!url || url.length > 2048) {
    return json({ ok: false, error: "Lien TikTok requis" }, { status: 400 });
  }

  try {
    const detected = await identifyTikTokAudio(url);
    const query = [detected.artist, detected.title].filter(Boolean).join(" ").trim();
    let search = await onlineSearch(query, 6, { bypassDownloadGate: true });
    if (search.results.length === 0 && detected.title && detected.artist) {
      const primaryArtist = detected.artist.split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0]?.trim() ?? "";
      const fallbackQuery = [primaryArtist, detected.title].filter(Boolean).join(" ").trim();
      if (fallbackQuery && fallbackQuery !== query) {
        search = await onlineSearch(fallbackQuery, 6, { bypassDownloadGate: true });
      }
      if (search.results.length === 0) {
        search = await onlineSearch(detected.title, 6, { bypassDownloadGate: true });
      }
    }
    const hit = pickBestTikTokStreamHit(search.results, detected);
    if (!hit) {
      return json(
        {
          ok: false,
          error: `Musique détectée (${detected.artist ? `${detected.artist} — ` : ""}${detected.title}), mais aucun flux streaming trouvé`,
        },
        { status: 404 },
      );
    }

    const { track, inserted } = upsertOnlineTrack({
      videoId: hit.videoId,
      title: detected.title || hit.title,
      artist: detected.artist || hit.artist || hit.uploader,
      album: detected.album || "TikTok",
      duration: detected.duration || hit.duration,
      thumbnail: detected.thumbnail || hit.thumbnail,
    });
    if (inserted) invalidateSnapshotCache();

    return json({ ok: true, detected, track });
  } catch (err) {
    if (err instanceof TikTokError) {
      return json({ ok: false, error: err.message }, { status: err.status });
    }
    return json({ ok: false, error: "Impossible d'analyser ce lien TikTok" }, { status: 500 });
  }
}
