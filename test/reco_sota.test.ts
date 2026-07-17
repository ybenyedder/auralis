// Tests for the SOTA recommendation layers added on top of the base taste engine:
// multi-cluster content, session self-attention + Markov transitions, UCB
// exploration, MMR diversity, knowledge-graph kinship, time-of-day context, and
// lyric-sentiment dissonance. Pure modules are exercised directly; the two
// end-to-end cases run against a real temporary SQLite DB (like reco.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-sota-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

import type { FeatureVector } from "../src/lib/auralis/reco";
import { featureSimilarity } from "../src/lib/auralis/reco";
import { fitTasteClusters, clusterAffinity } from "../src/server/reco/clusters";
import { buildSession, sessionAffinity, type SessionEvent } from "../src/server/reco/session";
import { ucbBonus } from "../src/server/reco/bandit";
import { mmrRerank } from "../src/server/reco/diversity";
import { buildGraphAffinity } from "../src/server/reco/graph";
import { buildTimeCurve, timeAffinity } from "../src/server/reco/temporal";
import { lyricValence, dissonance } from "../src/lib/auralis/sentiment";

const fv = (arousal: number, valence: number, energy = arousal, tempo = arousal): FeatureVector => ({ arousal, valence, energy, tempo });

// ---------------------------------------------------------------------------
// 1. Multi-cluster content — the fix for the "split taste → tepid middle" flaw.
// ---------------------------------------------------------------------------
test("clusters: split tastes form two pockets; a near-pocket track beats the tepid middle", () => {
  // Three calm points + three furious points — a bimodal taste.
  const calm = [fv(0.15, 0.6, 0.15, 0.05), fv(0.18, 0.58, 0.18, 0.08), fv(0.2, 0.62, 0.2, 0.06)];
  const loud = [fv(0.9, 0.42, 0.9, 0.9), fv(0.88, 0.4, 0.88, 0.85), fv(0.92, 0.45, 0.92, 0.95)];
  const points = [...calm, ...loud].map((vec) => ({ vec, weight: 1 }));

  const clusters = fitTasteClusters(points);
  assert.ok(clusters.length >= 2, "two distinct taste pockets are found");

  const nearLoud = fv(0.87, 0.43, 0.87, 0.88); // sits inside the "loud" pocket
  const middle = fv(0.5, 0.5, 0.5, 0.5); // the tepid centre a single centroid loves

  assert.ok(
    clusterAffinity(nearLoud, clusters) > clusterAffinity(middle, clusters),
    "a track near a real pocket outranks the lukewarm middle",
  );

  // Demonstrate the flaw the clusters fix: a SINGLE centroid (the mean of all
  // points) sits in the middle, so it would rate the tepid track ABOVE the pocket
  // track — exactly the failure mode we designed clusters to avoid.
  const single: FeatureVector = {
    arousal: points.reduce((s, p) => s + p.vec.arousal, 0) / points.length,
    valence: points.reduce((s, p) => s + p.vec.valence, 0) / points.length,
    energy: points.reduce((s, p) => s + p.vec.energy, 0) / points.length,
    tempo: points.reduce((s, p) => s + p.vec.tempo, 0) / points.length,
  };
  assert.ok(
    featureSimilarity(middle, single) > featureSimilarity(nearLoud, single),
    "single-centroid WOULD have preferred the middle (the bug clusters resolve)",
  );
});

test("clusters: a single coherent taste collapses to one pocket (base behaviour preserved)", () => {
  const pts = [fv(0.8, 0.8), fv(0.82, 0.78)].map((vec) => ({ vec, weight: 1 }));
  const clusters = fitTasteClusters(pts);
  assert.equal(clusters.length, 1, "too little/coherent evidence → one centroid");
});

// ---------------------------------------------------------------------------
// 2. Session: self-attention context + Markov transitions.
// ---------------------------------------------------------------------------
test("session: self-attention keeps the vibe despite a one-off anomaly", () => {
  const feat = new Map<string, FeatureVector | null>([
    ["hi", fv(0.9, 0.5)],
    ["lo", fv(0.1, 0.5)],
  ]);
  const t0 = 1_000_000;
  // Ordered by time; the newest (query) is high-energy, with an older low anomaly.
  const events: SessionEvent[] = [
    { trackhash: "lo", played_at: t0, kind: "complete" },
    { trackhash: "hi", played_at: t0 + 60_000, kind: "complete" },
    { trackhash: "hi", played_at: t0 + 120_000, kind: "complete" },
    { trackhash: "hi", played_at: t0 + 180_000, kind: "complete" },
  ];
  const model = buildSession(events, feat, t0 + 181_000);
  assert.equal(model.lastHash, "hi");
  assert.ok(model.contextVec, "a session context is summarised");
  const plainMean = (0.1 + 0.9 * 3) / 4; // 0.7 — what a naive average would give
  assert.ok(
    (model.contextVec?.arousal ?? 0) > plainMean,
    "attention down-weights the dissimilar anomaly, so context stays high-energy",
  );
  // A high-energy candidate continues the session better than a low-energy one.
  assert.ok(sessionAffinity(fv(0.9, 0.5), model) > sessionAffinity(fv(0.1, 0.5), model));
});

