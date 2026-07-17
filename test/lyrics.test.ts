// Unit tests for the LRCLIB candidate picker — the guard that stopped Auralis
// attaching the WRONG song's lyrics when only the duration happened to be close.
// pickBestLrclibHit is a pure function, so no database is needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pickBestLrclibHit, writeSidecar } from "../src/server/lyrics/service";
import { resetConfigCache } from "../src/server/config";

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

// writeSidecar must NOT try to write a .lrc next to a missing audio file (stale DB
// filepath / unmounted volume) — that was the source of the ENOENT prod log spam.
test("writeSidecar skips silently when the audio file is missing (no .lrc, no throw)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-lrc-"));
  process.env.AURALIS_MUSIC_DIR = dir;
  process.env.AURALIS_LYRICS_SIDECAR = "1";
  resetConfigCache();
  try {
    // "ghost.mp3" resolves under musicDir but was never created → must be a no-op.
    await writeSidecar("ghost.mp3", "[00:01.00]la", null);
    assert.equal(fs.existsSync(path.join(dir, "ghost.lrc")), false, "no sidecar for a missing audio file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.AURALIS_MUSIC_DIR;
    delete process.env.AURALIS_LYRICS_SIDECAR;
    resetConfigCache();
  }
});

test("writeSidecar writes the .lrc when the audio file exists", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-lrc-"));
  process.env.AURALIS_MUSIC_DIR = dir;
  process.env.AURALIS_LYRICS_SIDECAR = "1";
  resetConfigCache();
  try {
    fs.writeFileSync(path.join(dir, "song.mp3"), "audio");
    await writeSidecar("song.mp3", "[00:01.00]la", null);
    assert.equal(fs.readFileSync(path.join(dir, "song.lrc"), "utf8"), "[00:01.00]la");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.AURALIS_MUSIC_DIR;
    delete process.env.AURALIS_LYRICS_SIDECAR;
    resetConfigCache();
  }
});
