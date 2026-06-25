// Read model. Turns the SQLite library into the snapshot shape the web client
// already consumes (tracks/albums/artists/folders), now carrying real durations,
// tags, cover-art URLs and lyric availability. Also powers server-side search.

import { getDb } from "../db";
import { getConfig } from "../config";
import { getScanProgress } from "./scanner";
import { paletteForName } from "@/lib/auralis/brand";
import type { Album, Artist, Track, FolderNode } from "@/lib/auralis/types";

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
  arthash: string | null;
  folder: string;
  has_lyrics: number;
  added_at: number;
  playcount: number;
  is_favorite: number;
  lyrics_present: number;
}

export function artUrl(arthash: string | null | undefined): string | undefined {
  return arthash ? `/api/art/${arthash}` : undefined;
}

// favorites/playcounts are per-user (multi-account). The JOINs MUST be scoped to
// the requesting user's id, otherwise is_favorite/playcount leak across accounts
// (a title shows as favourited if ANY user favourited it, and the playcount is an
// arbitrary other user's). `uid` is a trusted integer (a DB user id), coerced to a
// safe integer here, so inlining it is injection-safe and lets search() keep its
// positional placeholders (better-sqlite3 forbids mixing named + positional).
function trackSelect(uid: number): string {
  const safeUid = Math.trunc(Number(uid)) || 0;
  return `
  SELECT t.*,
    COALESCE(pc.count, 0) AS playcount,
    CASE WHEN f.trackhash IS NOT NULL THEN 1 ELSE 0 END AS is_favorite,
    CASE WHEN l.synced IS NOT NULL OR l.plain IS NOT NULL THEN 1 ELSE 0 END AS lyrics_present
  FROM tracks t
  LEFT JOIN playcounts pc ON pc.trackhash = t.trackhash AND pc.user_id = ${safeUid}
  LEFT JOIN favorites  f  ON f.trackhash  = t.trackhash AND f.user_id  = ${safeUid}
  LEFT JOIN lyrics     l  ON l.trackhash  = t.trackhash
`;
}

function mapTrack(row: TrackRow): Track {
  const artistRef: Artist = { artisthash: row.artisthash, name: row.albumartist };
  return {
    trackhash: row.trackhash,
    title: row.title,
    artist: row.artist,
    artists: [artistRef],
    album: row.album,
    albumhash: row.albumhash,
    albumartists: [artistRef],
    duration: row.duration,
    filepath: row.filepath,
    folder: row.folder,
    image: artUrl(row.arthash),
    is_favorite: row.is_favorite === 1,
    playcount: row.playcount,
    disc: row.disc_no ?? 1,
    track: row.track_no ?? undefined,
    year: row.year ?? undefined,
    genre: row.genre ?? undefined,
    bitrate: row.bitrate ?? undefined,
    samplerate: row.samplerate ?? undefined,
    channels: row.channels ?? undefined,
    codec: row.codec ?? undefined,
    lossless: row.lossless === 1,
    size: row.size,
    hasLyrics: row.has_lyrics === 1 || row.lyrics_present === 1,
    addedAt: row.added_at || undefined,
    color: paletteForName(row.trackhash),
  };
}

function buildFolders(tracks: Track[], rootName: string): FolderNode[] {
  const rootPath = "/" + rootName;
  const root: FolderNode = { name: rootName, path: rootPath, trackcount: 0, children: [] };
  const nodes = new Map<string, FolderNode>([[rootPath, root]]);

  for (const track of tracks) {
    const full = track.folder || rootPath;
    const parts = full.split("/").filter(Boolean); // [rootName, sub, ...]
    let currentPath = rootPath;
    let current = root;
    current.trackcount += 1;
    for (let i = 1; i < parts.length; i++) {
      currentPath += "/" + parts[i];
      let child = nodes.get(currentPath);
      if (!child) {
        child = { name: parts[i], path: currentPath, trackcount: 0, children: [] };
        nodes.set(currentPath, child);
        (current.children ??= []).push(child);
      }
      child.trackcount += 1;
      current = child;
    }
  }

  const sortTree = (node: FolderNode) => {
    node.children?.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    node.children?.forEach(sortTree);
    if (node.children && node.children.length === 0) delete node.children;
  };
  sortTree(root);
  return [root];
}

export interface LibrarySnapshot {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  folders: FolderNode[];
  root: string;
  scannedAt: string | null;
  count: number;
  error: string | null;
}

