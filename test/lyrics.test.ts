// Unit tests for the LRCLIB candidate picker — the guard that stopped Auralis
// attaching the WRONG song's lyrics when only the duration happened to be close.
// pickBestLrclibHit is a pure function, so no database is needed.

import { test } from "vitest";
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

// ---------------------------------------------------------------------------
// getLyrics cache freshness — a cached "found" row is re-served from the .lrc
// sidecar when the sidecar's mtime is NEWER than the row's fetched_at (the user
// hand-edited it since we fetched), and the refresh is persisted back as a
// "sidecar"-source row. An older or missing sidecar leaves the cache standing.
// These run against a real temp DB + temp music dir; AURALIS_LYRICS_ONLINE=false
// keeps the whole flow offline.
// ---------------------------------------------------------------------------
const lyricsDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-lyrics-db-"));
const lyricsLibDir = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-lyrics-lib-"));
process.env.AURALIS_DATA_DIR = lyricsDataDir;
process.env.AURALIS_MUSIC_DIR = lyricsLibDir;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => {
  for (const d of [lyricsDataDir, lyricsLibDir]) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function lyricsDb() {
  // Re-assert the env (the writeSidecar tests above delete AURALIS_MUSIC_DIR) and
  // reset the config cache so paths resolve to THIS file's temp dirs.
  process.env.AURALIS_DATA_DIR = lyricsDataDir;
  process.env.AURALIS_MUSIC_DIR = lyricsLibDir;
  process.env.AURALIS_LYRICS_ONLINE = "false";
  resetConfigCache();
  const { getDb } = await import("../src/server/db");
  const { getLyrics } = await import("../src/server/lyrics/service");
  const db = getDb();
  db.exec("DELETE FROM lyrics; DELETE FROM tracks;");
  return { db, getLyrics };
}

function seedCachedFound(
  db: import("better-sqlite3").Database,
  trackhash: string,
  filepath: string,
  cachedSynced: string,
  fetchedAt: number,
) {
  db.prepare(
    "INSERT OR REPLACE INTO tracks (trackhash, filepath, title, duration, has_lyrics) VALUES (?, ?, 'Song', 200, 1)",
  ).run(trackhash, filepath);
  db.prepare(
    "INSERT OR REPLACE INTO lyrics (trackhash, synced, plain, source, status, instrumental, fetched_at) VALUES (?, ?, NULL, 'lrclib', 'found', 0, ?)",
  ).run(trackhash, cachedSynced, fetchedAt);
}

test("getLyrics: a sidecar edited AFTER the cached fetch wins and persists a sidecar-source row", async () => {
  const { db, getLyrics } = await lyricsDb();
  const name = "edited-song";
  fs.writeFileSync(path.join(lyricsLibDir, `${name}.mp3`), "audio");
  fs.writeFileSync(path.join(lyricsLibDir, `${name}.lrc`), "[00:01.00]hand-edited line\n[00:03.00]second line");
  const fetchedAt = Date.now() - 60_000;
  seedCachedFound(db, "hash-edited", `${name}.mp3`, "[00:01.00]original cached line", fetchedAt);
  // Hand-edit timestamp: mtime strictly AFTER the row's fetched_at.
  const later = new Date(Date.now() + 5_000);
  fs.utimesSync(path.join(lyricsLibDir, `${name}.lrc`), later, later);

  const r = await getLyrics("hash-edited");
  assert.equal(r.source, "sidecar", "the fresher sidecar is the source of truth");
  assert.equal(r.synced, true);
  assert.equal(r.lines[0]?.text, "hand-edited line", "the SIDECAR text is served, not the stale cache");

  const row = db.prepare("SELECT source, synced, fetched_at FROM lyrics WHERE trackhash = 'hash-edited'").get() as {
    source: string; synced: string; fetched_at: number;
  };
  assert.equal(row.source, "sidecar", "the refresh is persisted back with a sidecar source");
  assert.ok(row.synced.includes("hand-edited line"), "the row content is refreshed from the sidecar");
  assert.ok(row.fetched_at > fetchedAt, "fetched_at moved forward so the same edit isn't re-read forever");
});

test("getLyrics: a sidecar OLDER than the cached row loses — the cache wins untouched", async () => {
  const { db, getLyrics } = await lyricsDb();
  const name = "old-song";
  fs.writeFileSync(path.join(lyricsLibDir, `${name}.mp3`), "audio");
  fs.writeFileSync(path.join(lyricsLibDir, `${name}.lrc`), "[00:01.00]older sidecar line");
  const fetchedAt = Date.now();
  seedCachedFound(db, "hash-old", `${name}.mp3`, "[00:01.00]cached wins line", fetchedAt);
  const older = new Date(fetchedAt - 120_000);
  fs.utimesSync(path.join(lyricsLibDir, `${name}.lrc`), older, older);

  const r = await getLyrics("hash-old");
  assert.equal(r.source, "lrclib", "the cached row's source stands");
  assert.equal(r.lines[0]?.text, "cached wins line", "the CACHED text is served, not the sidecar's");

  const row = db.prepare("SELECT source, fetched_at FROM lyrics WHERE trackhash = 'hash-old'").get() as {
    source: string; fetched_at: number;
  };
  assert.equal(row.source, "lrclib");
  assert.equal(row.fetched_at, fetchedAt, "the row is not re-persisted when the sidecar is older");
});

test("getLyrics: a deleted sidecar falls back to the cached lyrics", async () => {
  const { db, getLyrics } = await lyricsDb();
  const name = "vanished-song";
  fs.writeFileSync(path.join(lyricsLibDir, `${name}.mp3`), "audio");
  const lrc = path.join(lyricsLibDir, `${name}.lrc`);
  fs.writeFileSync(lrc, "[00:01.00]soon deleted");
  const fetchedAt = Date.now();
  seedCachedFound(db, "hash-gone", `${name}.mp3`, "[00:01.00]cache survives", fetchedAt);
  fs.unlinkSync(lrc);

  const r = await getLyrics("hash-gone");
  assert.equal(r.source, "lrclib");
  assert.equal(r.lines[0]?.text, "cache survives", "a vanished sidecar never blanks out cached lyrics");

  const row = db.prepare("SELECT fetched_at FROM lyrics WHERE trackhash = 'hash-gone'").get() as { fetched_at: number };
  assert.equal(row.fetched_at, fetchedAt, "the cached row stands untouched");
});
