// TikTok URL → music identification (audio Shazam first, metadata fallback).
// Resolves standard, short (vm.tiktok.com / vt.tiktok.com), and web share URLs
// without storing any downloaded audio files on disk.

import { createLogger } from "../logger";
import { shazamRecognize } from "../melody/shazam";

const log = createLogger("tiktok");

const FETCH_TIMEOUT_MS = 12_000;
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;
const GENERIC_SOUND_RE =
  /^(original\s+sound|son\s+original|som\s+original|suono\s+originale|sonido\s+original|originalton|оригинальный\s+звук|âm\s+thanh\s+gốc|เสียงต้นฉบับ)/i;

export interface TikTokMeta {
  audioUrl: string | null;
  musicTitle: string;
  musicAuthor: string;
  album: string;
  original: boolean;
  duration: number;
  cover: string | null;
}

export interface DetectedTikTokTrack {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  thumbnail?: string | null;
  source: "shazam" | "tiktok-meta";
}

export class TikTokError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TikTokError";
    this.status = status;
  }
}

/** Strict allowlist for TikTok share / video / short URLs (blocks SSRF). */
export function isTikTokUrl(rawInput: string): boolean {
  try {
    const u = new URL(rawInput.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host === "tiktok.com" || host.endsWith(".tiktok.com");
  } catch {
    return false;
  }
}

function isSafeHttpsUrl(rawUrl: string | null | undefined): rawUrl is string {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const u = new URL(rawUrl);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchTikWmMeta(tiktokUrl: string): Promise<TikTokMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`, {
      headers: { Accept: "application/json", "User-Agent": "Auralis/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new TikTokError(`Service TikTok indisponible (${res.status}).`, 502);
    }
    const payload = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: {
        duration?: number;
        cover?: string;
        origin_cover?: string;
        music?: string;
        play?: string;
        music_info?: {
          title?: string;
          author?: string;
          album?: string;
          original?: boolean;
          play?: string;
          cover?: string;
          duration?: number;
        };
      };
    };
    const d = payload.data;
    if (payload.code !== 0 || !d) {
      throw new TikTokError(payload.msg || "Impossible de lire ce lien TikTok.", 404);
    }
    const mi = d.music_info ?? {};
    const audioUrl = [d.music, mi.play, d.play].find((u) => isSafeHttpsUrl(u)) ?? null;
    const cover = [mi.cover, d.origin_cover, d.cover].find((u) => isSafeHttpsUrl(u)) ?? null;
    return {
      audioUrl,
      musicTitle: (mi.title ?? "").trim(),
      musicAuthor: (mi.author ?? "").trim(),
      album: (mi.album ?? "").trim(),
      original: Boolean(mi.original),
      duration: typeof mi.duration === "number" && mi.duration > 0 ? Math.round(mi.duration) : typeof d.duration === "number" && d.duration > 0 ? Math.round(d.duration) : 0,
      cover,
    };
  } catch (err) {
    if (err instanceof TikTokError) throw err;
    log.warn("tikwm lookup failed", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    throw new TikTokError("Impossible de récupérer cette vidéo TikTok.", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadAudioSnippet(audioUrl: string): Promise<Buffer | null> {
  if (!isSafeHttpsUrl(audioUrl)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(audioUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.tiktok.com/" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= MAX_MEDIA_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return total > 0 ? Buffer.concat(chunks, Math.min(total, MAX_MEDIA_BYTES)) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isUsableTikTokMusicMeta(meta: TikTokMeta): boolean {
  if (!meta.musicTitle) return false;
  if (GENERIC_SOUND_RE.test(meta.musicTitle)) return false;
  return true;
}

export interface IdentifyTikTokDeps {
  fetchMeta?: (url: string) => Promise<TikTokMeta>;
  fetchAudio?: (url: string) => Promise<Buffer | null>;
  recognize?: typeof shazamRecognize;
}

/** Identify the song behind a TikTok URL. Always tries audio recognition
 *  (Shazam) when audio can be fetched, and falls back to non-generic TikTok
 *  music metadata when Shazam doesn't match. */
export async function identifyTikTokAudio(rawUrl: string, deps: IdentifyTikTokDeps = {}): Promise<DetectedTikTokTrack> {
  const cleanUrl = rawUrl.trim();
  if (!isTikTokUrl(cleanUrl)) {
    throw new TikTokError("Lien TikTok invalide.", 400);
  }

  const meta = await (deps.fetchMeta ?? fetchTikWmMeta)(cleanUrl);

  if (meta.audioUrl) {
    const audioBuf = await (deps.fetchAudio ?? downloadAudioSnippet)(meta.audioUrl);
    if (audioBuf && audioBuf.length > 0) {
      try {
        const hits = await (deps.recognize ?? shazamRecognize)(audioBuf);
        const top = hits[0];
        if (top?.title) {
          return {
            title: top.title.trim(),
            artist: top.artists?.[0]?.trim() || "",
            album: top.album?.trim() || undefined,
            duration: meta.duration || undefined,
            thumbnail: meta.cover,
            source: "shazam",
          };
        }
      } catch (err) {
        log.debug("tiktok shazam recognition failed", { error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
      }
    }
  }

  if (isUsableTikTokMusicMeta(meta)) {
    return {
      title: meta.musicTitle,
      artist: meta.original ? "" : meta.musicAuthor,
      album: meta.album || undefined,
      duration: meta.duration || undefined,
      thumbnail: meta.cover,
      source: "tiktok-meta",
    };
  }

  throw new TikTokError("Musique introuvable sur cet extrait TikTok (son original ou trop court).", 404);
}
