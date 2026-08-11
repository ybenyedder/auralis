/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayerState, Persisted, NormalizationMode, ViewId, ToastTone, ToastModel, NotifyOptions } from "./slices/types";
import { applyMode, normalizeMode, type Mode } from "@/lib/auralis/themes";
import { createQueueSlice } from "./slices/queueSlice";
import { createPlaylistSlice } from "./slices/playlistSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createPlaybackSlice } from "./slices/playbackSlice";
import { bindAudio, getAudioTime, consumeResumeSeek } from "./slices/PlaybackController";

import { shuffleArray, loadPersisted } from "./slices/helpers";
import { hydrated } from "./slices/PlaybackController";
import { consumeSkipExempt } from "./slices/PlaybackController";
export { applyMode as applyTheme, type Mode, shuffleArray, consumeSkipExempt };
export type { NormalizationMode, ViewId, ToastTone, ToastModel, NotifyOptions, PlayerState, Persisted };

export { bindAudio, getAudioTime, consumeResumeSeek };



export const usePlayer = create<PlayerState>()(
  persist(
    (...a) => ({
      ...createQueueSlice(...a),
      ...createPlaylistSlice(...a),
      ...createUiSlice(...a),
      ...createPlaybackSlice(...a),
    }),
    {
      name: "auralis.vault.v1",
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<Persisted> & { accent?: string };
        if (version < 2) {
          if ((state as any /* eslint-disable-line @typescript-eslint/no-explicit-any */).accent && !state.mode) {
            state.mode = (state as any /* eslint-disable-line @typescript-eslint/no-explicit-any */).accent as Mode;
          }
        }
        return state as Persisted;
      },
      // `partialize` stores favorites/dislikes as arrays (JSON has no Set), so the
      // default shallow merge would leave them as arrays after reload — and every
      // `favorites.has(...)` / `dislikes.has(...)` call in the views would throw
      // ("has is not a function"). Coerce them back into Sets here, synchronously,
      // before the first render reads them.
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<Persisted>;
        return {
          ...currentState,
          ...p,
          favorites: new Set(Array.isArray(p.favorites) ? p.favorites : []),
          dislikes: new Set(Array.isArray(p.dislikes) ? p.dislikes : []),
        };
      },
      partialize: (state) => ({
        favorites: Array.from(state.favorites),
        dislikes: Array.from(state.dislikes),
        volume: state.volume,
        muted: state.muted,
        repeat: state.repeat,
        shuffle: state.shuffle,
        autoplay: state.autoplay,
        normalization: state.normalization,
        crossfade: state.crossfade,
        locale: state.locale,
        customPlaylists: state.customPlaylists,
        recentTrackhashes: state.recentTrackhashes.slice(0, 40),
        mode: state.mode,
        flatBackdrop: state.flatBackdrop,
        playCounts: state.playCounts,
        karaokeMode: state.karaokeMode,
        lyricsOffset: state.lyricsOffset,
        lastSession: state.isPlaying && state.currentTrack
        ? {
            trackhash: state.currentTrack.trackhash,
            queueHashes: state.queue.map((t) => t.trackhash),
            currentIndex: state.currentIndex,
            position: getAudioTime() || 0,
          }
        : hydrated ? undefined : loadPersisted().lastSession,
      } as Persisted),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
           applyMode(state.mode);
           if (typeof document !== "undefined") {
             document.documentElement.lang = state.locale;
           }
        }
      }
    }
  )
);