test("session: Markov transitions learn what follows what", () => {
  const feat = new Map<string, FeatureVector | null>([
    ["a", fv(0.5, 0.5)],
    ["b", fv(0.6, 0.5)],
  ]);
  const t0 = 2_000_000;
  // a→b repeatedly, within one session window.
  const events: SessionEvent[] = [
    { trackhash: "a", played_at: t0, kind: "complete" },
    { trackhash: "b", played_at: t0 + 60_000, kind: "complete" },
    { trackhash: "a", played_at: t0 + 120_000, kind: "complete" },
    { trackhash: "b", played_at: t0 + 180_000, kind: "complete" },
  ];
  const model = buildSession(events, feat, t0 + 181_000);
  assert.ok(model.transitionAffinity("b") > 0, "b is a learned continuation of the recent tracks");
  assert.ok(model.transitionAffinity("unseen") === 0, "an unseen track has no transition signal");
});

// ---------------------------------------------------------------------------
// 3. UCB exploration.
// ---------------------------------------------------------------------------
test("bandit: UCB lifts under-sampled tracks and decays as they're heard, bounded", () => {
  const fresh = ucbBonus(0, 100);
  const seen = ucbBonus(20, 100);
  assert.ok(fresh > seen, "an unheard arm carries more uncertainty than a well-sampled one");
  assert.ok(fresh <= 0.28 * 1.3 + 1e-9, "the bonus is capped so it can't override taste");
  assert.ok(seen > 0, "even a sampled arm keeps a little optimism");
});

// ---------------------------------------------------------------------------
// 4. MMR diversity.
// ---------------------------------------------------------------------------
test("diversity: MMR promotes a novel track above a near-duplicate", () => {
  const items = [
    { trackhash: "dupA", score: 1.0 },
    { trackhash: "dupB", score: 0.95 },
    { trackhash: "diverse", score: 0.9 },
  ];
  const sim = (a: string, b: string): number => {
    const pair = new Set([a, b]);
    if (pair.has("dupA") && pair.has("dupB")) return 0.95; // the two near-duplicates
    return 0.1; // everything else is dissimilar
  };
  const ranked = mmrRerank(items, sim, 0.5, 3, 10);
  assert.equal(ranked[0].trackhash, "dupA", "the top pick stays");
  assert.equal(ranked[1].trackhash, "diverse", "the novel track is promoted over the near-duplicate");
});

// ---------------------------------------------------------------------------
// 5. Knowledge-graph kinship (the collaborative/GNN-equivalent).
// ---------------------------------------------------------------------------
test("graph: same-artist kinship beats same-mood, both beat unrelated", () => {
  const tracks = [
    { trackhash: "liked", artisthash: "X", genre: null, year: null, mood: "energetic" },
    { trackhash: "sameArtist", artisthash: "X", genre: null, year: null, mood: "chill" }, // audio far, culturally near
    { trackhash: "sameMood", artisthash: "Q", genre: null, year: null, mood: "energetic" },
    { trackhash: "unrelated", artisthash: "Z", genre: null, year: null, mood: "chill" },
  ];
  const aff = buildGraphAffinity(tracks, new Map([["liked", 1]]));
  const g = (h: string) => aff.get(h) ?? 0;
  assert.ok(g("sameArtist") > g("sameMood"), "sharing the artist is stronger kinship than sharing a mood");
  assert.ok(g("sameMood") > g("unrelated"), "a shared mood still beats no connection at all");
  assert.equal(g("unrelated"), 0, "a track sharing nothing with your taste gets no graph lift");
});

// ---------------------------------------------------------------------------
// 6. Time-of-day context.
// ---------------------------------------------------------------------------
test("temporal: the current hour's learned vibe is favoured", () => {
  const feat = new Map<string, FeatureVector | null>([
    ["hype", fv(0.9, 0.6)],
    ["calm", fv(0.15, 0.5)],
  ]);
  const now = Date.now();
  // Enough completed listens of the hype vibe THIS hour to trust the bucket.
  const events = Array.from({ length: 5 }, (_, i) => ({ trackhash: "hype", played_at: now - i * 1000, kind: "complete" }));
  const curve = buildTimeCurve(events, feat);
  assert.ok(
    timeAffinity(fv(0.9, 0.6), curve, now) > timeAffinity(fv(0.15, 0.5), curve, now),
    "a track matching the hour's historical vibe scores above a mismatched one",
  );
});

