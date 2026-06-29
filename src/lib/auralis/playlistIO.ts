"use client";

// Export / import playlists as portable files. The local-first angle Spotify can't
// offer: your playlists are yours, leave the server as M3U (plays in VLC/foobar/…)
// or JSON (lossless round-trip), and re-import on any Auralis library. No backend.

import type { Track } from "./types";
import { api } from "./api";

function slug(name: string): string {
  return (name.trim() || "playlist").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "playlist";
}

function download(filename: string, content: string, mime: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function trackArtistName(t: Track): string {
  return t.artist ?? t.artists?.map((a) => a.name).join(", ") ?? "";
}

/** Extended-M3U export. The URI line is the absolute stream URL so the file plays
 *  in other apps; EXTINF carries "artist - title" for readability + title fallback. */
export function exportPlaylistM3U(name: string, tracks: Track[]): void {
  const lines = ["#EXTM3U", `#PLAYLIST:${name}`];
  for (const t of tracks) {
    const secs = Math.round(t.duration || 0);
    lines.push(`#EXTINF:${secs},${trackArtistName(t)} - ${t.title}`);
    lines.push(t.filepath ? api.streamUrl(t.filepath) : t.trackhash);
  }
  download(`${slug(name)}.m3u8`, lines.join("\n"), "audio/x-mpegurl");
}

/** Lossless JSON export keyed on trackhash — re-imports exactly on the same library. */
export function exportPlaylistJSON(name: string, tracks: Track[]): void {
  const data = {
    auralisPlaylist: 1,
    name,
    exportedAt: new Date().toISOString(),
    tracks: tracks.map((t) => ({
      trackhash: t.trackhash,
      title: t.title,
      artist: trackArtistName(t),
      album: t.album ?? "",
      filepath: t.filepath ?? "",
    })),
  };
  download(`${slug(name)}.json`, JSON.stringify(data, null, 2), "application/json");
}

export interface ImportedPlaylist {
  name: string;
  hashes: string[];
  matched: number;
  total: number;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

/** Decode a `/api/stream/<encoded/segments>` URL (or a bare path) back to the
 *  library-relative filepath we index by. */
function pathFromUri(uri: string): string {
  const noQuery = uri.split("?")[0];
  const marker = "/api/stream/";
  const at = noQuery.indexOf(marker);
  const tail = at >= 0 ? noQuery.slice(at + marker.length) : noQuery;
  return tail
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
}

/** Parse a JSON or M3U playlist file and resolve its entries against the current
 *  library — by trackhash first, then by file path, then by "title|artist". Returns
 *  the matched hashes (in file order) plus how many of the total resolved. */
export async function parsePlaylistFile(file: File, library: Track[]): Promise<ImportedPlaylist> {
  const text = await file.text();
  const byHash = new Map(library.map((t) => [t.trackhash, t]));
  const byPath = new Map(library.map((t) => [normPath(t.filepath ?? ""), t]));
  const byTitle = new Map(library.map((t) => [`${t.title}|${trackArtistName(t)}`.toLowerCase(), t]));

  let name = file.name.replace(/\.[^.]+$/, "");
  const hashes: string[] = [];
  let total = 0;

  const trimmed = text.trimStart();
  const isJson = file.name.toLowerCase().endsWith(".json") || trimmed.startsWith("{");

  if (isJson) {
    const data = JSON.parse(text) as { name?: string; tracks?: { trackhash?: string; filepath?: string; title?: string; artist?: string }[] };
    name = data.name || name;
    for (const t of data.tracks ?? []) {
      total += 1;
      const m =
        (t.trackhash && byHash.get(t.trackhash)) ||
        (t.filepath && byPath.get(normPath(t.filepath))) ||
        (t.title ? byTitle.get(`${t.title}|${t.artist ?? ""}`.toLowerCase()) : undefined);
      if (m) hashes.push(m.trackhash);
    }
  } else {
    // M3U / M3U8
    let pendingTitle = "";
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#PLAYLIST:")) {
        name = line.slice("#PLAYLIST:".length).trim() || name;
        continue;
      }
      if (line.startsWith("#EXTINF:")) {
        pendingTitle = line.slice(line.indexOf(",") + 1).trim(); // "artist - title"
        continue;
      }
      if (line.startsWith("#")) continue;
      total += 1;
      const path = pathFromUri(line);
      let m = byPath.get(normPath(path)) ?? byHash.get(line);
      if (!m && pendingTitle) {
        // EXTINF is "artist - title"; the library key is "title|artist".
        const dash = pendingTitle.indexOf(" - ");
        if (dash >= 0) {
          const artist = pendingTitle.slice(0, dash).trim();
          const title = pendingTitle.slice(dash + 3).trim();
          m = byTitle.get(`${title}|${artist}`.toLowerCase());
        }
      }
      if (m) hashes.push(m.trackhash);
      pendingTitle = "";
    }
  }

  return { name, hashes, matched: hashes.length, total };
}
