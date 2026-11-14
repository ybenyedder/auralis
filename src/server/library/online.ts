// Lightweight virtual tracks streamed on demand without storing audio files
// on disk. Persisted in SQLite `online_tracks` so likes, recents, playlists,
// queue restore, and lyrics survive reloads while keeping local storage at 0 B.

import crypto from "node:crypto";
import { getDb } from "../db";
import type { Artist, Track } from "@/lib/auralis/types";
import { cleanTitle, splitArtistTitle } from "./youtube";

export const ONLINE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
export const LAZY_VIDEO_ID_PREFIX = "lzy_";

export function isValidVideoId(id: unknown): id is string {
  return typeof id === "string" && ONLINE_VIDEO_ID_RE.test(id);
}

export function isLazyVideoId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(LAZY_VIDEO_ID_PREFIX) && ONLINE_VIDEO_ID_RE.test(id);
}

export function lazyVideoIdForTrack(title: string, artist?: string): string {
  const key = normalizeLookupKey(title, artist);
  const digest = crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
  return `${LAZY_VIDEO_ID_PREFIX}${digest}`;
}

export function onlineTrackhash(videoId: string): string {
  return `yt:${videoId}`;
}

export function onlineFilepath(videoId: string): string {
  return `yt://${videoId}`;
}

export function isOnlineTrackhash(hash: string): boolean {
  return hash.startsWith("yt:");
}

export function isOnlineFilepath(filepath: string): boolean {
  return filepath.startsWith("yt://");
}

export function videoIdFromOnlineRef(ref: string): string | null {
  const raw = ref.startsWith("yt://") ? ref.slice(5) : ref.startsWith("yt:") ? ref.slice(3) : ref;
  return isValidVideoId(raw) ? raw : null;
}

export interface OnlineTrackRow {
  trackhash: string;
  video_id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string | null;
  added_at: number;
  lyrics_present?: number;
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function parseOnlineMeta(rawTitle: string, uploader?: string, explicitArtist?: string): { title: string; artist: string } {
  const cleaned = cleanTitle(rawTitle).trim() || rawTitle.trim();
  const split = splitArtistTitle(cleaned);
  if (split) {
    return {
      title: split.title,
      artist: explicitArtist?.trim() || split.artist,
    };
  }
  const fallbackArtist = (explicitArtist || uploader || "YouTube").replace(/\s*-\s*Topic$/i, "").trim() || "YouTube";
  return { title: cleaned, artist: fallbackArtist };
}

export function mapOnlineRowToTrack(row: OnlineTrackRow): Track {
  const artisthash = `yt-ar:${stableHash(row.artist.toLowerCase())}`;
  const albumhash = `yt-al:${stableHash(`${row.album.toLowerCase()}::${row.artist.toLowerCase()}`)}`;
  const artistRef: Artist = { artisthash, name: row.artist };
  return {
    trackhash: row.trackhash,
    title: row.title,
    artist: row.artist,
    artists: [artistRef],
    album: row.album || "YouTube",
    albumhash,
    albumartists: [artistRef],
    duration: Number.isFinite(row.duration) ? row.duration : 0,
    filepath: onlineFilepath(row.video_id),
    image: row.thumbnail || `/api/online/art/${encodeURIComponent(row.video_id)}`,
    hasLyrics: row.lyrics_present === 1,
    addedAt: row.added_at || undefined,
    isOnline: true,
    videoId: row.video_id,
  };
}

export interface RegisterOnlineTrackInput {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  thumbnail?: string | null;
}

/** Upsert one streamed track's metadata into `online_tracks`.
 *  Returns `{ track, inserted }` so callers know whether the catalogue version changed. */
export function upsertOnlineTrack(input: RegisterOnlineTrackInput): { track: Track; inserted: boolean } {
  if (!isValidVideoId(input.videoId)) {
    throw new Error("Identifiant vidéo invalide");
  }
  const db = getDb();
  const trackhash = onlineTrackhash(input.videoId);
  const existing = db
    .prepare("SELECT trackhash FROM online_tracks WHERE trackhash = ?")
    .get(trackhash) as { trackhash: string } | undefined;

  const parsed = parseOnlineMeta(input.title || input.videoId, input.artist, input.artist);
  const title = parsed.title.slice(0, 240);
  const artist = parsed.artist.slice(0, 200);
  const album = (input.album?.trim() || "Streaming").slice(0, 200);
  const duration = typeof input.duration === "number" && Number.isFinite(input.duration) && input.duration > 0
    ? Math.round(input.duration)
    : 0;
  const thumbnail = input.thumbnail && /^https?:\/\//i.test(input.thumbnail)
    ? input.thumbnail.slice(0, 500)
    : `/api/online/art/${encodeURIComponent(input.videoId)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO online_tracks (trackhash, video_id, title, artist, album, duration, thumbnail, added_at)
    VALUES (@trackhash, @video_id, @title, @artist, @album, @duration, @thumbnail, @added_at)
    ON CONFLICT(trackhash) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE online_tracks.duration END,
      thumbnail = COALESCE(excluded.thumbnail, online_tracks.thumbnail)
  `).run({
    trackhash,
    video_id: input.videoId,
    title,
    artist,
    album,
    duration,
    thumbnail,
    added_at: now,
  });

