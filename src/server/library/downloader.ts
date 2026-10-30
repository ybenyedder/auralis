// Online search + on-demand track downloads ("that song isn't in my library —
// fetch it"). Backed by a PURE-JS YouTube engine (src/server/library/youtube.ts,
// InnerTube via youtubei.js): a YouTube search powers the online suggestions,
// and a best-audio extraction drops the file into a subfolder of the music dir,
// after which the regular incremental scanner picks it up like any other file.
// No Python, no yt-dlp, no external binary — ffmpeg (optional) only upgrades
// the result with embedded tags + cover art.
//
// This module is server-only. It must never be imported from a client component.

import fs from "fs";
import path from "path";
import { createLogger } from "../logger";
import { getConfig } from "../config";
import { getDb } from "../db";
import { isSupportedAudioPath } from "../paths";
import { runScan } from "./scanner";
import { youtubeSearch, downloadYouTubeAudio, type YouTubeHit } from "./youtube";

const log = createLogger("downloader");

export interface OnlineResult {
  videoId: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string | null;
  url: string;
}

export type DownloadStatus = "queued" | "resolving" | "downloading" | "scanning" | "done" | "error";

export interface DownloadJob {
  id: string;
  query: string;
  videoId: string | null;
  title: string | null;
  status: DownloadStatus;
  /** 0-100 while downloading; meaningless otherwise. */
  progress: number;
  error: string | null;
  /** Trackhash of the imported file once status === "done". */
  trackhash: string | null;
  requestedBy: string;
  startedAt: number;
  finishedAt: number | null;
}

// ---- availability ----------------------------------------------------------

