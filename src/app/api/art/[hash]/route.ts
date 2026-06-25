import { readCachedArt } from "@/server/library/art";
import { applySecurityHeaders } from "@/server/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ hash: string }>;
}

export async function GET(_request: Request, context: Ctx) {
  const { hash } = await context.params;
  const art = await readCachedArt(hash);
  if (!art) return new NextResponse("Not Found", { status: 404 });

  // Content-addressed: the hash IS the validator, so cache aggressively & forever.
  const res = new NextResponse(art.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": art.contentType,
      "Content-Length": String(art.buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${hash}"`,
    },
  });
  return applySecurityHeaders(res);
}
