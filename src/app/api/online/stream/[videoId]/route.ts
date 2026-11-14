import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/server/http";
import { onlineSearch } from "@/server/library/downloader";
import { isLazyVideoId, isValidVideoId, resolveLazyVideoId } from "@/server/library/online";
import { resolveYouTubeStream, invalidateYouTubeStream } from "@/server/library/youtube";
import { createLogger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:online-stream");

const UPSTREAM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface RouteContext {
  params: Promise<{ videoId: string }>;
}

async function openUpstream(url: string, range: string | null, method: "GET" | "HEAD", signal: AbortSignal) {
  const headers: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    "Accept-Encoding": "identity",
  };
  if (range) headers.Range = range;
  return fetch(url, { method, headers, signal });
}

async function handleStream(request: NextRequest, context: RouteContext, headOnly: boolean) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const { videoId: rawVideoId } = await context.params;
  if (!isValidVideoId(rawVideoId)) {
    return NextResponse.json({ error: "Identifiant vidéo invalide" }, { status: 400 });
  }

  const range = request.headers.get("range");
  const method = headOnly ? "HEAD" : "GET";
  let videoId = rawVideoId;

  try {
    if (isLazyVideoId(rawVideoId)) {
      const resolved = await resolveLazyVideoId(rawVideoId, async (q) => {
        const s = await onlineSearch(q, 3, { bypassDownloadGate: true });
        return s.results[0] ?? null;
      });
      if (!resolved) {
        return NextResponse.json({ error: "Aucun flux audio trouvé pour ce titre" }, { status: 404 });
      }
      videoId = resolved;
    }

    let stream = await resolveYouTubeStream(videoId);
    let upstream = await openUpstream(stream.url, range, method, request.signal);

    if (upstream.status === 403 || upstream.status === 410 || upstream.status === 404) {
      try {
        await upstream.body?.cancel();
      } catch {
        /* ignore */
      }
      invalidateYouTubeStream(videoId);
      stream = await resolveYouTubeStream(videoId, { forceRefresh: true, skipClient: stream.client });
      upstream = await openUpstream(stream.url, range, method, request.signal);
    }

    if (!upstream.ok && upstream.status !== 206) {
      try {
        await upstream.body?.cancel();
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: `Flux audio indisponible (HTTP ${upstream.status})` }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || stream.mime || "audio/mp4");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    headers.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");

    if (headOnly) {
      try {
        await upstream.body?.cancel();
      } catch {
        /* ignore */
      }
      return new NextResponse(null, { status: upstream.status, headers });
    }

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    log.warn("online stream failed", { videoId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Impossible de lire ce titre en streaming" }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleStream(request, context, false);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return handleStream(request, context, true);
}
