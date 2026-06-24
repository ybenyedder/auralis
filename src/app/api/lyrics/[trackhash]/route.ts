import { getLyrics, getCachedLyrics } from "@/server/lyrics/service";
import { checkAuth, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ trackhash: string }>;
}

// GET resolves lyrics (cache → sidecar → online). ?cached=1 skips any network call.
export async function GET(request: Request, context: Ctx) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const { trackhash } = await context.params;
  const cachedOnly = new URL(request.url).searchParams.get("cached") === "1";
  if (cachedOnly) {
    const cached = getCachedLyrics(trackhash);
    return json(cached ?? { trackhash, status: "notfound", source: null, lines: [], plain: null, synced: false });
  }
  const result = await getLyrics(trackhash);
  return json(result);
}

// POST forces a fresh online lookup (ignores negative cache).
export async function POST(request: Request, context: Ctx) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const { trackhash } = await context.params;
  const result = await getLyrics(trackhash, { forceRefetch: true });
  return json(result);
}
