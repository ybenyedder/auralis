// Second SOTA test battery: covers the paths the first one didn't — dense-vector
// math + blob round-trip, embedding-decode robustness, MMR edge cases, cluster
// determinism, graph kinship via decade/genre, the probabilistic Markov, and two
// end-to-end engine behaviours (UCB exploration + lyric dissonance) plus the
// lyric-sentiment background pass writing to the DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-sota2-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

import type { FeatureVector } from "../src/lib/auralis/reco";
import { cosine, normalize, softmax, packFloat32, unpackFloat32, weightedMean } from "../src/lib/auralis/vector";
import { decodeEmbedding, deepCentroid, deepAffinity, parseStems } from "../src/server/reco/embedding";
import { fitTasteClusters } from "../src/server/reco/clusters";
import { buildSession, type SessionEvent } from "../src/server/reco/session";
import { mmrRerank } from "../src/server/reco/diversity";
import { buildGraphAffinity } from "../src/server/reco/graph";

const fv = (arousal: number, valence: number, energy = arousal, tempo = arousal): FeatureVector => ({ arousal, valence, energy, tempo });

// ---------------------------------------------------------------------------
// Dense-vector math + float32 blob round-trip.
// ---------------------------------------------------------------------------
test("vector: cosine, normalize, softmax and float32 round-trip", () => {
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9, "identical → 1");
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9, "orthogonal → 0");
  assert.equal(cosine([1, 2, 3], [1, 2]), 0, "length mismatch → 0 (defensive)");
  assert.equal(cosine([0, 0], [1, 1]), 0, "zero vector → 0");

  const u = normalize([3, 4]); // → unit length
  assert.ok(Math.abs(Math.hypot(u[0], u[1]) - 1) < 1e-9, "normalised to unit length");

  const p = softmax([1, 1, 1]);
  assert.ok(Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-9, "softmax sums to 1");
  assert.ok(Math.abs(p[0] - 1 / 3) < 1e-9, "equal logits → uniform");

  const orig = [0.5, -0.25, 1.5, 0];
  const round = unpackFloat32(packFloat32(orig));
  assert.ok(round && round.length === 4, "round-trips length");
  for (let i = 0; i < orig.length; i++) assert.ok(Math.abs((round as number[])[i] - orig[i]) < 1e-6, "value preserved");

  const mean = weightedMean([[0, 0], [10, 10]], [1, 3]); // weighted toward the second
  assert.deepEqual(mean, [7.5, 7.5]);
});

// ---------------------------------------------------------------------------
// Embedding-decode robustness (bad data must never crash the scorer).
// ---------------------------------------------------------------------------
test("embedding: decode/centroid/affinity degrade safely on missing or malformed data", () => {
  assert.equal(unpackFloat32(Buffer.from([1, 2, 3])), null, "non-multiple-of-4 length → null");
  assert.equal(unpackFloat32(Buffer.alloc(0)), null, "empty → null");
  assert.equal(decodeEmbedding(null), null, "null blob → null");
  assert.equal(decodeEmbedding(Buffer.from([9])), null, "malformed blob → null");

  // Fewer than two positive tracks with embeddings → no trustworthy centroid.
  const deepById = new Map<string, number[] | null>([["a", [1, 0]], ["b", null]]);
  assert.equal(deepCentroid(new Map([["a", 1], ["b", 1]]), deepById), null, "one deep seed is not enough");
  const ctr = deepCentroid(new Map([["a", 1], ["c", 1]]), new Map([["a", [1, 0]], ["c", [0.9, 0.1]]]));
  assert.ok(ctr, "two deep seeds → a centroid");

  assert.equal(deepAffinity(null, [1, 0]), 0, "missing candidate → 0");
  assert.equal(deepAffinity([1, 0], null), 0, "missing centroid → 0");
  assert.ok(deepAffinity([1, 0], normalize([1, 0])) > 0.99, "aligned → ~1");

  assert.equal(parseStems("not json"), null, "bad JSON → null");
  const st = parseStems(JSON.stringify({ vocals: 0.4, bass: 2, drums: -1, other: 0.3 }));
  assert.deepEqual(st, { vocals: 0.4, bass: 1, drums: 0, other: 0.3 }, "clamped to 0..1");
});

