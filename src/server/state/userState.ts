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
  /** JSON-encoded SmartConfig for dynamic playlists; null for static ones. */
  rules: string | null;
  /** Owner has marked this playlist shared/collaborative. */
  shared: boolean;
  /** This playlist belongs to ANOTHER user who shared it with the requester (the
   *  requester is a collaborator: read + append, never rename/delete). */
  collaborator: boolean;
  /** Owner's username (only set on collaborator playlists, for the "de X" label). */
  owner?: string;
  /** Content-hash into the shared art cache (art.ts); null = no custom cover. */
  imageHash: string | null;
}

export interface UserState {
  favorites: string[];
  dislikes: string[];
  playCounts: Record<string, number>;
  recents: string[];
  playlists: PlaylistDTO[];
  settings: Record<string, unknown>;
}

const RECENTS_LIMIT = 100;

export function getUserState(userId: number): UserState {
  const db = getDb();
  const favorites = (db.prepare("SELECT trackhash FROM favorites WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { trackhash: string }[]).map((r) => r.trackhash);
  const dislikes = (db.prepare("SELECT trackhash FROM dislikes WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { trackhash: string }[]).map((r) => r.trackhash);
  const playCounts: Record<string, number> = {};
  for (const r of db.prepare("SELECT trackhash, count FROM playcounts WHERE user_id = ?").all(userId) as { trackhash: string; count: number }[]) {
    playCounts[r.trackhash] = r.count;
  }
  const recents = (db.prepare("SELECT trackhash FROM recents WHERE user_id = ? ORDER BY played_at DESC LIMIT ?").all(userId, RECENTS_LIMIT) as { trackhash: string }[]).map((r) => r.trackhash);

  const playlistRows = db.prepare("SELECT id, name, description, pinned, position, rules, is_shared, image_hash FROM playlists WHERE user_id = ? ORDER BY position ASC, created_at ASC").all(userId) as {
    id: string; name: string; description: string | null; pinned: number; position: number; rules: string | null; is_shared: number; image_hash: string | null;
  }[];

  // Playlists shared WITH this user (they're a collaborator): appended to their
  // library, read + append only (rename/delete stay owner-only).
  const collabRows = db.prepare(`
    SELECT p.id, p.name, p.description, p.pinned, p.rules, p.image_hash, u.username AS owner
    FROM playlists p
    JOIN playlist_collaborators c ON c.playlist_id = p.id AND c.user_id = ?
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at ASC
  `).all(userId) as { id: string; name: string; description: string | null; pinned: number; rules: string | null; image_hash: string | null; owner: string }[];

  // One indexed IN-query for every playlist's tracks instead of one query per
  // playlist — a user with N playlists used to fire N+1 statements here on
  // every getUserState() call (i.e. every client reload).
  const allPlaylistIds = [...playlistRows.map((p) => p.id), ...collabRows.map((p) => p.id)];
  const trackhashesByPlaylist = new Map<string, string[]>();
  if (allPlaylistIds.length > 0) {
    const placeholders = allPlaylistIds.map(() => "?").join(",");
    const trackRows = db
      .prepare(`SELECT playlist_id, trackhash FROM playlist_tracks WHERE playlist_id IN (${placeholders}) ORDER BY playlist_id ASC, position ASC, added_at ASC`)
      .all(...allPlaylistIds) as { playlist_id: string; trackhash: string }[];
    for (const t of trackRows) {
      const arr = trackhashesByPlaylist.get(t.playlist_id);
      if (arr) arr.push(t.trackhash);
      else trackhashesByPlaylist.set(t.playlist_id, [t.trackhash]);
    }
  }

  const playlists: PlaylistDTO[] = playlistRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pinned: p.pinned === 1,
    position: p.position,
    rules: p.rules ?? null,
    shared: p.is_shared === 1,
    collaborator: false,
    imageHash: p.image_hash ?? null,
    trackhashes: trackhashesByPlaylist.get(p.id) ?? [],
  }));
  collabRows.forEach((p, i) => {
    playlists.push({
      id: p.id,
      name: p.name,
      description: p.description,
      pinned: false,
      position: 100_000 + i,
      rules: p.rules ?? null,
      shared: true,
      collaborator: true,
      owner: p.owner,
      imageHash: p.image_hash ?? null,
      trackhashes: trackhashesByPlaylist.get(p.id) ?? [],
    });
  });

  const settings: Record<string, unknown> = {};
  for (const r of db.prepare("SELECT key, value FROM user_settings WHERE user_id = ?").all(userId) as { key: string; value: string }[]) {
    try {
      settings[r.key] = JSON.parse(r.value);
    } catch {
      settings[r.key] = r.value;
    }
  }

  return { favorites, dislikes, playCounts, recents, playlists, settings };
}

export function setFavorite(userId: number, trackhash: string, favorite: boolean): void {
  const db = getDb();
  if (favorite) {
    db.prepare("INSERT INTO favorites (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING").run(userId, trackhash, Date.now());
    // Liking a track clears any prior "not for me" — the two are opposite verdicts.
    db.prepare("DELETE FROM dislikes WHERE user_id = ? AND trackhash = ?").run(userId, trackhash);
  } else {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND trackhash = ?").run(userId, trackhash);
  }
}

/** Explicit "not for me" verdict — a strong negative for the reco engine and a
 *  hard exclude from every recommendation surface. Disliking also drops the track
 *  from favourites (opposite verdicts can't both hold). */
export function setDislike(userId: number, trackhash: string, dislike: boolean): void {
  const db = getDb();
  if (dislike) {
    db.prepare("INSERT INTO dislikes (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING").run(userId, trackhash, Date.now());
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND trackhash = ?").run(userId, trackhash);
  } else {
    db.prepare("DELETE FROM dislikes WHERE user_id = ? AND trackhash = ?").run(userId, trackhash);
  }
}

export function recordPlay(userId: number, trackhash: string, msPlayed?: number, ratio?: number): number {
  const db = getDb();
  const now = Date.now();
  const ms = Number.isFinite(msPlayed) && (msPlayed as number) > 0 ? Math.round(msPlayed as number) : 0;
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio as number)) : 1;
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO playcounts (user_id, trackhash, count, last_played) VALUES (?, ?, 1, ?)
      ON CONFLICT(user_id, trackhash) DO UPDATE SET count = count + 1, last_played = excluded.last_played
    `).run(userId, trackhash, now);
    db.prepare("INSERT INTO recents (user_id, trackhash, played_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO UPDATE SET played_at = excluded.played_at").run(userId, trackhash, now);
    db.prepare("DELETE FROM recents WHERE user_id = ? AND trackhash NOT IN (SELECT trackhash FROM recents WHERE user_id = ? ORDER BY played_at DESC LIMIT ?)").run(userId, userId, RECENTS_LIMIT);
    // Append to the per-day event log (streaks / weekly recap / taste engine) and prune the tail.
    db.prepare("INSERT INTO play_events (user_id, trackhash, played_at, kind, ms_played, ratio) VALUES (?, ?, ?, 'complete', ?, ?)").run(userId, trackhash, now, ms, r);
    db.prepare("DELETE FROM play_events WHERE user_id = ? AND played_at < ?").run(userId, now - 400 * 86_400_000);
  });
  tx();
  return (db.prepare("SELECT count FROM playcounts WHERE user_id = ? AND trackhash = ?").get(userId, trackhash) as { count: number } | undefined)?.count ?? 0;
}

/** Record a SKIP: the user advanced before the listen threshold. Feeds the taste
 *  engine a negative signal (scaled by how little was heard) without touching play
 *  counts / recents / streaks — it isn't a listen, just a rejection. */
export function recordSkip(userId: number, trackhash: string, msPlayed?: number, ratio?: number): void {
  const db = getDb();
  const now = Date.now();
  const ms = Number.isFinite(msPlayed) && (msPlayed as number) > 0 ? Math.round(msPlayed as number) : 0;
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio as number)) : 0;
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO play_events (user_id, trackhash, played_at, kind, ms_played, ratio) VALUES (?, ?, ?, 'skip', ?, ?)").run(userId, trackhash, now, ms, r);
    db.prepare("DELETE FROM play_events WHERE user_id = ? AND played_at < ?").run(userId, now - 400 * 86_400_000);
  });
  tx();
}

/** Wipe a user's listening history (play counts, recents, per-day event log incl.
 *  skips). Favourites, dislikes and playlists are kept — those are explicit
 *  preferences, not the auto-collected "stats" signals this clears. */
export function resetUserStats(userId: number): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM playcounts WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM recents WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM play_events WHERE user_id = ?").run(userId);
  });
  tx();
}

export function setSetting(userId: number, key: string, value: unknown): void {
  // Bound both sides so one account can't bloat the DB with a multi-MB key/value
  // (the global 12 MB body cap is the only other limit). Keys are short setting
  // names; values are small preference blobs. Anything larger is hostile.
  const k = String(key).slice(0, 128);
  const serialized = JSON.stringify(value);
  if (serialized.length > 16_000) throw new Error("setting value too large");
  getDb().prepare("INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value")
    .run(userId, k, serialized);
}

export interface PlaylistInput {
  id?: string;
  name: string;
  description?: string | null;
  pinned?: boolean;
  trackhashes?: string[];
  /** JSON-encoded SmartConfig for a dynamic playlist; null/undefined = static. */
  rules?: string | null;
}

export function upsertPlaylist(userId: number, input: PlaylistInput): string {
  const db = getDb();
  const now = Date.now();
  const id = input.id ?? "pl-" + now.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  const rules = typeof input.rules === "string" ? input.rules.slice(0, 4000) : null; // cap a hostile payload
  // Cap free-text fields for the same reason (a name/description is bounded only
  // by the global body cap otherwise — a multi-MB name would bloat the DB and the UI).
  const name = String(input.name ?? "").slice(0, 200);
  const description = typeof input.description === "string" ? input.description.slice(0, 2000) : null;
  const tx = db.transaction(() => {
    // Scope the upsert to this user so one account can't mutate another's playlist.
    const existing = db.prepare("SELECT id, position FROM playlists WHERE id = ? AND user_id = ?").get(id, userId) as { id: string; position: number } | undefined;
    const position = existing?.position ?? ((db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM playlists WHERE user_id = ?").get(userId) as { p: number }).p);
    db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, pinned, position, rules, created_at, updated_at)
      VALUES (@id, @userId, @name, @description, @pinned, @position, @rules, @now, @now)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, pinned=excluded.pinned, rules=excluded.rules, updated_at=excluded.updated_at
      WHERE playlists.user_id = @userId
    `).run({ id, userId, name, description, pinned: input.pinned ? 1 : 0, position, rules, now });

    if (input.trackhashes) {
      // Re-check ownership AFTER the metadata upsert: a row just created above is owned
      // by the caller (so it passes), but an existing id belonging to another user must
      // NOT have its tracks rewritten (IDOR). Only mutate tracks for an owned playlist.
      const owned = db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId);
      if (owned) {
        db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(id);
        const ins = db.prepare("INSERT INTO playlist_tracks (playlist_id, trackhash, position, added_at) VALUES (?, ?, ?, ?)");
        input.trackhashes.forEach((h, i) => ins.run(id, h, i, now));
      }
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

