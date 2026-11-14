import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-online-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_MUSIC_DIR = path.join(tmp, "empty-music");
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

const REGISTER_URL = "http://localhost:4237/api/online/register";
const STREAM_URL = "http://localhost:4237/api/online/stream/jNQXAC9IVRw";

test("parseOnlineMeta cleans YouTube brackets and splits Artist - Title", async () => {
  const { parseOnlineMeta, isValidVideoId, onlineTrackhash, onlineFilepath } = await import("../src/server/library/online");
  assert.deepEqual(parseOnlineMeta("Daft Punk - Get Lucky (Official Audio)", "DaftPunkVEVO"), {
    artist: "Daft Punk",
    title: "Get Lucky",
  });
  assert.deepEqual(parseOnlineMeta("Midnight City (Official Video)", "M83 - Topic"), {
    artist: "M83",
    title: "Midnight City",
  });
  assert.equal(isValidVideoId("jNQXAC9IVRw"), true);
  assert.equal(isValidVideoId("../etc/passwd"), false);
  assert.equal(onlineTrackhash("jNQXAC9IVRw"), "yt:jNQXAC9IVRw");
  assert.equal(onlineFilepath("jNQXAC9IVRw"), "yt://jNQXAC9IVRw");
});

test("registering an online track surfaces it in snapshot and search with 0 audio files on disk", async () => {
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { POST } = await import("../src/app/api/online/register/route");
  const { getSnapshot, search } = await import("../src/server/library/repository");

  const anon = await POST(
    new Request(REGISTER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "jNQXAC9IVRw", title: "Daft Punk - One More Time" }),
    }),
  );
  assert.equal(anon.status, 401);

  const user = await createUser("streamer", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);

  const bad = await POST(
    new Request(REGISTER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ videoId: "../../bad", title: "Oops" }),
    }),
  );
  assert.equal(bad.status, 400);

  const res = await POST(
    new Request(REGISTER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        videoId: "jNQXAC9IVRw",
        title: "Daft Punk - One More Time (Official Audio)",
        duration: 320,
      }),
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; track: { trackhash: string; filepath: string; title: string; artist: string; isOnline: boolean } };
  assert.equal(body.ok, true);
  assert.equal(body.track.trackhash, "yt:jNQXAC9IVRw");
  assert.equal(body.track.filepath, "yt://jNQXAC9IVRw");
  assert.equal(body.track.title, "One More Time");
  assert.equal(body.track.artist, "Daft Punk");
  assert.equal(body.track.isOnline, true);

  const snap = getSnapshot();
  assert.equal(snap.error, null);
  assert.ok(snap.tracks.some((t) => t.trackhash === "yt:jNQXAC9IVRw"));
  assert.equal(snap.folders[0]?.trackcount ?? 0, 0, "virtual online tracks must not pollute local folders");

  const found = search("One More Time", 10);
  assert.ok(found.tracks.some((t) => t.trackhash === "yt:jNQXAC9IVRw"));
});

test("GET /api/online/stream/[videoId] enforces auth and rejects invalid videoId", async () => {
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { GET } = await import("../src/app/api/online/stream/[videoId]/route");

  const anon = await GET(new Request(STREAM_URL) as never, { params: Promise.resolve({ videoId: "jNQXAC9IVRw" }) });
  assert.equal(anon.status, 401);

  const user = await createUser("streamauth", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);

  const bad = await GET(
    new Request("http://localhost:4237/api/online/stream/bad$id", {
      headers: { authorization: `Bearer ${token}` },
    }) as never,
    { params: Promise.resolve({ videoId: "bad$id" }) },
  );
  assert.equal(bad.status, 400);
});

test("GET /api/lyrics/[trackhash] accepts metadata for virtual yt: tracks", async () => {
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { GET } = await import("../src/app/api/lyrics/[trackhash]/route");

  const user = await createUser("lyricsonline", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);

  const res = await GET(
    new Request("http://localhost:4237/api/lyrics/yt%3AdQw4w9WgXcQ?title=Never+Gonna+Give+You+Up&artist=Rick+Astley&duration=213", {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ trackhash: "yt:dQw4w9WgXcQ" }) },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { trackhash: string; status: string };
  assert.equal(body.trackhash, "yt:dQw4w9WgXcQ");
  assert.equal(body.status, "notfound");
});
