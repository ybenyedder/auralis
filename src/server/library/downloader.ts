// Online search + on-demand track downloads ("that song isn't in my library —
// fetch it"). Backed by yt-dlp on the SERVER: a flat-playlist YouTube search
// powers the online suggestions, and a bestaudio extraction drops the file into
// a subfolder of the music dir, after which the regular incremental scanner
// picks it up like any other file. No third-party service, no API key — the
// host just needs the yt-dlp binary (ffmpeg unlocks mp3 + thumbnails).
//
// This module is server-only. It must never be imported from a client component.

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createLogger } from "../logger";
import { getConfig } from "../config";
import { getDb } from "../db";
import { isSupportedAudioPath } from "../paths";
import { runScan } from "./scanner";

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

// ---- binary detection -------------------------------------------------------

let ytDlpPath: string | null | undefined;
let ytDlpProbe: Promise<boolean> | null = null;

function probeBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ["--version"]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

/** Resolve the yt-dlp binary. env override > plain lookup on PATH. Synchronous
 *  callers get an optimistic answer on first use; the async probe corrects it
 *  within milliseconds, and `downloadsAvailable()` awaits the real verdict. */
function findYtDlp(): string | null {
  if (ytDlpPath !== undefined) return ytDlpPath;
  const configured = process.env.AURALIS_YTDLP?.trim() || "yt-dlp";
  ytDlpPath = configured;
  if (!ytDlpProbe) {
    ytDlpProbe = probeBinary(configured).then((ok) => {
      ytDlpPath = ok ? configured : null;
      return ok;
    });
  }
  return ytDlpPath;
}

let ffmpegAvailable: boolean | undefined;

function hasFfmpeg(): boolean {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  ffmpegAvailable = fs.existsSync("/usr/bin/ffmpeg") || fs.existsSync("/usr/local/bin/ffmpeg");
  return ffmpegAvailable;
}

function enabledByConfig(): boolean {
  const v = process.env.AURALIS_DOWNLOADS?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off" || v === "no") return false;
  return true;
}

/** Awaited form for routes: the real "can we download" verdict. */
export async function downloadsAvailable(): Promise<boolean> {
  if (!enabledByConfig()) return false;
  findYtDlp();
  await ytDlpProbe;
  return ytDlpPath !== null;
}

export function downloadsEnabled(): boolean {
  return enabledByConfig() && findYtDlp() !== null;
}

export function downloadsDir(): string {
  const name = process.env.AURALIS_DOWNLOADS_DIR?.trim() || "Auralis Downloads";
  return path.join(/*turbopackIgnore: true*/ getConfig().musicDir, name);
}

// ---- online search ----------------------------------------------------------

const searchCache = new Map<string, { at: number; results: OnlineResult[] }>();
const SEARCH_CACHE_MS = 10 * 60 * 1000;
const MAX_DURATION_S = 15 * 60; // skip uploads longer than 15 min (mixes, podcasts)

function runYtDlp(args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  const bin = findYtDlp();
  if (!bin) return Promise.resolve({ code: -1, stdout: "", stderr: "yt-dlp not found" });
  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.length > 8_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
      if (err.length > 200_000) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: "spawn failed" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: out, stderr: err });
    });
  });
}

