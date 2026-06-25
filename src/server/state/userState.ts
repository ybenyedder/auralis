// Per-user persisted state (favorites, playlists, play counts, recents, prefs).
// SQLite is the source of truth so the same listening state is shared across the
// web UI, the desktop app and the Android client that talk to one Auralis server —
// scoped to the account that made the request.

import { getDb } from "../db";

export interface PlaylistDTO {
  id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  position: number;
  trackhashes: string[];
}

export interface UserState {
  favorites: string[];
  playCounts: Record<string, number>;
  recents: string[];
  playlists: PlaylistDTO[];
  settings: Record<string, unknown>;
}

const RECENTS_LIMIT = 100;

export function getUserState(userId: number): UserState {
  const db = getDb();
  const favorites = (db.prepare("SELECT trackhash FROM favorites WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { trackhash: string }[]).map((r) => r.trackhash);
  const playCounts: Record<string, number> = {};
  for (const r of db.prepare("SELECT trackhash, count FROM playcounts WHERE user_id = ?").all(userId) as { trackhash: string; count: number }[]) {
    playCounts[r.trackhash] = r.count;
  }
  const recents = (db.prepare("SELECT trackhash FROM recents WHERE user_id = ? ORDER BY played_at DESC LIMIT ?").all(userId, RECENTS_LIMIT) as { trackhash: string }[]).map((r) => r.trackhash);

  const playlistRows = db.prepare("SELECT id, name, description, pinned, position FROM playlists WHERE user_id = ? ORDER BY position ASC, created_at ASC").all(userId) as {
    id: string; name: string; description: string | null; pinned: number; position: number;
  }[];
  const trackStmt = db.prepare("SELECT trackhash FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC, added_at ASC");
  const playlists: PlaylistDTO[] = playlistRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pinned: p.pinned === 1,
    position: p.position,
    trackhashes: (trackStmt.all(p.id) as { trackhash: string }[]).map((t) => t.trackhash),
  }));

  const settings: Record<string, unknown> = {};
  for (const r of db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId) as { key: string; value: string }[]) {
    try {
      settings[r.key] = JSON.parse(r.value);
    } catch {
      settings[r.key] = r.value;
    }
  }

  return { favorites, playCounts, recents, playlists, settings };
}

export function setFavorite(userId: number, trackhash: string, favorite: boolean): void {
  const db = getDb();
  if (favorite) {
    db.prepare("INSERT INTO favorites (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING").run(userId, trackhash, Date.now());
  } else {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND trackhash = ?").run(userId, trackhash);
  }
}

export function recordPlay(userId: number, trackhash: string): number {
  const db = getDb();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, trackhash) DO UPDATE SET count = count + 1, last_played = excluded.last_played
    `).run(userId, trackhash, now);
    db.prepare("INSERT INTO recents (user_id, trackhash, played_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO UPDATE SET played_at = excluded.played_at").run(userId, trackhash, now);
    db.prepare("DELETE FROM recents WHERE user_id = ? AND trackhash NOT IN (SELECT trackhash FROM recents WHERE user_id = ? ORDER BY played_at DESC LIMIT ?)").run(userId, userId, RECENTS_LIMIT);
    // Append to the per-day event log (streaks / weekly recap) and prune the tail.
    db.prepare("INSERT INTO play_events (user_id, trackhash, played_at) VALUES (?, ?, ?)").run(userId, trackhash, now);
    db.prepare("DELETE FROM play_events WHERE user_id = ? AND played_at < ?").run(userId, now - 400 * 86_400_000);
  });
  tx();
  return (db.prepare("SELECT count FROM playcounts WHERE user_id = ? AND trackhash = ?").get(userId, trackhash) as { count: number } | undefined)?.count ?? 0;
}

export function setSetting(userId: number, key: string, value: unknown): void {
  getDb().prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value")
    .run(userId, key, JSON.stringify(value));
}

export interface PlaylistInput {
  id?: string;
  name: string;
  description?: string | null;
  pinned?: boolean;
  trackhashes?: string[];
}

export function upsertPlaylist(userId: number, input: PlaylistInput): string {
  const db = getDb();
  const now = Date.now();
  const id = input.id ?? "pl-" + now.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  const tx = db.transaction(() => {
    // Scope the upsert to this user so one account can't mutate another's playlist.
    const existing = db.prepare("SELECT id, position FROM playlists WHERE id = ? AND user_id = ?").get(id, userId) as { id: string; position: number } | undefined;
    const position = existing?.position ?? ((db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM playlists WHERE user_id = ?").get(userId) as { p: number }).p);
    db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, pinned, position, created_at, updated_at)
      VALUES (@id, @userId, @name, @description, @pinned, @position, @now, @now)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, pinned=excluded.pinned, updated_at=excluded.updated_at
      WHERE playlists.user_id = @userId
    `).run({ id, userId, name: input.name, description: input.description ?? null, pinned: input.pinned ? 1 : 0, position, now });

    if (input.trackhashes) {
      db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(id);
      const ins = db.prepare("INSERT INTO playlist_tracks (playlist_id, trackhash, position, added_at) VALUES (?, ?, ?, ?)");
      input.trackhashes.forEach((h, i) => ins.run(id, h, i, now));
    }
  });
  tx();
  return id;
}

