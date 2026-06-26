// Incremental library scanner. Walks the music directory, extracts real metadata
// for new/changed files only (mtime+size fingerprint), upserts into SQLite in
// batched transactions, prunes deleted files, then rebuilds album/artist aggregates.
// Emits live progress consumed by the scan SSE endpoint.

import fs from "fs";
import path from "path";
import { getConfig } from "../config";
import { getDb } from "../db";
import { createLogger } from "../logger";
import { extractMetadata } from "./metadata";
import { cacheFolderCover } from "./art";
import { albumHash, artistHash, trackHashForPath } from "./ids";

const log = createLogger("scanner");

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".m4a", ".m4b", ".aac", ".wav", ".flac", ".ogg", ".oga",
  ".opus", ".webm", ".aiff", ".aif", ".wma", ".alac", ".ape", ".mpc",
]);

const META_BATCH = 24; // files parsed concurrently
const WRITE_BATCH = 200; // rows per transaction

export type ScanStatus = "idle" | "scanning" | "ready" | "error";

export interface ScanProgress {
  status: ScanStatus;
  phase: string;
  processed: number;
  total: number;
  added: number;
  updated: number;
  removed: number;
  startedAt: number | null;
  finishedAt: number | null;
  scannedAt: string | null;
  root: string;
  error: string | null;
  /** Background audio-analysis (mood classifier) progress, runs after the scan. */
  analyzing: boolean;
  analyzed: number;
  analyzeTotal: number;
}

const progress: ScanProgress = {
  status: "idle",
  phase: "idle",
  processed: 0,
  total: 0,
  added: 0,
  updated: 0,
  removed: 0,
  startedAt: null,
  finishedAt: null,
  scannedAt: null,
  root: "",
  error: null,
  analyzing: false,
  analyzed: 0,
  analyzeTotal: 0,
};

type Listener = (snapshot: ScanProgress) => void;
const listeners = new Set<Listener>();

export function getScanProgress(): ScanProgress {
  return { ...progress };
}

export function subscribeScan(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(patch: Partial<ScanProgress>) {
  Object.assign(progress, patch);
  const snapshot = { ...progress };
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // a broken listener must not break the scan
    }
  }
}

/** Push analysis progress through the same channel (used by analysis.ts). */
export function updateScanProgress(patch: Partial<ScanProgress>) {
  emit(patch);
}

interface WalkedFile {
  abs: string;
  rel: string; // posix-style, relative to root
  size: number;
  mtime: number;
  dir: string; // absolute directory
}

// Async walk: readdir/stat via promises so the directory crawl YIELDS to the event
// loop between I/O ops instead of blocking it for the whole tree (a 10k-file
// library used to freeze every concurrent HTTP request for the duration of the
// sync crawl). Ordering, depth limit and the file cap are preserved exactly.
async function walk(root: string): Promise<WalkedFile[]> {
  const { maxScanFiles, maxScanDepth } = getConfig();
  const out: WalkedFile[] = [];

  const recurse = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= maxScanFiles || depth > maxScanDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(abs, depth + 1);
        if (out.length >= maxScanFiles) return;
        continue;
      }
      if (!entry.isFile()) continue;
      if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(abs);
      } catch {
        continue;
      }
      out.push({
        abs,
        rel: path.relative(root, abs).split(path.sep).join("/"),
        size: stat.size,
        mtime: Math.floor(stat.mtimeMs),
        dir,
      });
      if (out.length >= maxScanFiles) return;
    }
  };

  await recurse(root, 0);
  return out;
}

interface TrackRow {
  trackhash: string;
  filepath: string;
  title: string;
  artist: string;
  album: string;
  albumhash: string;
  artisthash: string;
  albumartist: string;
  duration: number;
  year: number | null;
  genre: string | null;
  track_no: number | null;
  disc_no: number | null;
  bitrate: number | null;
  samplerate: number | null;
  channels: number | null;
  codec: string | null;
  lossless: number;
  size: number;
  mtime: number;
  arthash: string | null;
  folder: string;
  has_lyrics: number;
  added_at: number;
}

