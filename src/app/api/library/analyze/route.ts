import { getScanProgress } from "@/server/library/scanner";
import { runAnalysis } from "@/server/library/analysis";
import { getDb } from "@/server/db";
import { checkAuth, requireAdmin, json, checkCsrf } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analysis progress is folded into the scan progress object.
export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;
  return json(getScanProgress());
}

// Trigger the background mood-classifier pass. `?force=1` re-analyses the whole
// library (resets the work-queue marker); otherwise only pending tracks run.
// Admin-only — decoding the whole tree with ffmpeg is expensive.
export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const denied = requireAdmin(request);
  if (denied) return denied;

  if (new URL(request.url).searchParams.get("force") === "1") {
    // Reset every analysis work-queue marker so the whole library re-derives.
    getDb().prepare("UPDATE tracks SET analyzed_at = 0, lyrics_sentiment_at = 0, embedded_at = 0").run();
  }

  // Fire-and-forget: each pass guards against concurrent runs itself. Swallow the
  // rejection so a throw before an internal try (e.g. getDb) can't surface as an
  // unhandledRejection. Chain the reco enrichment after the mood classifier:
  // lyric sentiment always (cheap, pure TS), deep embeddings only when opted in.
  void runAnalysis()
    .catch(() => {})
    .then(() => import("@/server/reco/lyricsSentiment").then((m) => m.runLyricsSentiment()))
    .catch(() => {})
    .then(() => import("@/server/reco/embeddingExtract").then((m) => m.runEmbeddingExtraction()))
    .catch(() => {});
  return json(getScanProgress(), { status: 202 });
}
