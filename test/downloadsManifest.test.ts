// Downloads manifest + lost-download recovery + queue pacing.
//
// The manifest (`downloads` table) is the authoritative list of "titles this
// server downloaded": it survives the scanner's prune on purpose so a wiped
// downloads folder (Docker container re-created on an ephemeral /music,
// unmounted volume, storage cleaner) is re-downloaded automatically instead of
// silently lost — the "downloaded titles disappear after every update" bug.
//
// The YouTube engine and the scanner are mocked (no network, no tag parsing);
// everything else (downloader, db, migrations, filesystem) is real.

import { test, vi } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-downloads-manifest-"));
const music = path.join(tmp, "music");
fs.mkdirSync(music, { recursive: true });
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_MUSIC_DIR = music;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

// Mutable behavior for the mocked download engine — swapped per test.
const mocks = vi.hoisted(() => ({
  downloadImpl: async (opts: { outBase: string }): Promise<{ filepath: string; mime: string }> => {
    const filepath = `${opts.outBase}.mp3`;
    fs.writeFileSync(filepath, "fake-audio-bytes");
    return { filepath, mime: "audio/mpeg" };
  },
}));

vi.mock("../src/server/library/youtube", () => ({
  youtubeSearch: vi.fn(async () => []),
  downloadYouTubeAudio: (opts: { outBase: string }) => mocks.downloadImpl(opts),
}));

// Minimal scanner stand-in: index every audio file under the music root the way
// the real scanner stores them (library-relative posix filepath).
vi.mock("../src/server/library/scanner", () => ({
  runScan: async () => {
    const { getDb } = await import("../src/server/db");
    const { getConfig } = await import("../src/server/config");
    const db = getDb();
    const root = getConfig().musicDir;
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(abs);
          continue;
        }
        if (!/\.(mp3|m4a|flac|ogg|opus|wav)$/i.test(entry.name)) continue;
        const rel = path.relative(root, abs).split(path.sep).join("/");
        db.prepare(
          "INSERT OR REPLACE INTO tracks (trackhash, filepath, title, added_at) VALUES (?, ?, ?, ?)",
        ).run(`h_${rel}`, rel, entry.name, Date.now());
      }
    };
    walk(root);
    return { added: 0, updated: 0, removed: 0 };
  },
  getScanProgress: () => ({ status: "idle", processed: 0, total: 0 }),
}));

async function mods() {
  const downloader = await import("../src/server/library/downloader");
  const { getDb } = await import("../src/server/db");
  return { ...downloader, getDb };
}

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

function resetDownloadImpl(): void {
  mocks.downloadImpl = async (opts) => {
    const filepath = `${opts.outBase}.mp3`;
    fs.writeFileSync(filepath, "fake-audio-bytes");
    return { filepath, mime: "audio/mpeg" };
  };
}

// ---- downloadsDir resolution -----------------------------------------------

test("downloadsDir defaults to <musicDir>/Auralis Downloads", async () => {
  const { downloadsDir } = await mods();
  assert.equal(downloadsDir(), path.join(music, "Auralis Downloads"));
});

test("downloadsDir joins a relative AURALIS_DOWNLOADS_DIR to the music root", async () => {
  const { downloadsDir } = await mods();
  process.env.AURALIS_DOWNLOADS_DIR = "autre dossier";
  try {
    assert.equal(downloadsDir(), path.join(music, "autre dossier"));
  } finally {
    delete process.env.AURALIS_DOWNLOADS_DIR;
  }
});

test("downloadsDir honors an absolute AURALIS_DOWNLOADS_DIR inside the music root (persistent mount)", async () => {
  const { downloadsDir } = await mods();
  const abs = path.join(music, "ssd", "Auralis Downloads");
  process.env.AURALIS_DOWNLOADS_DIR = abs;
  try {
    assert.equal(downloadsDir(), abs);
  } finally {
    delete process.env.AURALIS_DOWNLOADS_DIR;
  }
});

test("downloadsDir falls back to the default when the configured dir escapes the music root", async () => {
  const { downloadsDir } = await mods();
  process.env.AURALIS_DOWNLOADS_DIR = "/tmp/outside-the-library";
  try {
    assert.equal(downloadsDir(), path.join(music, "Auralis Downloads"));
  } finally {
    delete process.env.AURALIS_DOWNLOADS_DIR;
  }
});

// ---- manifest + lost-download recovery -------------------------------------

test("a downloaded title is recorded in the manifest and restored after its file vanishes", async () => {
  const { downloadsDir, startDownloadBatch, getJob, restoreLostDownloads, listJobs, getDb } = await mods();
  resetDownloadImpl();
  const videoId = "restorE0001"; // 11 chars, [A-Za-z0-9_-]
  const present = () =>
    fs.readdirSync(downloadsDir()).some((name) => name.includes(`[${videoId}]`) && name.endsWith(".mp3"));

  const batch = startDownloadBatch({
    items: [{ query: "artist - title", videoId, title: "Artist - Title" }],
    requestedBy: "alice",
  });
  assert.equal(batch.ok, true);
  const jobId = (batch as { jobs: Array<{ id: string }> }).jobs[0].id;
  await waitFor(() => getJob(jobId)?.status === "done", "initial download to finish");

  const row = getDb()
    .prepare("SELECT video_id, filepath, trackhash, restore_count FROM downloads WHERE video_id = ?")
    .get(videoId) as { video_id: string; filepath: string; trackhash: string; restore_count: number };
  assert.ok(row, "the finished download is recorded in the manifest");
  assert.equal(row.restore_count, 0);
  assert.ok(row.filepath.includes("Auralis Downloads/"), `library-relative path stored (${row.filepath})`);
  assert.ok(fs.existsSync(path.join(music, row.filepath)), "the recorded file exists");

  // Nothing to restore while the file is there.
  assert.deepEqual(restoreLostDownloads(), { missing: 0, enqueued: 0, dropped: 0 });

  // The wipe: the file disappears (container re-created, cleaner, ...).
  fs.rmSync(path.join(music, row.filepath), { force: true });
  assert.equal(present(), false);
  const first = restoreLostDownloads();
  assert.equal(first.missing, 1);
  assert.equal(first.enqueued, 1, "the lost title is re-downloaded automatically");
  await waitFor(present, "the lost title to come back", 15000);
  await waitFor(
    () => listJobs().every((j) => j.status === "done" || j.status === "error"),
    "the queue to drain",
    15000,
  );

  const after = getDb()
    .prepare("SELECT restore_count, filepath FROM downloads WHERE video_id = ?")
    .get(videoId) as { restore_count: number; filepath: string };
  assert.equal(after.restore_count, 1, "one restore attempt was spent");
  assert.ok(fs.existsSync(path.join(music, after.filepath)), "the manifest points at the restored file");
}, 30000);

