import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { requireAdmin, checkCsrf, json } from "@/server/http";
import { rateLimitWindow } from "@/server/rateLimit";
import { backupDbTo } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only disaster-recovery export: a consistent SQLite snapshot (favorites,
// playlists, play history, users — everything except the audio files themselves,
// which stay wherever the operator's music directory already is) streamed back
// as a downloadable file. Nothing before this wrote the database anywhere else,
// so a lost/corrupted data directory meant losing every playlist and favorite
// with no way back.
export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const denied = requireAdmin(request);
  if (denied) return denied;

  // A full-DB copy is real disk + CPU work; cap how often it can be triggered
  // regardless of which admin account is asking.
  if (rateLimitWindow("backup", 3, 10 * 60_000)) {
    return json(
      { error: "Trop de sauvegardes récentes — réessaie dans quelques minutes" },
      { status: 429, headers: { "Retry-After": "120" } },
    );
  }

  const tmpFile = path.join(os.tmpdir(), `auralis-backup-${crypto.randomBytes(8).toString("hex")}.db`);
  try {
    await backupDbTo(tmpFile);
  } catch {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best effort — nothing to clean up if the backup never created the file
    }
    return json({ error: "La sauvegarde a échoué" }, { status: 500 });
  }

  const stat = fs.statSync(tmpFile);
  const nodeStream = fs.createReadStream(tmpFile);
  // The temp copy only exists to serve this one response — remove it once the
  // stream is done (success or the client aborting mid-download both fire 'close').
  nodeStream.on("close", () => fs.unlink(tmpFile, () => {}));

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(Readable.toWeb(nodeStream) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="auralis-backup-${date}.db"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
