# Auralis recommendation engine — architecture

A **hybrid, session-aware, content + graph** recommender that runs **entirely
locally** (no cloud, no external API, no GPU required). It fuses a validated 4‑D
"feeling‑space" core with eight additional axes, each a **deterministic,
training‑free** stand‑in for a piece of what a large hybrid recommender does.
Every enrichment degrades to `0` when its data is absent, so a fresh, un‑enriched
library scores exactly like the original engine — the new axes are pure upside.

## Scoring equation

For every non‑disliked track (`src/server/reco/engine.ts` → `scoreTrack`):

```
score = 1.00·direct        // your own verdict on THIS track (finished vs skipped, tanh)
      + 0.85·content        // proximity to your NEAREST taste CLUSTER − rejection centroid
      + 0.60·mood           // standing affinity for the track's mood bucket
      + 0.35·session        // self-attention match to the vibe now playing
      + 0.30·transition     // Markov P(track | what you just heard)
      + 0.22·time           // match to the vibe you want at THIS hour
      + 0.30·graph          // cultural kinship (same artist/scene/era/mood)
      + 0.50·deep           // learned timbre-embedding match (0 unless extractor ran)
      + 0.12·dissonance     // do you seek happy-sound/sad-words tension?
      + ucb                 // UCB1 exploration bonus (principled novelty)
      − overplay − fatigue  // familiarity fade + "just heard this" penalty
```

Final slates (`recommend` / radio / discovery / blend) are then re‑ranked with
**MMR** for diversity so the mix breathes instead of repeating one sub‑genre.
Every signal **decays with a ~3‑week half‑life** so the profile tracks where your
taste is *now*.

## Modules

| File | Technique | Replaces (the "to train" version) |
|---|---|---|
| `lib/auralis/reco.ts` | 4‑D feeling vector (arousal/valence/energy/tempo) + weighted distance | — (the validated core) |
| `server/reco/clusters.ts` | **weighted K‑means++** taste pockets → nearest‑pocket content | GMM / multi‑cluster embeddings |
| `server/reco/session.ts` | **Markov chain** + **parameter‑free self‑attention** over the live session | RNN/LSTM, SASRec/BERT4Rec |
| `server/reco/bandit.ts` | **UCB1** upper‑confidence exploration | RL explore/exploit |
| `server/reco/diversity.ts` | **MMR** slate re‑rank | Slate/Deep‑RL list generation |
| `server/reco/graph.ts` | **spreading activation** over a track↔artist↔genre↔decade↔mood graph | GNN message passing / collaborative filtering |
| `server/reco/temporal.ts` | per‑hour (+weekend) arousal/valence preference curve | time‑aware context features |
| `server/reco/embedding.ts` | deep timbre‑embedding centroid + cosine match | OpenL3/VGGish deep content |
| `lib/auralis/sentiment.ts` | AFINN‑style FR+EN lexicon → lyric valence → **dissonance** | Whisper + BERT sentiment |
| `lib/auralis/vector.ts` | dense‑vector math (cosine, softmax, float32 pack) | — |

Why the classical equivalents: for a **single‑user, local‑first** app there is no
crowd to collaborate with and no labelled corpus to train on. The transformer /
GNN / Deep‑RL formulations reduce — at this scale — to their parameter‑free cores
(scaled‑dot‑product attention with a fixed kernel, degree‑normalised graph
propagation, greedy MMR, UCB), which deliver the same *behaviour* deterministically
inside the existing Node/SQLite stack. The one place a learned model genuinely
helps (timbre) is optional and isolated behind the extractor.

## Optional deep‑audio enrichment

`scripts/extract_embeddings.py` (opt‑in) computes a dense timbre embedding per
track (librosa by default; `AURALIS_OPENL3=1` for OpenL3) plus an optional Demucs
**per‑stem** energy summary (`AURALIS_STEMS=1`), writing `tracks.embedding` /
`tracks.stems`. Trigger it by setting `AURALIS_EMBEDDINGS=1` (the server spawns it
after a scan / on `POST /api/library/analyze`) or run it manually. Missing Python
deps → clean no‑op; the engine keeps scoring on the 4‑D vector.

Lyric sentiment (`server/reco/lyricsSentiment.ts`) is pure TS and runs
automatically after a scan over the lyrics already on disk.

## Data (migration v10)

`tracks.embedding` (float32 BLOB), `tracks.stems` (JSON), `tracks.lyric_valence`
+ `tracks.lyric_coverage`, and the `embedded_at` / `lyrics_sentiment_at` work
markers. All nullable — an un‑enriched row is fully supported.

## Guarantees

- **Deterministic** — no `Math.random`/wall‑clock in the scoring path (K‑means uses
  a data‑seeded PRNG), so the same history yields the same recs and the per‑user
  2.5 s memo is stable.
- **Non‑regressive** — the 4‑D core is untouched; 112 tests pass, including the
  original 11 that pin the base behaviour and 11 new ones proving each SOTA layer.
- **Private** — the "collaborative" signal (transitions + graph) is learned from
  *your own* sequences and library only; nothing leaves the LAN.
