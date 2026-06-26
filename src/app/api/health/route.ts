import { getDb } from "@/server/db";
import { getConfig } from "@/server/config";
import { json, withCors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();
  let tracks = 0;
  let dbOk = true;
  try {
    tracks = (getDb().prepare("SELECT COUNT(*) AS n FROM tracks").get() as { n: number }).n;
  } catch {
    dbOk = false;
  }
  // Health is the one endpoint clients probe cross-origin (before navigating to
  // the server), so it explicitly opts back into an open ACAO. Because it is both
  // unauthenticated AND CORS-open, it must NOT leak host internals: the absolute
  // musicDir path is omitted, and the detailed scan progress + process uptime are
  // kept off the open response (they're observable to authenticated clients via
  // /api/library and /api/library/scan). What remains is a minimal liveness probe.
  return withCors(json({
    name: "Auralis",
    status: dbOk ? "ok" : "degraded",
    version: "1.5.0",
    db: dbOk,
    tracks,
    lyricsOnline: config.lyricsOnline,
  }));
}
