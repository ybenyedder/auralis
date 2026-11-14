"use client";

// Instant Liner-style streaming resolution for unmatched tracks after a
// playlist import (.m3u/.json or Spotify/Deezer/Apple/YouTube link). Instead of
// downloading audio files to disk, resolves entries via POST /api/online/resolve-batch
// into lightweight `yt:<videoId>` tracks stored in `online_tracks` and adds
// them straight to the imported playlist.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";
import { translate } from "@/lib/auralis/messages";
import type { ExternalTrackEntry } from "@/lib/auralis/playlistIO";
import type { Track } from "@/lib/auralis/types";
import { usePlayer } from "./player";
import { useLibraryStore } from "./library";

const CHUNK_SIZE = 25;
const MAX_ITEMS = 500;

export interface ImportDownloadsState {
  playlistId: string | null;
  total: number;
  added: number;
  failed: number;
  running: boolean;
  finished: boolean;
  start: (playlistId: string, entries: ExternalTrackEntry[] | string[]) => void;
  cancel: () => void;
  dismiss: () => void;
}

let activeRunId = 0;

function normalizeEntries(input: ExternalTrackEntry[] | string[]): ExternalTrackEntry[] {
  return input
    .slice(0, MAX_ITEMS)
    .map((item) => {
      if (typeof item !== "string") return item;
      const sep = item.indexOf(" — ");
      if (sep > 0) return { artist: item.slice(0, sep).trim(), title: item.slice(sep + 3).trim() };
      return { title: item.trim() };
    })
    .filter((e) => Boolean(e.title?.trim() || e.videoId?.trim()));
}

export const useImportDownloads = create<ImportDownloadsState>()((set, get) => {
  const notify = (key: string, fallback: string, params?: Record<string, string | number>, tone?: "success" | "error") => {
    const player = usePlayer.getState();
    player.notify(translate(player.locale, key, fallback, params), tone ? { tone } : undefined);
  };

  return {
    playlistId: null,
    total: 0,
    added: 0,
    failed: 0,
    running: false,
    finished: false,

    start: (playlistId, rawEntries) => {
      if (get().running) return;
      const items = normalizeEntries(rawEntries);
      if (items.length === 0) return;

      const runId = ++activeRunId;
      set({ playlistId, total: items.length, added: 0, failed: 0, running: true, finished: false });

      void (async () => {
        let added = 0;
        let failed = 0;
        try {
          for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
            if (runId !== activeRunId) return;
            const chunk = items.slice(offset, offset + CHUNK_SIZE);
            try {
              const res = await api.post<{
                ok: boolean;
                resolved?: { index: number; track: Track | null }[];
              }>("/api/online/resolve-batch", { items: chunk });
              if (runId !== activeRunId) return;

              const tracks: Track[] = [];
              const resolvedRows = res.resolved ?? [];
              for (const row of resolvedRows) {
                if (row.track) {
                  useLibraryStore.getState().upsertTrack(row.track);
                  tracks.push(row.track);
                  added += 1;
                } else {
                  failed += 1;
                }
              }
              if (resolvedRows.length < chunk.length) {
                failed += chunk.length - resolvedRows.length;
              }
              if (tracks.length > 0) {
                usePlayer.getState().addTracksToPlaylist(playlistId, tracks, { silent: true });
              }
            } catch {
              if (runId !== activeRunId) return;
              failed += chunk.length;
            }
            set({ added, failed });
          }

          if (runId !== activeRunId) return;
          set({ added, failed, running: false, finished: true });
          notify(
            "library.importDownloadDone",
            "Playlist mise à jour : {count} titres prêts en streaming",
            { count: added },
            added > 0 ? "success" : "error",
          );
        } catch {
          if (runId !== activeRunId) return;
          set({ running: false, finished: true, failed: items.length - added });
          notify("search.downloadFailed", "Échec de la résolution", undefined, "error");
        }
      })();
    },

    cancel: () => {
      if (!get().running) return;
      activeRunId += 1;
      set({ running: false, finished: true });
    },

    dismiss: () => {
      if (get().running) return;
      set({ playlistId: null, total: 0, added: 0, failed: 0, finished: false });
    },
  };
});
