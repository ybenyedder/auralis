/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Track, Album, Artist, RepeatMode, Playlist } from "@/lib/auralis/types";
export type { Playlist, RepeatMode } from "@/lib/auralis/types";
import type { SmartConfig } from "@/lib/auralis/smartlist";
import type { Locale } from "@/lib/auralis/i18n";
import type { ThemeId, Mode } from "@/lib/auralis/themes";

export type NormalizationMode = "off" | "track" | "album";

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

export interface NavTarget {
  view: ViewId;
  id?: string;
}

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  track?: Track;
  album?: Album;
  artist?: Artist;
}

export interface SleepTimer {
  active: boolean;
  endsAt: number | null;
  minutes: number;
  endOfTrack?: boolean;
}

export type ToastTone = "success" | "error" | "info";
export interface ToastModel {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}
export interface NotifyOptions {
  tone?: ToastTone;
  action?: { label: string; run: () => void };
}

export interface QueueSlice {
  queue: Track[];
  shuffledQueue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  autoplay: boolean;
  normalization: NormalizationMode;
  crossfade: number;

  playTrack: (track: Track, list?: Track[], startIndex?: number) => void;
  playList: (list: Track[], startIndex?: number) => void;
  startRadio: (seedHash: string, seedTrack?: Track) => Promise<void>;
  startTrajectory: (path: string, label?: string) => Promise<void>;
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
  addToQueueNext: (track: Track) => void;
  addToQueueEnd: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpToQueueIndex: (index: number) => void;
}

export interface PlaylistSlice {
  customPlaylists: Playlist[];
  createPlaylist: (name: string, description?: string) => string;
  createSmartPlaylist: (config: SmartConfig) => string;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  setPlaylistCover: (id: string, dataUrl: string | null) => Promise<void>;
  addToPlaylist: (id: string, track: Track) => void;
  removeFromPlaylist: (id: string, trackhash: string) => void;
  reorderInPlaylist: (id: string, from: number, to: number) => void;
  importPlaylist: (name: string, trackhashes: string[]) => string;
  sharePlaylist: (id: string, shared: boolean) => void;
  addPlaylistCollaborator: (id: string, username: string) => Promise<boolean>;
  reorderCustomPlaylists: (from: number, to: number) => void;
}

export interface UiSlice {
  view: NavTarget;
  navHistory: NavTarget[];
  searchQuery: string;
  searchFocus: boolean;
  commandOpen: boolean;
  locale: Locale;
  selectionMode: boolean;
  selected: Set<string>;
  sleepTimer: SleepTimer;
  rightPanelOpen: boolean;
  fullscreenPlayer: boolean;
  lyricsOpen: boolean;
  queueOpen: boolean;
  helpOpen: boolean;
  miniPlayer: boolean;
  karaokeMode: boolean;
  lyricsOffset: number;
  visualizerOpen: boolean;
  mode: Mode;
  flatBackdrop: boolean;
  contextMenu: ContextMenuState;
  toast: ToastModel | null;
  lyricsLoading: boolean;
  lyricsStatus: "idle" | "loading" | "found" | "notfound" | "instrumental" | "error";
  lyricsPlain: string | null;
  aligning: boolean;

  navigate: (view: ViewId, id?: string) => void;
  back: () => void;
  setSearch: (q: string) => void;
  setSearchFocus: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setLocale: (locale: Locale) => void;
  enterSelection: (trackhash?: string) => void;
  toggleSelected: (trackhash: string) => void;
  selectMany: (trackhashes: string[]) => void;
  clearSelection: () => void;
  exitSelection: () => void;
  generateAiPlaylist: (opts?: { name?: string; count?: number }) => Promise<string | null>;
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
  setMode: (mode: Mode) => void;
  setFlatBackdrop: (on: boolean) => void;
  closeFullscreenPlayer: () => void;
  openContextMenu: (x: number, y: number, track: Track) => void;
  openAlbumContextMenu: (x: number, y: number, album: Album) => void;
  openArtistContextMenu: (x: number, y: number, artist: Artist) => void;
  closeContextMenu: () => void;
  notify: (message: string, opts?: NotifyOptions) => void;
  dismissToast: () => void;
  fetchLyrics: (force?: boolean) => Promise<void>;
  alignLyrics: () => Promise<void>;
}

export interface PlaybackSlice {
  favorites: Set<string>;
  dislikes: Set<string>;
  recentTrackhashes: string[];
  playCounts: Record<string, number>;
  syncReady: boolean;

  scrobble: (trackhash: string) => void;
  recordSkip: (trackhash: string, msPlayed: number, ratio: number) => void;
  toggleFavorite: (trackhash: string) => void;
  isFavorite: (trackhash: string) => boolean;
  toggleDislike: (trackhash: string) => void;
  isDisliked: (trackhash: string) => boolean;

  hydrateLocal: () => void;
  hydrateFromServer: () => Promise<void>;
  restoreLastSession: () => void;
  resetServerStats: () => void;
}

export type PlayerState = QueueSlice & PlaylistSlice & UiSlice & PlaybackSlice;

export interface ServerState {
  favorites: string[];
  dislikes: string[];
  playCounts: Record<string, number>;
  recents: string[];
  playlists: { id: string; name: string; description: string | null; pinned: boolean; trackhashes: string[]; rules?: string | null; shared?: boolean; collaborator?: boolean; owner?: string; imageHash?: string | null }[];
  settings: Record<string, unknown>;
}

export interface Persisted {
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
  mode: Mode;
  flatBackdrop?: boolean;
  accent?: string;
  playCounts: Record<string, number>;
  karaokeMode: boolean;
  lyricsOffset: number;
  lastSession?: { trackhash: string; queueHashes: string[]; currentIndex: number; position: number };
}
