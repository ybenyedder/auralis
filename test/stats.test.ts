// Server-side tests for the listening-stats module (streak + weekly recap +
// listening time). Runs against a real temporary SQLite database so the local-day
// streak math and the play_events × tracks join are exercised end to end.

import { test } from "vitest";
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

test("resetUserStats is scoped to the user (no cross-user wipe — IDOR-safe)", async () => {
  const { db, getListeningStats } = await setup();
  const { resetUserStats } = await import("../src/server/state/userState");
  const now = Date.now();
  addTrack(db, "t", 180);
  addEvent(db, "t", now); // user 1
  // user 2's signals
  db.prepare("INSERT INTO play_events (user_id, trackhash, played_at) VALUES (2, 't', ?)").run(now);
  db.prepare("INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (2, 't', 5, ?)").run(now);
  resetUserStats(1);
  assert.equal(getListeningStats(1).totalPlays, 0, "user 1 cleared");
  assert.equal(getListeningStats(2).totalPlays, 5, "user 2 untouched");
});

// The day/month bucketing moved from strftime('...','localtime') to JS computed
// over indexed queries. These pin that the results still match the old LOCAL-time
// semantics — not UTC.

test("month boundary: events on the last day and the first day of adjacent months land in separate month buckets", async () => {
  const { db } = await setup();
  const { listRecapMonths, getMonthlyRecap } = await import("../src/server/reco/recap");
  addTrack(db, "m1", 200);
  addTrack(db, "m2", 240);
  // Local wall-clock construction (2026-01-31 23:59 and 2026-02-01 00:01 local):
  // always in the past, so the assertion never depends on the machine's clock —
  // and 2 minutes apart ACROSS the boundary. A UTC-based bucketing would merge
  // one side into the other month in any timezone offset from UTC.
  const lastJan = new Date(2026, 0, 31, 23, 59, 0).getTime();
  const firstFeb = new Date(2026, 1, 1, 0, 1, 0).getTime();
  addEvent(db, "m1", lastJan);
  addEvent(db, "m2", firstFeb);

  const months = listRecapMonths(UID).filter((k) => k === "2026-01" || k === "2026-02");
  assert.deepEqual(months, ["2026-02", "2026-01"], "two distinct month buckets, newest first");

  const jan = getMonthlyRecap(UID, "2026-01");
  const feb = getMonthlyRecap(UID, "2026-02");
  assert.equal(jan.totalPlays, 1, "January owns exactly its last-day event");
  assert.equal(feb.totalPlays, 1, "February owns exactly its first-day event");
  assert.equal(jan.listeningSeconds, 200, "January's listening time comes only from its own event");
  assert.equal(feb.listeningSeconds, 240);
  assert.equal(getMonthlyRecap(UID, "2026-03").totalPlays, 0, "no leakage into the following month");
});

test("local midnight crossing: events either side of local midnight bucket on different days (timezone/DST safety)", async () => {
  const { db, getListeningStats } = await setup();
  const now = new Date();
  addTrack(db, "t", 180);
  // Built from LOCAL wall-clock components: 23:59:30 yesterday and 00:00:30
  // today — 60s apart across local midnight regardless of the UTC offset or a
  // DST transition (local midnight never moves). A UTC-day bucketing would merge
  // one of them into the other's day for any non-UTC offset.
  const yesterdayLate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 30).getTime();
  const todayEarly = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 30).getTime();
  addEvent(db, "t", yesterdayLate);
  addEvent(db, "t", todayEarly);

  const s = getListeningStats(UID);
  assert.notEqual(s.playsByDay[5].day, s.playsByDay[6].day, "the two sides of local midnight are distinct day keys");
  assert.equal(s.playsByDay[5].count, 1, "yesterday's 23:59:30 event buckets on yesterday");
  assert.equal(s.playsByDay[6].count, 1, "today's 00:00:30 event buckets on today");
  assert.equal(s.todayPlays, 1);
  assert.equal(s.streak, 2, "yesterday + today chain the streak across midnight");
});
