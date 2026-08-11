/* eslint-disable @typescript-eslint/no-unused-vars */
import { StateCreator } from "zustand";
import type { PlayerState, RepeatMode } from "./types";
import { api } from "@/lib/auralis/api";
import { useLibraryStore, tracksForHashes } from "../library";
import { useReco, fetchRadio, fetchTrajectory, fetchBlend } from "../reco";
import { usePlayhead } from "../playhead";
import { audioEl, clearResumeSeek, exemptFromSkip, pendingResumeSeek, hydrated } from "./PlaybackController";
import { applyMode, normalizeMode } from "@/lib/auralis/themes";
import { shuffleArray, reorderWithFirst, buildContinuation, clampOffset, DEFAULT_LYRICS_OFFSET, parseRules, loadPersisted, initialLocale, initialMode, initial, nextToastSeq } from "./helpers";

export const createQueueSlice: StateCreator<PlayerState, [], [], Pick<PlayerState, "queue" | "shuffledQueue" | "currentIndex" | "currentTrack" | "isPlaying" | "volume" | "muted" | "repeat" | "shuffle" | "autoplay" | "normalization" | "crossfade" | "playTrack" | "playList" | "togglePlay" | "playNext" | "playPrev" | "seek" | "seekRelative" | "setVolume" | "toggleMute" | "toggleShuffle" | "cycleRepeat" | "toggleAutoplay" | "setNormalization" | "setCrossfade" | "addToQueueNext" | "addToQueueEnd" | "removeFromQueue" | "reorderQueue" | "clearQueue" | "jumpToQueueIndex">> = (set, get) => ({
queue: [],

shuffledQueue: [],

currentIndex: 0,

currentTrack: null,

isPlaying: false,

volume: 0.78,

muted: false,

repeat: "off",

shuffle: false,

autoplay: true,

normalization: initial.normalization ?? "track",

crossfade: initial.crossfade ?? 0,

playTrack: (track, list, startIndex) => {
      clearResumeSeek();
      const source = list && list.length ? list : [track];
      const idx = list ? (startIndex ?? list.findIndex((t) => t.trackhash === track.trackhash)) : 0;
      const baseIndex = idx >= 0 ? idx : 0;
      const first = source[baseIndex] ?? track;
      const { shuffle } = get();
      const order = shuffle
        ? [first, ...shuffleArray(source.filter((_, i) => i !== baseIndex))]
        : reorderWithFirst(source, baseIndex);

      usePlayhead.getState().reset(first.duration || 0);
      set(() => {
        const next = {
          queue: source,
          shuffledQueue: order,
          currentIndex: 0,
          currentTrack: first,
          isPlaying: true,
        };
        return next;
      });
      // Re-selecting the track already loaded in the element keeps the same src,
      // so the audio effect would merely resume it — force a restart from 0.
      if (audioEl && audioEl.dataset.trackhash === first.trackhash) audioEl.currentTime = 0;
    },

playList: (list, startIndex = 0) => {
      clearResumeSeek();
      if (list.length === 0) return;
      const { shuffle } = get();
      const safeIndex = startIndex >= 0 && startIndex < list.length ? startIndex : 0;
      const first = list[safeIndex];
      const order = shuffle
        ? [first, ...shuffleArray(list.filter((_, i) => i !== safeIndex))]
        : reorderWithFirst(list, safeIndex);

      usePlayhead.getState().reset(first.duration || 0);
      set(() => {
        const next = {
          queue: list,
          shuffledQueue: order,
          currentIndex: 0,
          currentTrack: first,
          isPlaying: true,
        };
        return next;
      });
      if (audioEl && audioEl.dataset.trackhash === first.trackhash) audioEl.currentTime = 0;
    },

togglePlay: () => {
      const { currentTrack } = get();
      if (!currentTrack) return;
      set((s) => ({ isPlaying: !s.isPlaying }));
    },

playNext: () => {
      clearResumeSeek();
      const { currentIndex, repeat } = get();
      let shuffledQueue = get().shuffledQueue;
      if (shuffledQueue.length === 0) return;
      let nextIndex = currentIndex + 1;
      if (nextIndex >= shuffledQueue.length) {
        if (repeat === "all") {
          nextIndex = 0;
        } else if (get().autoplay) {
          // Endless listening: append a continuation of similar tracks and keep going.
          const cont = buildContinuation(get().currentTrack, get().queue, useLibraryStore.getState().tracks);
          if (cont.length === 0) { set({ isPlaying: false }); return; }
          set((s) => ({ queue: [...s.queue, ...cont], shuffledQueue: [...s.shuffledQueue, ...cont] }));
          shuffledQueue = get().shuffledQueue;
        } else {
          set({ isPlaying: false });
          return;
        }
      }
      const next = shuffledQueue[nextIndex];
      if (!next) { set({ isPlaying: false }); return; }
      usePlayhead.getState().reset(next.duration || 0);
      set(() => {
        const upd = {
          currentIndex: nextIndex,
          currentTrack: next,
          isPlaying: true,
        };
        return upd;
      });
    },

playPrev: () => {
      clearResumeSeek();
      const { shuffledQueue, currentIndex, repeat } = get();
      if (shuffledQueue.length === 0) return;
      if (usePlayhead.getState().position > 3) {
        usePlayhead.getState().setPosition(0);
        if (audioEl) audioEl.currentTime = 0;
        return;
      }
      let prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        prevIndex = repeat === "all" ? shuffledQueue.length - 1 : 0;
      }
      const prev = shuffledQueue[prevIndex];
      // Going BACK isn't a rejection of the current track — exempt its departure
      // from skip detection (only when we actually move to a different track).
      const leaving = get().currentTrack?.trackhash;
      if (leaving && prev && prev.trackhash !== leaving) exemptFromSkip(leaving);
      usePlayhead.getState().reset(prev.duration || 0);
      set(() => {
        const upd = {
          currentIndex: prevIndex,
          currentTrack: prev,
          isPlaying: true,
        };
        return upd;
      });
    },

seek: (seconds) => {
      const { duration } = usePlayhead.getState();
      const clamped = Math.max(0, Math.min(seconds, duration || seconds));
      usePlayhead.getState().setPosition(clamped);
      if (audioEl) audioEl.currentTime = clamped;
    },

seekRelative: (delta) => {
      const { position, duration } = usePlayhead.getState();
      const clamped = Math.max(0, Math.min(position + delta, duration || 0));
      usePlayhead.getState().setPosition(clamped);
      if (audioEl) audioEl.currentTime = clamped;
    },

setVolume: (v) => {
      const vol = Math.max(0, Math.min(1, v));
      set({ volume: vol, muted: vol === 0 });
    },

toggleMute: () => {
      set((s) => {
        const muted = !s.muted;
        return { muted };
      });
    },

toggleShuffle: () => {
      const { shuffle, queue, currentTrack } = get();
      const newShuffle = !shuffle;
      if (!currentTrack) {
        set({ shuffle: newShuffle });
        return;
      }
      if (newShuffle) {
        const rest = queue.filter((t) => t.trackhash !== currentTrack.trackhash);
        set({ shuffle: true, shuffledQueue: [currentTrack, ...shuffleArray(rest)], currentIndex: 0 });
      } else {
        const idx = queue.findIndex((t) => t.trackhash === currentTrack.trackhash);
        set({ shuffle: false, shuffledQueue: queue, currentIndex: idx >= 0 ? idx : 0 });
      }
    },

cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const { repeat } = get();
      const next = order[(order.indexOf(repeat) + 1) % order.length];
      set({ repeat: next });
    },

