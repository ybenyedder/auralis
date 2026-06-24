// Lyrics service. Resolution order: DB cache → on-disk .lrc sidecar → LRCLIB
// (open, key-less, self-hostable lyrics database). Anything fetched online is
// written back to the cache AND to a .lrc sidecar so the library self-hosts it.

import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getConfig } from "../config";
import { createLogger } from "../logger";
import { resolveLibraryPath } from "../paths";
import { parseSyncedLyrics, isSynced, type SyncedLine } from "./lrc";

const log = createLogger("lyrics");

const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // retry "not found" weekly
const FETCH_TIMEOUT_MS = 9000;
const USER_AGENT = "Auralis/1.0.0 (self-hosted music server; https://github.com/ybenyedder/auralis)";

export type LyricsStatus = "found" | "instrumental" | "notfound";
export type LyricsSource = "sidecar" | "lrclib" | "lyricsovh" | "manual" | "cache" | null;

export interface LyricsResult {
  trackhash: string;
  status: LyricsStatus;
  source: LyricsSource;
  /** Parsed synchronised lines (empty when only plain lyrics exist). */
  lines: SyncedLine[];
  /** Plain (unsynced) lyrics text, if any. */
  plain: string | null;
  synced: boolean;
}

interface TrackMeta {
  trackhash: string;
  title: string;
  artist: string;
  albumartist: string;
  album: string;
  duration: number;
  filepath: string;
}

interface LyricsRow {
  trackhash: string;
  synced: string | null;
  plain: string | null;
  source: string | null;
  status: LyricsStatus;
  instrumental: number;
  fetched_at: number;
}

function getTrackMeta(trackhash: string): TrackMeta | null {
  const db = getDb();
  return (db.prepare(
    "SELECT trackhash, title, artist, albumartist, album, duration, filepath FROM tracks WHERE trackhash = ?"
  ).get(trackhash) as TrackMeta | undefined) ?? null;
}

function rowToResult(row: LyricsRow): LyricsResult {
  const lines = row.synced ? parseSyncedLyrics(row.synced) : [];
  return {
    trackhash: row.trackhash,
    status: row.status,
    source: (row.source as LyricsSource) ?? "cache",
    lines,
    plain: row.plain,
    synced: lines.length > 0,
  };
}

