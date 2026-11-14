import { NextRequest, NextResponse } from "next/server";
import { isValidVideoId } from "@/server/library/online";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ videoId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { videoId } = await context.params;
  if (!isValidVideoId(videoId)) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const candidates = [
    `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: request.signal });
      if (!res.ok || !res.body) continue;
      return new NextResponse(res.body, {
        status: 200,
        headers: {
          "Content-Type": res.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, max-age=86400, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    }
  }

  return new NextResponse("Not Found", { status: 404 });
}
