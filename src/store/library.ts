"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { Album, Artist, FolderNode, Playlist, Track } from "@/lib/auralis/types";
import { api } from "@/lib/auralis/api";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

export interface ScanProgress {
  status: "idle" | "scanning" | "ready" | "error";
  phase: string;
  processed: number;
  total: number;
  added: number;
  updated: number;
  removed: number;
  scannedAt: string | null;
  error: string | null;
  /** Background audio-analysis (mood classifier) progress. */
  analyzing?: boolean;
  analyzed?: number;
  analyzeTotal?: number;
}

export interface LibraryPayload {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  folders?: FolderNode[];
  root?: string | null;
  scannedAt?: string | null;
  error?: string | null;
  scan?: ScanProgress;
}

interface LibraryState {
  tracks: Track[];
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[]; // curated/server playlists (reserved; user playlists live in the player store)
  folders: FolderNode[];
  trackIndex: Map<string, Track>;
  root: string | null;
  status: LibraryStatus;
  error: string | null;
  scannedAt: string | null;
  scan: ScanProgress | null;
  load: () => Promise<void>;
  rescan: () => Promise<void>;
  applyPayload: (payload: LibraryPayload) => void;
  setScan: (scan: ScanProgress) => void;
  getTrack: (hash: string) => Track | undefined;
}

function indexTracks(tracks: Track[]): Map<string, Track> {
  return new Map(tracks.map((t) => [t.trackhash, t]));
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  albums: [],
  artists: [],
  playlists: [],
  folders: [],
  trackIndex: new Map(),
  root: null,
  status: "idle",
  error: null,
  scannedAt: null,
  scan: null,

  applyPayload: (payload) => {
    const tracks = payload.tracks ?? [];
    set({
      tracks,
      albums: payload.albums ?? [],
      artists: payload.artists ?? [],
      folders: payload.folders ?? [],
      trackIndex: indexTracks(tracks),
      root: payload.root ?? null,
      scannedAt: payload.scannedAt ?? null,
      scan: payload.scan ?? get().scan,
      status: "ready",
      // An empty library is a normal first-run state, not an error — only surface
      // a real scan error so views show a friendly empty state instead of red text.
      error: payload.error ?? null,
    });
  },

  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const payload = await api.get<LibraryPayload>("/api/library");
      if (!Array.isArray(payload.tracks)) throw new Error("Invalid library payload");
      get().applyPayload(payload);
    } catch (error) {
      set({
        tracks: [], albums: [], artists: [], folders: [], trackIndex: new Map(),
        status: "error", error: error instanceof Error ? error.message : "Library scan failed",
      });
    }
  },

  rescan: async () => {
    try {
      await api.post("/api/library/scan", {});
    } catch {
      // progress + reload below still apply
    }
  },

  setScan: (scan) => set({ scan }),
  getTrack: (hash) => get().trackIndex.get(hash),
}));

/** Hook used by the app shell: loads the library and follows live scan progress. */
export function useLibrary() {
  const load = useLibraryStore((s) => s.load);
  const setScan = useLibraryStore((s) => s.setScan);
  const applyPayload = useLibraryStore((s) => s.applyPayload);
  const rescan = useLibraryStore((s) => s.rescan);

  useEffect(() => {
    void load();
    // Kick an incremental rescan on every app start so newly added files show up
    // without a manual refresh. It's cheap when nothing changed (mtime-diffed),
    // and the SSE stream below reloads the snapshot once it finishes.
    void rescan();

    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const source = new EventSource(api.url("/api/library/events"));
    let lastStatus = "";
    let wasAnalyzing = false;
    source.onmessage = (event) => {
      try {
        const scan = JSON.parse(event.data) as ScanProgress;
        setScan(scan);
        // When a scan finishes, pull the fresh snapshot once.
        if (lastStatus === "scanning" && scan.status === "ready") void load();
        // Also reload when the background analysis pass finishes, so the freshly
        // classified moods feed the recommendations without a manual refresh.
        if (wasAnalyzing && !scan.analyzing) void load();
        wasAnalyzing = Boolean(scan.analyzing);
        lastStatus = scan.status;
      } catch {
        // ignore malformed frames
      }
    };
    source.onerror = () => {
      /* EventSource auto-reconnects; nothing to do */
    };
    return () => source.close();
  }, [load, setScan, applyPayload, rescan]);

  // Return ONLY the two fields page.tsx needs, via atomic selectors. Returning the
  // whole store (useLibraryStore()) made the app-root component re-subscribe to
  // every mutation — each SSE scan-progress frame (several per second) re-rendered
  // the entire shell and the active view. Atomic selectors cut that to two fields.
  const scannedAt = useLibraryStore((s) => s.scannedAt);
  const status = useLibraryStore((s) => s.status);
  return { scannedAt, status };
}

export function tracksForHashesFrom(tracks: Track[], hashes: string[]): Track[] {
  if (hashes.length === 0) return [];
  const byHash = new Map(tracks.map((track) => [track.trackhash, track]));
  return hashes.map((hash) => byHash.get(hash)).filter((track): track is Track => Boolean(track));
}

/** Resolve hashes → tracks (in hash order) using the store's PREBUILT index instead
 *  of rebuilding a full-library Map on every call. The index changes identity with
 *  the library, so subscribing to it invalidates exactly like subscribing to tracks.
 *  Prefer this over tracksForHashesFrom on hot paths (home shelves, playlist covers). */
export function tracksFromIndex(index: Map<string, Track>, hashes: string[]): Track[] {
  if (hashes.length === 0) return [];
  const out: Track[] = [];
  for (const hash of hashes) {
    const track = index.get(hash);
    if (track) out.push(track);
  }
  return out;
}

/** Live index lookup for non-reactive call sites (click handlers, store actions). */
export function tracksForHashes(hashes: string[]): Track[] {
  return tracksFromIndex(useLibraryStore.getState().trackIndex, hashes);
}

export function tracksOfAlbumFrom(tracks: Track[], albumhash: string): Track[] {
  return tracks.filter((track) => track.albumhash === albumhash);
}

export function tracksOfArtistFrom(tracks: Track[], artisthash: string): Track[] {
  return tracks.filter((track) => track.artists?.some((artist) => artist.artisthash === artisthash));
}

export function albumsOfArtistFrom(albums: Album[], artisthash: string): Album[] {
  return albums.filter((album) => album.albumartists.some((artist) => artist.artisthash === artisthash));
}

// Per-artist play totals derived from the user's OWN play counts. The shared
// library catalogue is user-independent and carries no per-account plays, so any
// "most played" ranking/label is computed here from the player store's
// authoritative counts. Memoised on the (tracks, playCounts) identities so the
// several components that need it (home shelves, library sort, artist page,
// context menu) share one O(n) pass instead of each rebuilding the map.
let artistPlaysMemo: { tracks: Track[]; playCounts: Record<string, number>; map: Map<string, number> } | null = null;
export function artistPlayTotals(tracks: Track[], playCounts: Record<string, number>): Map<string, number> {
  if (artistPlaysMemo && artistPlaysMemo.tracks === tracks && artistPlaysMemo.playCounts === playCounts) {
    return artistPlaysMemo.map;
  }
  const map = new Map<string, number>();
  for (const track of tracks) {
    const count = playCounts[track.trackhash] ?? 0;
    if (!count) continue;
    for (const artist of track.artists ?? []) {
      if (artist.artisthash) map.set(artist.artisthash, (map.get(artist.artisthash) ?? 0) + count);
    }
  }
  artistPlaysMemo = { tracks, playCounts, map };
  return map;
}
