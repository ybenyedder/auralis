// "Hum to search" — upload a short recording (humming, singing, whistling or
// ambient audio) and get back matches from the local melody index plus (when
// ACRCloud credentials are configured) the global catalog.

import { json, checkCsrf } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import { recognizeHum } from "@/server/melody/recognize";
import { acrcloudConfigured } from "@/server/melody/acrcloud";
import { hasFfmpeg } from "@/server/melody/decode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload cap — a 30 s clip is ~1 MB; anything past 8 MB is abuse. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const contentType = request.headers.get("content-type") ?? "audio/webm";
  if (!contentType.includes("audio") && !contentType.includes("video") && !contentType.includes("octet-stream")) {
    return json({ error: "Corps audio attendu" }, { status: 415 });
  }
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) return json({ error: "Enregistrement vide" }, { status: 400 });
  if (buf.length > MAX_AUDIO_BYTES) return json({ error: "Enregistrement trop volumineux" }, { status: 413 });

  const result = await recognizeHum(buf, contentType);
  return json({
    ...result,
    ffmpeg: await hasFfmpeg(),
    remoteEnabled: acrcloudConfigured(),
  });
}