// ---------------------------------------------------------------------------
// 7. Lyric sentiment + cognitive dissonance.
// ---------------------------------------------------------------------------
test("sentiment: polarity, negation, and the dissonance sign", () => {
  assert.ok(lyricValence("I love the sunshine so happy and free").valence > 0.6, "bright lyric reads positive");
  assert.ok(lyricValence("alone in the dark pain and death I cry").valence < 0.4, "bleak lyric reads negative");
  assert.ok(
    lyricValence("not happy not good").polarity < lyricValence("happy good").polarity,
    "negation flips polarity",
  );
  assert.equal(lyricValence("").coverage, 0, "empty lyric carries no signal");
  // Bright SOUND (valence .9) over dark WORDS (valence .1) → positive dissonance.
  assert.ok(dissonance(0.9, { valence: 0.1, coverage: 1 }) > 0, "happy sound / sad words → positive dissonance");
  assert.ok(dissonance(0.2, { valence: 0.9, coverage: 1 }) < 0, "sombre sound / hopeful words → negative dissonance");
});

// ---------------------------------------------------------------------------
// 8. End-to-end: the graph lifts a culturally-adjacent track the audio misses.
// ---------------------------------------------------------------------------
async function mods() {
  const db = (await import("../src/server/db")).getDb();
  const engine = await import("../src/server/reco/engine");
  const userState = await import("../src/server/state/userState");
  return { db, ...engine, ...userState };
}
function addTrack(db: import("better-sqlite3").Database, hash: string, o: { mood?: string; energy?: number; bpm?: number; artisthash?: string } = {}) {
  db.prepare(
    "INSERT OR REPLACE INTO tracks (trackhash, filepath, title, duration, mood, energy, bpm, artisthash, artist, albumartist, analyzed_at) VALUES (?, ?, ?, 200, ?, ?, ?, ?, ?, ?, 1)",
  ).run(hash, `/m/${hash}.mp3`, hash, o.mood ?? null, o.energy ?? null, o.bpm ?? null, o.artisthash ?? hash, hash, hash);
}

test("engine: deep timbre embeddings rank a same-texture track above a same-audio-but-different-timbre one", async () => {
  const { db, setFavorite, invalidateReco, recommend } = await mods();
  const { packFloat32 } = await import("../src/lib/auralis/vector");
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM favorites; DELETE FROM dislikes; DELETE FROM tracks;");
  // Every track shares identical 4-D audio (mood/energy/bpm) so ONLY the deep
  // embedding can separate them — isolating the timbre path.
  const setEmb = (hash: string, vec: number[]) =>
    db.prepare("UPDATE tracks SET embedding = ?, embedded_at = 1 WHERE trackhash = ?").run(packFloat32(vec), hash);
  for (const h of ["liked1", "liked2", "sameTimbre", "diffTimbre"]) addTrack(db, h, { mood: "energetic", energy: 0.8, bpm: 130 });
  setEmb("liked1", [1, 0.1, 0, 0]);
  setEmb("liked2", [0.95, 0.15, 0.05, 0]); // the liked timbre centroid ≈ [~1, small, …]
  setEmb("sameTimbre", [0.98, 0.12, 0.02, 0]); // same corner of embedding space
  setEmb("diffTimbre", [0, 0.1, 1, 0]); // orthogonal timbre
  setFavorite(1, "liked1", true);
  setFavorite(1, "liked2", true);
  invalidateReco(1);
  const { forYou } = recommend(1, 50);
  const rank = (h: string) => forYou.findIndex((r) => r.trackhash === h);
  assert.ok(rank("sameTimbre") < rank("diffTimbre"), "the matching-timbre track wins on the deep embedding term");
});

test("engine: a same-artist track the audio places far still surfaces via graph kinship", async () => {
  const { db, setFavorite, invalidateReco, recommend } = await mods();
  db.exec("DELETE FROM play_events; DELETE FROM playcounts; DELETE FROM favorites; DELETE FROM dislikes; DELETE FROM tracks;");
  // The user loves a high-energy track by artist X.
  addTrack(db, "lovedX", { mood: "energetic", energy: 0.9, bpm: 145, artisthash: "X" });
  // Two UNHEARD calm tracks with identical audio — one by the SAME artist X, one by a stranger.
  addTrack(db, "calmX", { mood: "chill", energy: 0.2, bpm: 75, artisthash: "X" });
  addTrack(db, "calmZ", { mood: "chill", energy: 0.2, bpm: 75, artisthash: "Z" });
  setFavorite(1, "lovedX", true);
  invalidateReco(1);
  const { forYou } = recommend(1, 50);
  const rank = (h: string) => forYou.findIndex((r) => r.trackhash === h);
  assert.ok(rank("calmX") < rank("calmZ"), "the same-artist track outranks the acoustically-identical stranger");
});
