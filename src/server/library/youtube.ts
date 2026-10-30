// Pure-JS YouTube engine (InnerTube via youtubei.js) — search + best-audio
// streaming + byte-level download. This replaces the old yt-dlp/Python
// integration: NO Python, NO external binary is needed for the YouTube part.
//
// Why clients are rotated: YouTube hands out formats that sometimes carry an
// unplayable/undecipherable URL for a given InnerTube client (403s, PO-token
// walls). IOS / ANDROID_VR / VISIONOS currently return plain, playable URLs
// without a JS evaluator, so each retry attempt rotates the client and re-
// extracts FRESH URLs — the same "re-roll the dice" strategy the old yt-dlp
// path used with `--extractor-args youtube:player_client=...`.
//
// This module is server-only. It must never be imported from a client component.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Readable, Transform, type TransformCallback } from "stream";
import { pipeline } from "stream/promises";
import { createLogger } from "../logger";

const log = createLogger("youtube");

// youtubei.js is ESM-only; a dynamic import works from both CJS and ESM server
// builds and keeps the module lazy (it pulls in a protobuf runtime + a JS
// parser for the player decompiler).
type InnertubeSession = Awaited<ReturnType<typeof createSession>>;

async function createSession() {
  // NOTE: no turbopackIgnore here — the import must stay visible to the
  // standalone tracer so youtubei.js (and its deps) land in node_modules of
  // the packaged server (see next.config.ts serverExternalPackages).
  const { Innertube } = await import("youtubei.js");
  return Innertube.create();
}

let sessionPromise: Promise<InnertubeSession> | null = null;

function getSession(): Promise<InnertubeSession> {
  if (!sessionPromise) sessionPromise = createSession();
  return sessionPromise;
}

/** Drop the cached InnerTube session so the next call handshakes from scratch
 *  (fresh visitor data) — used when YouTube starts refusing a session. */
function resetSession() {
  sessionPromise = null;
}

/** InnerTube clients whose audio URLs currently work without a JS evaluator.
 *  Rotated per attempt, newest-tested first. */
const STREAM_CLIENTS = ["IOS", "ANDROID_VR", "VISIONOS"] as const;
type StreamClient = (typeof STREAM_CLIENTS)[number];

// ---- search ----------------------------------------------------------------

export interface YouTubeHit {
  videoId: string;
  title: string;
  uploader: string;
  /** Seconds; 0 when YouTube didn't expose a duration (e.g. live). */
  duration: number;
  thumbnail: string | null;
  url: string;
}

/** youtubei.js' search results are a union of node shapes (Video, CompactVideo,
 *  LockupView…) — only some of them carry the fields we need. Duck-type it. */
interface SearchVideoLike {
  video_id?: string;
  title?: { text?: string };
  author?: { name?: string };
  duration?: { seconds?: number };
  best_thumbnail?: { url?: string };
  thumbnails?: Array<{ url?: string }>;
}

/** YouTube search (videos only). Throws on engine failure — callers map the
 *  error to their own user-facing wording. */
