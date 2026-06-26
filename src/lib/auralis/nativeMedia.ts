"use client";

// OS media-control layer for the web app and the Electron shell. Modern browsers
// surface the `navigator.mediaSession` API as real lock-screen / notification /
// headset controls, so we drive that directly. The Android client is the separate
// native Kotlin app (android-native/) which does its own MediaSession via a media3
// session — this module is web-only and has no native bridge.

type PlaybackState = "none" | "paused" | "playing";

export interface MediaMeta {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes: string; type: string }[];
}

export type MediaAction =
  | "play"
  | "pause"
  | "previoustrack"
  | "nexttrack"
  | "stop";

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  previoustrack: () => void;
  nexttrack: () => void;
  stop: () => void;
  seekto: (time: number) => void;
  /** Relative scrub from the lock screen / headset (seekOffset seconds). */
  seekbackward: (offset: number) => void;
  seekforward: (offset: number) => void;
}

function hasWebSession(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Whether an OS media-control surface is available on this platform. */
export function mediaSupported(): boolean {
  return hasWebSession();
}

export function setMediaMetadata(meta: MediaMeta | null) {
  if (!hasWebSession()) return;
  if (!meta) {
    navigator.mediaSession.metadata = null;
    return;
  }
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      artwork: meta.artwork,
    });
  } catch {
    /* MediaMetadata constructor unavailable — ignore */
  }
}

export function setMediaPlaybackState(state: PlaybackState) {
  if (!hasWebSession()) return;
  navigator.mediaSession.playbackState = state;
}

export function setMediaPositionState(state: { duration: number; position: number; playbackRate: number }) {
  if (!hasWebSession()) return;
  try {
    navigator.mediaSession.setPositionState(state);
  } catch {
    /* setPositionState throws on inconsistent values (mid-seek) — ignore */
  }
}

export function setMediaHandlers(handlers: MediaHandlers) {
  if (!hasWebSession()) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => handlers.play());
  ms.setActionHandler("pause", () => handlers.pause());
  ms.setActionHandler("previoustrack", () => handlers.previoustrack());
  ms.setActionHandler("nexttrack", () => handlers.nexttrack());
  ms.setActionHandler("seekto", (d) => {
    if (typeof d.seekTime === "number") handlers.seekto(d.seekTime);
  });
  // seekbackward/forward + stop aren't supported everywhere — guard each so an
  // unknown action can't throw and abort the remaining handler registrations.
  try {
    ms.setActionHandler("seekbackward", (d) => handlers.seekbackward(d.seekOffset ?? 10));
    ms.setActionHandler("seekforward", (d) => handlers.seekforward(d.seekOffset ?? 10));
  } catch {
    /* seek actions unsupported on this platform */
  }
  try {
    ms.setActionHandler("stop", () => handlers.stop());
  } catch {
    /* action type unsupported on this platform */
  }
}
