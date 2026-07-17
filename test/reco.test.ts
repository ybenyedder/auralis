// Server-side tests for the recommendation taste engine + the monthly mood recap.
// Runs against a real temporary SQLite database so the event-weighting, the
// feeling-space content generalisation, the hard dislike exclude, and the
// month-bucketed mood aggregation are all exercised end to end.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-reco-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const DAY = 86_400_000;
const UID = 1;

type TrackOpts = { mood?: string; energy?: number; bpm?: number; duration?: number; genre?: string; artisthash?: string; artist?: string };

async function mods() {
  const db = (await import("../src/server/db")).getDb();
  const engine = await import("../src/server/reco/engine");
  const recap = await import("../src/server/reco/recap");
  const userState = await import("../src/server/state/userState");
  return { db, ...engine, ...recap, ...userState };
}

function reset(db: import("better-sqlite3").Database) {
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM recents; DELETE FROM favorites; DELETE FROM dislikes; DELETE FROM tracks;");
}

function addTrack(db: import("better-sqlite3").Database, hash: string, o: TrackOpts = {}) {
  db.prepare(
    "INSERT OR REPLACE INTO tracks (trackhash, filepath, title, duration, genre, mood, energy, bpm, artisthash, artist, albumartist, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
  ).run(hash, `/m/${hash}.mp3`, hash, o.duration ?? 200, o.genre ?? null, o.mood ?? null, o.energy ?? null, o.bpm ?? null, o.artisthash ?? hash, o.artist ?? hash, o.artist ?? hash);
}

/** Insert a completed/skip event directly with a controlled timestamp + ratio. */
function addEvent(db: import("better-sqlite3").Database, hash: string, kind: "complete" | "skip", playedAt: number, ratio: number) {
  db.prepare("INSERT INTO play_events (user_id, trackhash, played_at, kind, ms_played, ratio) VALUES (?, ?, ?, ?, ?, ?)").run(UID, hash, playedAt, kind, Math.round(ratio * 1000), ratio);
}

function rankOf(list: { trackhash: string }[], hash: string): number {
  return list.findIndex((r) => r.trackhash === hash);
}

test("cold start: recommends every track, none disliked, with a coherent profile", async () => {
  const { db, recommend, invalidateReco } = await mods();
  reset(db);
  addTrack(db, "a", { mood: "happy", energy: 0.6, bpm: 110 });
  addTrack(db, "b", { mood: "chill", energy: 0.3, bpm: 80 });
  invalidateReco(UID);
  const { forYou, profile } = recommend(UID, 50);
  assert.equal(forYou.length, 2, "both tracks surface with no history");
  assert.equal(profile.signals, 0, "no feedback yet");
  assert.equal(profile.disliked.length, 0);
});

test("a completed listen ranks a track above one that's repeatedly skipped", async () => {
  const { db, recordPlay, recordSkip, invalidateReco, recommend } = await mods();
  reset(db);
  addTrack(db, "loved", { mood: "happy", energy: 0.6, bpm: 110 });
  addTrack(db, "skipped", { mood: "happy", energy: 0.6, bpm: 110 });
  addTrack(db, "neutral", { mood: "happy", energy: 0.6, bpm: 110 });
  recordPlay(UID, "loved");
  recordPlay(UID, "loved");
  recordSkip(UID, "skipped", 1500, 0); // bailed almost immediately, thrice
  recordSkip(UID, "skipped", 1500, 0);
  recordSkip(UID, "skipped", 1500, 0);
  invalidateReco(UID);
  const { forYou } = recommend(UID, 50);
  assert.ok(rankOf(forYou, "loved") < rankOf(forYou, "skipped"), "loved outranks skipped");
  assert.ok(rankOf(forYou, "neutral") < rankOf(forYou, "skipped"), "even an untouched track outranks the skipped one");
  const skipScore = forYou.find((r) => r.trackhash === "skipped")?.score ?? 0;
  assert.ok(skipScore < 0, "a repeatedly-skipped track scores negative");
});

test("dislike hard-excludes a track from the mix and from radio", async () => {
  const { db, setDislike, invalidateReco, recommend, recommendRadio } = await mods();
  reset(db);
  addTrack(db, "x", { mood: "party", energy: 0.8, bpm: 128 });
  addTrack(db, "y", { mood: "party", energy: 0.8, bpm: 128 });
  addTrack(db, "z", { mood: "party", energy: 0.8, bpm: 128 });
  setDislike(UID, "y", true);
  invalidateReco(UID);
  const { forYou, profile } = recommend(UID, 50);
  assert.ok(!forYou.some((r) => r.trackhash === "y"), "disliked track absent from forYou");
  assert.deepEqual(profile.disliked, ["y"]);
  const radio = recommendRadio(UID, "x", 10);
  assert.ok(!radio.some((r) => r.trackhash === "y"), "disliked track absent from radio");
});

