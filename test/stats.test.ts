// Server-side tests for the listening-stats module (streak + weekly recap +
// listening time). Runs against a real temporary SQLite database so the local-day
// streak math and the play_events × tracks join are exercised end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-stats-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const DAY = 86_400_000;
const UID = 1;

async function setup() {
  const { getDb } = await import("../src/server/db");
  const { getListeningStats } = await import("../src/server/state/stats");
  const db = getDb();
  // Fresh per-test: clear the user signals.
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM tracks;");
  return { db, getListeningStats };
}

function addTrack(db: import("better-sqlite3").Database, hash: string, duration: number) {
  db.prepare("INSERT OR REPLACE INTO tracks (trackhash, filepath, title, duration) VALUES (?, ?, ?, ?)").run(hash, `/m/${hash}.mp3`, hash, duration);
}
function addEvent(db: import("better-sqlite3").Database, hash: string, playedAt: number) {
  db.prepare("INSERT INTO play_events (user_id, trackhash, played_at) VALUES (?, ?, ?)").run(UID, hash, playedAt);
  db.prepare("INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, trackhash) DO UPDATE SET count = count + 1, last_played = excluded.last_played").run(UID, hash, playedAt);
}

test("streak is 0 with no listening history", async () => {
  const { getListeningStats } = await setup();
  const s = getListeningStats(UID);
  assert.equal(s.streak, 0);
  assert.equal(s.totalPlays, 0);
  assert.equal(s.weekPlays, 0);
  assert.equal(s.playsByDay.length, 7);
});

test("streak counts consecutive days up to today", async () => {
  const { db, getListeningStats } = await setup();
  const now = Date.now();
  addTrack(db, "t", 180);
  // today, yesterday, 2 days ago → 3 consecutive days. Use local noon to avoid
  // landing on a midnight boundary.
  const noon = (offset: number) => { const d = new Date(now - offset * DAY); d.setHours(12, 0, 0, 0); return d.getTime(); };
  addEvent(db, "t", noon(0));
  addEvent(db, "t", noon(1));
  addEvent(db, "t", noon(2));
  const s = getListeningStats(UID);
  assert.equal(s.streak, 3, "three consecutive days");
  assert.equal(s.todayPlays, 1);
  assert.equal(s.totalPlays, 3);
});

test("a gap breaks the streak", async () => {
  const { db, getListeningStats } = await setup();
  const now = Date.now();
  addTrack(db, "t", 180);
  const noon = (offset: number) => { const d = new Date(now - offset * DAY); d.setHours(12, 0, 0, 0); return d.getTime(); };
  addEvent(db, "t", noon(0)); // today
  addEvent(db, "t", noon(3)); // 3 days ago (gap at days 1 & 2)
  const s = getListeningStats(UID);
  assert.equal(s.streak, 1, "only today counts");
});

test("yesterday-only keeps the streak alive (one-day grace before today's first play)", async () => {
  const { db, getListeningStats } = await setup();
  const now = Date.now();
  addTrack(db, "t", 180);
  const noon = (offset: number) => { const d = new Date(now - offset * DAY); d.setHours(12, 0, 0, 0); return d.getTime(); };
  addEvent(db, "t", noon(1)); // yesterday, nothing today yet
  const s = getListeningStats(UID);
  assert.equal(s.streak, 1, "yesterday anchors the streak");
  assert.equal(s.todayPlays, 0);
});

test("listening time sums played track durations over the week", async () => {
  const { db, getListeningStats } = await setup();
  const now = Date.now();
  addTrack(db, "a", 180);
  addTrack(db, "b", 240);
  const noon = (offset: number) => { const d = new Date(now - offset * DAY); d.setHours(12, 0, 0, 0); return d.getTime(); };
  addEvent(db, "a", noon(0));
  addEvent(db, "a", noon(1));
  addEvent(db, "b", noon(2));
  const s = getListeningStats(UID);
  assert.equal(s.weekListeningSeconds, 180 + 180 + 240, "2×a + 1×b durations");
  assert.equal(s.weekPlays, 3);
});

test("resetUserStats wipes play counts / recents / events", async () => {
  const { db, getListeningStats } = await setup();
  const { resetUserStats } = await import("../src/server/state/userState");
  const now = Date.now();
  addTrack(db, "t", 180);
  addEvent(db, "t", now);
  addEvent(db, "t", now - DAY);
  assert.ok(getListeningStats(UID).totalPlays > 0, "seeded before reset");
  resetUserStats(UID);
  const s = getListeningStats(UID);
  assert.equal(s.totalPlays, 0);
  assert.equal(s.weekPlays, 0);
  assert.equal(s.streak, 0);
  assert.equal(s.weekListeningSeconds, 0);
});