async function buildRow(file: WalkedFile, rootName: string, addedAt: number): Promise<TrackRow> {
  const meta = await extractMetadata(file.abs);
  const arthash = meta.arthash ?? cacheFolderCover(file.dir) ?? null;
  const sidecar = file.abs.slice(0, file.abs.length - path.extname(file.abs).length) + ".lrc";
  const hasLyrics = fs.existsSync(sidecar) ? 1 : 0;
  const relDir = path.posix.dirname(file.rel);
  const dirParts = relDir === "." ? [] : relDir.split("/").filter(Boolean);
  const folder = "/" + [rootName, ...dirParts].join("/");

  return {
    trackhash: trackHashForPath(file.rel),
    filepath: file.rel,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    albumhash: albumHash(meta.albumartist, meta.album),
    artisthash: artistHash(meta.albumartist),
    albumartist: meta.albumartist,
    duration: meta.duration,
    year: meta.year ?? null,
    genre: meta.genre ?? null,
    track_no: meta.trackNo ?? null,
    disc_no: meta.discNo ?? null,
    bitrate: meta.bitrate ?? null,
    samplerate: meta.sampleRate ?? null,
    channels: meta.channels ?? null,
    codec: meta.codec ?? null,
    lossless: meta.lossless ? 1 : 0,
    size: file.size,
    mtime: file.mtime,
    arthash,
    folder,
    has_lyrics: hasLyrics,
    added_at: addedAt,
  };
}

let scanning = false;

export async function runScan(): Promise<ScanProgress> {
  if (scanning) return getScanProgress();
  scanning = true;

  const { musicDir } = getConfig();
  const rootName = path.basename(musicDir) || "Music";
  const db = getDb();
  const now = Date.now();

  emit({
    status: "scanning", phase: "walking", processed: 0, total: 0,
    added: 0, updated: 0, removed: 0, startedAt: now, finishedAt: null,
    root: musicDir, error: null,
  });

  try {
    if (!fs.existsSync(musicDir)) {
      const scannedAt = new Date().toISOString();
      emit({ status: "ready", phase: "no-music-dir", scannedAt, finishedAt: Date.now() });
      writeMeta(db, scannedAt);
      return getScanProgress();
    }

    const files = await walk(musicDir);
    emit({ phase: "indexing", total: files.length });

    const existing = new Map<string, { mtime: number; size: number }>();
    for (const row of db.prepare("SELECT filepath, mtime, size FROM tracks").all() as { filepath: string; mtime: number; size: number }[]) {
      existing.set(row.filepath, { mtime: row.mtime, size: row.size });
    }

    const upsert = db.prepare(`
      INSERT INTO tracks (trackhash, filepath, title, artist, album, albumhash, artisthash, albumartist,
        duration, year, genre, track_no, disc_no, bitrate, samplerate, channels, codec, lossless,
        size, mtime, arthash, folder, has_lyrics, added_at)
      VALUES (@trackhash, @filepath, @title, @artist, @album, @albumhash, @artisthash, @albumartist,
        @duration, @year, @genre, @track_no, @disc_no, @bitrate, @samplerate, @channels, @codec, @lossless,
        @size, @mtime, @arthash, @folder, @has_lyrics, @added_at)
      ON CONFLICT(filepath) DO UPDATE SET
        title=excluded.title, artist=excluded.artist, album=excluded.album, albumhash=excluded.albumhash,
        artisthash=excluded.artisthash, albumartist=excluded.albumartist, duration=excluded.duration,
        year=excluded.year, genre=excluded.genre, track_no=excluded.track_no, disc_no=excluded.disc_no,
        bitrate=excluded.bitrate, samplerate=excluded.samplerate, channels=excluded.channels,
        codec=excluded.codec, lossless=excluded.lossless, size=excluded.size, mtime=excluded.mtime,
        arthash=excluded.arthash, folder=excluded.folder,
        mood=NULL, energy=NULL, bpm=NULL, analyzed_at=0
    `);
    const ftsDelete = db.prepare("DELETE FROM track_fts WHERE trackhash = ?");
    const ftsInsert = db.prepare("INSERT INTO track_fts (trackhash, title, artist, album, genre) VALUES (?, ?, ?, ?, ?)");

    const writeBatch = db.transaction((rows: TrackRow[]) => {
      for (const row of rows) {
        upsert.run(row);
        ftsDelete.run(row.trackhash);
        ftsInsert.run(row.trackhash, row.title, row.artist, row.album, row.genre ?? "");
      }
    });

    const seen = new Set<string>();
    let pending: TrackRow[] = [];
    let processed = 0;
    let added = 0;
    let updated = 0;

    for (let i = 0; i < files.length; i += META_BATCH) {
      const chunk = files.slice(i, i + META_BATCH);
      const changed = chunk.filter((file) => {
        seen.add(file.rel);
        const prev = existing.get(file.rel);
        if (prev && prev.mtime === file.mtime && prev.size === file.size) return false;
        return true;
      });

      const rows = await Promise.all(changed.map((file) => buildRow(file, rootName, now)));
      for (const row of rows) {
        if (existing.has(row.filepath)) updated++;
        else added++;
        pending.push(row);
      }

      processed += chunk.length;
      if (pending.length >= WRITE_BATCH) {
        writeBatch(pending);
        pending = [];
      }
      emit({ processed, added, updated });
    }

    if (pending.length) writeBatch(pending);

    // Prune files that disappeared from disk.
    emit({ phase: "pruning" });
    const toRemove: string[] = [];
    for (const filepath of existing.keys()) {
      if (!seen.has(filepath)) toRemove.push(filepath);
    }
    if (toRemove.length) {
      const removeTrack = db.prepare("DELETE FROM tracks WHERE filepath = ?");
      const removeFtsByHash = db.prepare("DELETE FROM track_fts WHERE trackhash = ?");
      const selectHash = db.prepare("SELECT trackhash FROM tracks WHERE filepath = ?");
      const prune = db.transaction((paths: string[]) => {
        for (const p of paths) {
          const hit = selectHash.get(p) as { trackhash: string } | undefined;
          if (hit) removeFtsByHash.run(hit.trackhash);
          removeTrack.run(p);
        }
      });
      prune(toRemove);
    }

    emit({ phase: "aggregating" });
    rebuildAggregates(db);

    const scannedAt = new Date().toISOString();
    writeMeta(db, scannedAt);
    emit({
      status: "ready", phase: "done", removed: toRemove.length,
      scannedAt, finishedAt: Date.now(),
    });
    log.info("scan complete", { total: files.length, added, updated, removed: toRemove.length });

    // Pre-build the user-independent catalogue cache off the request path, so the
    // client's post-scan reload hits a warm cache (sub-ms) instead of paying the
    // one-off build itself. Dynamic import avoids a scanner⇄repository load cycle.
    void import("./repository").then((m) => m.getSnapshot()).catch(() => {/* best effort */});

    // Kick the background audio-analysis pass (mood classifier) for any tracks
    // that still need it. Fire-and-forget + dynamically imported to avoid a load
    // cycle; it no-ops if ffmpeg is missing or nothing is pending.
    void import("./analysis").then((m) => m.runAnalysis()).catch(() => {/* analysis is best-effort */});
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown scan error";
    log.error("scan failed", { message });
    emit({ status: "error", phase: "error", error: message, finishedAt: Date.now() });
  } finally {
    scanning = false;
  }

  return getScanProgress();
}