  const row = db.prepare(`
    SELECT o.*,
      CASE WHEN l.synced IS NOT NULL OR l.plain IS NOT NULL THEN 1 ELSE 0 END AS lyrics_present
    FROM online_tracks o
    LEFT JOIN lyrics l ON l.trackhash = o.trackhash
    WHERE o.trackhash = ?
  `).get(trackhash) as OnlineTrackRow;

  return { track: mapOnlineRowToTrack(row), inserted: !existing };
}

export function getOnlineTrack(trackhash: string): Track | null {
  const row = getDb().prepare(`
    SELECT o.*,
      CASE WHEN l.synced IS NOT NULL OR l.plain IS NOT NULL THEN 1 ELSE 0 END AS lyrics_present
    FROM online_tracks o
    LEFT JOIN lyrics l ON l.trackhash = o.trackhash
    WHERE o.trackhash = ?
  `).get(trackhash) as OnlineTrackRow | undefined;
  return row ? mapOnlineRowToTrack(row) : null;
}

export function listOnlineTracks(): Track[] {
  const rows = getDb().prepare(`
    SELECT o.*,
      CASE WHEN l.synced IS NOT NULL OR l.plain IS NOT NULL THEN 1 ELSE 0 END AS lyrics_present
    FROM online_tracks o
    LEFT JOIN lyrics l ON l.trackhash = o.trackhash
    ORDER BY o.added_at DESC
  `).all() as OnlineTrackRow[];
  return rows.map(mapOnlineRowToTrack);
}

export interface OnlineResolveBatchItem {
  title: string;
  artist?: string;
  album?: string;
  videoId?: string;
  duration?: number;
  thumbnail?: string;
}

export interface OnlineResolveHit {
  videoId: string;
  title: string;
  artist?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string | null;
}

export interface OnlineResolveBatchEntry {
  index: number;
  track: Track | null;
  error?: string;
}

function normalizeLookupKey(title: string, artist?: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return `${norm(title)}::${norm(artist ?? "")}`;
}

/** Resolve a batch of playlist entries to lightweight `yt:` streaming tracks
 *  in SQLite `online_tracks` with zero audio files downloaded to disk. Reuses
 *  already-known tracks, accepts direct `videoId` entries without searching,
 *  and runs remaining lookups with bounded concurrency. */