// ---------------------------------------------------------------------------
// MMR edge cases.
// ---------------------------------------------------------------------------
test("diversity: MMR is a no-op at lambda=1 and for tiny sets", () => {
  const items = [
    { trackhash: "a", score: 1 },
    { trackhash: "b", score: 0.9 },
    { trackhash: "c", score: 0.8 },
    { trackhash: "d", score: 0.7 },
  ];
  const sim = () => 0.9;
  const pure = mmrRerank(items, sim, 1, 4); // lambda=1 → pure relevance order
  assert.deepEqual(pure.map((i) => i.trackhash), ["a", "b", "c", "d"]);
  const tiny = mmrRerank(items.slice(0, 2), sim, 0.5, 2);
  assert.deepEqual(tiny.map((i) => i.trackhash), ["a", "b"], "≤2 items unchanged");
});

// ---------------------------------------------------------------------------
// Cluster determinism (required for stable recs + the per-user memo).
// ---------------------------------------------------------------------------
test("clusters: identical input yields identical clusters (deterministic seeding)", () => {
  const pts = [fv(0.1, 0.6), fv(0.12, 0.62), fv(0.15, 0.58), fv(0.9, 0.4), fv(0.88, 0.42), fv(0.92, 0.38)].map((vec) => ({ vec, weight: 1 }));
  const a = fitTasteClusters(pts);
  const b = fitTasteClusters(pts.map((p) => ({ ...p })));
  assert.equal(a.length, b.length, "same cluster count");
  const key = (c: typeof a) => c.map((x) => `${x.centroid.arousal.toFixed(4)},${x.centroid.valence.toFixed(4)}`).sort().join("|");
  assert.equal(key(a), key(b), "same centroids run-to-run");
});

// ---------------------------------------------------------------------------
// Markov transitions are a proper conditional probability, not a raw count.
// ---------------------------------------------------------------------------
test("session: transition affinity favours the MORE frequent continuation", () => {
  const feat = new Map<string, FeatureVector | null>([["x", fv(0.5, 0.5)], ["y", fv(0.5, 0.5)], ["w", fv(0.5, 0.5)]]);
  const t0 = 3_000_000;
  const gap = 120_000; // within the 30-min session window
  // x→y three times, x→w once.
  const seq = ["x", "y", "x", "y", "x", "y", "x", "w"];
  const events: SessionEvent[] = seq.map((h, i) => ({ trackhash: h, played_at: t0 + i * gap, kind: "complete" }));
  const model = buildSession(events, feat, t0 + seq.length * gap);
  assert.ok(model.transitionAffinity("y") > model.transitionAffinity("w"), "the frequent continuation wins");
});

// ---------------------------------------------------------------------------
// Graph kinship also flows through decade and genre nodes.
// ---------------------------------------------------------------------------
test("graph: shared decade and genre create kinship, degree-normalised", () => {
  const tracks = [
    { trackhash: "liked", artisthash: "A", genre: "shoegaze", year: 1994, mood: "melancholy" },
    { trackhash: "sameDecadeGenre", artisthash: "B", genre: "shoegaze", year: 1996, mood: "chill" },
    { trackhash: "otherEra", artisthash: "C", genre: "trap", year: 2021, mood: "party" },
  ];
  const aff = buildGraphAffinity(tracks, new Map([["liked", 1]]));
  assert.ok((aff.get("sameDecadeGenre") ?? 0) > (aff.get("otherEra") ?? 0), "same era+genre is closer kin");
  assert.equal(aff.get("otherEra") ?? 0, 0, "nothing shared → no lift");
});

// ---------------------------------------------------------------------------
// End-to-end engine + background pass (real temporary SQLite DB).
// ---------------------------------------------------------------------------
async function mods() {
  const db = (await import("../src/server/db")).getDb();
  const engine = await import("../src/server/reco/engine");
  const userState = await import("../src/server/state/userState");
  const lyrics = await import("../src/server/reco/lyricsSentiment");
  return { db, ...engine, ...userState, ...lyrics };
}
type Opts = { mood?: string; energy?: number; bpm?: number; artisthash?: string; lyricValence?: number };
function addTrack(db: import("better-sqlite3").Database, hash: string, o: Opts = {}) {
  db.prepare(
    "INSERT OR REPLACE INTO tracks (trackhash, filepath, title, duration, mood, energy, bpm, artisthash, artist, albumartist, lyric_valence, lyric_coverage, lyrics_sentiment_at, analyzed_at) VALUES (?, ?, ?, 200, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
  ).run(hash, `/m/${hash}.mp3`, hash, o.mood ?? null, o.energy ?? null, o.bpm ?? null, o.artisthash ?? hash, hash, hash,
    o.lyricValence ?? null, o.lyricValence != null ? 0.8 : null, o.lyricValence != null ? 1 : 0);
}
const rankOf = (list: { trackhash: string }[], h: string) => list.findIndex((r) => r.trackhash === h);

