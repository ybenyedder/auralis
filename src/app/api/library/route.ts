import { getSnapshot, getSnapshotEtag } from "@/server/library/repository";
import { getScanProgress } from "@/server/library/scanner";
import { ensureLibraryReady } from "@/server/bootstrap";
import { json } from "@/server/http";
import { getRequestUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tolerate a comma-separated If-None-Match list and the "*" wildcard. Clients
// echo our weak ETag verbatim, so a trimmed string compare is enough (RFC 7232
// mandates weak comparison for If-None-Match).
function ifNoneMatchHits(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((tag) => {
    const t = tag.trim();
    return t === "*" || t === etag;
  });
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  ensureLibraryReady();
  try {
    const etag = getSnapshotEtag(user.id);
    const scan = getScanProgress();
    // While a scan is in flight the snapshot mutates faster than the coarse ETag
    // signals, and the client polls this endpoint for live progress — so only
    // honour conditional requests when no scan is running.
    if (scan.status !== "scanning" && ifNoneMatchHits(request.headers.get("if-none-match"), etag)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, no-cache" },
      });
    }

    const snapshot = getSnapshot(user.id);
    const res = json({ ...snapshot, scan, source: "filesystem" });
    res.headers.set("ETag", etag);
    res.headers.set("Cache-Control", "private, no-cache");
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Library read failed";
    return json(
      { tracks: [], albums: [], artists: [], folders: [], count: 0, root: null, scannedAt: null, error: message },
      { status: 500 },
    );
  }
}
