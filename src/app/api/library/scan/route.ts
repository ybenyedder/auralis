import { runScan, getScanProgress } from "@/server/library/scanner";
import { checkAuth, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;
  return json(getScanProgress());
}

export async function POST(request: Request) {
  const denied = checkAuth(request);
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
