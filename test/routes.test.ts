// Integration tests for the API routes that had no direct coverage: library
// (ETag/304), search, recommend (forYou + radio), recap, auth/status, and the
// /api/stream range request (206 + Content-Range) — core to audio streaming.
// Pattern mirrors httpRoutes.test.ts: real temp SQLite DB, real Request objects,
// direct route-handler calls.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-routes-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";

// A fake "music dir" so /api/stream can resolve a real file. The route checks
// the extension + content, so we write bytes with a .mp3 name; the route serves
// raw bytes regardless of the ID3 header (it's a byte range, not a decode).
const musicDir = path.join(tmp, "music");
fs.mkdirSync(musicDir, { recursive: true });
const trackBytes = Buffer.alloc(4096, 0xab); // deterministic filler
fs.writeFileSync(path.join(musicDir, "test.mp3"), trackBytes);
process.env.AURALIS_MUSIC_DIR = musicDir;

process.on("exit", () => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

const BASE = "http://localhost:4237";

async function mods() {
  const { getDb } = await import("../src/server/db");
  const { createUser, createSessionToken } = await import("../src/server/auth");
  return { db: getDb(), createUser, createSessionToken };
}

test("GET /api/auth/status reports unauthenticated without a session", async () => {
  const { GET } = await import("../src/app/api/auth/status/route");
  const res = await GET(new Request(`${BASE}/api/auth/status`));
  const body = await res.json();
  assert.equal(body.authenticated, false);
  assert.equal(body.username, null);
  assert.equal(body.token, null);
});

test("GET /api/auth/status reveals the account + re-issues a token when authed", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("statususer", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/auth/status/route");
  const res = await GET(new Request(`${BASE}/api/auth/status`, { headers: { authorization: `Bearer ${token}` } }));
  const body = await res.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.username, "statususer");
  assert.equal(typeof body.token, "string");
});

test("GET /api/library rejects without auth (401)", async () => {
  const { GET } = await import("../src/app/api/library/route");
  const res = await GET(new Request(`${BASE}/api/library`));
  assert.equal(res.status, 401);
});

test("GET /api/library serves the snapshot with an ETag when authed", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("libuser", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/library/route");
  const res = await GET(new Request(`${BASE}/api/library`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const etag = res.headers.get("etag");
  assert.ok(etag, "library response must carry an ETag");
  const body = await res.json();
  assert.ok(Array.isArray(body.tracks));
  assert.equal(body.source, "filesystem");
});

test("GET /api/library returns a stable ETag across calls (cacheable)", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("libuser2", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/library/route");
  const first = await GET(new Request(`${BASE}/api/library`, { headers: { authorization: `Bearer ${token}` } }));
  const etag1 = first.headers.get("etag");
  const second = await GET(new Request(`${BASE}/api/library`, { headers: { authorization: `Bearer ${token}` } }));
  const etag2 = second.headers.get("etag");
  // The ETag is a library fingerprint; without a rescan it must be stable so a
  // client can use If-None-Match. (We don't assert 304 directly because a
  // scanning state intentionally bypasses the conditional path.)
  assert.equal(etag1, etag2);
  assert.ok(etag1);
});

test("GET /api/search returns a result shape", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("searchuser", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/search/route");
  const res = await GET(new Request(`${BASE}/api/search?q=anything`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  // An empty library still returns the shape, just with empty arrays.
  assert.ok(body.tracks === undefined || Array.isArray(body.tracks));
});

test("GET /api/recommend returns the forYou mix for an authed user", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("recouser", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/recommend/route");
  const res = await GET(new Request(`${BASE}/api/recommend`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  // The engine degrades gracefully on an empty library; forYou is always an array.
  assert.ok(Array.isArray(body.forYou));
});

test("GET /api/recap returns the months list for an authed user", async () => {
  const { db, createUser, createSessionToken } = await mods();
  db.exec("DELETE FROM users;");
  const created = await createUser("recapuser", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const { GET } = await import("../src/app/api/recap/route");
  const res = await GET(new Request(`${BASE}/api/recap`, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.months));
});

test("GET /api/stream returns 206 with a Content-Range for a byte-range request", async () => {
  const { getDb } = await import("../src/server/db");
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { GET } = await import("../src/app/api/stream/[...path]/route");
  // The route needs a valid session to serve the file.
  getDb().exec("DELETE FROM users;");
  const created = await createUser("streamuser", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const res = await GET(
    new NextRequest(`${BASE}/api/stream/test.mp3`, {
      headers: { authorization: `Bearer ${token}`, range: "bytes=0-1023" },
    }),
    { params: Promise.resolve({ path: ["test.mp3"] }) },
  );
  assert.equal(res.status, 206);
  const cr = res.headers.get("content-range");
  assert.ok(cr && cr.startsWith("bytes 0-1023/"), `unexpected content-range: ${cr ?? "missing"}`);
  const accept = res.headers.get("accept-ranges");
  assert.equal(accept, "bytes");
});

test("GET /api/stream serves the full file with 200 when no Range is sent", async () => {
  const { getDb } = await import("../src/server/db");
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { GET } = await import("../src/app/api/stream/[...path]/route");
  getDb().exec("DELETE FROM users;");
  const created = await createUser("streamuser2", "correct-horse-battery-staple", false);
  const token = createSessionToken(created.id ?? 0);
  const res = await GET(
    new NextRequest(`${BASE}/api/stream/test.mp3`, { headers: { authorization: `Bearer ${token}` } }),
    { params: Promise.resolve({ path: ["test.mp3"] }) },
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  const body = await res.arrayBuffer();
  assert.equal(body.byteLength, 4096);
});
