import { getSnapshot } from "@/server/library/repository";
import { getScanProgress } from "@/server/library/scanner";
import { ensureLibraryReady } from "@/server/bootstrap";
import { checkAuth, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;

  ensureLibraryReady();
  try {
    const snapshot = getSnapshot();
    return json({ ...snapshot, scan: getScanProgress(), source: "filesystem" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Library read failed";
    return json(
      { tracks: [], albums: [], artists: [], folders: [], count: 0, root: null, scannedAt: null, error: message },
      { status: 500 },
    );
  }
}
