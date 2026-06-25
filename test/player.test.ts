// Unit tests for the client player store's critical playback logic (autoplay
// continuation, Fisher-Yates shuffle, sleep-timer modes, and session resume).
// The store is a browser module, so we shim the minimal globals it touches
// (window + localStorage) before importing it, and import it lazily inside the
// tests (the test runner transforms to CJS, which forbids top-level await).

import { test } from "node:test";
import assert from "node:assert/strict";

const lsStore: Record<string, string> = {};
const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
g.localStorage = {
  getItem: (k: string) => lsStore[k] ?? null,
  setItem: (k: string, v: string) => { lsStore[k] = v; },
  removeItem: (k: string) => { delete lsStore[k]; },
};
g.window = { localStorage: g.localStorage, addEventListener: () => {}, removeEventListener: () => {}, setTimeout, clearTimeout };

async function stores() {
  const p = await import("../src/store/player");
  const ph = await import("../src/store/playhead");
  const lib = await import("../src/store/library");
  return { usePlayer: p.usePlayer, shuffleArray: p.shuffleArray, consumeResumeSeek: p.consumeResumeSeek, usePlayhead: ph.usePlayhead, useLibraryStore: lib.useLibraryStore };
}

type T = { trackhash: string; title: string; artists: { artisthash: string; name: string }[]; genre?: string; duration: number };
const mk = (h: string, artist = "A", genre = "rock"): T => ({ trackhash: h, title: h, artists: [{ artisthash: artist, name: artist }], genre, duration: 200 });

test("shuffleArray is a permutation (keeps every element exactly once)", async () => {
  const { shuffleArray } = await stores();
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = shuffleArray(input);
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});

test("autoplay appends a similar continuation at the end of the queue", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("t0"), mk("t1"), mk("s1"), mk("s2"), mk("s3"), mk("s4"), mk("s5")];
  useLibraryStore.setState({ tracks: lib });
  usePlayer.setState({ queue: [lib[0], lib[1]], shuffledQueue: [lib[0], lib[1]], currentIndex: 1, currentTrack: lib[1], autoplay: true, repeat: "off", isPlaying: true });
  usePlayer.getState().playNext();
  const s = usePlayer.getState();
  assert.ok(s.shuffledQueue.length > 2, "queue grew");
  assert.equal(s.isPlaying, true);
  assert.equal(s.currentIndex, 2);
  assert.ok(s.shuffledQueue.slice(2).every((t) => t.trackhash !== "t0" && t.trackhash !== "t1"), "appended excludes already-queued");
});

test("autoplay OFF stops at the end of the queue", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("t0"), mk("t1")];
  useLibraryStore.setState({ tracks: lib });
  usePlayer.setState({ queue: lib, shuffledQueue: lib, currentIndex: 1, currentTrack: lib[1], autoplay: false, repeat: "off", isPlaying: true });
  usePlayer.getState().playNext();
  const s = usePlayer.getState();
  assert.equal(s.isPlaying, false);
  assert.equal(s.shuffledQueue.length, 2, "queue unchanged");
});

test("repeat all wraps to index 0 regardless of autoplay", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("t0"), mk("t1")];
  useLibraryStore.setState({ tracks: lib });
  usePlayer.setState({ queue: lib, shuffledQueue: lib, currentIndex: 1, currentTrack: lib[1], autoplay: false, repeat: "all", isPlaying: true });
  usePlayer.getState().playNext();
  assert.equal(usePlayer.getState().currentIndex, 0);
});

test("sleepAfterTrack arms end-of-track mode; cancel clears it", async () => {
  const { usePlayer } = await stores();
  usePlayer.getState().sleepAfterTrack();
  let st = usePlayer.getState().sleepTimer;
  assert.equal(st.active, true);
  assert.equal(st.endsAt, null);
  assert.equal(st.endOfTrack, true);
  usePlayer.getState().cancelSleepTimer();
  st = usePlayer.getState().sleepTimer;
  assert.equal(st.active, false);
  assert.ok(!st.endOfTrack);
});

test("session restore round-trips track + order + position (paused)", async () => {
  const { usePlayer, usePlayhead, useLibraryStore, consumeResumeSeek } = await stores();
  const lib = [mk("t0"), mk("t1"), mk("t2")];
  useLibraryStore.setState({ tracks: lib });
  lsStore["auralis.vault.v1"] = JSON.stringify({ lastSession: { trackhash: "t1", queueHashes: ["t1", "t0", "t2"], currentIndex: 0, position: 42 } });
  usePlayer.setState({ currentTrack: null, queue: [], shuffledQueue: [] });
  usePlayer.getState().restoreLastSession();
  const s = usePlayer.getState();
  assert.equal(s.currentTrack?.trackhash, "t1");
  assert.equal(s.shuffledQueue.map((t) => t.trackhash).join(), "t1,t0,t2");
  assert.equal(s.currentIndex, 0);
  assert.equal(s.isPlaying, false);
  assert.equal(usePlayhead.getState().position, 42, "scrubber restored");
  // The seek is bound to t1: a different track loading must NOT consume it.
  assert.equal(consumeResumeSeek("other"), null, "seek not leaked to a different track");
  assert.equal(consumeResumeSeek("t1"), 42, "resume seek armed for t1");
  assert.equal(consumeResumeSeek("t1"), null, "resume seek consumed once");
});

test("session restore falls back to the single track when it's outside the saved queue window", async () => {
  const { usePlayer, useLibraryStore, consumeResumeSeek } = await stores();
  const lib = [mk("a"), mk("b"), mk("c")];
  useLibraryStore.setState({ tracks: lib });
  // Simulate an autoplay-truncated window: current track "c" is NOT among queueHashes.
  lsStore["auralis.vault.v1"] = JSON.stringify({ lastSession: { trackhash: "c", queueHashes: ["a", "b"], currentIndex: 0, position: 30 } });
  usePlayer.setState({ currentTrack: null, queue: [], shuffledQueue: [] });
  consumeResumeSeek("a"); consumeResumeSeek("c"); // drain any armed state
  usePlayer.getState().restoreLastSession();
  const s = usePlayer.getState();
  assert.equal(s.currentTrack?.trackhash, "c", "resumes the correct track, not queue[0]");
  assert.equal(s.shuffledQueue.map((t) => t.trackhash).join(), "c");
  assert.equal(consumeResumeSeek("c"), 30, "seek armed for the correct track");
});

test("session restore does not clobber an already-playing track", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("t0"), mk("t1")];
  useLibraryStore.setState({ tracks: lib });
  lsStore["auralis.vault.v1"] = JSON.stringify({ lastSession: { trackhash: "t0", queueHashes: ["t0"], currentIndex: 0, position: 10 } });
  usePlayer.setState({ currentTrack: lib[1], isPlaying: true });
  usePlayer.getState().restoreLastSession();
  assert.equal(usePlayer.getState().currentTrack?.trackhash, "t1");
});
