// Route hardening for the "hum to search" endpoints and the download bulk
// enqueue: auth, CSRF, body validation. Same real-Request-against-real-route
// pattern as download.test.ts — no network, no ffmpeg needed.

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-melody-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

const RECOGNIZE_URL = "http://localhost:4238/api/recognize";
const MELODY_URL = "http://localhost:4238/api/library/melody";
const DOWNLOAD_URL = "http://localhost:4238/api/download";

async function mods() {
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const recognize = await import("../src/app/api/recognize/route");
  const melody = await import("../src/app/api/library/melody/route");
  const download = await import("../src/app/api/download/route");
  return { createUser, createSessionToken, recognize, melody, download };
}

test("POST /api/recognize requires authentication", async () => {
  const { recognize } = await mods();
  const res = await recognize.POST(new Request(RECOGNIZE_URL, { method: "POST", body: new Uint8Array([1, 2, 3]) }));
  assert.equal(res.status, 401);
});

test("POST /api/recognize rejects non-audio bodies", async () => {
  const { createUser, createSessionToken, recognize } = await mods();
  const user = await createUser("recmedia", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  const res = await recognize.POST(
    new Request(RECOGNIZE_URL, {
      method: "POST",
      headers: { "content-type": "text/html", authorization: `Bearer ${token}` },
      body: "<html>nope</html>",
    }),
  );
  assert.equal(res.status, 415);
});

test("POST /api/recognize rejects an empty recording", async () => {
  const { createUser, createSessionToken, recognize } = await mods();
  const user = await createUser("recempty", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  const res = await recognize.POST(
    new Request(RECOGNIZE_URL, {
      method: "POST",
      headers: { "content-type": "audio/webm", authorization: `Bearer ${token}` },
      body: new Uint8Array(0),
    }),
  );
  assert.equal(res.status, 400);
});

test("GET /api/library/melody reports index progress", async () => {
  const { createUser, createSessionToken, melody } = await mods();
  const user = await createUser("melstatus", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  const res = await melody.GET(new Request(MELODY_URL, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { running: boolean; indexed: number; total: number; ffmpeg: boolean };
  assert.equal(body.running, false);
  assert.equal(body.indexed, 0);
  assert.equal(typeof body.ffmpeg, "boolean");
});

test("POST /api/library/melody is admin-only and CSRF-guarded", async () => {
  const { createUser, createSessionToken, melody } = await mods();
  const anon = await melody.POST(new Request(MELODY_URL, { method: "POST" }));
  assert.equal(anon.status, 401);

  const user = await createUser("meluser", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  const res = await melody.POST(
    new Request(MELODY_URL, { method: "POST", headers: { authorization: `Bearer ${token}` } }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/download bulk mode validates its items", async () => {
  const { createUser, createSessionToken, download } = await mods();
  const user = await createUser("dlbatch", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);

  const empty = await download.POST(
    new Request(DOWNLOAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [] }),
    }),
  );
  assert.equal(empty.status, 400);

  const tooMany = await download.POST(
    new Request(DOWNLOAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: Array.from({ length: 201 }, () => ({ query: "some song" })) }),
    }),
  );
  assert.equal(tooMany.status, 400);

  const badId = await download.POST(
    new Request(DOWNLOAD_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: [{ query: "x", videoId: "../../etc/passwd" }] }),
    }),
  );
  assert.equal(badId.status, 400);
});