export async function resolveOnlineTracksBatch(
  items: OnlineResolveBatchItem[],
  searcher: (query: string) => Promise<OnlineResolveHit | null>,
  concurrency = 6,
): Promise<{ entries: OnlineResolveBatchEntry[]; insertedAny: boolean }> {
  const existing = listOnlineTracks();
  const byVideoId = new Map<string, Track>();
  const byKey = new Map<string, Track>();
  for (const t of existing) {
    if (t.videoId) byVideoId.set(t.videoId, t);
    const k = normalizeLookupKey(t.title, t.artist);
    if (k !== "::" && !byKey.has(k)) byKey.set(k, t);
  }

  const results: OnlineResolveBatchEntry[] = new Array(items.length);
  let insertedAny = false;
  let cursor = 0;

  async function resolveOne(item: OnlineResolveBatchItem): Promise<{ track: Track | null; error?: string }> {
    const title = item.title?.trim() ?? "";
    const artist = item.artist?.trim() || undefined;
    if (!title && !isValidVideoId(item.videoId)) {
      return { track: null, error: "Titre manquant" };
    }

    if (isValidVideoId(item.videoId)) {
      const cached = byVideoId.get(item.videoId);
      if (cached) return { track: cached };
      const { track, inserted } = upsertOnlineTrack({
        videoId: item.videoId,
        title: title || item.videoId,
        artist,
        album: item.album?.trim() || undefined,
        duration: item.duration,
        thumbnail: item.thumbnail,
      });
      byVideoId.set(item.videoId, track);
      if (inserted) insertedAny = true;
      return { track };
    }

    const key = normalizeLookupKey(title, artist);
    const matched = byKey.get(key);
    if (matched) return { track: matched };

    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return { track: null, error: "Recherche vide" };

    const hit = await searcher(query);
    if (!hit || !isValidVideoId(hit.videoId)) {
      return { track: null, error: "Aucun flux trouvé" };
    }

    const { track, inserted } = upsertOnlineTrack({
      videoId: hit.videoId,
      title: title || hit.title,
      artist: artist || hit.artist || hit.uploader,
      album: item.album?.trim() || undefined,
      duration: item.duration || hit.duration,
      thumbnail: item.thumbnail || hit.thumbnail,
    });
    byVideoId.set(hit.videoId, track);
    if (key !== "::") byKey.set(key, track);
    if (inserted) insertedAny = true;
    return { track };
  }

  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          const r = await resolveOne(items[index]);
          results[index] = { index, track: r.track, ...(r.error ? { error: r.error } : {}) };
        } catch (err) {
          results[index] = {
            index,
            track: null,
            error: err instanceof Error ? err.message.slice(0, 120) : "Échec",
          };
        }
      }
    }),
  );

  return { entries: results, insertedAny };
}

export function getLazyResolvedVideoId(lazyId: string): string | null {
  if (!isLazyVideoId(lazyId)) return null;
  const row = getDb()
    .prepare("SELECT video_id FROM online_lazy_map WHERE lazy_id = ?")
    .get(lazyId) as { video_id: string } | undefined;
  return row && isValidVideoId(row.video_id) && !isLazyVideoId(row.video_id) ? row.video_id : null;
}

export function saveLazyResolvedVideoId(lazyId: string, videoId: string, thumbnail?: string | null): void {
  if (!isLazyVideoId(lazyId) || !isValidVideoId(videoId) || isLazyVideoId(videoId)) return;
  const db = getDb();
  db.prepare(`
    INSERT INTO online_lazy_map (lazy_id, video_id, resolved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(lazy_id) DO UPDATE SET
      video_id = excluded.video_id,
      resolved_at = excluded.resolved_at
  `).run(lazyId, videoId, Date.now());
  if (thumbnail && /^https?:\/\//i.test(thumbnail)) {
    db.prepare(`
      UPDATE online_tracks
      SET thumbnail = ?
      WHERE trackhash = ? AND (thumbnail IS NULL OR thumbnail LIKE '/api/online/art/%')
    `).run(thumbnail.slice(0, 500), onlineTrackhash(lazyId));
  }
}

const inFlightLazyResolutions = new Map<string, Promise<string | null>>();

/** Resolve a placeholder `lzy_...` id to a real YouTube videoId (cached in SQLite
 *  `online_lazy_map` and deduplicated across concurrent callers). */
export async function resolveLazyVideoId(
  lazyId: string,
  searcher: (query: string) => Promise<OnlineResolveHit | null>,
): Promise<string | null> {
  const cached = getLazyResolvedVideoId(lazyId);
  if (cached) return cached;

  const existingPromise = inFlightLazyResolutions.get(lazyId);
  if (existingPromise) return existingPromise;

  const task = (async () => {
    const track = getOnlineTrack(onlineTrackhash(lazyId));
    if (!track) return null;
    const query = [track.artist !== "YouTube" ? track.artist : "", track.title].filter(Boolean).join(" ").trim();
    if (!query) return null;
    const hit = await searcher(query);
    if (!hit || !isValidVideoId(hit.videoId) || isLazyVideoId(hit.videoId)) return null;
    saveLazyResolvedVideoId(lazyId, hit.videoId, hit.thumbnail);
    return hit.videoId;
  })().finally(() => {
    inFlightLazyResolutions.delete(lazyId);
  });

  inFlightLazyResolutions.set(lazyId, task);
  return task;
}