// --- Collaborative playlists ------------------------------------------------
// A household feature: the OWNER shares a playlist; invited COLLABORATORS can read
// it and append/remove tracks, but only the owner can rename/delete/reorder. All
// mutating paths re-check authorization server-side (never trust the client).

/** Owner-only: mark a playlist shared (or revoke, dropping all collaborators). */
export function setPlaylistShared(userId: number, id: string, shared: boolean): boolean {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId)) return false;
  const tx = db.transaction(() => {
    db.prepare("UPDATE playlists SET is_shared = ? WHERE id = ? AND user_id = ?").run(shared ? 1 : 0, id, userId);
    if (!shared) db.prepare("DELETE FROM playlist_collaborators WHERE playlist_id = ?").run(id);
  });
  tx();
  return true;
}

/** Owner-only: set (or clear, with hash=null) a playlist's custom cover image. */
export function setPlaylistCover(userId: number, id: string, hash: string | null): boolean {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId)) return false;
  db.prepare("UPDATE playlists SET image_hash = ? WHERE id = ? AND user_id = ?").run(hash, id, userId);
  return true;
}

/** Owner-only: invite a collaborator by username (also marks the playlist shared). */
export function addCollaborator(userId: number, id: string, username: string): { ok: boolean; error?: string } {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId)) return { ok: false, error: "not_owner" };
  const other = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username.trim()) as { id: number } | undefined;
  if (!other) return { ok: false, error: "no_user" };
  if (other.id === userId) return { ok: false, error: "self" };
  const tx = db.transaction(() => {
    db.prepare("UPDATE playlists SET is_shared = 1 WHERE id = ? AND user_id = ?").run(id, userId);
    db.prepare("INSERT INTO playlist_collaborators (playlist_id, user_id, added_at) VALUES (?, ?, ?) ON CONFLICT(playlist_id, user_id) DO NOTHING").run(id, other.id, Date.now());
  });
  tx();
  return { ok: true };
}

