// Optional ACRCloud client — the "SoundHound-like" global humming/cover
// recognition behind env-configured credentials. When no keys are configured
// the whole module no-ops and "hum to search" runs against the LOCAL library
// only (see recognize.ts).
//
// Protocol: POST multipart /v1/identify with an HMAC-SHA1 signed request
// (docs.acrcloud.com/reference/identification-api/identification-api).
// Server-only module.

import { createHmac } from "crypto";
import { createLogger } from "../logger";

const log = createLogger("acrcloud");

export interface AcrMatch {
  title: string;
  artists: string[];
  score: number;
  source: "humming" | "music";
}

function config(): { host: string; key: string; secret: string } | null {
  const host = process.env.ACRACLOUD_HOST?.trim();
  const key = process.env.ACRACLOUD_KEY?.trim();
  const secret = process.env.ACRACLOUD_SECRET?.trim();
  if (!host || !key || !secret) return null;
  return { host, key, secret };
}

export function acrcloudConfigured(): boolean {
  return config() !== null;
}

/** Identify an audio sample (≤ 15 s works best). Returns null when ACRCloud is
 *  unconfigured, unreachable, or finds nothing — callers treat it as best-effort. */
export async function identifyWithAcrcloud(audio: Buffer, contentType: string, filename = "sample.webm"): Promise<AcrMatch[] | null> {
  const cfg = config();
  if (!cfg) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const dataType = "audio";
  const signatureVersion = "1";
  const httpUri = "/v1/identify";
  const stringToSign = `POST\n${httpUri}\n${cfg.key}\n${dataType}\n${signatureVersion}\n${timestamp}`;
  const signature = createHmac("sha1", cfg.secret).update(stringToSign).digest("base64");

  const form = new FormData();
  form.set("sample", new Blob([new Uint8Array(audio)], { type: contentType }), filename);
  form.set("access_key", cfg.key);
  form.set("sample_bytes", String(audio.length));
  form.set("timestamp", timestamp);
  form.set("signature", signature);
  form.set("data_type", dataType);
  form.set("signature_version", signatureVersion);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`https://${cfg.host}${httpUri}`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      log.warn("acrcloud identify failed", { status: res.status });
      return null;
    }
    const body = (await res.json()) as {
      status?: { code?: number; msg?: string };
      metadata?: {
        humming?: Array<{ title?: string; artists?: Array<{ name?: string }>; score?: string | number }>;
        music?: Array<{ title?: string; artists?: Array<{ name?: string }>; score?: string | number }>;
      };
    };
    if (body.status?.code !== 0) {
      log.warn("acrcloud no result", { code: body.status?.code, msg: body.status?.msg });
      return [];
    }
    const parse = (rows: Array<{ title?: string; artists?: Array<{ name?: string }>; score?: string | number }> | undefined, source: "humming" | "music"): AcrMatch[] =>
      (rows ?? [])
        .filter((row) => row.title)
        .map((row) => ({
          title: String(row.title),
          artists: (row.artists ?? []).map((a) => a.name ?? "").filter(Boolean),
          score: Number(row.score ?? 0),
          source,
        }));
    return [...parse(body.metadata?.humming, "humming"), ...parse(body.metadata?.music, "music")];
  } catch (err) {
    log.warn("acrcloud request error", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return null;
  }
}
