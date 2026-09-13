// Listening statistics derived from the per-user play_events log (see db.ts v3).
// These are the time-series facts the client can't compute on its own — the
// browser only keeps an order-only recents ring with no per-day history. The
// richer engagement shelves (Daily Mix, "rediscover") are composed client-side
// from the library + synced favorites/playcounts; the server only owns the
// streak / weekly recap here.

import { getDb } from "../db";

export interface ListeningStats {
  /** All-time play tally (sum of per-track counts). */
  totalPlays: number;
  /** Plays counted today (local day). */
  todayPlays: number;
  /** Plays counted over the last 7 local days. */
  weekPlays: number;
  /** Consecutive days (up to today, with a one-day grace) that have ≥1 play. */
  streak: number;
  /** Last 7 local days, oldest→newest, for a sparkline. */
  playsByDay: { day: string; count: number }[];
  /** Approx. listening time (seconds) over the last 7 days, from play_events × track
   *  durations. A scrobble fired after a real listen, so this slightly over-counts
   *  half-listens but is a fair estimate. */
  weekListeningSeconds: number;
  /** Listening time (seconds) over the retained event window (~400 days). */
  totalListeningSeconds: number;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getListeningStats(userId: number): ListeningStats {
  const db = getDb();
  const totalPlays = (db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM playcounts WHERE user_id = ?").get(userId) as { n: number }).n;

  // Distinct local days with activity + per-day counts, from ONE indexed pass.
  // These used to be two strftime('%Y-%m-%d', ...) queries — SQLite can't use an
  // index through that function, so every call full-scanned the user's events.
  // Selecting the raw played_at column keeps the read on
  // idx_play_events_user_kind (user_id, kind, played_at) and the local-day
  // bucketing happens per row in JS instead (bounded in practice by the 400-day
  // log retention).
  const eventRows = db
    .prepare("SELECT played_at FROM play_events WHERE user_id = ? AND kind = 'complete'")
    .all(userId) as { played_at: number }[];
  const daySet = new Set<string>();
  const countByDay = new Map<string, number>();
  for (const r of eventRows) {
    const key = localDayKey(new Date(r.played_at));
    daySet.add(key);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const today = new Date();
  const todayKey = localDayKey(today);
  const todayPlays = countByDay.get(todayKey) ?? 0;

  // Streak: count back from today; if today has no play yet, allow yesterday as
  // the anchor (so the streak doesn't visually break before the day is over).
  let streak = 0;
  const cursor = new Date(today);
  if (!daySet.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Last 7 local days oldest→newest for the sparkline + the week tally.
  const playsByDay: { day: string; count: number }[] = [];
  let weekPlays = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    const count = countByDay.get(key) ?? 0;
    weekPlays += count;
    playsByDay.push({ day: key, count });
  }

  // Listening time = sum of played track durations (joined to the catalogue).
  const weekSince = Date.now() - 7 * 86_400_000;
  const weekListeningSeconds = (db
    .prepare("SELECT COALESCE(SUM(t.duration), 0) AS s FROM play_events pe JOIN tracks t ON t.trackhash = pe.trackhash WHERE pe.user_id = ? AND pe.kind = 'complete' AND pe.played_at >= ?")
    .get(userId, weekSince) as { s: number }).s;
  const totalListeningSeconds = (db
    .prepare("SELECT COALESCE(SUM(t.duration), 0) AS s FROM play_events pe JOIN tracks t ON t.trackhash = pe.trackhash WHERE pe.user_id = ? AND pe.kind = 'complete'")
    .get(userId) as { s: number }).s;

  return { totalPlays, todayPlays, weekPlays, streak, playsByDay, weekListeningSeconds, totalListeningSeconds };
}
