import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { contentTypeFor, isSupportedAudioPath, resolveLibraryPath } from "@/server/paths";
import { checkAuth } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

function parseRange(rangeHeader: string | null, fileSize: number) {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return "invalid" as const;

  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return "invalid" as const;

  let start: number;
  let end: number;
  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid" as const;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : fileSize - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= fileSize) {
    return "invalid" as const;
  }
  return { start, end: Math.min(end, fileSize - 1) };
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function streamAudio(request: NextRequest, context: RouteContext, headOnly = false) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const params = await context.params;
  const relativePath = params.path.map(decodePathSegment).join("/");
  const filePath = resolveLibraryPath(relativePath);

  if (!filePath) return new NextResponse("Forbidden", { status: 403 });
  if (!isSupportedAudioPath(filePath)) return new NextResponse("Unsupported Media Type", { status: 415 });
  if (!fs.existsSync(filePath)) return new NextResponse("Not Found", { status: 404 });

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return new NextResponse("Not Found", { status: 404 });

  const fileSize = stat.size;
  const contentType = contentTypeFor(filePath);
  const range = parseRange(request.headers.get("range"), fileSize);

  if (range === "invalid") {
    return new NextResponse("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}`, "Accept-Ranges": "bytes" },
    });
  }

  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    const stream = headOnly ? null : Readable.toWeb(fs.createReadStream(filePath, { start, end }));
    return new NextResponse(stream as BodyInit | null, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const stream = headOnly ? null : Readable.toWeb(fs.createReadStream(filePath));
  return new NextResponse(stream as BodyInit | null, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return streamAudio(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return streamAudio(request, context, true);
}