toggleAutoplay: () => {
      const autoplay = !get().autoplay;
      set({ autoplay });
      get().notify(autoplay ? "Lecture continue activée" : "Lecture continue désactivée");
    },

setNormalization: (mode) => {
      set({ normalization: mode });
      get().notify(
        mode === "off" ? "Normalisation désactivée" : mode === "album" ? "Volume normalisé par album" : "Volume normalisé par titre",
      );
    },

setCrossfade: (seconds) => {
      const v = Math.max(0, Math.min(12, Math.round(seconds)));
      set({ crossfade: v });
      get().notify(v ? `Fondu enchaîné : ${v} s` : "Fondu désactivé");
    },

addToQueueNext: (track) => {
      const { shuffledQueue, queue, currentTrack, currentIndex, shuffle } = get();
      if (!currentTrack) {
        get().playTrack(track);
        return;
      }
      const insertAt = Math.min(currentIndex + 1, shuffledQueue.length);
      const canonicalIndex = queue.findIndex((t) => t.trackhash === currentTrack.trackhash);
      const nextQueue = shuffle || canonicalIndex < 0
        ? [...queue, track]
        : [...queue.slice(0, canonicalIndex + 1), track, ...queue.slice(canonicalIndex + 1)];
      set({
        shuffledQueue: [...shuffledQueue.slice(0, insertAt), track, ...shuffledQueue.slice(insertAt)],
        queue: nextQueue,
      });
      get().notify(`« ${track.title} » jouera ensuite`);
    },

