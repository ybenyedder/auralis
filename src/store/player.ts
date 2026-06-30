"use client";

import { create } from "zustand";
import type { Track, Album, Artist, RepeatMode, Playlist } from "@/lib/auralis/types";
import type { SmartConfig } from "@/lib/auralis/smartlist";
import type { Locale } from "@/lib/auralis/i18n";
import { api } from "@/lib/auralis/api";
import { useLibraryStore, tracksForHashes } from "./library";
import { useReco, fetchRadio, fetchTrajectory, fetchBlend } from "./reco";
import { usePlayhead } from "./playhead";
import {
  THEMES,
  applyTheme,
  normalizeTheme,
  type ThemeId,
} from "@/lib/auralis/themes";

// Re-exported so existing imports of the theme engine through the store keep
// working. The catalogue + apply logic now live in lib/auralis/themes.ts.
export { THEMES, applyTheme, type ThemeId };

/** Volume normalization mode (ReplayGain-style equal loudness). */
export type NormalizationMode = "off" | "track" | "album";

// Audio element reference, bound by the app shell. Seeking writes straight to it
// so the playhead store and the <audio> element stay in sync without React renders.
let audioEl: HTMLAudioElement | null = null;
export function bindAudio(el: HTMLAudioElement | null) {
  audioEl = el;
}
/** The live <audio> currentTime, read straight from the element. Lets the lyrics
 *  view interpolate playback at 60fps between the ~4×/s `timeupdate` store writes
 *  so the karaoke wipe is smooth instead of stepping. Null when nothing is bound. */
export function getAudioTime(): number | null {
  return audioEl ? audioEl.currentTime : null;
}

// Where to seek when a RESTORED track's audio loads — set by restoreLastSession,
// consumed once by the shell's loadedmetadata handler. Bound to the specific
// trackhash so a restored track that never loads (e.g. its file 404s) can't leak a
// stale seek onto an unrelated track the user picks next. Best-effort: a miss just
// starts from 0 (the first timeupdate re-syncs the scrubber), so it's benign.
let pendingResumeSeek: { trackhash: string; position: number } | null = null;
function clearResumeSeek() {
  pendingResumeSeek = null;
}
/** Returns the resume position ONLY when it was armed for `trackhash`, then clears
 *  it. Any other (normal) track loading gets null and leaves nothing armed. */
export function consumeResumeSeek(trackhash: string | undefined | null): number | null {
  if (pendingResumeSeek && trackhash && pendingResumeSeek.trackhash === trackhash) {
    const pos = pendingResumeSeek.position;
    pendingResumeSeek = null;
    return pos;
  }
  return null;
}

export type ViewId =
  | "home"
  | "explore"
  | "library"
  | "favorites"
  | "recents"
  | "folders"
  | "insights"
  | "album"
  | "artist"
  | "playlist"
  | "settings";

interface NavTarget {
  view: ViewId;
  id?: string;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  track?: Track;
  album?: Album;
  artist?: Artist;
}

interface SleepTimer {
  active: boolean;
  endsAt: number | null;
  minutes: number;
  /** When set, playback stops at the END of the current track (no minute timer). */
  endOfTrack?: boolean;
}

export type ToastTone = "success" | "error" | "info";
export interface ToastModel {
  id: number;
  message: string;
  tone: ToastTone;
  /** Optional inline action (e.g. "Annuler") — extends the auto-dismiss window. */
  action?: { label: string; run: () => void };
}
export interface NotifyOptions {
  tone?: ToastTone;
  action?: { label: string; run: () => void };
}

interface PlayerState {
  view: NavTarget;
  navHistory: NavTarget[];
  searchQuery: string;
  searchFocus: boolean;
  commandOpen: boolean;

  queue: Track[];
  shuffledQueue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  /** Endless listening: when the queue ends, auto-append similar tracks and keep going. */
  autoplay: boolean;
  /** Volume normalization mode (ReplayGain-style equal loudness): off | track | album. */
  normalization: NormalizationMode;
  /** Crossfade / fade-in length in seconds (0 = off). */
  crossfade: number;
  /** UI language. */
  locale: Locale;
  favorites: Set<string>;
  dislikes: Set<string>;
  recentTrackhashes: string[];
  playCounts: Record<string, number>;

  /** Spotify-style multi-select: when on, rows show a checkbox and tapping toggles
   *  selection instead of playing. Feeds the "AI playlist from my picks" action. */
  selectionMode: boolean;
  selected: Set<string>;

  customPlaylists: Playlist[];
  sleepTimer: SleepTimer;

  rightPanelOpen: boolean;
  fullscreenPlayer: boolean;
  lyricsOpen: boolean;
  queueOpen: boolean;
  helpOpen: boolean;
  miniPlayer: boolean;
  karaokeMode: boolean;
  /** Seconds added to the audio clock when timing lyrics. Positive = lyrics
   *  anticipate (appear earlier); lets the user dial out any residual lag. */
  lyricsOffset: number;
  visualizerOpen: boolean;
  theme: ThemeId;
  contextMenu: ContextMenuState;
  toast: ToastModel | null;
  lyricsLoading: boolean;
  lyricsStatus: "idle" | "loading" | "found" | "notfound" | "instrumental" | "error";
  lyricsPlain: string | null;
  syncReady: boolean;

  navigate: (view: ViewId, id?: string) => void;
  back: () => void;
  setSearch: (q: string) => void;
  setSearchFocus: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;

