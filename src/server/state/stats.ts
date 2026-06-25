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

  // Distinct local days with activity (bounded by the 400-day log retention) —
  // bucketed in SQLite so we walk at most ~400 day strings, not every event.
  const dayRows = db
    .prepare("SELECT DISTINCT strftime('%Y-%m-%d', played_at / 1000, 'unixepoch', 'localtime') AS day FROM play_events WHERE user_id = ?")
    .all(userId) as { day: string }[];
  const daySet = new Set(dayRows.map((r) => r.day));

  // Per-day counts over the last 8 days (covers today + the 7-day sparkline).
  const since = Date.now() - 8 * 86_400_000;
  const countRows = db
    .prepare("SELECT strftime('%Y-%m-%d', played_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS c FROM play_events WHERE user_id = ? AND played_at >= ? GROUP BY day")
    .all(userId, since) as { day: string; c: number }[];
  const countByDay = new Map(countRows.map((r) => [r.day, r.c]));

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

  return { totalPlays, todayPlays, weekPlays, streak, playsByDay };
}
