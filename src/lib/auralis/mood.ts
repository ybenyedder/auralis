// ============================================================================
// MOOD ENGINE
// ----------------------------------------------------------------------------
// We have no audio-feature data (energy/valence/bpm) — the only semantic signal
// per track is the ID3 `genre` string. So we derive a *mood* by matching genre
// keywords to a handful of buckets. It's heuristic, but it lets the app offer
// "how do you feel?" mixes and recommend by the mood the user actually plays.
//
// Pure + dependency-free so both the Home (personalised) and Explore (browse)
// views can compute moods client-side from the library snapshot they already hold.
// ============================================================================

import type { Track } from "./types";

export interface Mood {
  id: string;
  /** French display label. */
  label: string;
  emoji: string;
  /** Short tagline shown under the label. */
  blurb: string;
  /** Two-stop gradient for the mood card. */
  colors: [string, string];
  /** Lower-case genre substrings that map a track into this mood. */
  keywords: string[];
}

// Order matters: the first mood with a matching keyword wins, so the more
// specific buckets (party/focus) are listed before the broad ones.
export const MOODS: Mood[] = [
  {
    id: "energetic", label: "Énergie", emoji: "⚡️", blurb: "De quoi se booster",
    colors: ["#ef4444", "#f97316"],
    keywords: ["metal", "punk", "hardcore", "hard rock", "rock", "edm", "electro", "electronic",
      "house", "techno", "trance", "drum and bass", "drum & bass", "dnb", "dubstep", "industrial",
      "big room", "power", "thrash", "speed"],
  },
  {
    id: "party", label: "Fête", emoji: "🔥", blurb: "Monte le son",
    colors: ["#db2777", "#a855f7"],
    keywords: ["hip hop", "hip-hop", "rap", "trap", "r&b", "rnb", "reggaeton", "club", "dancehall",
      "grime", "drill", "crunk", "bass", "twerk", "moombahton"],
  },
  {
    id: "happy", label: "Bonne humeur", emoji: "☀️", blurb: "Sourire garanti",
    colors: ["#f59e0b", "#fde047"],
    keywords: ["pop", "funk", "disco", "reggae", "ska", "afro", "afrobeat", "latin", "salsa",
      "tropical", "feel good", "synthpop", "synth-pop", "k-pop", "dance pop"],
  },
  {
    id: "focus", label: "Concentration", emoji: "🎧", blurb: "Dans la zone",
    colors: ["#0d9488", "#10b981"],
    keywords: ["classical", "instrumental", "piano", "soundtrack", "score", "study", "post-rock",
      "post rock", "cinematic", "orchestra", "orchestral", "baroque", "minimal", "modern classical"],
  },
  {
    id: "chill", label: "Détente", emoji: "🌙", blurb: "Doux et posé",
    colors: ["#0ea5e9", "#22d3ee"],
    keywords: ["chill", "lofi", "lo-fi", "ambient", "downtempo", "lounge", "bossa", "easy",
      "mellow", "trip hop", "trip-hop", "new age", "smooth jazz", "chillout", "chill-out"],
  },
  {
    id: "melancholy", label: "Mélancolie", emoji: "🌧️", blurb: "Pour les émotions",
    colors: ["#6366f1", "#8b5cf6"],
    keywords: ["sad", "blues", "soul", "indie", "emo", "ballad", "slowcore", "melanch",
      "singer-songwriter", "folk", "acoustic", "shoegaze", "dream pop", "jazz"],
  },
];

const MOOD_BY_ID = new Map(MOODS.map((m) => [m.id, m]));
export function moodById(id: string): Mood | undefined {
  return MOOD_BY_ID.get(id);
}

/** Map a raw genre string to a mood id, or null if nothing matches. */
export function moodForGenre(genre?: string | null): string | null {
  if (!genre) return null;
  const g = genre.toLowerCase();
  for (const mood of MOODS) {
    if (mood.keywords.some((k) => g.includes(k))) return mood.id;
  }
  return null;
}

/**
 * The track's mood. Prefers the audio-analysis classifier's verdict (`track.mood`,
 * computed from real energy/tempo/timbre) and only falls back to the genre
 * heuristic for tracks not yet analysed (or where ffmpeg was unavailable).
 */
export function moodForTrack(track: Track): string | null {
  if (track.mood && MOOD_BY_ID.has(track.mood)) return track.mood;
  return moodForGenre(track.genre);
}

/** Group a library into mood → tracks, dropping tracks whose genre maps nowhere. */
export function groupByMood(tracks: Track[]): Map<string, Track[]> {
  const out = new Map<string, Track[]>();
  for (const t of tracks) {
    const id = moodForTrack(t);
    if (!id) continue;
    const arr = out.get(id);
    if (arr) arr.push(t);
    else out.set(id, [t]);
  }
  return out;
}
