import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stat as fsStat } from "fs/promises";
import { contentTypeFor, isSupportedAudioPath, resolveLibraryPath, resolveRealLibraryPath } from "@/server/paths";
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
  const lexicalPath = resolveLibraryPath(relativePath);

  if (!lexicalPath) return new NextResponse("Forbidden", { status: 403 });
  if (!isSupportedAudioPath(lexicalPath)) return new NextResponse("Unsupported Media Type", { status: 415 });

  // Re-resolve through realpath so a symlink inside the library that points outside
  // the music root can't be used to exfiltrate arbitrary files. A missing file or a
  // symlink that escapes the root both resolve to null here, surfacing as a 404.
  const filePath = await resolveRealLibraryPath(relativePath);
  if (!filePath) return new NextResponse("Not Found", { status: 404 });

  // One async stat instead of existsSync + statSync — keeps the blocking sync I/O
  // off the event loop on every range request (a seek storms this route). ENOENT
  // (missing file) surfaces as a 404 via the catch.
  let stat;
  try {
    stat = await fsStat(filePath);
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
  if (!stat.isFile()) return new NextResponse("Not Found", { status: 404 });

  const fileSize = stat.size;
  // Content type is derived from the request-derived path so the served MIME matches
  // the URL extension regardless of any in-library symlink target name.
  const contentType = contentTypeFor(lexicalPath);
  const range = parseRange(request.headers.get("range"), fileSize);

  if (range === "invalid") {
    return new NextResponse("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}`, "Accept-Ranges": "bytes" },
    });
  }

  // Hand-rolled Node→Web bridge instead of Readable.toWeb: toWeb() surfaces the
  // client aborting mid-stream (seek storms, tab close) as an unhandled
  // ERR_INVALID_STATE / premature-close rejection that crashes the route. Here a
  // cancelled controller just destroys the file stream and drops the chunk.
  const createWebStream = (start?: number, end?: number): ReadableStream<Uint8Array> => {
    const fileStream = fs.createReadStream(
      filePath,
      start !== undefined && end !== undefined ? { start, end } : undefined,
    );
    return new ReadableStream<Uint8Array>({
      start(controller) {
        fileStream.on("data", (chunk) => {
          try {
            controller.enqueue(new Uint8Array(chunk as Buffer));
          } catch {
            // Controller already closed/cancelled (client went away) — stop reading.
            fileStream.destroy();
            return;
          }
          // Backpressure: pause the file read when the consumer's queue is full so a
          // slow client can't force the whole file to be buffered in memory.
          if ((controller.desiredSize ?? 1) <= 0) fileStream.pause();
        });
        fileStream.on("end", () => {
          try {
            controller.close();
          } catch {
            // Ignore already closed controller errors
          }
        });
        fileStream.on("error", (err) => {
          try {
            controller.error(err);
          } catch {
            // Controller already closed — nothing to signal.
          }
        });
      },
      pull() {
        fileStream.resume();
      },
      cancel() {
        fileStream.destroy();
      },
    });
  };

  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    const stream = headOnly ? null : createWebStream(start, end);
    return new NextResponse(stream, {
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

  const stream = headOnly ? null : createWebStream();
  return new NextResponse(stream, {
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
