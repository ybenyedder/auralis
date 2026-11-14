import { json, readJsonBody, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { onlineSearch } from "@/server/library/downloader";
import { resolveOnlineTracksBatch, type OnlineResolveBatchItem } from "@/server/library/online";
import { invalidateSnapshotCache } from "@/server/library/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS_PER_BATCH = 50;

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const parsed = await readJsonBody<{ items?: OnlineResolveBatchItem[] }>(request);
  if (!parsed.ok) return parsed.response;

  const raw = Array.isArray(parsed.body.items) ? parsed.body.items : [];
  if (raw.length === 0) {
    return json({ ok: false, error: "Liste vide" }, { status: 400 });
  }
  const items = raw.slice(0, MAX_ITEMS_PER_BATCH).map((item) => ({
    title: typeof item?.title === "string" ? item.title : "",
    artist: typeof item?.artist === "string" ? item.artist : undefined,
    album: typeof item?.album === "string" ? item.album : undefined,
    videoId: typeof item?.videoId === "string" ? item.videoId : undefined,
    duration: typeof item?.duration === "number" ? item.duration : undefined,
    thumbnail: typeof item?.thumbnail === "string" ? item.thumbnail : undefined,
  }));

  const { entries, insertedAny } = await resolveOnlineTracksBatch(
    items,
    async (query) => {
      const s = await onlineSearch(query, 3, { bypassDownloadGate: true });
      return s.results[0] ?? null;
    },
    6,
  );
  if (insertedAny) invalidateSnapshotCache();

  return json({ ok: true, resolved: entries });
}