addToQueueEnd: (track) => {
      const { shuffledQueue, queue, currentTrack } = get();
      if (!currentTrack) {
        get().playTrack(track);
        return;
      }
      set({ shuffledQueue: [...shuffledQueue, track], queue: [...queue, track] });
      get().notify(`« ${track.title} » ajouté à la file`);
    },

removeFromQueue: (index) => {
      const { shuffledQueue, queue, currentIndex } = get();
      if (index < 0 || index >= shuffledQueue.length) return;
      const removed = shuffledQueue[index];
      const nextShuffled = shuffledQueue.filter((_, i) => i !== index);
      // Remove the SAME object from the canonical order — reference identity keeps
      // duplicate trackhashes in sync (the old hash-findIndex always dropped the
      // first occurrence, desyncing the two queues). Fall back to a hash match.
      let canonicalIdx = queue.indexOf(removed);
      if (canonicalIdx < 0) canonicalIdx = queue.findIndex((q) => q.trackhash === removed.trackhash);
      const nextQueue = canonicalIdx >= 0 ? queue.filter((_, i) => i !== canonicalIdx) : queue;
      if (nextShuffled.length === 0) {
        usePlayhead.getState().reset(0);
        set({ queue: [], shuffledQueue: [], currentIndex: 0, currentTrack: null, isPlaying: false });
        return;
      }
      if (index === currentIndex) {
        const safeIndex = Math.min(index, nextShuffled.length - 1);
        const currentTrack = nextShuffled[safeIndex];
        usePlayhead.getState().reset(currentTrack.duration || 0);
        set({ queue: nextQueue, shuffledQueue: nextShuffled, currentIndex: safeIndex, currentTrack });
        return;
      }
      set({ queue: nextQueue, shuffledQueue: nextShuffled, currentIndex: index < currentIndex ? currentIndex - 1 : currentIndex });
    },

reorderQueue: (from, to) => {
      const { shuffledQueue, currentIndex } = get();
      if (from === to || from < 0 || to < 0 || from >= shuffledQueue.length || to >= shuffledQueue.length) return;
      const next = [...shuffledQueue];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      let newCurrent = currentIndex;
      if (currentIndex === from) newCurrent = to;
      else if (from < currentIndex && to >= currentIndex) newCurrent = currentIndex - 1;
      else if (from > currentIndex && to <= currentIndex) newCurrent = currentIndex + 1;
      set({ shuffledQueue: next, currentIndex: newCurrent });
    },

clearQueue: () => {
      const { currentTrack, queue, shuffledQueue, currentIndex } = get();
      // Nothing meaningful to clear (empty, or just the current track).
      if (shuffledQueue.length <= (currentTrack ? 1 : 0)) return;
      set({ queue: currentTrack ? [currentTrack] : [], shuffledQueue: currentTrack ? [currentTrack] : [], currentIndex: 0 });
      get().notify("File d'attente vidée", {
        action: {
          label: "Annuler",
          // Re-anchor on the LIVE current track: during the undo window the track
          // can advance (autoplay/ended), so blindly restoring the snapshot index
          // would break shuffledQueue[currentIndex] === currentTrack. If the now-
          // playing track isn't in the restored queue (a fresh autoplay pick), splice
          // it in at the snapshot position so the invariant always holds.
          run: () => {
            const cur = get().currentTrack;
            if (!cur) { set({ queue, shuffledQueue, currentIndex }); return; }
            const idx = shuffledQueue.findIndex((t) => t.trackhash === cur.trackhash);
            if (idx >= 0) { set({ queue, shuffledQueue, currentIndex: idx }); return; }
            const sq = [...shuffledQueue];
            const at = Math.min(currentIndex, sq.length);
            sq.splice(at, 0, cur);
            const q = queue.some((t) => t.trackhash === cur.trackhash) ? queue : [...queue, cur];
            set({ queue: q, shuffledQueue: sq, currentIndex: at });
          },
        },
      });
    },

jumpToQueueIndex: (index) => {
      clearResumeSeek();
      const { shuffledQueue, currentTrack, currentIndex } = get();
      const t = shuffledQueue[index];
      if (!t) return;
      // Re-selecting the track that is already current restarts it from 0: neither
      // the currentTrack reference nor isPlaying changes, so the shell's audio
      // effect wouldn't otherwise re-fire (the element keeps playing where it was).
      if (currentTrack && index === currentIndex && t.trackhash === currentTrack.trackhash) {
        usePlayhead.getState().setPosition(0);
        if (audioEl) audioEl.currentTime = 0;
        set({ isPlaying: true });
        return;
      }
      usePlayhead.getState().reset(t.duration || 0);
      set(() => {
        const upd = {
          currentIndex: index,
          currentTrack: t,
          isPlaying: true,
        };
        return upd;
      });
    }
});
