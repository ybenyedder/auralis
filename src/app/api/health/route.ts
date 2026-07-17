import fs from "fs";
import { getDb } from "@/server/db";
import { getConfig } from "@/server/config";
import { isAuthenticated } from "@/server/auth";
import { json, withCors } from "@/server/http";
import pkg from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getConfig();
  let tracks = 0;
  let dbOk = true;
  try {
    tracks = (getDb().prepare("SELECT COUNT(*) AS n FROM tracks").get() as { n: number }).n;
  } catch {
    dbOk = false;
  }
  // Readable, not just "exists" — a scan silently returns zero files against an
  // unreadable dir (permissions, unmounted network share) with no error anywhere,
  // so this is the only place an operator's healthcheck can catch that class of
  // misconfiguration before "library is empty" support requests show up.
  let musicDirOk = true;
  try {
    fs.accessSync(config.musicDir, fs.constants.R_OK);
  } catch {
    musicDirOk = false;
  }
  const status = dbOk && musicDirOk ? "ok" : "degraded";
  // Health is the one endpoint clients probe cross-origin (before navigating to
  // the server), so it explicitly opts back into an open ACAO. Because it is both
  // unauthenticated AND CORS-open, it must NOT leak host internals: the absolute
  // musicDir path is omitted, and the detailed scan progress + process uptime are
  // kept off the open response. The exact version (a CVE-targeting fingerprint)
  // and the library track count are ALSO withheld from anonymous callers and only
  // returned once the request carries a valid session — the two consumers that
  // probe this (desktop boot wait, Android reachability check) look at the HTTP
  // status only, so nothing depends on those fields being public.
  const authed = isAuthenticated(request);
  return withCors(json({
    name: "Auralis",
    status,
    db: dbOk,
    musicDir: musicDirOk,
    lyricsOnline: config.lyricsOnline,
    ...(authed ? { version: pkg.version, tracks } : {}),
  }));
}