export function getSnapshot(userId: number): LibrarySnapshot {
  const db = getDb();
  const { musicDir } = getConfig();
  const rootName = musicDir.split(/[\\/]+/).filter(Boolean).pop() || "Music";

  const trackRows = db.prepare(
    `${trackSelect(userId)} ORDER BY t.albumhash, t.disc_no, t.track_no, t.title COLLATE NOCASE`
  ).all() as TrackRow[];
  const tracks = trackRows.map(mapTrack);

  // Album + artist aggregates derived from the same rows (counts/durations/genres).
  const albumAgg = new Map<string, { count: number; duration: number; genres: Set<string> }>();
  const artistAgg = new Map<string, { tracks: number; albums: Set<string>; plays: number; genres: Set<string> }>();
  for (const row of trackRows) {
    const al = albumAgg.get(row.albumhash) ?? { count: 0, duration: 0, genres: new Set<string>() };
    al.count += 1;
    al.duration += row.duration || 0;
    if (row.genre) al.genres.add(row.genre);
    albumAgg.set(row.albumhash, al);

    const ar = artistAgg.get(row.artisthash) ?? { tracks: 0, albums: new Set<string>(), plays: 0, genres: new Set<string>() };
    ar.tracks += 1;
    ar.albums.add(row.albumhash);
    ar.plays += row.playcount || 0;
    if (row.genre) ar.genres.add(row.genre);
    artistAgg.set(row.artisthash, ar);
  }

  const albumRows = db.prepare("SELECT albumhash, title, albumartist, artisthash, year, genre, arthash FROM albums").all() as {
    albumhash: string; title: string; albumartist: string; artisthash: string; year: number | null; genre: string | null; arthash: string | null;
  }[];
  const albums: Album[] = albumRows.map((row) => {
    const agg = albumAgg.get(row.albumhash);
    return {
      albumhash: row.albumhash,
      title: row.title,
      albumartists: [{ artisthash: row.artisthash, name: row.albumartist }],
      image: artUrl(row.arthash),
      year: row.year ?? undefined,
      trackcount: agg?.count ?? 0,
      duration: agg?.duration ?? 0,
      genres: agg && agg.genres.size ? Array.from(agg.genres) : undefined,
      color: paletteForName(row.albumhash),
    };
  }).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));

  const artistRows = db.prepare("SELECT artisthash, name, arthash FROM artists").all() as {
    artisthash: string; name: string; arthash: string | null;
  }[];
  const artists: Artist[] = artistRows.map((row) => {
    const agg = artistAgg.get(row.artisthash);
    return {
      artisthash: row.artisthash,
      name: row.name,
      image: artUrl(row.arthash),
      trackcount: agg?.tracks ?? 0,
      albumcount: agg?.albums.size ?? 0,
      playcount: agg?.plays ?? 0,
      genres: agg && agg.genres.size ? Array.from(agg.genres) : undefined,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const scanProgress = getScanProgress();
  const scannedAtRow = db.prepare("SELECT value FROM settings WHERE key = 'scannedAt'").get() as { value: string } | undefined;
  const scannedAt = scannedAtRow?.value ?? scanProgress.scannedAt ?? null;

  return {
    tracks,
    albums,
    artists,
    folders: buildFolders(tracks, rootName),
    root: musicDir,
    scannedAt,
    count: tracks.length,
    error: tracks.length === 0 ? "Aucun fichier audio indexé. Lance un scan ou configure AURALIS_MUSIC_DIR." : null,
  };
}

function escapeFts(query: string): string {
  // Build a prefix MATCH expression, quoting each token to neutralise FTS operators.
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!tokens.length) return "";
  return tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
}

export interface SearchResults {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
}

export function search(query: string, userId: number, limit = 50): SearchResults {
  const db = getDb();
  const expr = escapeFts(query);
  if (!expr) return { tracks: [], albums: [], artists: [] };

  const hashes = db.prepare(
    "SELECT trackhash FROM track_fts WHERE track_fts MATCH ? ORDER BY rank LIMIT ?"
  ).all(expr, limit) as { trackhash: string }[];

  if (!hashes.length) return { tracks: [], albums: [], artists: [] };
  const placeholders = hashes.map(() => "?").join(",");
  const rows = db.prepare(
    `${trackSelect(userId)} WHERE t.trackhash IN (${placeholders})`
  ).all(...hashes.map((h) => h.trackhash)) as TrackRow[];

  const order = new Map(hashes.map((h, i) => [h.trackhash, i]));
  const tracks = rows.map(mapTrack).sort((a, b) => (order.get(a.trackhash) ?? 0) - (order.get(b.trackhash) ?? 0));

  const albumSeen = new Map<string, Album>();
  const artistSeen = new Map<string, Artist>();
  for (const t of tracks) {
    if (t.albumhash && !albumSeen.has(t.albumhash)) {
      albumSeen.set(t.albumhash, {
        albumhash: t.albumhash, title: t.album ?? "", albumartists: t.albumartists ?? [],
        image: t.image, year: t.year, color: t.color,
      });
    }
    const ar = t.artists?.[0];
    if (ar && !artistSeen.has(ar.artisthash)) artistSeen.set(ar.artisthash, { ...ar, image: t.image });
  }

  return {
    tracks,
    albums: Array.from(albumSeen.values()).slice(0, 12),
    artists: Array.from(artistSeen.values()).slice(0, 12),
  };
}