/** True when `userId` may edit tracks of playlist `id`: owner OR a collaborator. */
function canEditPlaylistTracks(db: ReturnType<typeof getDb>, userId: number, id: string): boolean {
  if (db.prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?").get(id, userId)) return true;
  return Boolean(db.prepare("SELECT 1 FROM playlist_collaborators WHERE playlist_id = ? AND user_id = ?").get(id, userId));
}

/** Append one track (owner or collaborator). Granular so a collaborator can add to a
 *  playlist they don't own — the full upsert stays owner-scoped to prevent IDOR. */
export function addTrackToPlaylist(userId: number, id: string, trackhash: string): boolean {
  const db = getDb();
  if (!canEditPlaylistTracks(db, userId, id)) return false;
  const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM playlist_tracks WHERE playlist_id = ?").get(id) as { p: number }).p;
  db.prepare("INSERT INTO playlist_tracks (playlist_id, trackhash, position, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(playlist_id, trackhash) DO NOTHING").run(id, trackhash, pos, Date.now());
  return true;
}

/** Remove one track (owner or collaborator). */
export function removeTrackFromPlaylist(userId: number, id: string, trackhash: string): boolean {
  const db = getDb();
  if (!canEditPlaylistTracks(db, userId, id)) return false;
  db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND trackhash = ?").run(id, trackhash);
  return true;
}

// Hard ceilings so a single authenticated `replace` payload can't blow up the DB
// (a trivial DoS otherwise — favorites/playCounts/playlists were unbounded).
const MAX_FAVORITES = 100_000;
const MAX_DISLIKES = 100_000;
const MAX_PLAYCOUNTS = 100_000;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 50_000;
const MAX_SETTINGS = 200;
export const isHash = (h: unknown): h is string => typeof h === "string" && h.length > 0 && h.length <= 64;

/** Replace the whole user state in one shot (used by import / first-sync). */
export function replaceUserState(userId: number, state: Partial<UserState>): void {
  const db = getDb();
  const tx = db.transaction(() => {
    if (state.favorites) {
      db.prepare("DELETE FROM favorites WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO favorites (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING");
      state.favorites.filter(isHash).slice(0, MAX_FAVORITES).forEach((h, i) => ins.run(userId, h, Date.now() - i));
    }
    if (state.dislikes) {
      db.prepare("DELETE FROM dislikes WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO dislikes (user_id, trackhash, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, trackhash) DO NOTHING");
      const delFav = db.prepare("DELETE FROM favorites WHERE user_id = ? AND trackhash = ?");
      const base = Date.now();
      state.dislikes.filter(isHash).slice(0, MAX_DISLIKES).forEach((h, i) => {
        ins.run(userId, h, base - i);
        delFav.run(userId, h); // keep the favourite/dislike mutual exclusion on import
      });
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
