"use client";

// Client side of the realtime "Connect" hub. One EventSource per tab carries the
// device roster + now-playing snapshots; transport commands go back out over a
// plain POST. This device EXECUTES commands aimed at it (so the PC obeys the
// phone), and when the user picks another device to control, `controllingId` is
// set and the UI sends commands instead of touching local audio.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";
import { usePlayer } from "@/store/player";
import type { SyncDevice, NowPlaying, DeviceKind } from "@/server/sync";

const DEVICE_ID_KEY = "auralis.deviceId";

/** A now-playing snapshot plus the client-local time it arrived (for skew-free
 *  scrubber interpolation — see ConnectButton). `updatedAt` is a server clock and
 *  must not be diffed against a controller's Date.now(). */
export type LiveNowPlaying = NowPlaying & { receivedAt: number };

function readDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}`;
  }
}

function detectKind(): DeviceKind {
  if (typeof window === "undefined") return "web";
  if ((window as unknown as { auralisDesktop?: unknown }).auralisDesktop) return "desktop";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return "mobile";
  return "web";
}

function defaultName(kind: DeviceKind): string {
  return kind === "desktop" ? "Ordinateur" : kind === "mobile" ? "Téléphone" : "Navigateur";
}

interface SyncState {
  deviceId: string;
  deviceName: string;
  deviceKind: DeviceKind;
  connected: boolean;
  /** This tab owns the device identity (Web Locks leader). Only the leader executes
   *  incoming commands and publishes — so two tabs of one browser (same deviceId)
   *  can't double-skip the queue or flap their now-playing against each other. */
  isLeader: boolean;
  devices: SyncDevice[];
  nowPlaying: Record<string, LiveNowPlaying>;
  /** Device this tab is remote-controlling (null = controlling itself locally). */
  controllingId: string | null;

  connect: () => void;
  disconnect: () => void;
  /** Push this device's current playback snapshot to the hub. */
  publish: (np: { trackhash: string | null; title?: string; artist?: string; image?: string; position: number; duration: number; isPlaying: boolean }) => void;
  /** Start/stop remote-controlling another device. */
  control: (deviceId: string | null) => void;
  /** Send a transport command to the controlled device. */
  command: (type: "play" | "pause" | "next" | "prev" | "seek", position?: number) => void;
}

let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
// Set true when THIS tab paused local audio to take over a remote device, so
// ending the remote session can resume exactly what it interrupted.
let pausedForRemote = false;

const initialKind = detectKind();

/** Parse an SSE frame's JSON payload; null on a malformed frame. */
function parseFrame<T>(e: Event): T | null {
  try {
    return JSON.parse((e as MessageEvent).data) as T;
  } catch {
    return null;
  }
}

export const useSync = create<SyncState>((set, get) => ({
  deviceId: readDeviceId(),
  deviceName: defaultName(initialKind),
  deviceKind: initialKind,
  connected: false,
  // No Web Locks (older WebView / SSR) → can't coordinate tabs, so act as leader.
  isLeader: typeof navigator === "undefined" || !navigator.locks,
  devices: [],
  nowPlaying: {},
  controllingId: null,

  connect: () => {
    if (typeof window === "undefined" || es) return;
    const { deviceId, deviceName, deviceKind } = get();

    // Elect one leader tab per deviceId. The lock is held for the tab's whole life
    // (the request callback never resolves), so when the leader tab closes the lock
    // frees and a waiting tab is promoted automatically.
    if (navigator.locks && !get().isLeader) {
      navigator.locks
        .request(`auralis.sync.leader.${deviceId}`, () => {
          set({ isLeader: true });
          return new Promise<void>(() => {});
        })
        .catch(() => set({ isLeader: true })); // lock unavailable → don't strand the tab
    }

    const qs = `device=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(deviceName)}&kind=${deviceKind}`;
    const source = new EventSource(api.url(`/api/sync/stream?${qs}`), { withCredentials: true });
    es = source;

    source.addEventListener("open", () => {
      reconnectAttempts = 0;
      set({ connected: true });
    });

    source.addEventListener("error", () => {
      set({ connected: false });
      // A transient drop leaves the EventSource in CONNECTING and it retries itself.
      // A fatal close (e.g. 401 token expired) ends in CLOSED and never auto-retries
      // — drop the dead handle and schedule our own backed-off reconnect so Connect
      // recovers without a full page reload.
      if (source.readyState === EventSource.CLOSED) {
        source.close();
        if (es === source) es = null;
        if (reconnectTimer === undefined) {
          const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
          reconnectAttempts += 1;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined;
            get().connect();
          }, delay);
        }
      }
    });

    source.addEventListener("devices", (e) => {
      const list = parseFrame<SyncDevice[]>(e);
      if (!list) return;
      set({ devices: list });
      // If the device we were controlling vanished, drop back to local control via
      // control(null) so the same resume-the-audio-we-paused path runs (a raw
      // `controllingId: null` here would leave local playback stuck paused).
      const ctrl = get().controllingId;
      if (ctrl && !list.some((d) => d.id === ctrl)) get().control(null);
    });

    source.addEventListener("nowplaying", (e) => {
      const np = parseFrame<NowPlaying>(e);
      if (!np) return;
      // Stamp arrival on the LOCAL clock; the scrubber interpolates from this, never
      // from the server-stamped updatedAt (cross-host clock skew would distort it).
      set((s) => ({ nowPlaying: { ...s.nowPlaying, [np.deviceId]: { ...np, receivedAt: Date.now() } } }));
    });

    source.addEventListener("command", (e) => {
      const cmd = parseFrame<{ target: string; from: string; type: string; position?: number }>(e);
      if (!cmd) return;
      const { deviceId: me, controllingId, isLeader } = get();
      if (cmd.target !== me || cmd.from === me) return; // not for us / our own echo
      if (!isLeader) return; // a non-leader tab of this device must not double-execute
      if (controllingId) return; // we're a remote of another device — don't touch local audio
      const p = usePlayer.getState();
      switch (cmd.type) {
        case "play":
          if (!p.isPlaying && p.currentTrack) p.togglePlay();
          break;
        case "pause":
          if (p.isPlaying) p.togglePlay();
          break;
        case "next":
          p.playNext();
          break;
        case "prev":
          p.playPrev();
          break;
        case "seek":
          if (typeof cmd.position === "number") p.seek(cmd.position);
          break;
      }
    });
  },

  disconnect: () => {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    es?.close();
    es = null;
    set({ connected: false, devices: [], nowPlaying: {}, controllingId: null });
  },

  publish: (np) => {
    // Only the leader tab represents the device on the hub.
    if (!get().isLeader) return;
    const { deviceId } = get();
    void api.post("/api/sync", { action: "state", deviceId, ...np }).catch(() => {});
  },

  control: (deviceId) => {
    if (deviceId === get().deviceId) deviceId = null; // "control myself" = local
    if (deviceId) {
      // Taking over another device: flip into remote mode FIRST so SyncManager's
      // publish guard sees controllingId set before we pause (otherwise the pause
      // would publish a stale "still here, paused" snapshot). Then silence local
      // audio, remembering we did so we can resume it when the session ends.
      set({ controllingId: deviceId });
      const p = usePlayer.getState();
      if (p.isPlaying) {
        p.togglePlay();
        pausedForRemote = true;
      }
    } else {
      // Leaving remote mode: restore local control, then resume the audio we paused
      // on takeover (only if the user hasn't started something else meanwhile).
      set({ controllingId: null });
      if (pausedForRemote) {
        const p = usePlayer.getState();
        if (!p.isPlaying && p.currentTrack) p.togglePlay();
      }
      pausedForRemote = false;
    }
  },

  command: (type, position) => {
    const { controllingId, deviceId } = get();
    if (!controllingId) return;
    void api.post("/api/sync", { action: "command", target: controllingId, from: deviceId, type, position }).catch(() => {});
  },
}));
