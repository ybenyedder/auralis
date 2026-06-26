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
    getDb().prepare("UPDATE tracks SET analyzed_at = 0").run();
  }

  void runAnalysis();
  return json(getScanProgress(), { status: 202 });
}