function persist(
  trackhash: string,
  data: { synced?: string | null; plain?: string | null; source: LyricsSource; status: LyricsStatus; instrumental?: boolean },
): LyricsResult {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO lyrics (trackhash, synced, plain, source, status, instrumental, fetched_at)
    VALUES (@trackhash, @synced, @plain, @source, @status, @instrumental, @fetched_at)
    ON CONFLICT(trackhash) DO UPDATE SET
      synced=excluded.synced, plain=excluded.plain, source=excluded.source,
      status=excluded.status, instrumental=excluded.instrumental, fetched_at=excluded.fetched_at
  `).run({
    trackhash,
    synced: data.synced ?? null,
    plain: data.plain ?? null,
    source: data.source,
    status: data.status,
    instrumental: data.instrumental ? 1 : 0,
    fetched_at: now,
  });
  db.prepare("UPDATE tracks SET has_lyrics = ? WHERE trackhash = ?").run(data.status === "found" ? 1 : 0, trackhash);

  return rowToResult({
    trackhash, synced: data.synced ?? null, plain: data.plain ?? null,
    source: data.source, status: data.status, instrumental: data.instrumental ? 1 : 0, fetched_at: now,
  });
}

function readSidecar(filepath: string): { synced: string | null; plain: string | null } | null {
  const abs = resolveLibraryPath(filepath);
  if (!abs) return null;
  const lrcPath = abs.slice(0, abs.length - path.extname(abs).length) + ".lrc";
  try {
    const content = fs.readFileSync(lrcPath, "utf8");
    if (!content.trim()) return null;
    if (isSynced(content)) return { synced: content, plain: null };
    return { synced: null, plain: content.trim() };
  } catch {
    return null;
  }
}

function writeSidecar(filepath: string, synced: string | null, plain: string | null): void {
  if (!getConfig().lyricsWriteSidecar) return;
  const abs = resolveLibraryPath(filepath);
  if (!abs) return;
  const lrcPath = abs.slice(0, abs.length - path.extname(abs).length) + ".lrc";
  try {
    if (fs.existsSync(lrcPath)) return; // never clobber user-authored lyrics
    const body = synced ?? plain;
    if (body) fs.writeFileSync(lrcPath, body, "utf8");
  } catch (error) {
    log.warn("sidecar write failed", { lrcPath, error: String(error) });
  }
}

interface LrclibHit {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
  duration?: number | null;
}

async function lrclibRequest(pathname: string): Promise<unknown | null> {
  const { lyricsEndpoint } = getConfig();
  const url = `${lyricsEndpoint.replace(/\/+$/, "")}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) {
      log.warn("lrclib non-ok", { status: res.status });
      return null;
    }
    return await res.json();
  } catch (error) {
    log.warn("lrclib request failed", { error: String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function qs(params: Record<string, string | number>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

async function fetchFromLrclib(track: TrackMeta): Promise<LrclibHit | null> {
  // 1) Exact signature match (artist + title + album + duration).
  const exact = (await lrclibRequest(
    `/api/get?${qs({ artist_name: track.albumartist || track.artist, track_name: track.title, album_name: track.album, duration: Math.round(track.duration) })}`,
  )) as LrclibHit | null;
  if (exact) return exact;

  // 2) Looser search; pick the candidate closest in duration, preferring synced.
  const results = (await lrclibRequest(
    `/api/search?${qs({ track_name: track.title, artist_name: track.albumartist || track.artist })}`,
  )) as LrclibHit[] | null;
  if (!Array.isArray(results) || results.length === 0) return null;

  const scored = results
    .map((hit) => {
      const durDelta = typeof hit.duration === "number" && track.duration ? Math.abs(hit.duration - track.duration) : 999;
      const syncedBonus = hit.syncedLyrics ? -100 : 0;
      return { hit, score: durDelta + syncedBonus };
    })
    .sort((a, b) => a.score - b.score);

  const best = scored[0]?.hit;
  if (!best) return null;
  // Reject wildly mismatched durations to avoid pairing the wrong song.
  if (typeof best.duration === "number" && track.duration && Math.abs(best.duration - track.duration) > 15) return null;
  return best;
}

// Keyless plain-lyrics fallback (lyrics.ovh) for when LRCLIB has no match. Returns
// unsynced text only — the UI shows it in its plain-lyrics view. Best-effort: any
// network/format failure just yields null so resolution falls through to notfound.
async function fetchFromLyricsOvh(track: TrackMeta): Promise<string | null> {
  const { lyricsFallbackEndpoint } = getConfig();
  if (!lyricsFallbackEndpoint) return null;
  const artist = track.albumartist || track.artist;
  if (!artist || !track.title) return null;
  const base = lyricsFallbackEndpoint.replace(/\/+$/, "");
  const url = `${base}/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track.title)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null; // 404 = no match
    const data = (await res.json()) as { lyrics?: string } | null;
    const lyrics = data?.lyrics?.replace(/\r\n/g, "\n").trim();
    return lyrics ? lyrics : null;
  } catch (error) {
    log.warn("lyrics.ovh request failed", { error: String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isFresh(row: LyricsRow): boolean {
  if (row.status === "found" || row.status === "instrumental") return true;
  return Date.now() - row.fetched_at < NEGATIVE_TTL_MS;
}

export async function getLyrics(trackhash: string, opts: { forceRefetch?: boolean } = {}): Promise<LyricsResult> {
  const db = getDb();
  const track = getTrackMeta(trackhash);
  if (!track) return { trackhash, status: "notfound", source: null, lines: [], plain: null, synced: false };

  const cached = db.prepare("SELECT * FROM lyrics WHERE trackhash = ?").get(trackhash) as LyricsRow | undefined;
  if (cached && !opts.forceRefetch && isFresh(cached)) return rowToResult(cached);

  // On-disk sidecar wins — it is the user's self-hosted source of truth.
  const sidecar = readSidecar(track.filepath);
  if (sidecar) {
    return persist(trackhash, {
      synced: sidecar.synced, plain: sidecar.plain, source: "sidecar",
      status: sidecar.synced || sidecar.plain ? "found" : "notfound",
    });
  }

  if (getConfig().lyricsOnline) {
    const hit = await fetchFromLrclib(track);
    if (hit) {
      if (hit.instrumental) return persist(trackhash, { source: "lrclib", status: "instrumental", instrumental: true });
      const synced = hit.syncedLyrics?.trim() || null;
      const plain = hit.plainLyrics?.trim() || null;
      if (synced || plain) {
        writeSidecar(track.filepath, synced, plain);
        return persist(trackhash, { synced, plain, source: "lrclib", status: "found" });
      }
    }

    // LRCLIB had nothing usable — try the keyless plain-lyrics fallback.
    const ovh = await fetchFromLyricsOvh(track);
    if (ovh) {
      writeSidecar(track.filepath, null, ovh);
      return persist(trackhash, { plain: ovh, source: "lyricsovh", status: "found" });
    }
  }

  return persist(trackhash, { source: null, status: "notfound" });
}

/** Read-only cache lookup used by snapshot/UI without triggering a network fetch. */
export function getCachedLyrics(trackhash: string): LyricsResult | null {
  const row = getDb().prepare("SELECT * FROM lyrics WHERE trackhash = ?").get(trackhash) as LyricsRow | undefined;
  return row ? rowToResult(row) : null;
}
