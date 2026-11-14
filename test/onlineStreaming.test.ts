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

test("resolveOnlineTracksBatch resolves playlist entries to yt:// tracks with zero search when videoId or cached track exists", async () => {
  const { resolveOnlineTracksBatch } = await import("../src/server/library/online");
  const { matchLibraryTracks } = await import("../src/lib/auralis/playlistIO");

  const searchCalls: string[] = [];
  const res = await resolveOnlineTracksBatch(
    [
      { title: "Direct Video", artist: "Artist A", videoId: "aqz-KE-bpKQ", duration: 634 },
      { title: "One More Time", artist: "Daft Punk" }, // already registered in online_tracks from previous test
      { title: "Around the World", artist: "Daft Punk" },
    ],
    async (query) => {
      searchCalls.push(query);
      return { videoId: "dwDns8x3Jb4", title: "Around the World", artist: "Daft Punk", duration: 429 };
    },
    3,
  );

  assert.equal(res.insertedAny, true);
  assert.equal(res.entries[0]?.track?.trackhash, "yt:aqz-KE-bpKQ");
  assert.equal(res.entries[0]?.track?.filepath, "yt://aqz-KE-bpKQ");
  assert.equal(res.entries[1]?.track?.trackhash, "yt:jNQXAC9IVRw");
  assert.equal(res.entries[2]?.track?.trackhash, "yt:dwDns8x3Jb4");
  assert.deepEqual(searchCalls, ["Daft Punk Around the World"]);

  const matched = matchLibraryTracks(
    [
      { title: "Song Missing 1", artist: "Artist X", videoId: "xxxxxxxxxxx" },
      { title: "One More Time", artist: "Daft Punk" },
    ],
    res.entries[1]?.track ? [res.entries[1].track] : [],
  );
  assert.equal(matched.hashes.length, 1);
  assert.equal(matched.unmatched.length, 1);
  assert.equal(matched.unmatched[0]?.videoId, "xxxxxxxxxxx");
});

test("identifyTikTokAudio prioritizes Shazam recognition, falls back to non-original metadata, and rejects SSRF / unknown original sounds", async () => {
  const { identifyTikTokAudio, isTikTokUrl, TikTokError } = await import("../src/server/library/tiktok");

  assert.equal(isTikTokUrl("https://vm.tiktok.com/ZMeTest/"), true);
  assert.equal(isTikTokUrl("https://www.tiktok.com/@user/video/7106594312292453675"), true);
  assert.equal(isTikTokUrl("https://evil.example.com/video/123"), false);

  await assert.rejects(
    () => identifyTikTokAudio("http://127.0.0.1/video/1"),
    (e: unknown) => e instanceof TikTokError && e.status === 400,
  );

  // Shazam finds the real track even when TikTok label is "son original"
  const shazamHit = await identifyTikTokAudio("https://vm.tiktok.com/ZMeShazam/", {
    fetchMeta: async () => ({
      audioUrl: "https://cdn.example.com/audio.mp3",
      musicTitle: "son original - randomuser",
      musicAuthor: "randomuser",
      album: "",
      original: true,
      duration: 19,
      cover: "https://cdn.example.com/cover.jpg",
    }),
    fetchAudio: async () => Buffer.from("fake-mp3"),
    recognize: async () => [{ title: "Midnight City", artists: ["M83"], album: "Hurry Up, We're Dreaming", score: 1, source: "shazam" }],
  });
  assert.equal(shazamHit.source, "shazam");
  assert.equal(shazamHit.title, "Midnight City");
  assert.equal(shazamHit.artist, "M83");

  // Falls back to music_info when Shazam misses and metadata isn't generic original sound
  const metaFallback = await identifyTikTokAudio("https://www.tiktok.com/@a/video/123", {
    fetchMeta: async () => ({
      audioUrl: "https://cdn.example.com/audio.mp3",
      musicTitle: "Blinding Lights",
      musicAuthor: "The Weeknd",
      album: "After Hours",
      original: false,
      duration: 30,
      cover: null,
    }),
    fetchAudio: async () => Buffer.from("fake-mp3"),
    recognize: async () => [],
  });
  assert.equal(metaFallback.source, "tiktok-meta");
  assert.equal(metaFallback.title, "Blinding Lights");
  assert.equal(metaFallback.artist, "The Weeknd");

  // Generic "original sound" + Shazam miss -> clean 404
  await assert.rejects(
    () =>
      identifyTikTokAudio("https://vm.tiktok.com/ZMeUnknown/", {
        fetchMeta: async () => ({
          audioUrl: "https://cdn.example.com/audio.mp3",
          musicTitle: "original sound - user123",
          musicAuthor: "user123",
          album: "",
          original: true,
          duration: 12,
          cover: null,
        }),
        fetchAudio: async () => Buffer.from("fake-mp3"),
        recognize: async () => [],
      }),
    (e: unknown) => e instanceof TikTokError && e.status === 404,
  );
});
