import { getCachedLyrics } from "@/server/lyrics/service";
import { json, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { rateLimitWindow } from "@/server/rateLimit";
import { startAlignOne, getAlignStatus } from "@/server/library/alignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ trackhash: string }>;
}

// GET reports the on-demand forced-alignment status for a track so the client can
// poll after kicking a job (running | ok | failed | unavailable | idle).
export async function GET(request: Request, context: Ctx) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const { trackhash } = await context.params;
  return json(getAlignStatus(trackhash) ?? { state: "idle" });
}

// POST kicks the local forced-alignment AI for ONE track: it refines existing
// line-level synced lyrics into word-by-word karaoke by listening to the audio.
// Returns immediately (the work runs detached); the client polls GET for the
// outcome. Heavy, so it's rate-limited and single-flighted server-side.
export async function POST(request: Request, context: Ctx) {
  // Unguarded, this lets a cross-site page burn a visiting user's rate-limit
  // budget on a heavy local ffmpeg+ML job (compute DoS), not just an API call.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  if (rateLimitWindow(`align:${user.id}`, 6, 60_000)) {
    return json({ error: "Trop de requêtes — réessaie dans un instant" }, { status: 429, headers: { "Retry-After": "30" } });
  }

  const { trackhash } = await context.params;
  const cached = getCachedLyrics(trackhash);

  // Forced alignment refines a known transcript — it needs line-level SYNCED lyrics
  // as input. Plain (untimed) or missing lyrics can't be aligned.
  if (!cached || !cached.synced) {
    return json({ state: "no-source", message: "Pas de paroles synchronisées ligne-à-ligne à convertir." });
  }
  // Already word-by-word — nothing to do.
  if (cached.lines.some((l) => l.words && l.words.length > 0)) {
    return json({ state: "ready" });
  }

  startAlignOne(trackhash);
  return json({ state: "running" });
}
