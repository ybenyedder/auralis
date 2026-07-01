// Integration tests that call actual App Router route handlers (not just the
// underlying helpers in isolation, see csrf.test.ts) with real Request objects
// against a real temporary SQLite database — end to end through auth, body-size
// guarding, rate limiting and session issuance.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-httproutes-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const LOGIN_URL = "http://localhost:4237/api/auth/login";
const STATE_URL = "http://localhost:4237/api/state";

async function mods() {
  const { getDb } = await import("../src/server/db");
  const { createUser } = await import("../src/server/auth");
  const { POST: loginPost } = await import("../src/app/api/auth/login/route");
  return { db: getDb(), createUser, loginPost };
}

async function stateMods() {
  const { getDb } = await import("../src/server/db");
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { upsertPlaylist } = await import("../src/server/state/userState");
  const { PUT: statePut } = await import("../src/app/api/state/route");
  return { db: getDb(), createUser, createSessionToken, upsertPlaylist, statePut };
}

test("login rejects an oversized body with 413 before touching credentials/rate-limit", async () => {
  const { loginPost } = await mods();
  // A real oversized body (not a spoofed header) so Content-Length reflects it
  // exactly like a real client's request would. Comfortably over the 12MB cap
  // (sized to fit an 8MB base64 cover image, see http.ts).
  const hugePassword = "x".repeat(13 * 1024 * 1024);
  const req = new Request(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: hugePassword }),
  });
  const res = await loginPost(req);
  assert.equal(res.status, 413);
});

test("login with wrong credentials returns 401 and never sets a session cookie", async () => {
  const { db, createUser, loginPost } = await mods();
  db.exec("DELETE FROM users;");
  createUser("integrationtest", "correct-horse-battery-staple", false);
  const req = new Request(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "integrationtest", password: "wrong-password" }),
  });
  const res = await loginPost(req);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("login with correct credentials issues a session token + cookie end to end", async () => {
  const { db, createUser, loginPost } = await mods();
  db.exec("DELETE FROM users;");
  createUser("integrationtest2", "correct-horse-battery-staple", true);
  const req = new Request(LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "integrationtest2", password: "correct-horse-battery-staple" }),
  });
  const res = await loginPost(req);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { ok: boolean; token: string; username: string; isAdmin: boolean };
  assert.equal(data.ok, true);
  assert.equal(data.username, "integrationtest2");
  assert.equal(data.isAdmin, true);
  assert.ok(data.token && data.token.length > 10, "a real session token is returned");
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.ok(setCookie.includes("HttpOnly"), "session cookie is HttpOnly");
});

test("login with an invalid JSON body returns 400, not a 500 crash", async () => {
  const { loginPost } = await mods();
  const req = new Request(LOGIN_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  const res = await loginPost(req);
  assert.equal(res.status, 400);
});

test("playlist.cover accepts a legitimate cover right up at the 8MB limit (base64 inflation must fit the JSON body cap)", async () => {
  const { db, createUser, createSessionToken, upsertPlaylist, statePut } = await stateMods();
  db.exec("DELETE FROM users; DELETE FROM playlists;");
  const created = createUser("coveruser", "correct-horse-battery-staple", false);
  assert.ok(created.id);
  const uid = created.id;
  const token = createSessionToken(uid);
  const playlistId = upsertPlaylist(uid, { name: "Cover test" });

  // Exactly MAX_COVER_BYTES (8MB) of raw image data, base64-encoded — the JSON
  // body this produces is ~11.2MB, bigger than a naive "8MB is under 10MB" guess
  // would suggest. This is the exact upload the code's own MAX_COVER_BYTES check
  // is supposed to allow; readJsonBody's cap must not reject it first.
  const raw = Buffer.alloc(8 * 1024 * 1024, 1);
  const imageDataUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
  const req = new Request(STATE_URL, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "playlist.cover", id: playlistId, imageDataUrl }),
  });
  const res = await statePut(req);
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  assert.equal(res.status, 200, `expected the max-size cover to be accepted, got ${res.status}: ${data.error}`);
  assert.equal(data.ok, true);
});

test("playlist.cover still rejects a body genuinely over the JSON cap", async () => {
  const { db, createUser, createSessionToken, upsertPlaylist, statePut } = await stateMods();
  db.exec("DELETE FROM users; DELETE FROM playlists;");
  const created = createUser("coveruser2", "correct-horse-battery-staple", false);
  assert.ok(created.id);
  const uid = created.id;
  const token = createSessionToken(uid);
  const playlistId = upsertPlaylist(uid, { name: "Cover test 2" });

  // Comfortably past MAX_COVER_BYTES even after accounting for base64 inflation.
  const raw = Buffer.alloc(14 * 1024 * 1024, 1);
  const imageDataUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
  const req = new Request(STATE_URL, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "playlist.cover", id: playlistId, imageDataUrl }),
  });
  const res = await statePut(req);
  assert.equal(res.status, 413);
});
