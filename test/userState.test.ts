// Server-side tests for getUserState()'s playlist loading — locks in the
// N+1 → single IN(...) query fix (2026-06-30): every playlist's trackhashes
// must come back in the same per-playlist order as before, for both owned
// and collaborator playlists.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-userstate-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const OWNER = 1;
const COLLAB = 2;

async function setup() {
  const { getDb } = await import("../src/server/db");
  const { getUserState } = await import("../src/server/state/userState");
  const db = getDb();
  db.exec("DELETE FROM playlists; DELETE FROM playlist_tracks; DELETE FROM playlist_collaborators; DELETE FROM users;");
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, is_admin) VALUES (?, 'owner', 'x', 'x', 0)").run(OWNER);
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, is_admin) VALUES (?, 'collab', 'x', 'x', 0)").run(COLLAB);
  return { db, getUserState };
}

function addPlaylist(db: import("better-sqlite3").Database, id: string, userId: number, position = 0) {
  db.prepare("INSERT INTO playlists (id, name, user_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)").run(id, id, userId, position);
}
function addTrackToPlaylist(db: import("better-sqlite3").Database, playlistId: string, trackhash: string, position: number) {
  db.prepare("INSERT INTO playlist_tracks (playlist_id, trackhash, position, added_at) VALUES (?, ?, ?, ?)").run(playlistId, trackhash, position, position);
}

test("getUserState returns no playlists for a user with none (empty IN clause path)", async () => {
  const { getUserState } = await setup();
  const state = getUserState(OWNER);
  assert.deepEqual(state.playlists, []);
});

test("each playlist's trackhashes come back in position order", async () => {
  const { db, getUserState } = await setup();
  addPlaylist(db, "p1", OWNER, 0);
  addPlaylist(db, "p2", OWNER, 1);
  addTrackToPlaylist(db, "p1", "t3", 2);
  addTrackToPlaylist(db, "p1", "t1", 0);
  addTrackToPlaylist(db, "p1", "t2", 1);
  addTrackToPlaylist(db, "p2", "only", 0);

  const state = getUserState(OWNER);
  const p1 = state.playlists.find((p) => p.id === "p1");
  const p2 = state.playlists.find((p) => p.id === "p2");
  assert.deepEqual(p1?.trackhashes, ["t1", "t2", "t3"], "ordered by position, not insertion/scan order");
  assert.deepEqual(p2?.trackhashes, ["only"]);
});

test("a playlist with zero tracks gets an empty array, not undefined", async () => {
  const { db, getUserState } = await setup();
  addPlaylist(db, "empty", OWNER, 0);
  const state = getUserState(OWNER);
  assert.deepEqual(state.playlists[0]?.trackhashes, []);
});

test("collaborator playlists load their own tracks, scoped correctly, and don't leak into the owner's own list twice", async () => {
  const { db, getUserState } = await setup();
  addPlaylist(db, "mine", OWNER, 0);
  addTrackToPlaylist(db, "mine", "a", 0);
  addPlaylist(db, "shared", COLLAB, 0);
  addTrackToPlaylist(db, "shared", "b", 0);
  addTrackToPlaylist(db, "shared", "c", 1);
  db.prepare("INSERT INTO playlist_collaborators (playlist_id, user_id, added_at) VALUES ('shared', ?, 0)").run(OWNER);

  const state = getUserState(OWNER);
  assert.equal(state.playlists.length, 2);
  const mine = state.playlists.find((p) => p.id === "mine");
  const shared = state.playlists.find((p) => p.id === "shared");
  assert.deepEqual(mine?.trackhashes, ["a"]);
  assert.equal(mine?.collaborator, false);
  assert.deepEqual(shared?.trackhashes, ["b", "c"]);
  assert.equal(shared?.collaborator, true);
  assert.equal(shared?.owner, "collab");
});

test("many playlists (id collision stress for the shared IN-query grouping) each keep their own tracks", async () => {
  const { db, getUserState } = await setup();
  for (let i = 0; i < 25; i++) {
    addPlaylist(db, `pl-${i}`, OWNER, i);
    addTrackToPlaylist(db, `pl-${i}`, `track-${i}-a`, 0);
    addTrackToPlaylist(db, `pl-${i}`, `track-${i}-b`, 1);
  }
  const state = getUserState(OWNER);
  assert.equal(state.playlists.length, 25);
  for (let i = 0; i < 25; i++) {
    const p = state.playlists.find((pl) => pl.id === `pl-${i}`);
    assert.deepEqual(p?.trackhashes, [`track-${i}-a`, `track-${i}-b`], `playlist pl-${i} keeps only its own tracks in order`);
  }
});
