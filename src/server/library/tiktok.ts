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

/** Strict allowlist for TikTok share / video / short / music URLs (blocks SSRF). */
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

export function extractTikTokMusicId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const pathMatch = /\/music\/(?:[^/?#]*-)?(\d{10,25})\/?$/i.exec(u.pathname);
    if (pathMatch) return pathMatch[1];
    const qp = u.searchParams.get("share_music_id");
    if (qp && /^\d{10,25}$/.test(qp)) return qp;
    return null;
  } catch {
    return null;
  }
}

/** Follow short-link redirects (`vm.tiktok.com` / `vt.tiktok.com`) safely while
 *  enforcing the TikTok host allowlist on every redirect hop (anti-SSRF). */
async function followTikTokRedirects(startUrl: string): Promise<string> {
  let current = startUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let hop = 0; hop < 5; hop += 1) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      await res.body?.cancel().catch(() => {});
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, current).toString();
      if (!isTikTokUrl(next)) break;
      current = next;
    }
    return current;
  } catch {
    return current;
  } finally {
    clearTimeout(timer);
  }
}

interface MusicEmbedFallback {
  videoUrl: string | null;
  fallbackMeta: TikTokMeta | null;
}

/** Resolve a TikTok `/music/...-<id>` sound page via TikTok's public embed page
 *  to grab the first public video using that sound (for TikWM + Shazam) plus
 *  embed metadata/MP4 fallback. */
async function resolveTikTokMusicEmbed(musicId: string): Promise<MusicEmbedFallback> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.tiktok.com/embed/music/${encodeURIComponent(musicId)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
    });
    if (!res.ok) return { videoUrl: null, fallbackMeta: null };
    const html = await res.text();
    const match = /<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (!match) return { videoUrl: null, fallbackMeta: null };
    const state = JSON.parse(match[1]) as {
      source?: {
        data?: Record<
          string,
          {
            embedInfo?: { title?: string; artist?: string; coverUrl?: string };
            videoList?: { id?: string; authorUniqueId?: string; playAddr?: string; coverUrl?: string }[];
          }
        >;
      };
    };
    const dataMap = state.source?.data ?? {};
    const entry = dataMap[`/embed/music/${musicId}`] ?? Object.values(dataMap).find((v) => Array.isArray(v?.videoList));
    const first = entry?.videoList?.find((v) => v && (v.id || isSafeHttpsUrl(v.playAddr)));
    if (!first) return { videoUrl: null, fallbackMeta: null };

    const videoUrl = first.id
      ? `https://www.tiktok.com/@${encodeURIComponent(first.authorUniqueId || "tiktok")}/video/${encodeURIComponent(first.id)}`
      : null;
    const playAddr = isSafeHttpsUrl(first.playAddr) ? first.playAddr : null;
    const cover = [entry?.embedInfo?.coverUrl, first.coverUrl].find((u) => isSafeHttpsUrl(u)) ?? null;
    const fallbackMeta: TikTokMeta | null = playAddr
      ? {
          audioUrl: playAddr,
          musicTitle: (entry?.embedInfo?.title ?? "").trim(),
          musicAuthor: (entry?.embedInfo?.artist ?? "").trim(),
          album: "",
          original: false,
          duration: 0,
          cover,
        }
      : null;
    return { videoUrl, fallbackMeta };
  } catch (err) {
    log.debug("tiktok music embed lookup failed", { musicId, error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
    return { videoUrl: null, fallbackMeta: null };
  } finally {
    clearTimeout(timer);
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
  let targetUrl = tiktokUrl;
  let fallbackMeta: TikTokMeta | null = null;

  let musicId = extractTikTokMusicId(targetUrl);
  if (!musicId && !/\/(?:video|photo)\/\d+/i.test(targetUrl)) {
    const expanded = await followTikTokRedirects(targetUrl);
    musicId = extractTikTokMusicId(expanded);
    const canonicalVideo = /https:\/\/[^/]*tiktok\.com\/@[^/?#]+\/(?:video|photo)\/\d+/i.exec(expanded);
    if (canonicalVideo) targetUrl = canonicalVideo[0];
    else if (expanded !== targetUrl) targetUrl = expanded;
  }

  if (musicId) {
    const resolved = await resolveTikTokMusicEmbed(musicId);
    if (resolved.videoUrl) targetUrl = resolved.videoUrl;
    fallbackMeta = resolved.fallbackMeta;
    if (!resolved.videoUrl && fallbackMeta) return fallbackMeta;
    if (!resolved.videoUrl) {
      throw new TikTokError("Impossible de récupérer cet extrait audio TikTok.", 404);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
      headers: { Accept: "application/json", "User-Agent": "Auralis/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (fallbackMeta) return fallbackMeta;
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
      if (fallbackMeta) return fallbackMeta;
      throw new TikTokError(payload.msg || "Impossible de lire ce lien TikTok.", 404);
    }
    const mi = d.music_info ?? {};
    const audioUrl = [d.music, mi.play, d.play].find((u) => isSafeHttpsUrl(u)) ?? fallbackMeta?.audioUrl ?? null;
    const cover = [mi.cover, d.origin_cover, d.cover].find((u) => isSafeHttpsUrl(u)) ?? fallbackMeta?.cover ?? null;
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
    if (fallbackMeta) return fallbackMeta;
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
