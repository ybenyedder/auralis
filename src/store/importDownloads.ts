"use client";

// Playlist-import bulk downloads — the "Télécharger les N titres manquants"
// offer that follows a .m3u/.json or URL import. One POST /api/download batch,
// then each returned job id is polled exactly like the single online-search
// downloads, and every finished track is folded into the just-created playlist
// through the regular addToPlaylist action. Lives in a module-level zustand
// store (not in the view) so the run keeps completing — and keeps adding to the
// playlist — even after the user navigates away from the import screen.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";
import { translate } from "@/lib/auralis/messages";
import type { Track } from "@/lib/auralis/types";
import { usePlayer } from "./player";
import { useLibraryStore } from "./library";

type DownloadStatus = "queued" | "resolving" | "downloading" | "scanning" | "done" | "error";

interface ImportJobView {
  id: string;
  status: DownloadStatus;
  progress: number;
  trackhash: string | null;
  error: string | null;
  title: string | null;
}

/** The /api/download bulk endpoint caps a batch at 200 items. */
const MAX_BATCH = 200;
const POLL_MS = 1500;
const MAX_POLLS = 600;

export interface ImportDownloadsState {
  /** The playlist finished downloads are appended to. */
  playlistId: string | null;
  /** Jobs queued in the current run. */
  total: number;
  /** Jobs that produced a track and were added to the playlist. */
  added: number;
  /** Jobs that errored (or finished without a track) — tolerated per job. */
  failed: number;
  running: boolean;
  finished: boolean;
  /** Enqueue `misses` ("Artist — Title" strings) as one bulk download batch. */
  start: (playlistId: string, misses: string[]) => void;
  /** Hide the finished run's panel and reset the counters. */
  dismiss: () => void;
}

// The run target lives outside the state so a re-render or a partial reset can
// never detach in-flight jobs from the playlist they belong to.
let targetPlaylistId: string | null = null;

export const useImportDownloads = create<ImportDownloadsState>()((set, get) => {
  const notify = (key: string, fallback: string, params?: Record<string, string | number>, tone?: "success" | "error") => {
    const player = usePlayer.getState();
    player.notify(translate(player.locale, key, fallback, params), tone ? { tone } : undefined);
  };

  const settle = (ok: boolean, trackhash: string | null, title: string | null) => {
    const state = get();
    const resolved = ok && Boolean(trackhash);
    const added = state.added + (resolved ? 1 : 0);
    const failed = state.failed + (resolved ? 0 : 1);
    const finished = added + failed >= state.total;
    if (resolved && targetPlaylistId) {
      // addToPlaylist only needs the hash — the scan import materialises the
      // full track in the library snapshot a moment later.
      const track =
        useLibraryStore.getState().trackIndex.get(trackhash as string) ??
        ({ trackhash: trackhash as string, title: title ?? "" } as Track);
      usePlayer.getState().addToPlaylist(targetPlaylistId, track, { silent: true });
    }
    set({ added, failed, running: !finished, finished });
    if (finished) {
      notify("library.importDownloadDone", "Playlist mise à jour : {count} titres ajoutés", { count: added }, added > 0 ? "success" : "error");
    }
  };

  const poll = (jobId: string, attempt: number) => {
    setTimeout(() => {
      void api
        .get<{ job?: ImportJobView }>(`/api/download?job=${encodeURIComponent(jobId)}`)
        .then((res) => {
          const job = res.job;
          if (!job) {
            if (attempt < MAX_POLLS) poll(jobId, attempt + 1);
            else settle(false, null, null);
            return;
          }
          if (job.status === "done") settle(true, job.trackhash, job.title);
          else if (job.status === "error") settle(false, null, null);
          else if (attempt < MAX_POLLS) poll(jobId, attempt + 1);
          else settle(false, null, null);
        })
        .catch(() => {
          if (attempt < MAX_POLLS) poll(jobId, attempt + 1);
          else settle(false, null, null);
        });
    }, POLL_MS);
  };

  return {
    playlistId: null,
    total: 0,
    added: 0,
    failed: 0,
    running: false,
    finished: false,

    start: (playlistId, misses) => {
      if (get().running) return;
      const items = misses.slice(0, MAX_BATCH).map((m) => ({
        // "Artist — Title" → a plain "<artist> <title>" search query.
        query: m.replace(/\s+[—–-]\s+/g, " ").trim(),
        title: m,
      }));
      if (items.length === 0) return;
      targetPlaylistId = playlistId;
      set({ playlistId, total: items.length, added: 0, failed: 0, running: true, finished: false });
      void api
        .post<{ ok: boolean; jobs?: ImportJobView[]; error?: string }>("/api/download", { items })
        .then((res) => {
          const jobs = res.jobs ?? [];
          if (!res.ok || jobs.length === 0) throw new Error(res.error || "no jobs");
          // The server may trim the batch — track what it actually queued.
          set({ total: jobs.length });
          for (const job of jobs) poll(job.id, 0);
        })
        .catch(() => {
          set({ running: false, finished: true, failed: get().total });
          notify("search.downloadFailed", "Échec du téléchargement", undefined, "error");
        });
    },

    dismiss: () => {
      if (get().running) return;
      set({ playlistId: null, total: 0, added: 0, failed: 0, finished: false });
    },
  };
});
