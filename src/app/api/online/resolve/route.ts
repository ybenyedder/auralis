import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { onlineSearch } from "@/server/library/downloader";
import { upsertOnlineTrack } from "@/server/library/online";
import { invalidateSnapshotCache } from "@/server/library/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const parsed = await readJsonBody<{ query?: string; title?: string; artist?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const query = parsed.body.query?.trim();
  if (!query) return json({ ok: false, error: "Recherche requise" }, { status: 400 });

  const search = await onlineSearch(query, 3);
  const hit = search.results[0];
  if (!hit) {
    return json({ ok: false, error: search.error || "Aucun flux trouvé" }, { status: 404 });
  }

  const { track, inserted } = upsertOnlineTrack({
    videoId: hit.videoId,
    title: parsed.body.title?.trim() || hit.title,
    artist: parsed.body.artist?.trim() || hit.artist || hit.uploader,
    duration: hit.duration,
    thumbnail: hit.thumbnail,
  });
  if (inserted) invalidateSnapshotCache();

  return json({ ok: true, track });
}