/** Liner-style instant registration: inserts all playlist entries without blocking
 *  on YouTube searches (`lzy_<hash>` placeholders for unresolved tracks), returning
 *  immediately in one SQLite transaction. */
export function instantRegisterOnlineTracksBatch(items: OnlineResolveBatchItem[]): {
  entries: OnlineResolveBatchEntry[];
  insertedAny: boolean;
  lazyToWarm: string[];
} {
  const existing = listOnlineTracks();
  const byVideoId = new Map<string, Track>();
  const byKey = new Map<string, Track>();
  for (const t of existing) {
    if (t.videoId) byVideoId.set(t.videoId, t);
    const k = normalizeLookupKey(t.title, t.artist);
    // Prefer already-resolved non-lazy tracks when colliding on title+artist.
    const cur = byKey.get(k);
    if (k !== "::" && (!cur || (t.videoId && !isLazyVideoId(t.videoId) && (!cur.videoId || isLazyVideoId(cur.videoId))))) {
      byKey.set(k, t);
    }
  }

  const results: OnlineResolveBatchEntry[] = new Array(items.length);
  const lazyToWarm = new Set<string>();
  let insertedAny = false;

  const runTx = getDb().transaction(() => {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const title = item.title?.trim() ?? "";
      const artist = item.artist?.trim() || undefined;
      if (!title && !isValidVideoId(item.videoId)) {
        results[index] = { index, track: null, error: "Titre manquant" };
        continue;
      }

      if (isValidVideoId(item.videoId) && !isLazyVideoId(item.videoId)) {
        const cached = byVideoId.get(item.videoId);
        if (cached) {
          results[index] = { index, track: cached };
          continue;
        }
        const { track, inserted } = upsertOnlineTrack({
          videoId: item.videoId,
          title: title || item.videoId,
          artist,
          album: item.album?.trim() || undefined,
          duration: item.duration,
          thumbnail: item.thumbnail,
        });
        byVideoId.set(item.videoId, track);
        if (inserted) insertedAny = true;
        results[index] = { index, track };
        continue;
      }

      const key = normalizeLookupKey(title, artist);
      const matched = key !== "::" ? byKey.get(key) : undefined;
      if (matched) {
        if (matched.videoId && isLazyVideoId(matched.videoId) && !getLazyResolvedVideoId(matched.videoId)) {
          lazyToWarm.add(matched.videoId);
        }
        results[index] = { index, track: matched };
        continue;
      }

      const lazyId = lazyVideoIdForTrack(title, artist);
      const cachedLazy = byVideoId.get(lazyId);
      if (cachedLazy) {
        if (!getLazyResolvedVideoId(lazyId)) lazyToWarm.add(lazyId);
        results[index] = { index, track: cachedLazy };
        continue;
      }

      const { track, inserted } = upsertOnlineTrack({
        videoId: lazyId,
        title,
        artist,
        album: item.album?.trim() || undefined,
        duration: item.duration,
        thumbnail: item.thumbnail,
      });
      byVideoId.set(lazyId, track);
      if (key !== "::") byKey.set(key, track);
      if (inserted) insertedAny = true;
      lazyToWarm.add(lazyId);
      results[index] = { index, track };
    }
  });

  runTx();
  return { entries: results, insertedAny, lazyToWarm: [...lazyToWarm] };
}

/** Fire-and-forget pre-warming for freshly imported lazy tracks so tracks play
 *  even faster once the user taps past track 1. */
export async function warmLazyOnlineTracks(
  lazyIds: string[],
  searcher: (query: string) => Promise<OnlineResolveHit | null>,
  concurrency = 3,
): Promise<void> {
  if (lazyIds.length === 0) return;
  let cursor = 0;
  const workers = Math.min(Math.max(1, concurrency), lazyIds.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < lazyIds.length) {
        const lazyId = lazyIds[cursor++];
        try {
          await resolveLazyVideoId(lazyId, searcher);
        } catch {
          /* best effort: stream route retries lazily on play */
        }
      }
    }),
  );
}
