import { getLyrics, getCachedLyrics } from "@/server/lyrics/service";
import { checkAuth, json } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { rateLimitWindow } from "@/server/rateLimit";

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
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  // Throttle deliberate online refetches: one account shouldn't be able to loop
  // POSTs and hammer LRCLIB/lyrics.ovh (which would get the host IP blocked).
  if (rateLimitWindow(`lyrics:${user.id}`, 12, 60_000)) {
    return json(
      { error: "Trop de requêtes — réessaie dans un instant" },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const { trackhash } = await context.params;
  const result = await getLyrics(trackhash, { forceRefetch: true });
  return json(result);
}
