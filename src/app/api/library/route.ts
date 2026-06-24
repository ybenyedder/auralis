import { getSnapshot } from "@/server/library/repository";
import { getScanProgress } from "@/server/library/scanner";
import { ensureLibraryReady } from "@/server/bootstrap";
import { json } from "@/server/http";
import { getRequestUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  ensureLibraryReady();
  try {
    const snapshot = getSnapshot(user.id);
    return json({ ...snapshot, scan: getScanProgress(), source: "filesystem" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Library read failed";
    return json(
      { tracks: [], albums: [], artists: [], folders: [], count: 0, root: null, scannedAt: null, error: message },
      { status: 500 },
    );
  }
}
