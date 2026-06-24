import { getDb } from "@/server/db";
import { getConfig } from "@/server/config";
import { getScanProgress } from "@/server/library/scanner";
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
  // unauthenticated AND CORS-open, it must NOT leak host details — the absolute
  // musicDir path (which reveals the OS username / filesystem layout) is omitted.
  return withCors(json({
    name: "Auralis",
    status: dbOk ? "ok" : "degraded",
    version: "1.1.0",
    db: dbOk,
    tracks,
    lyricsOnline: config.lyricsOnline,
    scan: getScanProgress(),
    uptime: Math.round(process.uptime()),
  }));
}
