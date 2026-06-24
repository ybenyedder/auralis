import { runScan, getScanProgress } from "@/server/library/scanner";
import { checkAuth, requireAdmin, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reading scan progress is harmless — any authenticated user may poll it.
export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;
  return json(getScanProgress());
}

// Triggering a full library scan is expensive (CPU/IO over the whole tree), so
// it is reserved for admins — otherwise any account could DoS the host.
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const wait = new URL(request.url).searchParams.get("wait") === "1";
  if (wait) {
    const result = await runScan();
    return json(result);
  }
  // Fire-and-forget: progress is observable via GET or the SSE events stream.
  void runScan();
  return json(getScanProgress(), { status: 202 });
}