  playTrack: (track: Track, list?: Track[], startIndex?: number) => void;
  playList: (list: Track[], startIndex?: number) => void;
  /** Start a personalised radio around a seed track: plays the seed, then a
   *  similarity×taste continuation from the server engine (autoplay keeps it going). */
  startRadio: (seedHash: string, seedTrack?: Track) => Promise<void>;
  /** Start a mood-trajectory radio (a set gliding along a named arousal/valence arc). */
  startTrajectory: (path: string, label?: string) => Promise<void>;
  /** Start a household Blend mix with another account (by username). */
  startBlend: (username: string, label?: string) => Promise<void>;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (seconds: number) => void;
  seekRelative: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleAutoplay: () => void;
  setNormalization: (mode: NormalizationMode) => void;
  setCrossfade: (seconds: number) => void;
  setLocale: (locale: Locale) => void;
  addToQueueNext: (track: Track) => void;
  addToQueueEnd: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpToQueueIndex: (index: number) => void;
  /** Count a *real* listen (fired by the shell after a play threshold, not on
   *  track selection): bumps recents + play count, server stays authoritative. */
  scrobble: (trackhash: string) => void;
  /** Record a SKIP (fired by the shell when the user advances before the listen
   *  threshold): a negative taste signal, scaled by how little was heard. */
  recordSkip: (trackhash: string, msPlayed: number, ratio: number) => void;

  toggleFavorite: (trackhash: string) => void;
  isFavorite: (trackhash: string) => boolean;
  toggleDislike: (trackhash: string) => void;
  isDisliked: (trackhash: string) => boolean;

  createPlaylist: (name: string, description?: string) => string;
  /** Create a SMART (dynamic) playlist from a rule config — tracks computed live. */
  createSmartPlaylist: (config: SmartConfig) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (id: string, track: Track) => void;
  removeFromPlaylist: (id: string, trackhash: string) => void;
  reorderInPlaylist: (id: string, from: number, to: number) => void;
  /** Create a playlist from a set of already-resolved trackhashes in one shot (import). */
  importPlaylist: (name: string, trackhashes: string[]) => string;

  // --- Multi-select → AI playlist -----------------------------------------
  /** Enter selection mode (optionally pre-selecting one track from a long-press). */
  enterSelection: (trackhash?: string) => void;
  /** Toggle one track in/out of the current selection (turns selection mode on). */
  toggleSelected: (trackhash: string) => void;
  /** Add a batch of trackhashes to the selection (e.g. "select all" in a view). */
  selectMany: (trackhashes: string[]) => void;
  /** Empty the selection but stay in selection mode. */
  clearSelection: () => void;
  /** Leave selection mode and drop the selection. */
  exitSelection: () => void;
  /** Ask the server's taste engine to build a playlist from the selected seeds +
   *  the user's taste, persist it, mirror it locally and open it. Resolves the new
   *  playlist id (or null on failure / empty selection). */
  generateAiPlaylist: (opts?: { name?: string; count?: number }) => Promise<string | null>;
  /** Owner-only: toggle a playlist shared/collaborative. */
  sharePlaylist: (id: string, shared: boolean) => void;
  /** Owner-only: invite a collaborator by username. Resolves true on success. */
  addPlaylistCollaborator: (id: string, username: string) => Promise<boolean>;

  startSleepTimer: (minutes: number) => void;
  sleepAfterTrack: () => void;
  cancelSleepTimer: () => void;

  toggleRightPanel: () => void;
  toggleFullscreenPlayer: () => void;
  toggleLyrics: () => void;
  toggleQueue: () => void;
  setHelpOpen: (v: boolean) => void;
  toggleMiniPlayer: () => void;
  toggleKaraoke: () => void;
  adjustLyricsOffset: (delta: number) => void;
  resetLyricsOffset: () => void;
  toggleVisualizer: () => void;
  closeVisualizer: () => void;
  setTheme: (id: ThemeId) => void;
  reorderCustomPlaylists: (from: number, to: number) => void;
  closeFullscreenPlayer: () => void;
  openContextMenu: (x: number, y: number, track: Track) => void;
  openAlbumContextMenu: (x: number, y: number, album: Album) => void;
  openArtistContextMenu: (x: number, y: number, artist: Artist) => void;
  closeContextMenu: () => void;
  notify: (message: string, opts?: NotifyOptions) => void;
  dismissToast: () => void;

  hydrateLocal: () => void;
  hydrateFromServer: () => Promise<void>;
  restoreLastSession: () => void;
  resetServerStats: () => void;
  fetchLyrics: (force?: boolean) => Promise<void>;
}

interface ServerState {
  favorites: string[];
  dislikes: string[];
  playCounts: Record<string, number>;
  recents: string[];
  playlists: { id: string; name: string; description: string | null; pinned: boolean; trackhashes: string[]; rules?: string | null; shared?: boolean; collaborator?: boolean; owner?: string }[];
  settings: Record<string, unknown>;
}

/** Parse a server playlist's JSON `rules` string into a SmartConfig (or undefined). */
function parseRules(s?: string | null): SmartConfig | undefined {
  if (!s) return undefined;
  try {
    const o = JSON.parse(s) as SmartConfig;
    return o && Array.isArray(o.rules) ? o : undefined;
  } catch {
    return undefined;
  }
}

