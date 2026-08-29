// ============================================================================
// GENERIC VECTOR MATH  (shared client ⇄ server)
// ----------------------------------------------------------------------------
// Small, dependency-free helpers for the dense audio embeddings the SOTA reco
// layer reasons about (deep timbre vectors from the Python extractor, per-stem
// feature summaries, taste clusters). Kept separate from reco.ts's 4-D feeling
// vector: that one stays a fixed, hand-tuned space; THIS operates on arbitrary
// N-dimensional dense vectors (cosine geometry), which is what a learned
// embedding wants. Pure so a client fallback and the server engine agree.
// ============================================================================

/** Cosine similarity of two equal-length dense vectors, in [-1, 1]. Returns 0
 *  when either is a zero vector or the lengths differ (defensive: a partially
 *  extracted library can hold vectors of mixed provenance). */
export function cosine(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** In-place L2 normalisation → unit vector (so a later dot product IS the cosine).
 *  A zero vector is returned unchanged. */
export function normalize(v: number[]): number[] {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  if (n === 0) return v;
  const inv = 1 / Math.sqrt(n);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

/** Weighted mean of a set of equal-length vectors → the centroid. Null when the
 *  set is empty or the total weight is 0. Dimensionality is taken from the first
 *  vector; shorter/longer ones are read up to that length (defensive). */
export function weightedMean(vectors: readonly (readonly number[])[], weights: readonly number[]): number[] | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const acc = new Array<number>(dim).fill(0);
  let wsum = 0;
  for (let i = 0; i < vectors.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    const v = vectors[i];
    for (let d = 0; d < dim; d++) acc[d] += (v[d] ?? 0) * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  for (let d = 0; d < dim; d++) acc[d] /= wsum;
  return acc;
}

/** Squared Euclidean distance between two vectors (read up to the shorter one). */
export function sqDistance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/** softmax over an array of logits → a probability distribution that sums to 1.
 *  Numerically stabilised (subtract the max). Empty input → empty output. */
export function softmax(logits: readonly number[]): number[] {
  if (logits.length === 0) return [];
  let max = -Infinity;
  for (const x of logits) if (x > max) max = x;
  const exps = logits.map((x) => Math.exp(x - max));
  let sum = 0;
  for (const e of exps) sum += e;
  if (sum === 0) return logits.map(() => 1 / logits.length);
  return exps.map((e) => e / sum);
}

/** Pack a Float32 vector into a Buffer for a SQLite BLOB column (little-endian). */
export function packFloat32(v: readonly number[]): Buffer {
  const buf = Buffer.allocUnsafe(v.length * 4);
  for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i], i * 4);
  return buf;
}

/** Decode a Float32 BLOB (as written by packFloat32 / the Python extractor's
 *  `np.float32().tobytes()`) back to a number[]. Null on a malformed length. */
export function unpackFloat32(buf: Buffer | Uint8Array | null | undefined): number[] | null {
  if (!buf || buf.length === 0 || buf.length % 4 !== 0) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const out = new Array<number>(b.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = b.readFloatLE(i * 4);
  return out;
}
