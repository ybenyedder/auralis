import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { isValidVideoId, upsertOnlineTrack } from "@/server/library/online";
import { invalidateSnapshotCache } from "@/server/library/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegisterBody {
  videoId?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  thumbnail?: string | null;
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const parsed = await readJsonBody<RegisterBody>(request);
  if (!parsed.ok) return parsed.response;
  const { videoId, title, artist, album, duration, thumbnail } = parsed.body;

  if (!isValidVideoId(videoId)) {
    return json({ ok: false, error: "Identifiant vidéo invalide" }, { status: 400 });
  }
  if (!title?.trim()) {
    return json({ ok: false, error: "Titre requis" }, { status: 400 });
  }

  const { track, inserted } = upsertOnlineTrack({
    videoId,
    title: title.trim(),
    artist,
    album,
    duration,
    thumbnail,
  });
  if (inserted) invalidateSnapshotCache();

  return json({ ok: true, track });
}