test("engine: UCB exploration surfaces an unheard track above an over-played one", async () => {
  const { db, invalidateReco, recommend } = await mods();
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM favorites; DELETE FROM dislikes; DELETE FROM tracks;");
  addTrack(db, "fresh", { mood: "chill", energy: 0.3, bpm: 80 });
  addTrack(db, "overplayed", { mood: "chill", energy: 0.3, bpm: 80 });
  // Same audio, no taste signal — but "overplayed" has a high play count with NO
  // recent timestamp (so it's familiarity/UCB, not fatigue, doing the work).
  db.prepare("INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (1, 'overplayed', 25, 0)").run();
  invalidateReco(1);
  const { forYou } = recommend(1, 50);
  assert.ok(rankOf(forYou, "fresh") < rankOf(forYou, "overplayed"), "the under-sampled track carries more exploration value");
});

test("engine: dissonance taste lifts a happy-sound/sad-words track for a listener who likes that tension", async () => {
  const { db, setFavorite, invalidateReco, recommend } = await mods();
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM favorites; DELETE FROM dislikes; DELETE FROM tracks;");
  // The user favourites two DISSONANT tracks: bright audio (happy) but bleak lyrics.
  addTrack(db, "favD1", { mood: "happy", energy: 0.6, bpm: 110, lyricValence: 0.1 });
  addTrack(db, "favD2", { mood: "happy", energy: 0.6, bpm: 110, lyricValence: 0.12 });
  // Two unheard tracks with IDENTICAL bright audio — one dissonant, one congruent.
  addTrack(db, "dissonant", { mood: "happy", energy: 0.6, bpm: 110, lyricValence: 0.1 });
  addTrack(db, "congruent", { mood: "happy", energy: 0.6, bpm: 110, lyricValence: 0.85 });
  setFavorite(1, "favD1", true);
  setFavorite(1, "favD2", true);
  invalidateReco(1);
  const { forYou } = recommend(1, 50);
  assert.ok(rankOf(forYou, "dissonant") < rankOf(forYou, "congruent"), "the matching sound/lyric tension is preferred");
});

test("lyricsSentiment pass: scores stored lyrics and stamps the work marker", async () => {
  const { db, runLyricsSentiment } = await mods();
  db.exec("DELETE FROM tracks; DELETE FROM lyrics;");
  addTrack(db, "bright", { mood: "happy" });
  addTrack(db, "bleak", { mood: "melancholy" });
  // Reset the sentiment marker set by addTrack (it stamps 1 when lyricValence given;
  // here we provide none, so both are 0 = pending) and attach lyrics rows.
  db.prepare("UPDATE tracks SET lyrics_sentiment_at = 0").run();
  db.prepare("INSERT OR REPLACE INTO lyrics (trackhash, plain, status) VALUES ('bright', 'love sunshine happy smile so free', 'available')").run();
  // A synced LRC (with timestamps) must be stripped before scoring.
  db.prepare("INSERT OR REPLACE INTO lyrics (trackhash, synced, status) VALUES ('bleak', '[00:01.00]alone in the dark\\n[00:05.00]pain and death I cry', 'available')").run();

  await runLyricsSentiment();

  const bright = db.prepare("SELECT lyric_valence, lyric_coverage, lyrics_sentiment_at FROM tracks WHERE trackhash = 'bright'").get() as { lyric_valence: number; lyric_coverage: number; lyrics_sentiment_at: number };
  const bleak = db.prepare("SELECT lyric_valence, lyrics_sentiment_at FROM tracks WHERE trackhash = 'bleak'").get() as { lyric_valence: number; lyrics_sentiment_at: number };
  assert.ok(bright.lyrics_sentiment_at > 0, "work marker stamped");
  assert.ok(bright.lyric_coverage > 0, "coverage recorded");
  assert.ok(bright.lyric_valence > 0.6, "bright lyric scored positive");
  assert.ok(bleak.lyric_valence < 0.4, "bleak (LRC-stripped) lyric scored negative");
});