interface LyricsResponse {
  status: "found" | "instrumental" | "notfound";
  lines: { time: number; text: string; words?: { time: number; text: string }[] }[];
  plain: string | null;
  synced: boolean;
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function reorderWithFirst<T>(list: T[], firstIndex: number): T[] {
  if (firstIndex < 0 || firstIndex >= list.length) return list;
  const first = list[firstIndex];
  const rest = list.filter((_, i) => i !== firstIndex);
  return [first, ...rest];
}

// Trackhashes whose *departure* must NOT be recorded as a skip (going to the
// PREVIOUS track, a resumed-session track, a programmatic restart). The shell's
// skip detector consults and one-shot-clears this on each track change — the store
// owns the navigation intent, the shell owns the listening progress.
const skipExempt = new Set<string>();
/** Mark a track so leaving it next isn't counted as a skip (one-shot). */
export function exemptFromSkip(trackhash: string | undefined | null): void {
  if (trackhash) skipExempt.add(trackhash);
}
/** True if leaving `trackhash` should be exempt; clears the flag (one-shot). */
export function consumeSkipExempt(trackhash: string): boolean {
  return skipExempt.delete(trackhash);
}

/** Build an "autoplay/radio" continuation when the queue runs out: tracks by the
 *  same artist(s) or genre as the current one (so it feels related), then ranked by
 *  the user's taste score so the radio leans into what they actually love and away
 *  from what they reject. Disliked tracks are dropped outright; a little jitter
 *  keeps the radio from being identical every lap. Falls back to the wider library. */
function buildContinuation(current: Track | null, queued: Track[], library: Track[]): Track[] {
  if (library.length === 0) return [];
  const inQueue = new Set(queued.map((t) => t.trackhash));
  const { scores, disliked } = useReco.getState();
  // Exclude dislikes from the AUTHORITATIVE player set (updated synchronously on
  // toggle, hydrated from localStorage even offline), unioned with the reco mirror
  // so a dislike synced from another device is honoured too. The reco mirror alone
  // lags behind a just-made dislike by the refresh debounce and is empty offline.
  const playerDislikes = usePlayer.getState().dislikes;
  const isDisliked = (h: string) => playerDislikes.has(h) || disliked.has(h);
  const curArtists = new Set((current?.artists ?? []).map((a) => a.artisthash).filter(Boolean));
  const curGenre = current?.genre;
  const available = library.filter((t) => !inQueue.has(t.trackhash) && !isDisliked(t.trackhash));
  const similar = available.filter(
    (t) => (t.artists ?? []).some((a) => curArtists.has(a.artisthash)) || (!!curGenre && t.genre === curGenre),
  );
  const pool = similar.length >= 5 ? similar : available;
  // Taste score biases the order; the jitter (~score magnitude) preserves variety.
  const rank = (t: Track) => (scores.get(t.trackhash) ?? 0) + Math.random() * 0.6;
  return [...pool].sort((a, b) => rank(b) - rank(a)).slice(0, 20);
}

const LS_KEY = "auralis.vault.v1";

interface Persisted {
  favorites: string[];
  dislikes: string[];
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  autoplay: boolean;
  normalization?: NormalizationMode;
  crossfade?: number;
  locale?: Locale;
  customPlaylists: Playlist[];
  recentTrackhashes: string[];
  theme: ThemeId;
  /** @deprecated pre-0.5 key, read once for migration into `theme`. */
  accent?: string;
  playCounts: Record<string, number>;
  karaokeMode: boolean;
  lyricsOffset: number;
  /** Last playback session (current track + play order + position) so it can be
   *  restored, paused, after a reload/reopen. Hashes only; resolved against the
   *  library. `position` is the playhead in seconds. */
  lastSession?: { trackhash: string; queueHashes: string[]; currentIndex: number; position: number };
}

// A small default karaoke lead-in: the highlight appears a beat before the word
// so it reads as sing-along rather than chasing the voice. NOT a latency
// correction (source LRCs vary), so it's deliberately gentle and fully tunable
// from the lyrics pane's −/+ control (and resettable to this value).
const DEFAULT_LYRICS_OFFSET = 0.15;
const LYRICS_OFFSET_MAX = 3;
function clampOffset(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-LYRICS_OFFSET_MAX, Math.min(LYRICS_OFFSET_MAX, Math.round(n * 100) / 100));
}

function loadPersisted(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function writePersist(state: PlayerState) {
  try {
    const data: Persisted = {
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
      theme: state.theme,
      playCounts: state.playCounts,
      karaokeMode: state.karaokeMode,
      lyricsOffset: state.lyricsOffset,
      // Persist the live play order (capped so an autoplay-grown queue can't bloat
      // localStorage). currentIndex points into shuffledQueue.
      lastSession: state.currentTrack
        ? (() => {
            // Keep a ≤200-track window AROUND the current track (autoplay can grow
            // the queue well past 200, so a plain slice(0,200) would drop the very
            // track being played). relIndex stays valid inside the window.
            const q = state.shuffledQueue;
            const start = q.length <= 200 ? 0 : Math.max(0, Math.min(state.currentIndex - 40, q.length - 200));
            return {
              trackhash: state.currentTrack.trackhash,
              queueHashes: q.slice(start, start + 200).map((t) => t.trackhash),
              currentIndex: state.currentIndex - start,
              // Live playhead (its own store) — read at write time so the pagehide/
              // beforeunload flush captures where the user actually is.
              position: Math.floor(usePlayhead.getState().position),
            };
          })()
        // No current track. Two opposite states both land here:
        //  • BEFORE hydration (app startup, launch-time persists from
        //    hydrateFromServer() fire while currentTrack is still null) — writing
        //    `undefined` would erase the saved session before restoreLastSession
        //    can read it, leaving the reopened app on "Aucune lecture". So we
        //    PRESERVE the prior value until restore has had its chance.
        //  • AFTER hydration (the user genuinely stopped / emptied the queue) —
        //    the session SHOULD clear, so we write `undefined`.
        // The `hydrated` flag (set the first time restoreLastSession runs with the
        // library ready) is what tells the two apart; it also spares the common
        // post-hydration path the localStorage read+parse.
        : hydrated ? undefined : loadPersisted().lastSession,
    };
    window.localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable or full; playback must keep working.
  }
}

// persist() is called synchronously inside ~18 store actions (every play / next /
// favorite / volume tick…). Serialising the whole persisted slice on each call put
// a JSON.stringify on the main thread at every track change — a real micro-jank on
// mobile. We coalesce: keep only the latest snapshot and flush it at most once per
// ~400ms, plus a synchronous flush on page hide so nothing is lost on close.
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingPersist: PlayerState | null = null;
// True once restoreLastSession has run with the library ready: from that point a
// null currentTrack means a genuine stop (clear the session), not the pre-restore
// startup window (preserve it). See writePersist's lastSession branch.
let hydrated = false;

function flushPersist() {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (pendingPersist) {
    writePersist(pendingPersist);
    pendingPersist = null;
  }
}

function persist(state: PlayerState) {
  if (typeof window === "undefined") return;
  pendingPersist = state;
  if (persistTimer !== undefined) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    if (pendingPersist) {
      writePersist(pendingPersist);
      pendingPersist = null;
    }
  }, 400);
}

