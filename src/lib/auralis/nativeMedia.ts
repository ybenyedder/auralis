"use client";

// Unified OS media-control layer.
//
// On the web and inside the Electron shell, modern engines surface the
// `navigator.mediaSession` API as real lock-screen / notification controls, so we
// drive that directly. Inside the Capacitor Android WebView, however, the web
// MediaSession is frequently NOT promoted to a system notification (MIUI/Xiaomi
// in particular swallow it). There we route through @jofr/capacitor-media-session,
// a native plugin that spins up a foreground media service and publishes a real
// Android notification + lock-screen controls.
//
// Both paths share the same call sites in the app shell; this module hides the
// branch so page.tsx stays platform-agnostic.

import { Capacitor } from "@capacitor/core";

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
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function hasWebSession(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Whether any OS media-control surface is available on this platform. */
export function mediaSupported(): boolean {
  return isNative() || hasWebSession();
}

// Lazily pull in the native plugin only when we actually run on a device, so the
// web/desktop bundle never evaluates the Capacitor bridge.
type Plugin = typeof import("@jofr/capacitor-media-session")["MediaSession"];
let pluginPromise: Promise<Plugin | null> | null = null;
function nativePlugin(): Promise<Plugin | null> {
  if (!isNative()) return Promise.resolve(null);
  if (!pluginPromise) {
    pluginPromise = import("@jofr/capacitor-media-session")
      .then((m) => m.MediaSession)
      .catch(() => null);
  }
  return pluginPromise;
}

export function setMediaMetadata(meta: MediaMeta | null) {
  if (isNative()) {
    void nativePlugin().then((p) => {
      if (!p) return;
      if (!meta) {
        // No dedicated clear; an empty metadata payload blanks the notification.
        void p.setMetadata({}).catch(() => {});
        return;
      }
      void p
        .setMetadata({ title: meta.title, artist: meta.artist, album: meta.album, artwork: meta.artwork })
        .catch(() => {});
    });
    return;
  }
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
  if (isNative()) {
    void nativePlugin().then((p) => p?.setPlaybackState({ playbackState: state }).catch(() => {}));
    return;
  }
  if (!hasWebSession()) return;
  navigator.mediaSession.playbackState = state;
}

export function setMediaPositionState(state: { duration: number; position: number; playbackRate: number }) {
  if (isNative()) {
    void nativePlugin().then((p) => p?.setPositionState(state).catch(() => {}));
    return;
  }
  if (!hasWebSession()) return;
  try {
    navigator.mediaSession.setPositionState(state);
  } catch {
    /* setPositionState throws on inconsistent values (mid-seek) — ignore */
  }
}

export function setMediaHandlers(handlers: MediaHandlers) {
  if (isNative()) {
    void nativePlugin().then((p) => {
      if (!p) return;
      void p.setActionHandler({ action: "play" }, () => handlers.play()).catch(() => {});
      void p.setActionHandler({ action: "pause" }, () => handlers.pause()).catch(() => {});
      void p.setActionHandler({ action: "previoustrack" }, () => handlers.previoustrack()).catch(() => {});
      void p.setActionHandler({ action: "nexttrack" }, () => handlers.nexttrack()).catch(() => {});
      void p
        .setActionHandler({ action: "seekto" }, (d) => {
          if (typeof d.seekTime === "number") handlers.seekto(d.seekTime);
        })
        .catch(() => {});
      void p.setActionHandler({ action: "stop" }, () => handlers.stop()).catch(() => {});
    });
    return;
  }
  if (!hasWebSession()) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler("play", () => handlers.play());
  ms.setActionHandler("pause", () => handlers.pause());
  ms.setActionHandler("previoustrack", () => handlers.previoustrack());
  ms.setActionHandler("nexttrack", () => handlers.nexttrack());
  ms.setActionHandler("seekto", (d) => {
    if (typeof d.seekTime === "number") handlers.seekto(d.seekTime);
  });
  // "stop" isn't supported everywhere — guard so an unknown action can't throw.
  try {
    ms.setActionHandler("stop", () => handlers.stop());
  } catch {
    /* action type unsupported on this platform */
  }
}
