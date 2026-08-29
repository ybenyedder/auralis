import { readArtVariant, readCachedArt } from "@/server/library/art";
import { applySecurityHeaders } from "@/server/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ hash: string }>;
}

export async function GET(request: Request, context: Ctx) {
  const { hash } = await context.params;
  const sizeRaw = new URL(request.url).searchParams.get("w");
  const size = sizeRaw ? parseInt(sizeRaw, 10) : 0;

  // Content-addressed: the hash (+ requested size) IS the validator, so we can
  // cache forever and answer revalidations with a cheap 304.
  const etag = `"${hash}-${size || 0}"`;
  const cacheControl = "public, max-age=31536000, immutable";
  if (request.headers.get("if-none-match") === etag) {
    return applySecurityHeaders(
      new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } }),
    );
  }

  const art = size > 0 ? await readArtVariant(hash, size) : await readCachedArt(hash);
  if (!art) return new NextResponse("Not Found", { status: 404 });

  const res = new NextResponse(art.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": art.contentType,
      "Content-Length": String(art.buffer.length),
      "Cache-Control": cacheControl,
      ETag: etag,
    },
  });
  return applySecurityHeaders(res);
}