if (typeof window !== "undefined") {
  // On close/background, persist the CURRENT state (so the live playhead position is
  // captured for session resume), then flush synchronously so nothing is lost.
  const persistNow = () => {
    try { persist(usePlayer.getState()); } catch { /* store not ready */ }
    flushPersist();
  };
  window.addEventListener("pagehide", persistNow);
  window.addEventListener("beforeunload", persistNow);
}

const initial = loadPersisted();
// Migrate the pre-0.5 `accent` key into the richer `theme` registry (the four
// classic accent ids are still valid theme ids, so existing prefs carry over).
const initialTheme = normalizeTheme(initial.theme ?? initial.accent);
const initialLocale: Locale =
  (initial.locale as Locale) ?? (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr");

if (typeof window !== "undefined") {
  applyTheme(initialTheme);
  if (typeof document !== "undefined") document.documentElement.lang = initialLocale;
}

export const usePlayer = create<PlayerState>((set, get) => {
  // Push a single playlist's current contents to the server.
  const pushPlaylist = (id: string) => {
    const pl = get().customPlaylists.find((p) => String(p.id) === id);
    if (!pl) return;
    void api.put("/api/state", {
      action: "playlist.upsert",
      playlist: { id: String(pl.id), name: pl.name, description: pl.description ?? null, pinned: Boolean(pl.pinned), trackhashes: pl.trackhashes ?? [], rules: pl.rules ? JSON.stringify(pl.rules) : null },
    }).catch(() => {});
  };

  return {
    view: { view: "home" },
    navHistory: [],
    searchQuery: "",
    searchFocus: false,
    commandOpen: false,

    queue: [],
    shuffledQueue: [],
    currentIndex: 0,
    currentTrack: null,
    isPlaying: false,
    // SSR-safe defaults. Persisted values are applied after mount via hydrateLocal()
    // so the first client render matches the server-rendered HTML (no hydration mismatch).
    volume: 0.78,
    muted: false,
    repeat: "off",
    shuffle: false,
    autoplay: true,
    normalization: initial.normalization ?? "track",
    crossfade: initial.crossfade ?? 0,
    locale: initialLocale,
    favorites: new Set<string>(),
    dislikes: new Set<string>(),
    recentTrackhashes: [],
    playCounts: {},

    selectionMode: false,
    selected: new Set<string>(),

    customPlaylists: [],
    sleepTimer: { active: false, endsAt: null, minutes: 0 },

    rightPanelOpen: true,
    fullscreenPlayer: false,
    lyricsOpen: false,
    queueOpen: false,
    helpOpen: false,
    miniPlayer: false,
    // Karaoke wipe is the default surface for synced lyrics; the user can switch
    // to a plain highlighted view via the Standard/Karaoké toggle in the lyrics pane.
    karaokeMode: initial.karaokeMode ?? true,
    lyricsOffset: clampOffset(initial.lyricsOffset ?? DEFAULT_LYRICS_OFFSET),
    visualizerOpen: false,
    theme: initialTheme,
    contextMenu: { open: false, x: 0, y: 0 },
    toast: null,
    lyricsLoading: false,
    lyricsStatus: "idle",
    lyricsPlain: null,
    syncReady: false,

    navigate: (view, id) => {
      const { view: current } = get();
      set((s) => ({
        view: { view, id },
        navHistory: [...s.navHistory, current].slice(-24),
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
        persist({ ...get(), ...next });
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
        persist({ ...get(), ...next });
        return next;
      });
      if (audioEl && audioEl.dataset.trackhash === first.trackhash) audioEl.currentTime = 0;
    },

    startRadio: async (seedHash, seedTrack) => {
      get().notify("Chargement de la radio…", { tone: "info" });
      // The server engine ranks the whole library by similarity-to-seed × taste,
      // excluding the seed + dislikes. Empty only when nothing has audio features yet.
      const hashes = await fetchRadio(seedHash, [], 50);
      const radio = tracksForHashes(hashes);
      const seed = seedTrack ?? useLibraryStore.getState().trackIndex.get(seedHash);
      const list = seed ? [seed, ...radio.filter((t) => t.trackhash !== seed.trackhash)] : radio;
      if (list.length === 0) {
        get().notify("Radio indisponible — pas assez de titres analysés", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(seed ? `Radio : ${seed.title}` : "Radio lancée");
    },

    startTrajectory: async (path, label) => {
      get().notify("Préparation du voyage sonore…", { tone: "info" });
      const list = tracksForHashes(await fetchTrajectory(path, 40));
      if (list.length === 0) {
        get().notify("Pas assez de titres analysés pour ce trajet", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(label ? `En route : ${label}` : "Trajectoire lancée");
    },

    startBlend: async (username, label) => {
      get().notify("Préparation du blend…", { tone: "info" });
      const { hashes } = await fetchBlend(username);
      const list = tracksForHashes(hashes);
      if (list.length === 0) {
        get().notify("Blend indisponible — profils trop minces", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(label ? `Blend avec ${label}` : "Blend lancé");
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
        persist({ ...get(), ...upd });
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
        persist({ ...get(), ...upd });
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
      persist({ ...get(), volume: vol, muted: vol === 0 });
    },
    toggleMute: () => {
      set((s) => {
        const muted = !s.muted;
        persist({ ...get(), muted });
        return { muted };
      });
    },

    toggleShuffle: () => {
      const { shuffle, queue, currentTrack } = get();
      const newShuffle = !shuffle;
      if (!currentTrack) {
        set({ shuffle: newShuffle });
        persist({ ...get(), shuffle: newShuffle });
        return;
      }
      if (newShuffle) {
        const rest = queue.filter((t) => t.trackhash !== currentTrack.trackhash);
        set({ shuffle: true, shuffledQueue: [currentTrack, ...shuffleArray(rest)], currentIndex: 0 });
      } else {
        const idx = queue.findIndex((t) => t.trackhash === currentTrack.trackhash);
        set({ shuffle: false, shuffledQueue: queue, currentIndex: idx >= 0 ? idx : 0 });
      }
      persist({ ...get(), shuffle: newShuffle });
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      const { repeat } = get();
      const next = order[(order.indexOf(repeat) + 1) % order.length];
      set({ repeat: next });
      persist({ ...get(), repeat: next });
    },

    toggleAutoplay: () => {
      const autoplay = !get().autoplay;
      set({ autoplay });
      persist({ ...get(), autoplay });
      get().notify(autoplay ? "Lecture continue activée" : "Lecture continue désactivée");
    },

    setNormalization: (mode) => {
      set({ normalization: mode });
      persist({ ...get(), normalization: mode });
      get().notify(
        mode === "off" ? "Normalisation désactivée" : mode === "album" ? "Volume normalisé par album" : "Volume normalisé par titre",
      );
    },

    setCrossfade: (seconds) => {
      const v = Math.max(0, Math.min(12, Math.round(seconds)));
      set({ crossfade: v });
      persist({ ...get(), crossfade: v });
      get().notify(v ? `Fondu enchaîné : ${v} s` : "Fondu désactivé");
    },

    setLocale: (locale) => {
      set({ locale });
      persist({ ...get(), locale });
      if (typeof document !== "undefined") document.documentElement.lang = locale;
      void api.put("/api/state", { action: "setting", key: "locale", value: locale }).catch(() => {});
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
        persist({ ...get(), ...upd });
        return upd;
      });
    },

    scrobble: (trackhash) => {
      // Optimistic local bump seeded from the *current per-user* count only (never
      // from track.playcount — that double-counted against the server's own tally).
      set((s) => {
        const recents = [trackhash, ...s.recentTrackhashes.filter((h) => h !== trackhash)].slice(0, 100);
        const nextCount = (s.playCounts[trackhash] ?? 0) + 1;
        const upd = { recentTrackhashes: recents, playCounts: { ...s.playCounts, [trackhash]: nextCount } };
        persist({ ...get(), ...upd });
        return upd;
      });
      // The server is the source of truth: reconcile to the count it returns so
      // multi-device play history converges instead of drifting upward.
      void api.put<{ count?: number }>("/api/state", { action: "play", trackhash })
        .then((r) => {
          if (typeof r?.count === "number") {
            set((s) => ({ playCounts: { ...s.playCounts, [trackhash]: r.count as number } }));
          }
        })
        .catch(() => {});
      // A completed listen nudges the taste profile — refresh the recs (debounced).
      useReco.getState().scheduleRefresh();
    },

    recordSkip: (trackhash, msPlayed, ratio) => {
      // Skips don't touch local play counts/recents — they're a negative signal,
      // not a listen. Just tell the server and let the engine re-weight.
      void api.put("/api/state", { action: "skip", trackhash, msPlayed, ratio }).catch(() => {});
      useReco.getState().scheduleRefresh();
    },

    toggleFavorite: (trackhash) => {
      let nowFavorite = false;
      set((s) => {
        const next = new Set(s.favorites);
        if (next.has(trackhash)) next.delete(trackhash);
        else { next.add(trackhash); nowFavorite = true; }
        // Liking clears any prior dislike (opposite verdicts) — mirror the server.
        const dislikes = new Set(s.dislikes);
        if (nowFavorite) dislikes.delete(trackhash);
        const upd = { favorites: next, dislikes };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", { action: "favorite", trackhash, value: nowFavorite }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify(nowFavorite ? "Ajouté aux favoris" : "Retiré des favoris");
    },
    isFavorite: (trackhash) => get().favorites.has(trackhash),

    toggleDislike: (trackhash) => {
      let nowDisliked = false;
      set((s) => {
        const next = new Set(s.dislikes);
        const favorites = new Set(s.favorites);
        if (next.has(trackhash)) next.delete(trackhash);
        else { next.add(trackhash); nowDisliked = true; favorites.delete(trackhash); }
        const upd = { dislikes: next, favorites };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", { action: "dislike", trackhash, value: nowDisliked }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify(nowDisliked ? "Moins de titres comme celui-ci" : "Préférence retirée");
    },
    isDisliked: (trackhash) => get().dislikes.has(trackhash),

    createPlaylist: (name, description) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const colors = ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: name.trim() || "New Playlist",
        description: description?.trim() || undefined,
        trackcount: 0,
        color: colors,
        trackhashes: [],
        pinned: false,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: pl.description ?? null, pinned: false, trackhashes: [] },
      }).catch(() => {});
      get().notify(`Playlist « ${pl.name} » créée`);
      return id;
    },

    createSmartPlaylist: (config) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const colors = ["#1e293b", "#0ea5e9", "#22d3ee"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: config.label || "Smart playlist",
        trackcount: 0,
        color: colors,
        trackhashes: [],
        pinned: false,
        rules: config,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: null, pinned: false, trackhashes: [], rules: JSON.stringify(config) },
      }).catch(() => {});
      get().notify(`Smart playlist « ${pl.name} » créée`);
      return id;
    },

    deletePlaylist: (id) => {
      set((s) => {
        const upd = { customPlaylists: s.customPlaylists.filter((p) => String(p.id) !== id) };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", { action: "playlist.delete", id }).catch(() => {});
      get().notify("Playlist supprimée");
    },

    renamePlaylist: (id, name) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, name: name.trim() || p.name } : p)),
        };
        persist({ ...get(), ...upd });
        return upd;
      });
      pushPlaylist(id);
    },

    addToPlaylist: (id, track) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            if (p.trackhashes?.includes(track.trackhash)) return p;
            const trackhashes = [...(p.trackhashes ?? []), track.trackhash];
            return { ...p, trackhashes, trackcount: trackhashes.length };
          }),
        };
        persist({ ...get(), ...upd });
        return upd;
      });
      const pl = get().customPlaylists.find((p) => String(p.id) === id);
      // Collaborator playlists (owned by another user) must use the GRANULAR add —
      // the full upsert is owner-scoped and would be IDOR-rejected.
      if (pl?.collaborator) void api.put("/api/state", { action: "playlist.addTrack", id, trackhash: track.trackhash }).catch(() => {});
      else pushPlaylist(id);
      get().notify(`Ajouté à « ${pl?.name ?? "la playlist"} »`);
    },

    removeFromPlaylist: (id, trackhash) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            const trackhashes = (p.trackhashes ?? []).filter((h) => h !== trackhash);
            return { ...p, trackhashes, trackcount: trackhashes.length };
          }),
        };
        persist({ ...get(), ...upd });
        return upd;
      });
      const pl = get().customPlaylists.find((p) => String(p.id) === id);
      if (pl?.collaborator) void api.put("/api/state", { action: "playlist.removeTrack", id, trackhash }).catch(() => {});
      else pushPlaylist(id);
    },

    reorderInPlaylist: (id, from, to) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            const trackhashes = [...(p.trackhashes ?? [])];
            if (from === to || from < 0 || to < 0 || from >= trackhashes.length || to >= trackhashes.length) return p;
            const [moved] = trackhashes.splice(from, 1);
            trackhashes.splice(to, 0, moved);
            return { ...p, trackhashes };
          }),
        };
        persist({ ...get(), ...upd });
        return upd;
      });
      // The server playlist stores an ORDERED trackhash array, so re-pushing the whole
      // playlist persists the new order (calque of reorderCustomPlaylists).
      pushPlaylist(id);
    },

    importPlaylist: (name, trackhashes) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const unique = [...new Set(trackhashes)];
      const colors = ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: name.trim() || "Playlist importée",
        trackcount: unique.length,
        color: colors,
        trackhashes: unique,
        pinned: false,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        persist({ ...get(), ...upd });
        return upd;
      });
      // One upsert with the full ordered set (createPlaylist + N addToPlaylist would
      // fire N server round-trips and N persists).
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: null, pinned: false, trackhashes: unique },
      }).catch(() => {});
      get().notify(`Playlist « ${pl.name} » importée — ${unique.length} titre${unique.length > 1 ? "s" : ""}`);
      return id;
    },

    enterSelection: (trackhash) =>
      set((s) => ({
        selectionMode: true,
        selected: trackhash ? new Set(s.selected).add(trackhash) : s.selected,
      })),

    toggleSelected: (trackhash) =>
      set((s) => {
        const next = new Set(s.selected);
        if (next.has(trackhash)) next.delete(trackhash);
        else next.add(trackhash);
        return { selected: next, selectionMode: true };
      }),

    selectMany: (trackhashes) =>
      set((s) => {
        const next = new Set(s.selected);
        for (const h of trackhashes) next.add(h);
        return { selected: next, selectionMode: true };
      }),

    clearSelection: () => set({ selected: new Set<string>() }),
    exitSelection: () => set({ selectionMode: false, selected: new Set<string>() }),

    generateAiPlaylist: async (opts) => {
      const seeds = [...get().selected];
      if (seeds.length === 0) {
        get().notify("Sélectionnez au moins un titre", { tone: "error" });
        return null;
      }
      get().notify("Création de votre Mix IA…");
      try {
        const res = await api.put<{ ok: boolean; id: string; name: string; trackhashes: string[] }>("/api/state", {
          action: "playlist.generateFromSeeds",
          seeds,
          count: opts?.count ?? 30,
          name: opts?.name,
        });
        if (!res?.id) throw new Error("no id");
        // Mirror the server-built playlist locally so it appears instantly, in the
        // Spotify-green palette (it's the AI mix).
        const pl: Playlist = {
          id: res.id,
          name: res.name,
          description: "Généré par l'IA d'après votre sélection et vos goûts",
          trackcount: res.trackhashes.length,
          color: ["#0b3b24", "#1ED760", "#1DB954"],
          trackhashes: res.trackhashes,
          pinned: false,
        };
        set((s) => {
          const upd = {
            customPlaylists: [pl, ...s.customPlaylists.filter((p) => String(p.id) !== res.id)],
            selectionMode: false,
            selected: new Set<string>(),
          };
          persist({ ...get(), ...upd });
          return upd;
        });
        get().navigate("playlist", res.id);
        get().notify(`Mix IA « ${res.name} » prêt — ${res.trackhashes.length} titres`, { tone: "success" });
        return res.id;
      } catch {
        get().notify("Impossible de générer la playlist", { tone: "error" });
        return null;
      }
    },

    sharePlaylist: (id, shared) => {
      set((s) => ({ customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, shared } : p)) }));
      void api.put("/api/state", { action: "playlist.share", id, value: shared }).catch(() => {});
      get().notify(shared ? "Playlist partagée — collaboration activée" : "Partage désactivé");
    },

    addPlaylistCollaborator: async (id, username) => {
      try {
        await api.put("/api/state", { action: "playlist.collaborator", id, username });
        set((s) => ({ customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, shared: true } : p)) }));
        get().notify(`« ${username} » peut maintenant collaborer`);
        return true;
      } catch {
        get().notify("Collaborateur introuvable ou non autorisé", { tone: "error" });
        return false;
      }
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
        persist({ ...get(), karaokeMode });
        return { karaokeMode };
      }),
    adjustLyricsOffset: (delta) =>
      set((s) => {
        const lyricsOffset = clampOffset(s.lyricsOffset + delta);
        persist({ ...get(), lyricsOffset });
        return { lyricsOffset };
      }),
    resetLyricsOffset: () =>
      set(() => {
        const lyricsOffset = DEFAULT_LYRICS_OFFSET;
        persist({ ...get(), lyricsOffset });
        return { lyricsOffset };
      }),
    toggleVisualizer: () => set((s) => ({ visualizerOpen: !s.visualizerOpen })),
    closeVisualizer: () => set({ visualizerOpen: false }),
    setTheme: (id) => {
      const theme = normalizeTheme(id);
      set({ theme });
      persist({ ...get(), theme });
      applyTheme(theme);
      // Keep writing the legacy `accent` key too so older clients still read a
      // sane value, plus the new `theme` key going forward.
      void api.put("/api/state", { action: "setting", key: "theme", value: theme }).catch(() => {});
      void api.put("/api/state", { action: "setting", key: "accent", value: theme }).catch(() => {});
    },
    reorderCustomPlaylists: (from, to) => {
      set((s) => {
        if (from === to || from < 0 || to < 0 || from >= s.customPlaylists.length || to >= s.customPlaylists.length) return {};
        const next = [...s.customPlaylists];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const upd = { customPlaylists: next };
        persist({ ...get(), ...upd });
        return upd;
      });
      void api.put("/api/state", { action: "playlist.reorder", ids: get().customPlaylists.map((p) => String(p.id)) }).catch(() => {});
    },
    closeFullscreenPlayer: () => set({ fullscreenPlayer: false, lyricsOpen: false }),

    openContextMenu: (x, y, track) => set({ contextMenu: { open: true, x, y, track } }),
    openAlbumContextMenu: (x, y, album) => set({ contextMenu: { open: true, x, y, album } }),
    openArtistContextMenu: (x, y, artist) => set({ contextMenu: { open: true, x, y, artist } }),
    closeContextMenu: () => set((s) => ({ contextMenu: { ...s.contextMenu, open: false } })),

    notify: (message, opts) => {
      const id = Date.now();
      set({ toast: { id, message, tone: opts?.tone ?? "success", action: opts?.action } });
      if (typeof window !== "undefined") {
        // Give an actionable toast (e.g. "Annuler") longer to be clicked.
        window.setTimeout(() => {
          if (get().toast?.id === id) set({ toast: null });
        }, opts?.action ? 5200 : 2600);
      }
    },
    dismissToast: () => set({ toast: null }),

    hydrateLocal: () => {
      const p = loadPersisted();
      const theme = normalizeTheme(p.theme ?? p.accent);
      set({
        volume: p.volume ?? 0.78,
        muted: p.muted ?? false,
        repeat: p.repeat ?? "off",
        shuffle: p.shuffle ?? false,
        autoplay: p.autoplay ?? true,
        normalization: p.normalization ?? "track",
        crossfade: p.crossfade ?? 0,
        favorites: new Set(p.favorites ?? []),
        dislikes: new Set(p.dislikes ?? []),
        recentTrackhashes: p.recentTrackhashes ?? [],
        playCounts: p.playCounts ?? {},
        customPlaylists: p.customPlaylists ?? [],
        karaokeMode: p.karaokeMode ?? true,
        lyricsOffset: clampOffset(p.lyricsOffset ?? DEFAULT_LYRICS_OFFSET),
        theme,
        locale: p.locale ?? initialLocale,
      });
      applyTheme(theme);
      if (typeof document !== "undefined") document.documentElement.lang = p.locale ?? initialLocale;
    },

    hydrateFromServer: async () => {
      // Snapshot local state *before* the network round-trip so we can re-apply
      // any optimistic favorite/playlist change the user made WHILE the GET was
      // in flight. Without this, the server snapshot (which predates those
      // changes) silently clobbers them — the root cause of "I favourited a
      // track and it vanished / didn't save". The server stays the source of
      // truth; we only graft back the user's just-made, not-yet-synced edits.
      const beforeFav = new Set(get().favorites);
      const beforeDis = new Set(get().dislikes);
      const beforePlaylistIds = new Set(get().customPlaylists.map((p) => String(p.id)));
      try {
        const s = await api.get<ServerState>("/api/state");
        const local = get();

        // Favorites added during the fetch window → graft on; removed → drop.
        const liveFav = local.favorites;
        const addedDuringFetch = [...liveFav].filter((h) => !beforeFav.has(h));
        const removedDuringFetch = new Set([...beforeFav].filter((h) => !liveFav.has(h)));
        const favorites = new Set(s.favorites);
        addedDuringFetch.forEach((h) => favorites.add(h));
        removedDuringFetch.forEach((h) => favorites.delete(h));

        // Same graft for dislikes made while the GET was in flight.
        const liveDis = local.dislikes;
        const dislikes = new Set(s.dislikes ?? []);
        [...liveDis].filter((h) => !beforeDis.has(h)).forEach((h) => dislikes.add(h));
        [...beforeDis].filter((h) => !liveDis.has(h)).forEach((h) => dislikes.delete(h));

        const serverPlaylists: Playlist[] = s.playlists.map((p) => ({
          id: p.id, name: p.name, description: p.description ?? undefined, pinned: p.pinned,
          trackhashes: p.trackhashes, trackcount: p.trackhashes.length,
          color: ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string],
          rules: parseRules(p.rules),
          shared: p.shared, collaborator: p.collaborator, owner: p.owner,
        }));
        // Keep any playlist created locally during the fetch window that the
        // server snapshot doesn't know about yet (its own upsert is in flight).
        const serverIds = new Set(serverPlaylists.map((p) => String(p.id)));
        const localOnly = local.customPlaylists.filter(
          (p) => !serverIds.has(String(p.id)) && !beforePlaylistIds.has(String(p.id)),
        );
        const customPlaylists = [...localOnly, ...serverPlaylists];

        const theme = normalizeTheme(
          (typeof s.settings.theme === "string" && (s.settings.theme as string)) ||
            (typeof s.settings.accent === "string" && (s.settings.accent as string)) ||
            local.theme,
        );
        const serverLocale: Locale | undefined = s.settings.locale === "en" ? "en" : s.settings.locale === "fr" ? "fr" : undefined;
        set({
          favorites,
          dislikes,
          playCounts: s.playCounts,
          recentTrackhashes: s.recents,
          customPlaylists,
          theme,
          ...(serverLocale ? { locale: serverLocale } : {}),
          syncReady: true,
        });
        applyTheme(theme);
        if (serverLocale && typeof document !== "undefined") document.documentElement.lang = serverLocale;
        persist({ ...get() });
        // Profile is synced — warm up the personalised recommendations.
        void useReco.getState().fetchForYou();
      } catch {
        set({ syncReady: true }); // offline — keep the local cache
      }
    },

    restoreLastSession: () => {
      // Don't clobber anything the user already started before the library loaded.
      if (get().currentTrack) { hydrated = true; return; }
      const ls = loadPersisted().lastSession;
      const lib = useLibraryStore.getState().tracks;
      if (lib.length === 0) return; // library not ready yet — retried on load, still pre-hydration
      // Library is ready and we've had our chance to restore: from here on a null
      // currentTrack is a real stop, so persist may clear the session.
      hydrated = true;
      if (!ls?.trackhash) return;
      const byHash = new Map(lib.map((t) => [t.trackhash, t]));
      const track = byHash.get(ls.trackhash);
      if (!track) return; // the track left the library (rescan/move)
      const queue = (ls.queueHashes ?? []).map((h) => byHash.get(h)).filter((t): t is Track => Boolean(t));
      let order = queue.length ? queue : [track];
      let idx = order.findIndex((t) => t.trackhash === ls.trackhash);
      if (idx < 0) {
        // The saved current track isn't in the (windowed/truncated) queue — resume
        // it alone rather than wrongly selecting order[0].
        order = [track];
        idx = 0;
      }
      const pos = typeof ls.position === "number" && ls.position > 1 ? ls.position : 0;
      usePlayhead.getState().reset(track.duration || 0);
      if (pos > 0) {
        usePlayhead.getState().setPosition(pos); // scrubber shows where you left off
        pendingResumeSeek = { trackhash: order[idx].trackhash, position: pos }; // <audio> seeks here on load
        // A resumed track was already partly heard last session; leaving it now
        // isn't a fresh skip (the accumulator can't see the prior listening).
        exemptFromSkip(order[idx].trackhash);
      } else {
        pendingResumeSeek = null;
      }
      // Restored PAUSED — the now-playing surface shows where you left off and the
      // user presses play to resume (we deliberately don't auto-start audio).
      set({ queue: order, shuffledQueue: order, currentIndex: idx, currentTrack: order[idx], isPlaying: false });
    },

    resetServerStats: () => {
      // Clear the local listening signals immediately (optimistic) and ask the
      // server to wipe play counts / recents / event log. Favourites + playlists keep.
      set({ recentTrackhashes: [], playCounts: {} });
      persist({ ...get(), recentTrackhashes: [], playCounts: {} });
      void api.put("/api/state", { action: "resetStats" }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify("Historique d'écoute réinitialisé");
    },

    fetchLyrics: async (force = false) => {
      const track = get().currentTrack;
      if (!track) return;
      set({ lyricsLoading: true, lyricsStatus: "loading" });
      try {
        const res = force
          ? await api.post<LyricsResponse>(`/api/lyrics/${track.trackhash}`)
          : await api.get<LyricsResponse>(`/api/lyrics/${track.trackhash}`);
        const lines = res.lines ?? [];
        const updated: Track = { ...track, lyrics: lines.length ? lines : undefined, hasLyrics: res.status === "found" };

        useLibraryStore.setState((ls) => {
          const idx = new Map(ls.trackIndex);
          const existing = idx.get(track.trackhash);
          if (existing) idx.set(track.trackhash, { ...existing, lyrics: updated.lyrics, hasLyrics: updated.hasLyrics });
          return { trackIndex: idx };
        });

        set((s) => ({
          currentTrack: s.currentTrack?.trackhash === track.trackhash ? updated : s.currentTrack,
          lyricsLoading: false,
          lyricsStatus: res.status,
          lyricsPlain: res.plain ?? null,
          // Respect the user's choice: never force the pane back open if they
          // closed it; only keep it open when it already was.
          lyricsOpen: s.lyricsOpen,
        }));

        if (res.status === "notfound") get().notify("Aucune parole trouvée en ligne", { tone: "info" });
        else if (res.status === "instrumental") get().notify("Morceau instrumental", { tone: "info" });
      } catch {
        set({ lyricsLoading: false, lyricsStatus: "error" });
        get().notify("Recherche de paroles indisponible", { tone: "error" });
      }
    },
  };
});