test("content generalisation: liking a vibe lifts UNHEARD tracks of the same vibe", async () => {
  const { db, setFavorite, invalidateReco, recommend } = await mods();
  reset(db);
  // The user likes a couple of high-energy party tracks…
  addTrack(db, "fav1", { mood: "party", energy: 0.9, bpm: 130 });
  addTrack(db, "fav2", { mood: "party", energy: 0.88, bpm: 126 });
  // …and has never touched these two — one high-energy, one mellow.
  addTrack(db, "newHi", { mood: "energetic", energy: 0.85, bpm: 140 });
  addTrack(db, "newLo", { mood: "melancholy", energy: 0.2, bpm: 70 });
  setFavorite(UID, "fav1", true);
  setFavorite(UID, "fav2", true);
  invalidateReco(UID);
  const { forYou } = recommend(UID, 50);
  assert.ok(
    rankOf(forYou, "newHi") < rankOf(forYou, "newLo"),
    "the unheard track that matches the liked vibe outranks the mismatched one",
  );
});

test("dislike clears a prior like (opposite verdicts can't both hold)", async () => {
  const { db, setFavorite, setDislike, getUserState } = await mods();
  reset(db);
  addTrack(db, "t", { mood: "chill", energy: 0.3, bpm: 80 });
  setFavorite(UID, "t", true);
  setDislike(UID, "t", true);
  const s = getUserState(UID);
  assert.ok(!s.favorites.includes("t"), "disliking removed the favourite");
  assert.ok(s.dislikes.includes("t"), "dislike recorded");
});

test("recommendFromSeeds: same-vibe mix that excludes the seeds and dislikes", async () => {
  const { db, recommendFromSeeds, setDislike, invalidateReco } = await mods();
  reset(db);
  // Two party seeds → the AI mix should lean party/energetic, away from melancholy.
  addTrack(db, "seed1", { mood: "party", energy: 0.9, bpm: 128 });
  addTrack(db, "seed2", { mood: "party", energy: 0.88, bpm: 126 });
  addTrack(db, "near", { mood: "energetic", energy: 0.85, bpm: 132 });
  addTrack(db, "far", { mood: "melancholy", energy: 0.2, bpm: 70 });
  addTrack(db, "banned", { mood: "party", energy: 0.9, bpm: 128 });
  setDislike(UID, "banned", true);
  invalidateReco(UID);
  const res = recommendFromSeeds(UID, ["seed1", "seed2"], 10);
  const hashes = res.tracks.map((t) => t.trackhash);
  assert.ok(!hashes.includes("seed1") && !hashes.includes("seed2"), "seeds aren't re-listed as additions");
  assert.ok(!hashes.includes("banned"), "a disliked track is hard-excluded");
  assert.ok(rankOf(res.tracks, "near") < rankOf(res.tracks, "far"), "the same-vibe track outranks the mismatched one");
  assert.equal(res.mood, "party", "dominant seed mood detected");
  assert.ok(res.name.includes("Mix IA"), "named as the AI mix");
});

test("generateFromSeeds persistence: the playlist is led by the hand-picked seeds", async () => {
  const { db, recommendFromSeeds, upsertPlaylist, getUserState, invalidateReco } = await mods();
  reset(db);
  addTrack(db, "s1", { mood: "chill", energy: 0.3, bpm: 80 });
  addTrack(db, "extra", { mood: "chill", energy: 0.32, bpm: 82 });
  invalidateReco(UID);
  const res = recommendFromSeeds(UID, ["s1"], 10);
  const trackhashes = [...new Set(["s1", ...res.tracks.map((t) => t.trackhash)])];
  const id = upsertPlaylist(UID, { name: res.name, trackhashes });
  const pl = getUserState(UID).playlists.find((p) => p.id === id);
  assert.ok(pl, "playlist persisted");
  assert.equal(pl?.trackhashes[0], "s1", "the seed leads the generated playlist");
});