function writeMeta(db: ReturnType<typeof getDb>, scannedAt: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('scannedAt', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(scannedAt);
}

/** Recompute the albums and artists tables from the current tracks. */
function rebuildAggregates(db: ReturnType<typeof getDb>) {
  type Agg = {
    albumhash: string; album: string; albumartist: string; artisthash: string;
    year: number | null; genre: string | null; arthash: string | null; track_no: number | null;
  };
  const rows = db.prepare(
    "SELECT albumhash, album, albumartist, artisthash, year, genre, arthash, track_no FROM tracks"
  ).all() as Agg[];

  const albums = new Map<string, { title: string; albumartist: string; artisthash: string; year: number | null; genre: string | null; arthash: string | null; artPriority: number }>();
  const artists = new Map<string, { name: string; arthash: string | null }>();

  for (const r of rows) {
    let album = albums.get(r.albumhash);
    if (!album) {
      album = { title: r.album, albumartist: r.albumartist, artisthash: r.artisthash, year: r.year, genre: r.genre, arthash: null, artPriority: Infinity };
      albums.set(r.albumhash, album);
    }
    if (r.year && !album.year) album.year = r.year;
    if (r.genre && !album.genre) album.genre = r.genre;
    // Prefer artwork from the lowest track number (usually track 1 / the cover).
    const priority = r.track_no ?? 9999;
    if (r.arthash && priority < album.artPriority) {
      album.arthash = r.arthash;
      album.artPriority = priority;
    }

    let artist = artists.get(r.artisthash);
    if (!artist) {
      artist = { name: r.albumartist, arthash: null };
      artists.set(r.artisthash, artist);
    }
    if (r.arthash && !artist.arthash) artist.arthash = r.arthash;
  }

  const tx = db.transaction(() => {
    db.exec("DELETE FROM albums; DELETE FROM artists;");
    const insAlbum = db.prepare("INSERT INTO albums (albumhash, title, albumartist, artisthash, year, genre, arthash) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const insArtist = db.prepare("INSERT INTO artists (artisthash, name, arthash) VALUES (?, ?, ?)");
    for (const [albumhash, a] of albums) insAlbum.run(albumhash, a.title, a.albumartist, a.artisthash, a.year, a.genre, a.arthash);
    for (const [artisthash, a] of artists) insArtist.run(artisthash, a.name, a.arthash);
  });
  tx();
}
