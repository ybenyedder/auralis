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

test("toggleFavorite prepends so the newest like iterates first (matches server's created_at DESC + FavoritesView's 'Récents' sort)", async () => {
  const { usePlayer } = await stores();
  usePlayer.setState({ favorites: new Set(["old2", "old1"]) });
  usePlayer.getState().toggleFavorite("new1");
  assert.deepEqual([...usePlayer.getState().favorites], ["new1", "old2", "old1"], "fresh like goes first, not last");
  usePlayer.getState().toggleFavorite("new1");
  assert.deepEqual([...usePlayer.getState().favorites], ["old2", "old1"], "un-liking removes it cleanly without disturbing the rest's order");
});

test("navigate() to the already-active view is a no-op for identity + history (no wasted re-render, no stuck back())", async () => {
  const { usePlayer } = await stores();
  usePlayer.setState({ view: { view: "home" }, navHistory: [] });
  usePlayer.getState().navigate("explore");
  const afterFirstNav = usePlayer.getState().view;
  assert.deepEqual(afterFirstNav, { view: "explore", id: undefined });
  assert.equal(usePlayer.getState().navHistory.length, 1, "one real navigation = one history entry");

  // Re-navigating to the SAME view+id must not duplicate history or reallocate
  // the view object — components with an atomic `s.view` selector should see
  // no change at all.
  usePlayer.getState().navigate("explore");
  assert.equal(usePlayer.getState().view, afterFirstNav, "same object reference — no re-render for atomic selectors");
  assert.equal(usePlayer.getState().navHistory.length, 1, "redundant navigate() must not push a duplicate history entry");

  // Navigate somewhere new, then back() must land on "home" (the real previous
  // view), not "explore" again (which the duplicate-history bug would cause).
  usePlayer.getState().navigate("favorites");
  assert.equal(usePlayer.getState().navHistory.length, 2);
  usePlayer.getState().back();
  assert.deepEqual(usePlayer.getState().view, { view: "explore", id: undefined });
  usePlayer.getState().back();
  assert.deepEqual(usePlayer.getState().view, { view: "home" });
});

test("navigate() always closes fullscreen, even when re-navigating to the current view", async () => {
  const { usePlayer } = await stores();
  usePlayer.setState({ view: { view: "home" }, navHistory: [], fullscreenPlayer: true });
  usePlayer.getState().navigate("home");
  assert.equal(usePlayer.getState().fullscreenPlayer, false);
});

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

test("clearQueue undo restores cleanly when the track hasn't changed", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("a"), mk("b"), mk("c")];
  useLibraryStore.setState({ tracks: lib });
  usePlayer.setState({ queue: lib, shuffledQueue: lib, currentIndex: 1, currentTrack: lib[1], autoplay: true });
  usePlayer.getState().clearQueue();
  assert.equal(usePlayer.getState().shuffledQueue.length, 1, "collapsed to current track");
  const undo = usePlayer.getState().toast?.action?.run;
  assert.ok(undo, "undo action present");
  undo();
  const s = usePlayer.getState();
  assert.equal(s.shuffledQueue.length, 3, "full queue restored");
  assert.equal(s.shuffledQueue[s.currentIndex]?.trackhash, "b", "index still anchors the current track");
});

test("clearQueue undo re-anchors when the track advanced during the undo window (no desync)", async () => {
  const { usePlayer, useLibraryStore } = await stores();
  const lib = [mk("a"), mk("b"), mk("c"), mk("d")];
  useLibraryStore.setState({ tracks: lib });
  usePlayer.setState({ queue: [lib[0], lib[1], lib[2]], shuffledQueue: [lib[0], lib[1], lib[2]], currentIndex: 0, currentTrack: lib[0], autoplay: true });
  usePlayer.getState().clearQueue();
  const undo = usePlayer.getState().toast?.action?.run;
  assert.ok(undo, "undo action present");
  // Autoplay advances to a NEW track "d" (not in the snapshot) during the 5.2s window.
  usePlayer.setState({ currentTrack: lib[3], shuffledQueue: [lib[0], lib[3]], currentIndex: 1 });
  undo();
  const s = usePlayer.getState();
  // The invariant shuffledQueue[currentIndex] === currentTrack must hold.
  assert.equal(s.shuffledQueue[s.currentIndex]?.trackhash, "d", "currentIndex follows the live track");
  assert.ok(s.shuffledQueue.some((t) => t.trackhash === "a"), "the old queue was restored");
});
