/* eslint-disable @typescript-eslint/no-unused-vars */
import { StateCreator } from "zustand";
import type { PlayerState } from "./types";
import { api } from "@/lib/auralis/api";
import { useLibraryStore, tracksForHashes } from "../library";
import { useReco, fetchRadio, fetchTrajectory, fetchBlend } from "../reco";
import { usePlayhead } from "../playhead";
import { audioEl, clearResumeSeek, exemptFromSkip, pendingResumeSeek, hydrated } from "./PlaybackController";
import { applyMode, normalizeMode } from "@/lib/auralis/themes";
import { shuffleArray, reorderWithFirst, buildContinuation, clampOffset, DEFAULT_LYRICS_OFFSET, parseRules, loadPersisted, initialLocale, initialMode, initial, nextToastSeq } from "./helpers";

export const createUiSlice: StateCreator<PlayerState, [], [], Pick<PlayerState, "view" | "navHistory" | "searchQuery" | "searchFocus" | "commandOpen" | "rightPanelOpen" | "fullscreenPlayer" | "lyricsOpen" | "queueOpen" | "helpOpen" | "miniPlayer" | "karaokeMode" | "lyricsOffset" | "visualizerOpen" | "mode" | "flatBackdrop" | "contextMenu" | "toast" | "lyricsLoading" | "lyricsStatus" | "lyricsPlain" | "aligning" | "syncReady" | "sleepTimer" | "locale" | "navigate" | "back" | "setSearch" | "setSearchFocus" | "setCommandOpen" | "toggleRightPanel" | "toggleFullscreenPlayer" | "toggleLyrics" | "toggleQueue" | "setHelpOpen" | "toggleMiniPlayer" | "toggleKaraoke" | "adjustLyricsOffset" | "resetLyricsOffset" | "toggleVisualizer" | "closeVisualizer" | "setMode" | "setFlatBackdrop" | "closeFullscreenPlayer" | "openContextMenu" | "openAlbumContextMenu" | "openArtistContextMenu" | "closeContextMenu" | "notify" | "dismissToast" | "setLocale" | "startSleepTimer" | "sleepAfterTrack" | "cancelSleepTimer">> = (set, get) => ({
view: { view: "home" },

navHistory: [],

searchQuery: "",

searchFocus: false,

commandOpen: false,

locale: initialLocale,

sleepTimer: { active: false, endsAt: null, minutes: 0 },

rightPanelOpen: true,

fullscreenPlayer: false,

lyricsOpen: false,

queueOpen: false,

helpOpen: false,

miniPlayer: false,

karaokeMode: initial.karaokeMode ?? true,

lyricsOffset: clampOffset(initial.lyricsOffset ?? DEFAULT_LYRICS_OFFSET),

visualizerOpen: false,

mode: initialMode,

flatBackdrop: initial.flatBackdrop ?? false,

contextMenu: { open: false, x: 0, y: 0 },

toast: null,

lyricsLoading: false,

lyricsStatus: "idle",

lyricsPlain: null,

aligning: false,

syncReady: false,

navigate: (view, id) => {
      const { view: current } = get();
      // Navigating to the view you're already on (e.g. re-clicking the active
      // sidebar link) used to still push a duplicate onto navHistory — back()
      // would then "return" to the same view, a wasted press before it actually
      // went anywhere — and recreate the `view` object, re-rendering every
      // atomic `s.view` subscriber (Sidebar, TitleBar…) for nothing. Keep the
      // SAME view reference so those subscribers see no change; fullscreenPlayer
      // still resets unconditionally (a nav click should always leave fullscreen).
      const same = current.view === view && current.id === id;
      set((s) => ({
        view: same ? s.view : { view, id },
        navHistory: same ? s.navHistory : [...s.navHistory, current].slice(-24),
        fullscreenPlayer: false,
      }));
    },

back: () => {
      const { navHistory } = get();
      if (navHistory.length === 0) return;
      const prev = navHistory[navHistory.length - 1];
      set((s) => ({ view: prev, navHistory: s.navHistory.slice(0, -1) }));
    },

setSearch: (q) => set({ searchQuery: q }),

setSearchFocus: (v) => set({ searchFocus: v }),

setCommandOpen: (v) => set({ commandOpen: v }),

setLocale: (locale) => {
      set({ locale });
      if (typeof document !== "undefined") document.documentElement.lang = locale;
      void api.put("/api/state", { action: "setting", key: "locale", value: locale }).catch(() => {});
    },

startSleepTimer: (minutes) => {
      set({ sleepTimer: { active: true, endsAt: Date.now() + minutes * 60_000, minutes } });
      get().notify(`Minuteur réglé sur ${minutes} min`);
    },

sleepAfterTrack: () => {
      set({ sleepTimer: { active: true, endsAt: null, minutes: 0, endOfTrack: true } });
      get().notify("Le lecteur s'arrêtera à la fin du titre");
    },

cancelSleepTimer: () => {
      set({ sleepTimer: { active: false, endsAt: null, minutes: 0 } });
      get().notify("Minuteur annulé");
    },

toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

toggleFullscreenPlayer: () => set((s) => ({ fullscreenPlayer: !s.fullscreenPlayer, lyricsOpen: false, visualizerOpen: false })),

toggleLyrics: () => {
      const willOpen = !get().lyricsOpen;
      // Reveal the lyrics surface reliably: the desktop pane lives inside
      // NowPlayingPanel, which is hidden when the right panel is closed and shows
      // the queue when queueOpen — so opening lyrics must claim the right panel and
      // drop the queue, otherwise the toggle silently does nothing.
      set({
        lyricsOpen: willOpen,
        queueOpen: willOpen ? false : get().queueOpen,
        rightPanelOpen: willOpen ? true : get().rightPanelOpen,
      });
      // Auto-resolve lyrics (cache → sidecar → online) the first time the pane opens.
      if (willOpen && !get().currentTrack?.lyrics?.length && get().lyricsStatus === "idle") {
        void get().fetchLyrics(false);
      }
    },

toggleQueue: () =>
      set((s) => {
        const willOpen = !s.queueOpen;
        // Same coordination as lyrics: queue + lyrics share the right panel, so
        // opening the queue must claim the panel and drop lyrics.
        return {
          queueOpen: willOpen,
          lyricsOpen: willOpen ? false : s.lyricsOpen,
          rightPanelOpen: willOpen ? true : s.rightPanelOpen,
        };
      }),

setHelpOpen: (v) => set({ helpOpen: v }),

toggleMiniPlayer: () => set((s) => ({ miniPlayer: !s.miniPlayer })),

toggleKaraoke: () =>
      set((s) => {
        const karaokeMode = !s.karaokeMode;
        return { karaokeMode };
      }),

adjustLyricsOffset: (delta) =>
      set((s) => {
        const lyricsOffset = clampOffset(s.lyricsOffset + delta);
        return { lyricsOffset };
      }),

resetLyricsOffset: () =>
      set(() => {
        const lyricsOffset = DEFAULT_LYRICS_OFFSET;
        return { lyricsOffset };
      }),

toggleVisualizer: () => set((s) => ({ visualizerOpen: !s.visualizerOpen })),

closeVisualizer: () => set({ visualizerOpen: false }),

setMode: (id) => {
      const mode = normalizeMode(id);
      set({ mode } as any /* eslint-disable-line @typescript-eslint/no-explicit-any */);
      applyMode(mode);
      // Keep writing the legacy `accent` key too so older clients still read a
      // sane value, plus the new `theme` key going forward.
      void api.put("/api/state", { action: "setting", key: "mode", value: mode }).catch(() => {});
      void api.put("/api/state", { action: "setting", key: "accent", value: mode }).catch(() => {});
    },

setFlatBackdrop: (on) => {
      set({ flatBackdrop: on });
      void api.put("/api/state", { action: "setting", key: "flatBackdrop", value: on }).catch(() => {});
    },

closeFullscreenPlayer: () => set({ fullscreenPlayer: false, lyricsOpen: false }),

openContextMenu: (x, y, track) => set({ contextMenu: { open: true, x, y, track } }),

openAlbumContextMenu: (x, y, album) => set({ contextMenu: { open: true, x, y, album } }),

openArtistContextMenu: (x, y, artist) => set({ contextMenu: { open: true, x, y, artist } }),

closeContextMenu: () => set((s) => ({ contextMenu: { ...s.contextMenu, open: false } })),

notify: (message, opts) => {
      const id = nextToastSeq();
      set({ toast: { id, message, tone: opts?.tone ?? "success", action: opts?.action } });
      if (typeof window !== "undefined") {
        // Give an actionable toast (e.g. "Annuler") longer to be clicked.
        window.setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null });
        }, opts?.action ? 5200 : 2600);
      }
    },

dismissToast: () => set({ toast: null })
});