/** YouTube search via yt-dlp's flat-playlist dump. Cached 10 min per query. */
export async function onlineSearch(query: string, limit = 8): Promise<{ enabled: boolean; results: OnlineResult[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { enabled: downloadsEnabled(), results: [] };
  if (!downloadsEnabled()) return { enabled: false, results: [], error: "yt-dlp absent du serveur" };

  const cached = searchCache.get(trimmed.toLowerCase());
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) {
    return { enabled: true, results: cached.results.slice(0, limit) };
  }

  const { code, stdout, stderr } = await runYtDlp(
    ["--flat-playlist", "--dump-single-json", "--no-warnings", `ytsearch${Math.max(limit, 10)}:${trimmed}`],
    20_000,
  );
  if (code !== 0) {
    log.warn("online search failed", { code, stderr: stderr.slice(0, 300) });
    return { enabled: true, results: [], error: "Recherche en ligne indisponible" };
  }
  let entries: unknown[] = [];
  try {
    const parsed = JSON.parse(stdout) as { entries?: unknown[] };
    entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return { enabled: true, results: [], error: "Réponse de recherche illisible" };
  }
  const results: OnlineResult[] = [];
  for (const raw of entries) {
    const e = raw as {
      id?: string;
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
      thumbnails?: { url?: string; height?: number }[];
      url?: string;
    };
    if (!e.id || !e.title) continue;
    if (typeof e.duration === "number" && (e.duration <= 0 || e.duration > MAX_DURATION_S)) continue;
    const thumb =
      e.thumbnail ??
      [...(e.thumbnails ?? [])].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0]?.url ??
      null;
    results.push({
      videoId: e.id,
      title: e.title,
      uploader: e.uploader ?? e.channel ?? "YouTube",
      duration: e.duration ?? 0,
      thumbnail: thumb,
      url: e.url ?? `https://www.youtube.com/watch?v=${e.id}`,
    });
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
 *  yt-dlp argument it wasn't meant to be. */
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
 *  AUDIO files only: the embedded-thumbnail .webp lands on the same output
 *  template even when (or after) the audio download failed, and once
 *  masqueraded as "already downloaded", skipping the real download. */
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
    return { ok: false, error: "Téléchargement indisponible : installez yt-dlp sur le serveur", status: 503 };
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

const running = new Map<string, ReturnType<typeof spawn>>();

export function cancelJob(id: string): boolean {
  const child = running.get(id);
  const job = jobs.get(id);
  if (!job) return false;
  if (child) {
    child.kill("SIGKILL");
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
      const outTpl = path.join(dir, `${base}.%(ext)s`);
      const args = [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--no-overwrites",
        "--embed-metadata",
        "--no-simulate",
        "--print", "after_move:filepath",
        "-o", outTpl,
        `-f`, hasFfmpeg() ? "bestaudio[abr<=192]/bestaudio/best" : "bestaudio[ext=m4a]/bestaudio/best",
      ];
      if (hasFfmpeg()) {
        args.push("-x", "--audio-format", "mp3", "--audio-quality", "3", "--embed-thumbnail");
      }
      args.push(`https://www.youtube.com/watch?v=${job.videoId}`);

      // YouTube intermittently answers 403 on perfectly valid requests (seen
      // live: the same command failed twice then succeeded untouched — the
      // stream URLs it hands out sometimes demand a PO token this server has no
      // way to mint). Each attempt re-extracts FRESH URLs and later ones rotate
      // the player client, which re-rolls the dice on the 403.
      for (let attempt = 1; attempt <= 4 && !finalPath && job.error !== "Annulé"; attempt++) {
        if (attempt > 1) {
          job.error = null;
          await new Promise((r) => setTimeout(r, 1200 * attempt));
        }
        const clientArgs =
          attempt === 1
            ? []
            : attempt === 2
              ? ["--extractor-args", "youtube:player_client=default,tv"]
              : ["--extractor-args", "youtube:player_client=default,web_safari,tv"];
        const fullArgs = attempt === 1 ? args : [...args.slice(0, -1), ...clientArgs, args[args.length - 1]];
        finalPath = await new Promise<string | null>((resolve) => {
          const bin = findYtDlp();
          if (!bin) {
            job.error = "yt-dlp introuvable sur le serveur";
            resolve(null);
            return;
          }
          const child = spawn(/*turbopackIgnore: true*/ bin, fullArgs, { stdio: ["ignore", "pipe", "pipe"] });
          running.set(job.id, child);
          let printed = "";
          let tail = "";
          let done = false;
          const finish = (value: string | null) => {
            if (done) return;
            done = true;
            running.delete(job.id);
            clearTimeout(timer);
            resolve(value);
          };
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            finish(null);
          }, DOWNLOAD_TIMEOUT_MS);
          child.stdout.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            printed += text;
            tail = (tail + text).slice(-4000);
            const pct = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(text);
            if (pct) {
              const value = Math.round(Number.parseFloat(pct[1]));
              if (Number.isFinite(value)) job.progress = Math.max(job.progress, Math.min(99, value));
            }
          });
          child.stderr.on("data", (chunk: Buffer) => {
            tail = (tail + chunk.toString()).slice(-4000);
          });
          child.on("error", () => finish(null));
          child.on("close", (code) => {
            if (code === 0) {
              // after_move:filepath prints the FINAL path — but on failures the
              // thumbnail write (same output template) can leave its own path
              // behind; only an AUDIO file counts (the library scans audio only,
              // a rescued .webp thumbnail once masqueraded as the download).
              const match = [...printed.matchAll(/[^\n"]*\/[^\n"]+\.[a-z0-9]{2,5}\s*$/gim)]
                .map((m) => m[0].trim())
                .reverse()
                .find((p) => isSupportedAudioPath(p) && fs.existsSync(p));
              finish(match ?? null);
            } else if (job.error === "Annulé") {
              finish(null);
            } else {
              job.error = sanitize(tail || `yt-dlp a échoué (code ${code})`);
              finish(null);
            }
          });
        });
      }

      if (job.error === "Annulé") throw new Error("Annulé");
      if (!finalPath) {
        // Drop non-audio leftovers for THIS video (the embedded-thumbnail .webp
        // lands on the output template even when the audio download fails) so a
        // failed job doesn't litter the music folder.
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
        // the run (audio-only, for the same thumbnail-masquerade reason).
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
    // The thumbnail sidecar (non-audio, same template name) is no longer needed
    // once it's embedded in the file — drop it so it can't confuse a later job.
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
