// ============================================================================
// MONTHLY MOOD RECAP  —  "your month in feelings"
// ----------------------------------------------------------------------------
// At the close of each month the app can tell you what mood you mostly lived in —
// melancholic, radiant, electric… — the way a year-in-review does, but monthly.
// We aggregate the month's *completed* listens (skips don't count), weight each by
// how much of the track was actually heard, bucket them by the analyser's mood,
// and pick the dominant one. A short French narrative is generated from the shape
// of the month plus a comparison to the previous one.
// ============================================================================

import { getDb } from "../db";
import { featureVector, recoMood, type FeatureVector, type MonthlyRecap, type MoodShare } from "@/lib/auralis/reco";
import { moodById } from "@/lib/auralis/mood";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Emotional adjective per mood, agreeing with the feminine noun "humeur".
const MOOD_WORD: Record<string, string> = {
  melancholy: "mélancolique",
  happy: "heureuse",
  energetic: "électrique",
  party: "festive",
  chill: "sereine",
  focus: "introspective",
};

interface MonthRow {
  trackhash: string;
  ratio: number;
  mood: string | null;
  genre: string | null;
  energy: number | null;
  bpm: number | null;
  duration: number;
  artisthash: string | null;
  artist: string | null;
  albumartist: string | null;
}

/** Local "YYYY-MM" key for a Date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Juin 2026" from a "2026-06" key. */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_FR[(m || 1) - 1] ?? key} ${y}`;
}

/** The "YYYY-MM" immediately before the given key. */
function previousMonthKey(key: string): string {
  let [y, m] = key.split("-").map(Number);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Months (newest first) that have at least one completed listen. */
export function listRecapMonths(userId: number): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT strftime('%Y-%m', played_at / 1000, 'unixepoch', 'localtime') AS m FROM play_events WHERE user_id = ? AND kind = 'complete' ORDER BY m DESC",
      )
      .all(userId) as { m: string }[]
  ).map((r) => r.m);
}

/** Dominant mood id of a month (used for the previous-month comparison). */
function dominantMoodOf(userId: number, key: string): string | null {
  const rows = monthRows(userId, key);
  if (rows.length === 0) return null;
  const { moods } = aggregate(rows);
  return moods.length ? moods[0].mood : null;
}

function monthRows(userId: number, key: string): MonthRow[] {
  return getDb()
    .prepare(
      `SELECT pe.trackhash, pe.ratio, t.mood, t.genre, t.energy, t.bpm, t.duration,
              t.artisthash, t.artist, t.albumartist
       FROM play_events pe
       JOIN tracks t ON t.trackhash = pe.trackhash
       WHERE pe.user_id = ? AND pe.kind = 'complete'
         AND strftime('%Y-%m', pe.played_at / 1000, 'unixepoch', 'localtime') = ?`,
    )
    .all(userId, key) as MonthRow[];
}

interface Aggregated {
  moods: MoodShare[];
  totalPlays: number;
  listeningSeconds: number;
  distinctTracks: number;
  arousal: number;
  valence: number;
  topTracks: { trackhash: string; plays: number }[];
  topArtists: { artisthash: string; name: string; plays: number }[];
}

function aggregate(rows: MonthRow[]): Aggregated {
  const moodWeight = new Map<string, number>();
  const moodPlays = new Map<string, number>();
  const trackPlays = new Map<string, number>();
  const artistPlays = new Map<string, { name: string; plays: number }>();
  const distinct = new Set<string>();

  let totalWeight = 0;
  let listeningSeconds = 0;
  const feel = { arousal: 0, valence: 0, w: 0 };

  for (const r of rows) {
    const ratio = clamp(Number.isFinite(r.ratio) ? r.ratio : 1, 0, 1);
    const weight = clamp(ratio, 0.3, 1); // a counted listen always carries some weight
    listeningSeconds += (r.duration || 0) * ratio;
    distinct.add(r.trackhash);
    trackPlays.set(r.trackhash, (trackPlays.get(r.trackhash) ?? 0) + 1);

    const aId = r.artisthash;
    if (aId) {
      const name = r.albumartist || r.artist || "Artiste";
      const cur = artistPlays.get(aId) ?? { name, plays: 0 };
      cur.plays += 1;
      artistPlays.set(aId, cur);
    }

    const mood = recoMood(r);
    if (mood) {
      moodWeight.set(mood, (moodWeight.get(mood) ?? 0) + weight);
      moodPlays.set(mood, (moodPlays.get(mood) ?? 0) + 1);
      totalWeight += weight;
    }

    const v: FeatureVector | null = featureVector(r);
    if (v) {
      feel.arousal += v.arousal * weight;
      feel.valence += v.valence * weight;
      feel.w += weight;
    }
  }

  const moods: MoodShare[] = [...moodWeight.entries()]
    .map(([mood, w]) => ({ mood, share: totalWeight > 0 ? w / totalWeight : 0, plays: moodPlays.get(mood) ?? 0 }))
    .sort((a, b) => b.share - a.share);

  const topTracks = [...trackPlays.entries()]
    .map(([trackhash, plays]) => ({ trackhash, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  const topArtists = [...artistPlays.entries()]
    .map(([artisthash, v]) => ({ artisthash, name: v.name, plays: v.plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  return {
    moods,
    totalPlays: rows.length,
    listeningSeconds: Math.round(listeningSeconds),
    distinctTracks: distinct.size,
    arousal: feel.w > 0 ? feel.arousal / feel.w : 0.5,
    valence: feel.w > 0 ? feel.valence / feel.w : 0.5,
    topTracks,
    topArtists,
  };
}

function buildNarrative(
  monthName: string,
  agg: Aggregated,
  dominant: string | null,
  previousMood: string | null,
  prevMonthName: string,
): string {
  if (agg.totalPlays === 0 || !dominant) {
    return `Pas encore assez d'écoutes en ${monthName.toLowerCase()} pour dégager une humeur. Lance quelques titres et reviens !`;
  }
  const mood = moodById(dominant);
  const word = MOOD_WORD[dominant] ?? mood?.label.toLowerCase() ?? "particulière";
  const share = agg.moods[0]?.share ?? 0;
  const intensity = share > 0.5 ? "nettement" : share > 0.35 ? "surtout" : "plutôt";
  const hours = agg.listeningSeconds / 3600;
  const timeStr = hours >= 1 ? `${hours.toFixed(1).replace(".0", "")} h` : `${Math.round(agg.listeningSeconds / 60)} min`;

  let sentence = `En ${monthName.toLowerCase()}, ton humeur était ${intensity} ${word} ${mood?.emoji ?? ""}`.trim() + ".";
  sentence += ` Tu as écouté ${agg.totalPlays} titre${agg.totalPlays > 1 ? "s" : ""} (${timeStr})`;

  // A feeling-space flavour clause.
  if (agg.valence < 0.4 && agg.arousal < 0.45) sentence += ", dans des ambiances posées et introspectives";
  else if (agg.valence > 0.62 && agg.arousal > 0.6) sentence += ", porté par des morceaux lumineux et énergiques";
  else if (agg.arousal > 0.62) sentence += ", avec beaucoup d'intensité";
  else if (agg.valence > 0.6) sentence += ", sur des notes plutôt ensoleillées";
  sentence += ".";

  // Comparison to the previous month.
  if (previousMood && previousMood !== dominant) {
    const prevWord = MOOD_WORD[previousMood] ?? moodById(previousMood)?.label.toLowerCase() ?? "différente";
    sentence += ` Un vrai virage par rapport à ${prevMonthName.toLowerCase()}, plus ${prevWord}.`;
  } else if (previousMood && previousMood === dominant) {
    sentence += ` Dans la continuité de ${prevMonthName.toLowerCase()}.`;
  }
  return sentence;
}

/** The recap for one month (defaults to the current local month). */
export function getMonthlyRecap(userId: number, month?: string): MonthlyRecap {
  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
  const rows = monthRows(userId, key);
  const agg = aggregate(rows);
  const dominant = agg.moods.length ? agg.moods[0].mood : null;
  const prevKey = previousMonthKey(key);
  const previousMood = dominantMoodOf(userId, prevKey);
  const label = monthLabel(key);
  const inProgress = key === monthKey(new Date());

  return {
    month: key,
    label,
    inProgress,
    totalPlays: agg.totalPlays,
    listeningSeconds: agg.listeningSeconds,
    distinctTracks: agg.distinctTracks,
    dominantMood: dominant,
    moodWord: dominant ? MOOD_WORD[dominant] ?? null : null,
    arousal: Math.round(agg.arousal * 1000) / 1000,
    valence: Math.round(agg.valence * 1000) / 1000,
    moods: agg.moods,
    topTracks: agg.topTracks,
    topArtists: agg.topArtists,
    narrative: buildNarrative(label, agg, dominant, previousMood, monthLabel(prevKey)),
    previousMood,
  };
}
