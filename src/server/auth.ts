// Multi-user authentication for the self-hosted server. Accounts live in the
// `users` table; the admin (seeded on first run) can create more accounts, and
// each account gets its own favorites / playlists / history. Sessions are signed
// HMAC tokens carrying the user id; they are accepted as a cookie OR as a bearer /
// ?token= (so WebView clients that persist the token in localStorage stay logged
// in across restarts). An optional AURALIS_TOKEN bearer maps to the admin.
//
// No external crypto dependency — Node's crypto (scrypt + HMAC) only.

import crypto from "crypto";
import { getDb } from "./db";
import { getConfig } from "./config";
import { createLogger } from "./logger";

const log = createLogger("auth");
const COOKIE_NAME = "auralis_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_ADMIN = "admin";

export interface UserRow {
  id: number;
  username: string;
  is_admin: number;
  is_default: number;
  created_at: number;
}

function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
function setSetting(key: string, value: string): void {
  getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/** Seed the signing secret and the first admin account. Idempotent. */
export function ensureAuth(): void {
  const db = getDb();
  if (!getSetting("auth.secret")) {
    setSetting("auth.secret", crypto.randomBytes(32).toString("hex"));
  }
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (count > 0) return;

  // Carry over a pre-multiuser single admin if its credentials are still in
  // settings (so the user keeps their existing password); otherwise seed default.
  const legacyHash = getSetting("auth.passwordHash");
  const legacySalt = getSetting("auth.passwordSalt");
  const legacyDefault = getSetting("auth.isDefault");
  let hash: string, salt: string, isDefault: number;
  if (legacyHash && legacySalt) {
    hash = legacyHash;
    salt = legacySalt;
    isDefault = legacyDefault === "1" ? 1 : 0;
  } else {
    salt = crypto.randomBytes(16).toString("hex");
    // Never ship a known default password. An operator-supplied password (env)
    // is used verbatim; otherwise we generate a random one and print it ONCE so
    // it can be read from the boot logs, then nudged to be changed (is_default=1).
    const envPw = process.env.AURALIS_ADMIN_PASSWORD?.trim();
    const initialPw = envPw && envPw.length >= 6 ? envPw : crypto.randomBytes(9).toString("base64url");
    hash = hashPassword(initialPw, salt);
    isDefault = envPw ? 0 : 1;
    if (!envPw) {
      log.warn(
        "No admin account found — generated a temporary admin password. " +
          "Log in and change it (or set AURALIS_ADMIN_PASSWORD).",
        { username: DEFAULT_ADMIN, password: initialPw },
      );
    }
  }
  // The first insert into the empty table gets id=1, matching the user_id the v2
  // migration assigned to all pre-existing favorites / playlists / history.
  db.prepare(
    "INSERT INTO users (username, password_hash, password_salt, is_admin, is_default, created_at) VALUES (?, ?, ?, 1, ?, ?)",
  ).run(DEFAULT_ADMIN, hash, salt, isDefault, Date.now());
}

function secret(): string {
  ensureAuth();
  const value = getSetting("auth.secret");
  if (!value) throw new Error("auth secret not initialised");
  return value;
}

export function getUserById(id: number): UserRow | null {
  return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
}

export function getUserByName(username: string): UserRow | null {
  return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE username = ?").get(username) as UserRow | undefined) ?? null;
}

/** Verify a username/password pair. Returns the user row on success, else null. */
export function verifyCredentials(username: string, password: string): UserRow | null {
  ensureAuth();
  const row = getDb()
    .prepare("SELECT id, username, password_hash, password_salt, is_admin, is_default, created_at FROM users WHERE username = ?")
    .get(username) as (UserRow & { password_hash: string; password_salt: string }) | undefined;
  if (!row) return null;
  const candidate = hashPassword(password, row.password_salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(row.password_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { id: row.id, username: row.username, is_admin: row.is_admin, is_default: row.is_default, created_at: row.created_at };
}

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 6) return "Le mot de passe doit faire au moins 6 caractères";
  return null;
}
function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

export function createUser(username: string, password: string, isAdmin = false): { ok: boolean; error?: string; id?: number } {
  ensureAuth();
  const uname = normalizeUsername(username);
  if (!/^[a-z0-9._-]{2,32}$/.test(uname)) return { ok: false, error: "Identifiant invalide (2–32 caractères : lettres, chiffres, . _ -)" };
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };
  if (getUserByName(uname)) return { ok: false, error: "Cet identifiant existe déjà" };
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const info = getDb()
    .prepare("INSERT INTO users (username, password_hash, password_salt, is_admin, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .run(uname, hash, salt, isAdmin ? 1 : 0, Date.now());
  return { ok: true, id: Number(info.lastInsertRowid) };
}

export function listUsers(): UserRow[] {
  ensureAuth();
  return getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users ORDER BY id ASC").all() as UserRow[];
}

export function deleteUser(id: number): { ok: boolean; error?: string } {
  const db = getDb();
  const target = getUserById(id);
  if (!target) return { ok: false, error: "Compte introuvable" };
  if (target.is_admin) {
    const admins = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1").get() as { n: number }).n;
    if (admins <= 1) return { ok: false, error: "Impossible de supprimer le dernier administrateur" };
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM favorites WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM playcounts WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM recents WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)").run(id);
    db.prepare("DELETE FROM playlists WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
  return { ok: true };
}

/** Set a new password for a user (admin reset or self-change). */
export function setUserPassword(userId: number, newPassword: string): { ok: boolean; error?: string } {
  const pwErr = validatePassword(newPassword);
  if (pwErr) return { ok: false, error: pwErr };
  if (!getUserById(userId)) return { ok: false, error: "Compte introuvable" };
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(newPassword, salt);
  getDb().prepare("UPDATE users SET password_hash = ?, password_salt = ?, is_default = 0 WHERE id = ?").run(hash, salt, userId);
  return { ok: true };
}

/** Self password change — requires the current password. */
export function changePassword(userId: number, currentPassword: string, newPassword: string): { ok: boolean; error?: string } {
  const user = getUserById(userId);
  if (!user) return { ok: false, error: "Compte introuvable" };
  if (!verifyCredentials(user.username, currentPassword)) return { ok: false, error: "Mot de passe actuel incorrect" };
  return setUserPassword(userId, newPassword);
}

export function isDefaultPassword(userId: number): boolean {
  return getUserById(userId)?.is_default === 1;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify a session token and return the user id it carries, or null. */
function decodeSessionToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid?: number; exp: number };
    if (typeof exp !== "number" || Date.now() >= exp || typeof uid !== "number") return null;
    return uid;
  } catch {
    return null;
  }
}

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Resolve the authenticated user for a request (cookie, bearer/?token=, or the
 *  static AURALIS_TOKEN which maps to the first admin). Returns null if none. */
export function getRequestUser(request: Request): UserRow | null {
  ensureAuth();
  const cookie = parseCookie(request.headers.get("cookie"), COOKIE_NAME);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const queryToken = new URL(request.url).searchParams.get("token");

  const uid = decodeSessionToken(cookie) ?? decodeSessionToken(bearer) ?? decodeSessionToken(queryToken);
  if (uid) {
    const user = getUserById(uid);
    if (user) return user;
  }

  const { authToken } = getConfig();
  if (authToken && (bearer === authToken || queryToken === authToken)) {
    return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1").get() as UserRow | undefined) ?? null;
  }
  return null;
}

export function isAuthenticated(request: Request): boolean {
  return getRequestUser(request) !== null;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000);
