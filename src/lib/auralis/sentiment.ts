// ============================================================================
// LYRIC SENTIMENT  —  the "cognitive dissonance" signal (NLP, no model)
// ----------------------------------------------------------------------------
// The 4-D feeling vector is derived purely from SOUND, so it's blind to what a
// song SAYS. That misses the whole "Pumped Up Kicks / Stromae" effect: a bright,
// major, danceable production (high audio valence) wrapped around bleak lyrics.
//
// We already hold lyrics for many tracks (Musixmatch / .lrc sidecars), so instead
// of running Whisper + a transformer we score the existing text with a compact
// AFINN-style polarity lexicon (English + French). It's a bag-of-words estimate —
// crude next to a fine-tuned BERT — but it reliably separates "j'aime / soleil /
// danse" from "seul / pleurer / mourir", which is all the DISSONANCE term needs:
//
//     dissonance = audio_valence − lyric_valence
//
// A large positive dissonance = happy sound, sad words. Negative = the reverse.
// The taste engine can then learn whether a user gravitates to that tension.
// Pure + dependency-free so it can run in the background pass or a client fallback.
// ============================================================================

// Compact polarity lexicon. Weights in [-3, 3] (AFINN convention). Kept small and
// high-signal rather than exhaustive; the score is normalised by hit count so
// coverage matters more than magnitude. Stems are matched as word prefixes where
// marked with a trailing '*' handling below is done via the WORD set + PREFIXES.
const LEXICON: Record<string, number> = {
  // --- English positive ---
  love: 3, loved: 3, loving: 2, happy: 3, happiness: 3, joy: 3, joyful: 3, smile: 2, smiling: 2,
  sunshine: 2, sunny: 2, bright: 2, beautiful: 3, wonderful: 3, amazing: 3, good: 2, great: 2,
  best: 2, heaven: 2, paradise: 2, dream: 1, dreams: 1, hope: 2, hopeful: 2, alive: 2, free: 2,
  freedom: 2, dance: 2, dancing: 2, celebrate: 3, party: 2, laugh: 2, laughing: 2, kiss: 2,
  warm: 1, gold: 1, golden: 2, shine: 2, shining: 2, glow: 1, sweet: 2, forever: 1, together: 2,
  win: 2, winner: 2, fly: 1, high: 1, magic: 2, magical: 2, peace: 2, peaceful: 2, fun: 2,
  // --- English negative ---
  hate: -3, hated: -3, sad: -2, sadness: -2, cry: -2, crying: -2, cried: -2, tears: -2, tear: -1,
  pain: -3, painful: -2, hurt: -2, hurts: -2, broken: -2, break: -1, breaking: -2, alone: -2,
  lonely: -3, loneliness: -3, empty: -2, emptiness: -2, dark: -2, darkness: -2, death: -3,
  dead: -3, die: -3, dying: -3, kill: -3, killed: -3, blood: -2, war: -2, fear: -2, afraid: -2,
  scared: -2, cold: -1, lost: -2, lose: -2, losing: -2, fall: -1, falling: -1, fell: -1,
  goodbye: -1, gone: -1, miss: -1, missing: -1, sorry: -1, regret: -2, shame: -2, hell: -2,
  drown: -2, drowning: -2, numb: -2, hopeless: -3, worthless: -3, misery: -3, suffer: -3,
  suffering: -3, nightmare: -2, cruel: -2, betray: -2, wound: -2, wounded: -2, tired: -1,
  // --- French positive ---
  amour: 3, aimer: 3, aime: 3, aimé: 3, aimée: 2, heureux: 3, heureuse: 3, bonheur: 3,
  joie: 3, sourire: 2, soleil: 2, beau: 2, belle: 2, magnifique: 3, merveilleux: 3, bien: 1,
  ciel: 1, paradis: 2, rêve: 1, rêver: 1, espoir: 2, vivant: 2, vivante: 2, libre: 2,
  liberté: 2, danser: 2, danse: 2, fête: 2, rire: 2, embrasser: 2, chaud: 1, briller: 2,
  doux: 2, douce: 2, toujours: 1, ensemble: 2, gagner: 2, voler: 1, magie: 2, paix: 2, envie: 1,
  // --- French negative ---
  haine: -3, haïr: -3, triste: -2, tristesse: -2, pleurer: -2, pleure: -2, larmes: -2,
  larme: -1, douleur: -3, mal: -2, blesser: -2, brisé: -2, brisée: -2, seul: -2, seule: -2,
  solitude: -3, vide: -2, sombre: -2, noir: -1, mort: -3, mourir: -3, meurs: -3, tuer: -3,
  sang: -2, guerre: -2, peur: -2, effrayé: -2, froid: -1, perdu: -2, perdre: -2, tomber: -1,
  adieu: -1, parti: -1, partie: -1, manque: -1, désolé: -1, honte: -2, enfer: -2,
  noyer: -2, souffrir: -3, souffrance: -3, cauchemar: -2, trahir: -2, fatigué: -1,
  pire: -2, jamais: -1, rien: -1, sans: -1,
};

// Negators flip the polarity of the next scored token (English + French).
const NEGATORS = new Set(["not", "no", "never", "don't", "dont", "cant", "can't", "won't", "wont",
  "ne", "pas", "plus", "jamais", "sans", "aucun", "rien", "non"]);

/**
 * Score a lyric text's overall emotional polarity, returned as a *valence* in
 * 0..1 (0 = bleak, 0.5 = neutral / no signal, 1 = elated) so it lines up with the
 * audio `valence` axis for the dissonance subtraction. Returns 0.5 for text with
 * no lexicon hits (unknown), and a small `coverage` so callers can weight by how
 * much signal there actually was.
 */
export function lyricValence(text: string | null | undefined): { valence: number; polarity: number; coverage: number } {
  if (!text) return { valence: 0.5, polarity: 0, coverage: 0 };
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}'’\s-]/gu, " ")
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4000); // bound a pathologically long lyric blob
  let sum = 0;
  let hits = 0;
  let negate = false;
  for (const tok of tokens) {
    if (NEGATORS.has(tok)) {
      negate = true;
      continue;
    }
    const w = LEXICON[tok];
    if (w !== undefined) {
      sum += negate ? -w : w;
      hits++;
    }
    negate = false; // negation only reaches the immediately following token
  }
  if (hits === 0) return { valence: 0.5, polarity: 0, coverage: 0 };
  // Mean per-hit polarity in ~[-3, 3] → squash to [-1, 1] → map to 0..1 valence.
  const polarity = Math.tanh(sum / hits / 1.5);
  const valence = 0.5 + polarity * 0.5;
  const coverage = Math.min(1, hits / 8); // ~8 sentiment words ≈ a confident read
  return { valence, polarity, coverage };
}

/** Signed cognitive-dissonance score: how much brighter the SOUND is than the
 *  WORDS. >0 → happy music / dark lyrics; <0 → sombre music / hopeful lyrics.
 *  Scaled by coverage so a lyric with almost no sentiment words barely counts. */
export function dissonance(audioValence: number, lyric: { valence: number; coverage: number }): number {
  return (audioValence - lyric.valence) * lyric.coverage;
}