test("a title that keeps vanishing is eventually dropped (deleted on purpose)", async () => {
  const { restoreLostDownloads, listJobs, getDb } = await mods();
  // The engine never produces a file — every restore attempt fails and the
  // title stays missing, burning one budget per attempt.
  mocks.downloadImpl = async () => {
    throw new Error("engine down");
  };
  const videoId = "giveUpx0002";
  const rel = `Auralis Downloads/gone [${videoId}].mp3`;
  try {
    // A manifest row whose file is gone, exactly as recordDownload writes them.
    getDb()
      .prepare(
        "INSERT INTO downloads (video_id, title, filepath, trackhash, requested_by, created_at, restore_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(videoId, "Artist - Gone", rel, null, "bob", Date.now(), 0);

    // Three automatic attempts...
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = restoreLostDownloads();
      assert.equal(result.enqueued, 1, `attempt ${attempt} is enqueued`);
      await waitFor(
        () =>
          (getDb().prepare("SELECT restore_count FROM downloads WHERE video_id = ?").get(videoId) as { restore_count: number })
            .restore_count === attempt,
        `restore budget ${attempt} to be spent`,
      );
      // Let the (failing) job settle before the next round.
      await waitFor(
        () => listJobs().every((j) => j.status === "done" || j.status === "error"),
        "the queue to drain",
        15000,
      );
    }

    // ...then the manifest gives up and drops the title for good.
    const last = restoreLostDownloads();
    assert.equal(last.dropped, 1);
    assert.equal(last.enqueued, 0);
    const gone = getDb().prepare("SELECT video_id FROM downloads WHERE video_id = ?").get(videoId);
    assert.equal(gone, undefined, "the manifest row is dropped after the cap");
  } finally {
    resetDownloadImpl();
  }
}, 30000);

test("a deliberate user re-download resets the restore budget", async () => {
  const { startDownloadBatch, getJob, restoreLostDownloads, getDb } = await mods();
  resetDownloadImpl();
  const videoId = "freshSt0003";
  const batch = startDownloadBatch({
    items: [{ query: "x", videoId, title: "Fresh" }],
    requestedBy: "carol",
  });
  assert.equal(batch.ok, true);
  const jobId = (batch as { jobs: Array<{ id: string }> }).jobs[0].id;
  await waitFor(() => getJob(jobId)?.status === "done", "download to finish");

  // Simulate a spent budget. The file is present → nothing to restore.
  getDb().prepare("UPDATE downloads SET restore_count = 2 WHERE video_id = ?").run(videoId);
  assert.deepEqual(restoreLostDownloads(), { missing: 0, enqueued: 0, dropped: 0 });

  // An explicit re-download (a real user, not the restore engine) earns a
  // fresh budget — "I want this title back" is an intent to keep it.
  const again = startDownloadBatch({
    items: [{ query: "x", videoId, title: "Fresh" }],
    requestedBy: "carol",
  });
  assert.equal(again.ok, true);
  const againId = (again as { jobs: Array<{ id: string }> }).jobs[0].id;
  await waitFor(() => getJob(againId)?.status === "done", "re-download to finish");
  const row = getDb()
    .prepare("SELECT restore_count FROM downloads WHERE video_id = ?")
    .get(videoId) as { restore_count: number };
  assert.equal(row.restore_count, 0, "an explicit re-download earns a fresh budget");
});

// ---- queue pacing ----------------------------------------------------------

test("a batch of several downloads all run (queue no longer starves on its own depth)", async () => {
  const { startDownloadBatch, getJob } = await mods();
  resetDownloadImpl();
  const items = Array.from({ length: 5 }, (_, i) => ({
    query: `song ${i}`,
    videoId: `pacing0${String(i).padStart(4, "0")}`, // 11 chars
    title: `Song ${i}`,
  }));
  const batch = startDownloadBatch({ items, requestedBy: "dave" });
  assert.equal(batch.ok, true);
  const jobs = (batch as { jobs: Array<{ id: string }> }).jobs;
  assert.equal(jobs.length, 5);
  // Before the runningCount() fix, ≥3 enqueued jobs with 0 running deadlocked:
  // activeCount() (queue depth) instantly exceeded MAX_ACTIVE and pumpQueue
  // never started anything. Every job must now reach a terminal state.
  await waitFor(
    () => jobs.every((j) => getJob(j.id)?.status === "done"),
    "all 5 batch downloads to finish",
    20000,
  );
}, 30000);