function enabledByConfig(): boolean {
  const v = process.env.AURALIS_DOWNLOADS?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

/** Awaited form for routes: downloads are pure JS now, so availability is
 *  purely a configuration question (kept async for API compatibility). */
export async function downloadsAvailable(): Promise<boolean> {
  return enabledByConfig();
}

export function downloadsEnabled(): boolean {
  return enabledByConfig();
}

export function downloadsDir(): string {
  const name = process.env.AURALIS_DOWNLOADS_DIR?.trim() || "Auralis Downloads";
  return path.join(/*turbopackIgnore: true*/ getConfig().musicDir, name);
}

// ---- online search ----------------------------------------------------------

const searchCache = new Map<string, { at: number; results: OnlineResult[] }>();
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const MAX_DURATION_S = 15 * 60; // skip uploads longer than 15 min (mixes, podcasts)

function toOnlineResult(hit: YouTubeHit): OnlineResult {
  return {
    videoId: hit.videoId,
    title: hit.title,
    uploader: hit.uploader,
    duration: hit.duration,
    thumbnail: hit.thumbnail,
    url: hit.url,
  };
}

/** YouTube search via the JS engine. Cached 10 min per query. */
export async function onlineSearch(query: string, limit = 8): Promise<{ enabled: boolean; results: OnlineResult[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { enabled: downloadsEnabled(), results: [] };
  if (!downloadsEnabled()) return { enabled: false, results: [], error: "Téléchargement désactivé sur ce serveur" };

  const cached = searchCache.get(trimmed.toLowerCase());
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) {
    return { enabled: true, results: cached.results.slice(0, limit) };
  }

  let hits: YouTubeHit[];
  try {
    hits = await youtubeSearch(trimmed, Math.max(limit, 10));
  } catch (err) {
    log.warn("online search failed", { error: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    return { enabled: true, results: [], error: "Recherche en ligne indisponible" };
  }
  const results: OnlineResult[] = [];
  for (const hit of hits) {
    if (!hit.videoId || !hit.title) continue;
    if (hit.duration <= 0 || hit.duration > MAX_DURATION_S) continue;
    results.push(toOnlineResult(hit));
    if (results.length >= limit) break;
  }
  searchCache.set(trimmed.toLowerCase(), { at: Date.now(), results });
  // Bound the cache so a long-lived server doesn't grow it forever.
  if (searchCache.size > 200) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [k] of oldest) searchCache.delete(k);
  }
  return { enabled: true, results };
}

// ---- download jobs ----------------------------------------------------------

const jobs = new Map<string, DownloadJob>();
const MAX_ACTIVE = 2;
const MAX_QUEUED = 6;
const MAX_ACTIVE_PER_USER = 2;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_COMPLETED_JOBS = 30;
/** YouTube video ids are exactly 11 chars of this alphabet. Validating the
 *  CLIENT-SUPPLIED id keeps it from smuggling query params into the watch URL,
 *  path separators into the `[id]` filename marker, or anything else into a
 *  filename or engine argument it wasn't meant to be. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function activeCount(): number {
  let n = 0;
  for (const job of jobs.values()) if (job.status !== "done" && job.status !== "error") n++;
  return n;
}

function sanitize(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

function slug(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}& '()-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "audio"
  );
}

/** Find a track row imported at the given absolute file path. */
function trackByFilepath(filepath: string): { trackhash: string; title: string } | null {
  try {
    const row = getDb().prepare("SELECT trackhash, title FROM tracks WHERE filepath = ?").get(filepath) as
      | { trackhash: string; title: string }
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** Same video already downloaded? Match the `[VIDEOID]` marker in the filename —
 *  AUDIO files only: sidecar leftovers (cover art, partials) can land on the
 *  same output template and must never masquerade as "already downloaded". */
function existingFileFor(videoId: string): string | null {
  const dir = downloadsDir();
  try {
    const hit = fs.readdirSync(/*turbopackIgnore: true*/ dir).find(
      (name) => name.includes(`[${videoId}]`) && isSupportedAudioPath(name),
    );
    return hit ? path.join(dir, hit) : null;
  } catch {
    return null;
  }
}

function pumpQueue() {
  for (const job of jobs.values()) {
    if (job.status !== "queued") continue;
    if (activeCount() > MAX_ACTIVE) return;
    void execute(job);
  }
}

export function startDownload(opts: {
  query: string;
  videoId?: string;
  title?: string;
  requestedBy: string;
}): { ok: true; job: DownloadJob } | { ok: false; error: string; status: number } {
  if (!downloadsEnabled()) {
    return { ok: false, error: "Téléchargement désactivé sur ce serveur", status: 503 };
  }
  if (opts.videoId && !VIDEO_ID_RE.test(opts.videoId)) {
    return { ok: false, error: "Identifiant vidéo invalide", status: 400 };
  }
  const activeForUser = [...jobs.values()].filter(
    (j) => j.requestedBy === opts.requestedBy && j.status !== "done" && j.status !== "error",
  ).length;
  if (activeForUser >= MAX_ACTIVE_PER_USER) {
    return { ok: false, error: "Trop de téléchargements en cours pour votre compte", status: 429 };
  }
  if (activeCount() >= MAX_ACTIVE + MAX_QUEUED) {
    return { ok: false, error: "File de téléchargement saturée — réessayez dans un instant", status: 429 };
  }
  // Dedupe: a job for the same video is already running → hand it back.
  if (opts.videoId) {
    const twin = [...jobs.values()].find(
      (j) => j.videoId === opts.videoId && j.status !== "done" && j.status !== "error",
    );
    if (twin) return { ok: true, job: { ...twin } };
  }

  const job: DownloadJob = {
    id: `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    query: opts.query,
    videoId: opts.videoId ?? null,
    title: opts.title ?? null,
    status: "queued",
    progress: 0,
    error: null,
    trackhash: null,
    requestedBy: opts.requestedBy,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  void (async () => {
    // Small yield so the POST response (which returns the queued job) wins the
    // race against an immediate status flip.
    await new Promise((r) => setTimeout(r, 50));
    pumpQueue();
  })();
  pruneFinished();
  return { ok: true, job: { ...job } };
}

/** Bulk enqueue — used by "download the playlist's missing tracks". Batches
 *  skip the per-user/queue caps at CREATION (the global MAX_ACTIVE pacing still
 *  trickles the actual downloads) and are rate-limited per user. Every item is
 *  validated exactly like a single start. */
const BATCH_MAX_ITEMS = 200;
const batchStarts = new Map<string, number[]>();

export function startDownloadBatch(opts: {
  items: Array<{ query: string; videoId?: string; title?: string }>;
  requestedBy: string;
}): { ok: true; jobs: DownloadJob[] } | { ok: false; error: string; status: number } {
  if (!downloadsEnabled()) {
    return { ok: false, error: "Téléchargement désactivé sur ce serveur", status: 503 };
  }
  if (!Array.isArray(opts.items) || opts.items.length === 0) {
    return { ok: false, error: "Liste de téléchargements vide", status: 400 };
  }
  if (opts.items.length > BATCH_MAX_ITEMS) {
    return { ok: false, error: `Trop de titres d'un coup (max ${BATCH_MAX_ITEMS})`, status: 400 };
  }
  const now = Date.now();
  const starts = (batchStarts.get(opts.requestedBy) ?? []).filter((t) => now - t < 60_000);
  if (starts.length >= 3) {
    return { ok: false, error: "Trop de lots de téléchargement — réessayez dans une minute", status: 429 };
  }
  for (const item of opts.items) {
    if (item.videoId && !VIDEO_ID_RE.test(item.videoId)) {
      return { ok: false, error: "Identifiant vidéo invalide", status: 400 };
    }
    if (!item.videoId && !item.query?.trim()) {
      return { ok: false, error: "Précisez un identifiant vidéo ou une recherche", status: 400 };
    }
  }
  starts.push(now);
  batchStarts.set(opts.requestedBy, starts);

  const created: DownloadJob[] = [];
  for (const item of opts.items) {
    // Dedupe within and against running work: same video already queued → skip.
    if (item.videoId) {
      const twin = [...jobs.values()].find(
        (j) => j.videoId === item.videoId && j.status !== "done" && j.status !== "error",
      );
      if (twin) {
        created.push({ ...twin });
        continue;
      }
    }
    const job: DownloadJob = {
      id: `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      query: item.query.slice(0, 300),
      videoId: item.videoId ?? null,
      title: item.title?.slice(0, 300) ?? null,
      status: "queued",
      progress: 0,
      error: null,
      trackhash: null,
      requestedBy: opts.requestedBy,
      startedAt: now,
      finishedAt: null,
    };
    jobs.set(job.id, job);
    created.push({ ...job });
  }
  pumpQueue();
  pruneFinished();
  return { ok: true, jobs: created };
}

function pruneFinished() {
  const finished = [...jobs.values()]
    .filter((j) => (j.status === "done" || j.status === "error") && j.finishedAt)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  for (const job of finished.slice(0, Math.max(0, finished.length - MAX_COMPLETED_JOBS))) jobs.delete(job.id);
}

export function getJob(id: string): DownloadJob | null {
  const job = jobs.get(id);
  return job ? { ...job } : null;
}

export function listJobs(): DownloadJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 30)
    .map((j) => ({ ...j }));
}

/** In-flight downloads, keyed by job id — cancellation = abort the HTTP fetch. */
const running = new Map<string, AbortController>();

export function cancelJob(id: string): boolean {
  const controller = running.get(id);
  const job = jobs.get(id);
  if (!job) return false;
  if (controller) {
    controller.abort();
    running.delete(id);
    job.status = "error";
    job.error = "Annulé";
    job.finishedAt = Date.now();
    return true;
  }
  if (job.status === "queued") {
    job.status = "error";
    job.error = "Annulé";
    job.finishedAt = Date.now();
    return true;
  }
  return false;
}

async function execute(job: DownloadJob) {
  job.status = "resolving";
  try {
    // Resolve a bare query to its top YouTube hit.
    if (!job.videoId) {
      const { results } = await onlineSearch(job.query, 1);
      const best = results[0];
      if (!best) throw new Error("Aucun résultat en ligne pour cette recherche");
      job.videoId = best.videoId;
      job.title = best.title;
    }

    const dir = downloadsDir();
    fs.mkdirSync(dir, { recursive: true });

    // Already downloaded once? Skip the network and just make sure it's indexed.
    const existing = existingFileFor(job.videoId);
    let finalPath = existing;

    if (!finalPath) {
      job.status = "downloading";
      const base = job.title ? `${slug(job.title)} [${job.videoId}]` : `[${job.videoId}]`;
      const outBase = path.join(dir, base);
      const controller = new AbortController();
      running.set(job.id, controller);
      const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      try {
        const { filepath } = await downloadYouTubeAudio({
          videoId: job.videoId,
          title: job.title ?? "",
          outBase,
          onProgress: (pct) => {
            job.progress = Math.max(job.progress, Math.min(99, pct));
          },
          signal: controller.signal,
        });
        finalPath = filepath;
        // Defensive: never hand the scanner a path that isn't really there.
        if (finalPath && !fs.existsSync(finalPath)) finalPath = null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Échec du téléchargement";
        if (message === "Annulé" || controller.signal.aborted) {
          job.error = "Annulé";
          throw new Error("Annulé");
        }
        job.error = sanitize(message);
      } finally {
        clearTimeout(timer);
        running.delete(job.id);
      }

      if (job.error === "Annulé") throw new Error("Annulé");
      if (!finalPath) {
        // Drop non-audio leftovers for THIS video (cover art, partials share the
        // `[VIDEOID]` output template) so a failed job doesn't litter the music
        // folder.
        try {
          for (const name of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
            if (name.includes(`[${job.videoId}]`) && !isSupportedAudioPath(name)) {
              fs.rmSync(path.join(dir, name), { force: true });
            }
          }
        } catch {
          /* best effort */
        }
        // Last resort: the newest AUDIO file that appeared in the dir during
        // the run (audio-only, for the same leftover-masquerade reason).
        try {
          const since = job.startedAt - 2000;
          const newest = fs
            .readdirSync(/*turbopackIgnore: true*/ dir)
            .map((name) => path.join(dir, name))
            .filter((p) => isSupportedAudioPath(p))
            .filter((p) => {
              try {
                return fs.statSync(p).mtimeMs >= since;
              } catch {
                return false;
              }
            })
            .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
          if (newest) finalPath = newest;
        } catch {
          /* dir unreadable — fall through to the error below */
        }
      }
      if (!finalPath) throw new Error(job.error || "Le téléchargement n'a produit aucun fichier");
    }

    // Index the new file so it shows up like any other library track. runScan()
    // is incremental (mtime+size diff) but NOT queued: when a scan is already in
    // flight (app-start rescan, another download), it returns that scan's
    // progress immediately and OUR file may miss it — hence a bounded retry
    // rather than a single attempt.
    job.status = "scanning";
    job.progress = 100;
    const rel = path.relative(getConfig().musicDir, finalPath);
    const candidates = [rel, finalPath.replace(/\\/g, "/")];
    let row: { trackhash: string; title: string } | null = null;
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
      await runScan();
      row = candidates.map((p) => trackByFilepath(p)).find((found) => found !== null) ?? null;
    }
    if (!row) throw new Error("Fichier téléchargé mais introuvable au scan");

    job.status = "done";
    job.trackhash = row.trackhash;
    job.title = row.title || job.title;
    job.finishedAt = Date.now();
    // Sidecar leftovers (non-audio, same template name) are no longer needed
    // once embedded — drop them so they can't confuse a later job.
    try {
      for (const name of fs.readdirSync(/*turbopackIgnore: true*/ dir)) {
        if (name.includes(`[${job.videoId}]`) && !isSupportedAudioPath(name)) {
          fs.rmSync(path.join(dir, name), { force: true });
        }
      }
    } catch {
      /* best effort */
    }
    log.info("download imported", { videoId: job.videoId, trackhash: row.trackhash });
  } catch (err) {
    job.status = "error";
    job.error = sanitize(err instanceof Error ? err.message : "Échec du téléchargement");
    job.finishedAt = Date.now();
    log.warn("download failed", { videoId: job.videoId, error: job.error });
  } finally {
    pumpQueue();
  }
}
