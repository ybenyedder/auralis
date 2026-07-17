// Real-time "Connect" hub — the phone-controls-the-PC (Spotify Connect) backend.
//
// Per user we keep an in-memory presence + now-playing registry and a set of SSE
// listeners. Each open client is a *device* (a stable id from localStorage). A
// device that is playing audio publishes its now-playing snapshot; any other
// device of the SAME user can send transport commands (play / pause / next / prev
// / seek) targeted at it, which we fan out over SSE for the target to execute.
//
// State is process-local (no DB): fine for a self-hosted single-process server,
// and it naturally evaporates when every device disconnects. Multi-process
// deployments would need a shared bus, but that's out of scope for the self-host.

export type DeviceKind = "desktop" | "mobile" | "web";

export interface SyncDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  lastSeen: number;
  /** Whether this device is currently playing audio (mirrors its last snapshot). */
  playing: boolean;
}

export interface NowPlaying {
  deviceId: string;
  trackhash: string | null;
  title?: string;
  artist?: string;
  image?: string;
  position: number;
  duration: number;
  isPlaying: boolean;
  updatedAt: number;
}

export interface RemoteCommand {
  /** Device id that should execute the command. */
  target: string;
  /** Controller device id (so a device ignores echoes of its own commands). */
  from: string;
  type: "play" | "pause" | "next" | "prev" | "seek";
  position?: number;
}

type Listener = (event: string, data: unknown) => void;

interface Hub {
  devices: Map<string, SyncDevice>;
  subscribers: Map<string, { deviceId: string; listener: Listener }>;
  nowPlaying: Map<string, NowPlaying>;
}

const hubs = new Map<number, Hub>();

function getHub(userId: number): Hub {
  let h = hubs.get(userId);
  if (!h) {
    h = { devices: new Map(), subscribers: new Map(), nowPlaying: new Map() };
    hubs.set(userId, h);
  }
  return h;
}

function deviceList(h: Hub): SyncDevice[] {
  return [...h.devices.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function broadcast(userId: number, event: string, data: unknown): void {
  const h = hubs.get(userId);
  if (!h) return;
  for (const sub of h.subscribers.values()) sub.listener(event, data);
}

/** Fan out the (re-sorted) device roster — the single source of "devices" frames. */
function broadcastDevices(userId: number, h: Hub): void {
  broadcast(userId, "devices", deviceList(h));
}

/** Register a new SSE listener for a device and announce its presence. */
export function registerSubscriber(
  userId: number,
  subId: string,
  device: { id: string; name: string; kind: DeviceKind },
  listener: Listener,
): void {
  const h = getHub(userId);
  h.devices.set(device.id, {
    id: device.id,
    name: device.name,
    kind: device.kind,
    lastSeen: Date.now(),
    playing: h.nowPlaying.get(device.id)?.isPlaying ?? false,
  });
  h.subscribers.set(subId, { deviceId: device.id, listener });
  // Catch the newcomer up: the full device list + every known now-playing snapshot.
  listener("devices", deviceList(h));
  for (const np of h.nowPlaying.values()) listener("nowplaying", np);
  // And tell everyone else a device appeared.
  broadcastDevices(userId, h);
}

/** Drop an SSE listener; remove its device when it has no listeners left. */
export function unregisterSubscriber(userId: number, subId: string): void {
  const h = hubs.get(userId);
  if (!h) return;
  const sub = h.subscribers.get(subId);
  h.subscribers.delete(subId);
  if (sub) {
    const stillConnected = [...h.subscribers.values()].some((s) => s.deviceId === sub.deviceId);
    if (!stillConnected) {
      h.devices.delete(sub.deviceId);
      h.nowPlaying.delete(sub.deviceId);
      broadcastDevices(userId, h);
    }
  }
  if (h.subscribers.size === 0) hubs.delete(userId);
}

/** A device reports what it is playing; mirror it and fan out to controllers. */
export function publishNowPlaying(userId: number, np: NowPlaying): void {
  const h = getHub(userId);
  const dev = h.devices.get(np.deviceId);
  // Only a device with a LIVE subscriber may publish. This blocks two leaks at
  // once: a flood of `state` POSTs under arbitrary deviceIds can no longer grow
  // nowPlaying unboundedly (no SSE connection → not in `devices` → dropped), and
  // a snapshot racing in just after unregisterSubscriber can't re-create an
  // orphaned entry that nothing would ever reap.
  if (!dev) return;
  const snap: NowPlaying = { ...np, updatedAt: Date.now() };
  h.nowPlaying.set(np.deviceId, snap);
  // The roster only changes when the play/pause flag flips; a plain position
  // tick (4s cadence per device) must NOT re-broadcast the whole sorted list.
  const rosterChanged = dev.playing !== np.isPlaying;
  dev.playing = np.isPlaying;
  dev.lastSeen = Date.now();
  broadcast(userId, "nowplaying", snap);
  if (rosterChanged) broadcastDevices(userId, h);
}

/** Relay a transport command to ONLY the target device's subscriber(s). Routing
 *  server-side (instead of broadcasting to everyone and filtering on the client)
 *  means a device never sees control traffic meant for another, the sender never
 *  receives its own echo, and a `from`/`target` spoof can't reach an unrelated
 *  device. If no subscriber matches the target, the command is simply dropped. */
export function sendCommand(userId: number, cmd: RemoteCommand): void {
  const h = hubs.get(userId);
  if (!h) return;
  for (const sub of h.subscribers.values()) {
    if (sub.deviceId === cmd.target) sub.listener("command", cmd);
  }
}

/** Keep a device marked alive (called on SSE pings). */
export function heartbeat(userId: number, deviceId: string): void {
  const dev = hubs.get(userId)?.devices.get(deviceId);
  if (dev) dev.lastSeen = Date.now();
}

// A live subscriber pings every 25s (stream route), refreshing lastSeen. A device
// silent for well past that lost its connection without a clean abort (process
// killed, network dropped, proxy swallowed the close) — reap it so it stops
// haunting other devices' pickers and can't grow memory forever. The sweep also
// drops any subscriber bound to a reaped device and prunes a hub once empty.
const STALE_MS = 70_000;

function sweepHub(userId: number, h: Hub, now: number): void {
  let rosterChanged = false;
  for (const dev of [...h.devices.values()]) {
    if (now - dev.lastSeen <= STALE_MS) continue;
    h.devices.delete(dev.id);
    h.nowPlaying.delete(dev.id);
    for (const [subId, sub] of h.subscribers) {
      if (sub.deviceId === dev.id) h.subscribers.delete(subId);
    }
    rosterChanged = true;
  }
  if (rosterChanged) broadcastDevices(userId, h);
}

// One process-wide timer (guarded against double-registration under HMR / repeated
// module evaluation) sweeps every hub. `unref` so it never keeps the process alive.
const SWEEP_KEY = "__auralisSyncSweep";
const g = globalThis as unknown as Record<string, ReturnType<typeof setInterval> | undefined>;
if (!g[SWEEP_KEY]) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [userId, h] of [...hubs]) {
      sweepHub(userId, h, now);
      if (h.subscribers.size === 0 && h.devices.size === 0) hubs.delete(userId);
    }
  }, 30_000);
  timer.unref?.();
  g[SWEEP_KEY] = timer;
}