export async function youtubeSearch(query: string, limit: number): Promise<YouTubeHit[]> {
  const yt = await getSession();
  const search = await yt.search(query, { type: "video" });
  const hits: YouTubeHit[] = [];
  for (const video of ((search.videos ?? []) as unknown as SearchVideoLike[])) {
    const videoId = video.video_id;
    // Some YouTube result nodes mash metadata into the title text (view
    // counts, line breaks) — flatten it to a single clean line.
    const title = (video.title?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!videoId || !title) continue;
    hits.push({
      videoId,
      title,
      uploader: video.author?.name ?? "YouTube",
      duration: Math.round(video.duration?.seconds ?? 0),
      thumbnail: video.best_thumbnail?.url ?? video.thumbnails?.[0]?.url ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

// ---- metadata cleanup ------------------------------------------------------

/** Strip the "(Official Audio)" / "[Lyrics]" / "- Topic" noise YouTube titles
 *  drown in, WITHOUT touching meaningful parenthesised content like "(feat. X)"
 *  or "(Remix)". Noise tokens are removed wherever they sit in the title. */
export function cleanTitle(raw: string): string {
  const NOISE = [
    "official audio", "official video", "official music video", "official visualizer",
    "official visualiser", "official lyric video", "official lyrics video",
    "lyric video", "lyrics video", "music video", "lyrics", "lyric",
    "audio", "visualizer", "visualiser", "video",
    "hq", "hd", "4k", "1080p", "720p", "60fps", "hd audio", "full album", "full mix",
  ];
  const noiseRe = new RegExp(
    `\\s*[\\(\\[]\\s*(?:${NOISE.join("|")})\\s*[\\)\\]]`,
    "gi",
  );
  let title = raw.trim();
  for (let i = 0; i < 3; i++) {
    const next = title.replace(noiseRe, " ").replace(/\s{2,}/g, " ").trim();
    if (next === title) break;
    title = next;
  }
  return title.replace(/\s*#\s*shorts\s*$/i, "").trim() || raw.trim();
}

/** Split "Artist - Title" (also – —) into parts. YouTube music uploads almost
 *  always use that shape; the library then indexes a real artist instead of
 *  channelling everything under the uploader. Returns null when there is no
 *  convincing separator (so the caller keeps the full title). */
export function splitArtistTitle(raw: string): { artist: string; title: string } | null {
  const m = /^(.{1,60}?)\s+[-–—]\s+(.{2,})$/.exec(raw.trim());
  if (!m) return null;
  const artist = m[1].trim().replace(/\s*-\s*Topic$/i, "").trim();
  const title = m[2].trim();
  if (!artist || !title) return null;
  return { artist, title };
}

/** Container extension for a downloaded audio stream's mime type. */
export function audioExtFor(mime: string | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("mp4a")) return ".m4a";
  if (m.includes("webm")) return ".webm";
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  return ".m4a";
}

// ---- download --------------------------------------------------------------

export interface DownloadAudioOptions {
  videoId: string;
  /** Full (uncleaned) video title — used for tags and the artist split. */
  title: string;
  /** Channel name — artist/album fallback. */
  uploader?: string;
  /** Final output path WITHOUT extension (the caller owns the directory and
   *  the `[VIDEOID]` filename marker). */
  outBase: string;
  /** 0-100. Reported as bytes/content-length, capped at 99 by convention —
   *  the caller flips it to 100 once the track is indexed. */
  onProgress?: (percent: number) => void;
  /** Aborts the HTTP download (cancel button / timeout). */
  signal?: AbortSignal;
  /** Attempts per job (client rotation). */
  attempts?: number;
}

export interface DownloadAudioResult {
  /** Absolute path of the final audio file. */
  filepath: string;
  /** Mime of the stream actually downloaded. */
  mime: string;
}

class Counting extends Transform {
  private readonly total: number;
  private readonly onProgress?: (percent: number) => void;
  private seen = 0;
  constructor(total: number, onProgress?: (percent: number) => void) {
    super();
    this.total = total;
    this.onProgress = onProgress;
  }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.seen += chunk.length;
    if (this.total > 0 && this.onProgress) {
      const pct = Math.round((this.seen / this.total) * 100);
      this.onProgress(Math.max(0, Math.min(99, pct)));
    }
    cb(null, chunk);
  }
}

/** Probe ffmpeg once. It is OPTIONAL: without it the raw stream is kept as-is
 *  (m4a/webm, no tags), exactly like the old behavior. */
let ffmpegAvailable: boolean | undefined;
function hasFfmpeg(): boolean {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  ffmpegAvailable = fs.existsSync("/usr/bin/ffmpeg") || fs.existsSync("/usr/local/bin/ffmpeg");
  return ffmpegAvailable;
}

/** Remux tags + embedded cover into the downloaded file with a single ffmpeg
 *  pass (`-c copy` when the container allows it — no re-encode). Falls back to
 *  the raw file when ffmpeg is missing or refuses. */
async function tagWithFfmpeg(rawPath: string, finalPath: string, tags: Record<string, string>, coverPath: string | null): Promise<boolean> {
  const args = ["-y", "-loglevel", "error", "-i", rawPath];
  if (coverPath) args.push("-i", coverPath, "-map", "0:a:0", "-map", "1:v:0");
  else args.push("-map", "0:a:0");
  // Audio: copy when the source already is mp4 audio; otherwise re-encode to
  // AAC so the output can carry an embedded picture (webm can't).
  if (finalPath.endsWith(".m4a") && !rawPath.endsWith(".m4a")) args.push("-c:a", "aac", "-b:a", "192k");
  else args.push("-c:a", "copy");
  if (coverPath) args.push("-c:v", "mjpeg", "-q:v", "2", "-disposition:v:0", "attached_pic");
  for (const [key, value] of Object.entries(tags)) {
    if (value) args.push("-metadata", `${key}=${value}`);
  }
  args.push("-movflags", "+faststart", finalPath);
  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.stderr.on("data", (c: Buffer) => {
      err = (err + c.toString()).slice(-2000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        log.warn("ffmpeg tag/cover pass failed", { code, error: err.slice(0, 300) });
        resolve(false);
        return;
      }
      resolve(fs.existsSync(finalPath));
    });
  });
}

/** Download the best audio for a video into `<outBase>.<ext>`, then (when
 *  ffmpeg is present) embed title/artist/album + the thumbnail as cover art.
 *  Throws with a sanitized message when every attempt failed. */
export async function downloadYouTubeAudio(opts: DownloadAudioOptions): Promise<DownloadAudioResult> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  let lastError = "Le téléchargement a échoué";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (opts.signal?.aborted) throw new Error("Annulé");
    const client: StreamClient | undefined = STREAM_CLIENTS[(attempt - 1) % STREAM_CLIENTS.length];
    try {
      const yt = await getSession();

      // Fresh metadata + streaming URL for THIS attempt (YouTube invalidates
      // old URLs and sometimes 403s a client that worked a minute ago).
      const [info, format] = await Promise.all([
        yt.getBasicInfo(opts.videoId, client ? { client } : undefined),
        yt.getStreamingData(opts.videoId, {
          type: "audio",
          quality: "best",
          ...(client ? { client } : {}),
        }),
      ]);
      const streamUrl = format.url;
      if (!streamUrl) throw new Error("Aucun flux audio exploitable");

      const title = cleanTitle(opts.title || info.basic_info?.title || "audio");
      const parts = splitArtistTitle(title);
      const artist = parts?.artist ?? opts.uploader ?? info.basic_info?.author ?? "YouTube";
      const trackTitle = parts?.title ?? title;
      const uploader = opts.uploader ?? info.basic_info?.author ?? "YouTube";

      const mime = format.mime_type ?? "audio/mp4";
      const rawExt = audioExtFor(mime);
      const targetExt = hasFfmpeg() ? ".m4a" : rawExt;
      // The raw download MUST land on a distinct path from the final one:
      // ffmpeg can't write its output on top of its input (it truncates the
      // file it is reading). ".part" is also deliberately NOT an audio
      // extension so leftover cleanup can never mistake a partial for a track.
      const rawPath = opts.outBase + ".part";
      const finalPath = opts.outBase + targetExt;

      // Stream the bytes to disk with progress. Plain fetch (NOT youtubei.js'
      // downloader) — its internal client is currently rejected by
      // googlevideo while a bare fetch works fine.
      const res = await fetch(streamUrl, {
        signal: opts.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!res.ok || !res.body) throw new Error(`Flux audio refusé (HTTP ${res.status})`);
      const total = Number(format.content_length ?? res.headers.get("content-length") ?? 0) || 0;

      fs.mkdirSync(path.dirname(opts.outBase), { recursive: true });
      const body = Readable.fromWeb(res.body as import("stream/web").ReadableStream<Uint8Array>);
      await pipeline(body, new Counting(total, opts.onProgress), fs.createWriteStream(rawPath));

      if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size === 0) {
        throw new Error("Téléchargement vide");
      }

      // Cover art (best-effort) — embedded as attached picture below.
      let coverPath: string | null = null;
      const thumb = info.basic_info?.thumbnail?.at(-1)?.url ?? info.basic_info?.thumbnail?.[0]?.url ?? null;
      if (thumb && hasFfmpeg()) {
        try {
          const cover = await fetch(thumb, { signal: opts.signal });
          if (cover.ok) {
            coverPath = opts.outBase + ".cover";
            fs.writeFileSync(coverPath, Buffer.from(await cover.arrayBuffer()));
          }
        } catch {
          coverPath = null;
        }
      }

      if (hasFfmpeg()) {
        const tags: Record<string, string> = {
          title: trackTitle,
          artist,
          album: uploader,
          comment: `https://www.youtube.com/watch?v=${opts.videoId}`,
        };
        const ok = await tagWithFfmpeg(rawPath, finalPath, tags, coverPath);
        try {
          if (coverPath) fs.rmSync(coverPath, { force: true });
        } catch {
          /* best effort */
        }
        if (ok) {
          if (rawPath !== finalPath) fs.rmSync(rawPath, { force: true });
          return { filepath: finalPath, mime };
        }
        // ffmpeg refused → keep the raw stream as the result.
        fs.rmSync(finalPath, { force: true });
        fs.renameSync(rawPath, finalPath);
        return { filepath: finalPath, mime };
      }

      // No ffmpeg: raw file, no tags.
      fs.renameSync(rawPath, finalPath);
      return { filepath: finalPath, mime };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Annulé" || opts.signal?.aborted) throw new Error("Annulé");
      lastError = message;
      log.warn("youtube download attempt failed", { videoId: opts.videoId, client, attempt, error: message.slice(0, 200) });
      // A poisoned session explains a whole class of failures — rebuild it
      // before the next attempt.
      if (attempt === 2) resetSession();
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  throw new Error(lastError.slice(0, 300));
}