test("monthly recap picks the dominant mood and ignores skips", async () => {
  const { db, getMonthlyRecap, listRecapMonths } = await mods();
  reset(db);
  addTrack(db, "m1", { mood: "melancholy", energy: 0.25, bpm: 72, duration: 240 });
  addTrack(db, "m2", { mood: "melancholy", energy: 0.3, bpm: 78, duration: 200 });
  addTrack(db, "h1", { mood: "happy", energy: 0.6, bpm: 115, duration: 180 });

  // ~45 days ago → a fully-elapsed prior month, still inside the 400-day window.
  const when = Date.now() - 45 * DAY;
  const d = new Date(when);
  d.setHours(12, 0, 0, 0);
  const ts = d.getTime();
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (let i = 0; i < 6; i++) addEvent(db, i % 2 ? "m2" : "m1", "complete", ts - i * 1000, 1);
  addEvent(db, "h1", "complete", ts, 1);
  // Skips of a happy track must NOT swing the month toward happy.
  for (let i = 0; i < 8; i++) addEvent(db, "h1", "skip", ts - i * 500, 0);

  const months = listRecapMonths(UID);
  assert.ok(months.includes(key), "the month with listens is listed");

  const recap = getMonthlyRecap(UID, key);
  assert.equal(recap.month, key);
  assert.equal(recap.inProgress, false, "a past month is not in progress");
  assert.equal(recap.dominantMood, "melancholy", "melancholy dominates the month");
  assert.equal(recap.moodWord, "mélancolique");
  assert.equal(recap.totalPlays, 7, "only the 7 completes count, not the 8 skips");
  assert.ok(recap.narrative.toLowerCase().includes("mélancolique"), "narrative names the mood");
  const total = recap.moods.reduce((s, m) => s + m.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-6, "mood shares sum to 1");
});

test("replaceUserState imports dislikes and keeps the favourite/dislike mutual exclusion", async () => {
  const { db, replaceUserState, getUserState } = await mods();
  reset(db);
  addTrack(db, "a", { mood: "happy" });
  addTrack(db, "b", { mood: "chill" });
  // Import a state where "b" is both favourited and disliked — the import must not
  // leave it in both (the inverse of getUserState was previously lossy on dislikes).
  replaceUserState(UID, { favorites: ["a", "b"], dislikes: ["b"] });
  const s = getUserState(UID);
  assert.deepEqual(s.dislikes, ["b"], "dislikes are persisted on import");
  assert.deepEqual(s.favorites, ["a"], "the disliked track is dropped from favourites");
});

test("recap defaults to the most recent month that actually has data", async () => {
  const { db, getMonthlyRecap, listRecapMonths } = await mods();
  reset(db);
  addTrack(db, "t", { mood: "energetic", energy: 0.8, bpm: 140, duration: 200 });
  const ts = Date.now() - 10 * DAY;
  addEvent(db, "t", "complete", ts, 1);
  const months = listRecapMonths(UID);
  assert.ok(months.length >= 1);
  // No month arg → server resolves to months[0]; mirror that here.
  const recap = getMonthlyRecap(UID, months[0]);
  assert.equal(recap.dominantMood, "energetic");
  assert.ok(recap.totalPlays >= 1);
});

test("events older than the 180-day read window no longer influence scoring", async () => {
  const { db, invalidateReco, recommend } = await mods();
  reset(db);
  addTrack(db, "recent", { mood: "happy", energy: 0.6, bpm: 110 });
  addTrack(db, "stale", { mood: "happy", energy: 0.6, bpm: 110 });
  addTrack(db, "neutral", { mood: "happy", energy: 0.6, bpm: 110 });
  // Well within the engine's read window (EVENTS_WINDOW_MS = 180 * DAY).
  addEvent(db, "recent", "complete", Date.now() - 10 * DAY, 1);
  // Inserted directly (bypassing recordPlay's 400-day prune), so this row is still
  // in play_events — it must be excluded by the query's own window, not by pruning.
  addEvent(db, "stale", "complete", Date.now() - 200 * DAY, 1);
  invalidateReco(UID);
  const { forYou } = recommend(UID, 50);
  const staleScore = forYou.find((r) => r.trackhash === "stale")?.score ?? 0;
  const neutralScore = forYou.find((r) => r.trackhash === "neutral")?.score ?? 0;
  assert.equal(staleScore, neutralScore, "an event past the read window scores identically to no event at all");
  assert.ok(rankOf(forYou, "recent") < rankOf(forYou, "stale"), "the in-window listen still outranks the windowed-out one");
});
