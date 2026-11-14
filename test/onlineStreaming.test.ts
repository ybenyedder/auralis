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
  const { identifyTikTokAudio, isTikTokUrl, extractTikTokMusicId, TikTokError } = await import("../src/server/library/tiktok");

  assert.equal(isTikTokUrl("https://vm.tiktok.com/ZMeTest/"), true);
  assert.equal(isTikTokUrl("https://www.tiktok.com/@user/video/7106594312292453675"), true);
  assert.equal(isTikTokUrl("https://www.tiktok.com/music/original-sound-7642449097114290977"), true);
  assert.equal(isTikTokUrl("https://evil.example.com/video/123"), false);
  assert.equal(extractTikTokMusicId("https://www.tiktok.com/music/original-sound-7642449097114290977"), "7642449097114290977");
  assert.equal(extractTikTokMusicId("https://www.tiktok.com/music/Song-Name-123456789012345?share_music_id=123456789012345"), "123456789012345");
  assert.equal(extractTikTokMusicId("https://www.tiktok.com/@user/video/7106594312292453675"), null);

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

  // Licensed non-original TikTok metadata skips Shazam so pitched/edited audio
  // cannot be mis-attributed to a hardtek/slowed bootleg
  const { pickBestTikTokStreamHit } = await import("../src/server/library/tiktok");
  let shazamCalledForOfficial = false;
  const officialMeta = await identifyTikTokAudio("https://www.tiktok.com/@a/video/456", {
    fetchMeta: async () => ({
      audioUrl: "https://cdn.example.com/audio.mp3",
      musicTitle: "Sanechka",
      musicAuthor: "DJ Artist",
      album: "",
      original: false,
      duration: 24,
      cover: null,
    }),
    fetchAudio: async () => {
      shazamCalledForOfficial = true;
      return Buffer.from("fake-mp3");
    },
    recognize: async () => {
      shazamCalledForOfficial = true;
      return [{ title: "Sanechka hardtekk (Slowed)", artists: ["Bootleg"], album: null, score: 1, source: "shazam" }];
    },
  });
  assert.equal(shazamCalledForOfficial, false);
  assert.equal(officialMeta.title, "Sanechka");
  assert.equal(officialMeta.source, "tiktok-meta");

  // Stream hit selector avoids hardtek/slowed bootlegs in favour of the original track
  const chosenOriginal = pickBestTikTokStreamHit(
    [
      { title: "Sanechka hardtekk (Rampage, Slowed)", artist: "Anhenfil", uploader: "BootlegChannel" },
      { title: "Sanechka", artist: "DJ Artist", uploader: "DJ Artist - Topic" },
    ],
    { title: "Sanechka", artist: "DJ Artist" },
  );
  assert.equal(chosenOriginal?.title, "Sanechka");

  // Word-boundary check must NOT penalise normal words containing "live" or "cover"
  const chosenAlive = pickBestTikTokStreamHit(
    [
      { title: "Stay Alive (Hardtek Remix)", artist: "RandomDJ", uploader: "RandomDJ" },
      { title: "Stay Alive", artist: "Jose Gonzalez", uploader: "Jose Gonzalez" },
    ],
    { title: "Stay Alive", artist: "Jose Gonzalez" },
  );
  assert.equal(chosenAlive?.title, "Stay Alive");

  // Speed/pitch sweep helpers & derivative detector
  const { isDerivativeVariantText, extractTrackFromVideoCaption } = await import("../src/server/library/tiktok");
  const { resamplePcmSpeed } = await import("../src/server/melody/shazam");
  assert.equal(isDerivativeVariantText("Sanechka hardtekk (Rampage, Slowed)"), true);
  assert.equal(isDerivativeVariantText("Stay Alive"), false);
  const resampledUp = resamplePcmSpeed(new Float32Array([0, 2, 4, 6, 8, 10]), 2);
  assert.deepEqual(Array.from(resampledUp), [0, 4, 8]);

  // Caption parser unmasks TikTok profanity censorship & strips hashtags
  const parsedCaption = extractTrackFromVideoCaption(
    "laydownrot - s*xy scene girl #songlyrics #lyrics_songs #fyp",
    "ipostlyricvidz",
  );
  assert.deepEqual(parsedCaption, { artist: "laydownrot", title: "sexy scene girl", highConfidence: true });
  assert.equal(extractTrackFromVideoCaption("#fridaythe13th #edit"), null);

  // Verified caption takes priority over a false-positive Shazam match
  let shazamInvoked = false;
  const captionVerified = await identifyTikTokAudio("https://www.tiktok.com/@ipostlyricvidz/video/123", {
    fetchMeta: async () => ({
      audioUrl: "https://cdn.example.com/audio.mp3",
      musicTitle: "original sound - ipostlyricvidz",
      musicAuthor: "ipostlyricvidz",
      album: "",
      original: true,
      duration: 15,
      cover: null,
      videoTitle: "laydownrot - s*xy scene girl #songlyrics",
      videoAuthor: "ipostlyricvidz",
    }),
    verifyCaption: async (c) => c.artist === "laydownrot" && c.title === "sexy scene girl",
    recognize: async () => {
      shazamInvoked = true;
      return [{ title: "Work That Body", artists: ["Temper"], album: null, score: 1, source: "shazam" }];
    },
  });
  assert.equal(shazamInvoked, false);
  assert.equal(captionVerified.artist, "laydownrot");
  assert.equal(captionVerified.title, "sexy scene girl");
  assert.equal(captionVerified.source, "tiktok-meta");
});

test("instantRegisterOnlineTracksBatch registers lazy placeholders immediately and resolveLazyVideoId resolves once", async () => {
  const {
    instantRegisterOnlineTracksBatch,
    isLazyVideoId,
    resolveLazyVideoId,
    getLazyResolvedVideoId,
  } = await import("../src/server/library/online");

  const reg = instantRegisterOnlineTracksBatch([
    { title: "One More Time", artist: "Daft Punk" }, // already exists with real videoId
    { title: "Starboy", artist: "The Weeknd" },
    { title: "Starboy", artist: "The Weeknd" }, // duplicate in same batch
  ]);

  assert.equal(reg.insertedAny, true);
  assert.equal(reg.entries[0]?.track?.trackhash, "yt:jNQXAC9IVRw");
  const lazyTrack = reg.entries[1]?.track;
  assert.ok(lazyTrack);
  assert.equal(reg.entries[2]?.track?.trackhash, lazyTrack.trackhash);
  assert.ok(isLazyVideoId(lazyTrack.videoId));
  assert.equal(reg.lazyToWarm.length, 1);

  let searches = 0;
  const search = async () => {
    searches += 1;
    return { videoId: "34Na4j8AVgA", title: "Starboy", artist: "The Weeknd" };
  };

  const lazyId = lazyTrack.videoId ?? "";
  assert.ok(lazyId);
  const [r1, r2] = await Promise.all([resolveLazyVideoId(lazyId, search), resolveLazyVideoId(lazyId, search)]);
  assert.equal(r1, "34Na4j8AVgA");
  assert.equal(r2, "34Na4j8AVgA");
  assert.equal(searches, 1, "concurrent lazy resolutions must deduplicate");
  assert.equal(getLazyResolvedVideoId(lazyId), "34Na4j8AVgA");
  const r3 = await resolveLazyVideoId(lazyId, search);
  assert.equal(r3, "34Na4j8AVgA");
  assert.equal(searches, 1, "cached lazy resolution must not re-search");
});
