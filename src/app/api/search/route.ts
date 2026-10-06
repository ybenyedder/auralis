import { search } from "@/server/library/repository";
import { json } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { onlineSearch, downloadsAvailable, type OnlineResult } from "@/server/library/downloader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const wantOnline = url.searchParams.get("online") === "1";
  if (!q) {
    return json({ tracks: [], albums: [], artists: [], query: "", online: { enabled: await downloadsAvailable(), results: [] } });
  }

  const local = search(q, limit);
  // `online=1`: also ask yt-dlp for YouTube hits so the client can offer tracks
  // that are NOT in the library yet ("search it and download it"). The client
  // asks for it when its local results are starving (or empty).
  let online: { enabled: boolean; results: OnlineResult[]; error?: string };
  if (wantOnline) {
    const res = await onlineSearch(q, 8);
    online = { enabled: res.enabled, results: res.results, ...(res.error ? { error: res.error } : {}) };
  } else {
    online = { enabled: await downloadsAvailable(), results: [] };
  }
  return json({ ...local, query: q, online });
}
