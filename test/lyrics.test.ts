// Unit tests for the LRCLIB candidate picker — the guard that stopped Auralis
// attaching the WRONG song's lyrics when only the duration happened to be close.
// pickBestLrclibHit is a pure function, so no database is needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestLrclibHit } from "../src/server/lyrics/service";

type Hit = Parameters<typeof pickBestLrclibHit>[0][number];
const hit = (over: Partial<Hit>): Hit => ({
  trackName: "Song", artistName: "Artist", duration: 200,
  syncedLyrics: null, plainLyrics: "la la", instrumental: false, ...over,
});
const target = { title: "Song", artist: "Artist", duration: 200 };

test("returns null on empty results", () => {
  assert.equal(pickBestLrclibHit([], target), null);
});

test("accepts an exact title/artist match with a close duration", () => {
  const r = pickBestLrclibHit([hit({ duration: 201 })], target);
  assert.ok(r);
  assert.equal(r?.trackName, "Song");
});

test("rejects a clearly-different title when the duration doesn't corroborate (wrong-song guard)", () => {
  // "Reise Reise" shares nothing with "Voyage" → max title penalty; duration off by 10s.
  const r = pickBestLrclibHit([hit({ trackName: "Reise Reise", duration: 210 })], { title: "Voyage", artist: "Artist", duration: 200 });
  assert.equal(r, null);
});

test("accepts a totally different title when the duration matches tightly (≤4s — transliteration/decoration)", () => {
  const r = pickBestLrclibHit([hit({ trackName: "Reise Reise", duration: 202 })], { title: "Voyage", artist: "Artist", duration: 200 });
  assert.ok(r, "a tight duration trusts even a different title");
});

test("rejects a wildly mismatched duration even when the title matches", () => {
  const r = pickBestLrclibHit([hit({ trackName: "Song", duration: 260 })], target); // 60s off
  assert.equal(r, null);
});

test("prefers a synced candidate over a plain one when both match", () => {
  const plain = hit({ duration: 200, syncedLyrics: null });
  const synced = hit({ duration: 200, syncedLyrics: "[00:01.00]la" });
  const r = pickBestLrclibHit([plain, synced], target);
  assert.ok(r?.syncedLyrics, "the synced candidate wins");
});

test("picks the duration-closest among same-titled candidates", () => {
  const r = pickBestLrclibHit([hit({ duration: 215 }), hit({ duration: 201 }), hit({ duration: 230 })], target);
  assert.equal(r?.duration, 201);
});