export function deletePlaylist(userId: number, id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    const owned = db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId);
    if (!owned) return;
    db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(id);
    db.prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?").run(id, userId);
  });
  tx();
}

export function reorderPlaylists(userId: number, orderedIds: string[]): void {
  const db = getDb();
  const upd = db.prepare("UPDATE playlists SET position = ? WHERE id = ? AND user_id = ?");
  const tx = db.transaction(() => orderedIds.forEach((id, i) => upd.run(i, id, userId)));
  tx();
}

// Hard ceilings so a single authenticated `replace` payload can't blow up the DB
// (a trivial DoS otherwise — favorites/playCounts/playlists were unbounded).
const MAX_FAVORITES = 100_000;
const MAX_PLAYCOUNTS = 100_000;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 50_000;
const MAX_SETTINGS = 200;
const isHash = (h: unknown): h is string => typeof h === "string" && h.length > 0 && h.length <= 64;

/** Replace the whole user state in one shot (used by import / first-sync). */
export function replaceUserState(userId: number, state: Partial<UserState>): void {
  const db = getDb();
  const tx = db.transaction(() => {
    if (state.favorites) {
      db.prepare("DELETE FROM favorites WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO favorites (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING");
      state.favorites.filter(isHash).slice(0, MAX_FAVORITES).forEach((h, i) => ins.run(userId, h, Date.now() - i));
    }
    if (state.playCounts) {
      db.prepare("DELETE FROM playcounts WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (?, ?, ?, 0) ON CONFLICT(user_id, trackhash) DO UPDATE SET count=excluded.count");
      for (const [h, c] of Object.entries(state.playCounts).slice(0, MAX_PLAYCOUNTS)) {
        if (isHash(h) && Number.isFinite(c)) ins.run(userId, h, Math.max(0, Math.min(1_000_000, Math.trunc(c))));
      }
    }
    if (state.recents) {
      db.prepare("DELETE FROM recents WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO recents (user_id, trackhash, played_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING");
      const base = Date.now();
      state.recents.filter(isHash).slice(0, RECENTS_LIMIT).forEach((h, i) => ins.run(userId, h, base - i));
    }
    if (state.playlists) {
      db.prepare("DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)").run(userId);
      db.prepare("DELETE FROM playlists WHERE user_id = ?").run(userId);
      state.playlists.slice(0, MAX_PLAYLISTS).forEach((p, idx) => {
        const trackhashes = (p.trackhashes ?? []).filter(isHash).slice(0, MAX_TRACKS_PER_PLAYLIST);
        upsertPlaylist(userId, { id: p.id, name: p.name, description: p.description, pinned: p.pinned, trackhashes });
        db.prepare("UPDATE playlists SET position = ? WHERE id = ? AND user_id = ?").run(idx, p.id, userId);
      });
    }
    if (state.settings) {
      for (const [k, v] of Object.entries(state.settings).slice(0, MAX_SETTINGS)) setSetting(userId, k, v);
    }
  });
  tx();
}
