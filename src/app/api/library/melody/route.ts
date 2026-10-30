// Melody index management for "hum to search": progress/status + the admin
// trigger for the (heavy, opt-in) background indexing pass.

import { json, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { runMelodyIndex, melodyProgress } from "@/server/melody/indexer";
import { hasFfmpeg } from "@/server/melody/decode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  return json({ ...melodyProgress(), ffmpeg: await hasFfmpeg() });
}

/** POST (admin) — start/restart an indexing pass. */
export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  if (user.is_admin !== 1) return json({ error: "Réservé à l'admin" }, { status: 403 });

  if (!(await hasFfmpeg())) {
    return json({ ok: false, error: "ffmpeg est requis pour indexer la mélodie" }, { status: 503 });
  }
  // Fire and forget — the pass runs in the background and its progress is
  // polled through this same GET (and the library snapshot's `scan` object).
  void runMelodyIndex();
  return json({ ok: true, started: true });
}
