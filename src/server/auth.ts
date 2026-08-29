// Multi-user authentication for the self-hosted server. Accounts live in the
// `users` table; the admin (seeded on first run) can create more accounts, and
// each account gets its own favorites / playlists / history. Sessions are signed
// HMAC tokens carrying the user id; they are accepted as a cookie OR as a bearer /
// ?token= (so WebView clients that persist the token in localStorage stay logged
// in across restarts). An optional AURALIS_TOKEN bearer maps to the admin.
//
// No external crypto dependency — Node's crypto (scrypt + HMAC) only.

import crypto from "crypto";
import fs from "fs";
import path from "path";
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

// scrypt is memory-hard (~50–100ms). The Sync variant blocks the event loop on
// every login / password change / user creation, stalling all other requests.
// The async callback variant yields to the libuv thread pool so the Node event
// loop stays free while the KDF runs.
function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex"));
    });
  });
}

/** Sync variant, reserved for the ONE-TIME admin seeding at first boot
 *  (ensureAuth). The hot paths — login, user creation, password change — use the
 *  async hashPassword so the event loop isn't blocked. Seeding runs once ever,
 *  before any request is served, so blocking there is harmless. */
function hashPasswordSync(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/** Constant-time string equality. Used for comparing the static AURALIS_TOKEN
 *  bearer — the password hash and session HMAC already use timingSafeEqual, and
 *  this closes the last `===` secret comparison so timing can't leak the token. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** True when the presented bearer/query token matches the static AURALIS_TOKEN
 *  in constant time (short-circuits safely when either side is absent). */
function matchesAuthToken(authToken: string, bearer: string | null, queryToken: string | null): boolean {
  return (bearer !== null && timingSafeEqualStr(bearer, authToken)) || (queryToken !== null && timingSafeEqualStr(queryToken, authToken));
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
    // is used verbatim; otherwise we generate a random one. We must NOT log the
    // generated password through the structured logger — stdout/JSON logs are
    // routinely shipped to collectors (Docker/Pterodactyl/systemd) and shared, so
    // a plaintext admin secret there is a real exposure. Instead we write it to a
    // 0600 file in the data dir and only log WHERE to read it.
    const envPw = process.env.AURALIS_ADMIN_PASSWORD?.trim();
    const initialPw = envPw && envPw.length >= 6 ? envPw : crypto.randomBytes(9).toString("base64url");
    hash = hashPasswordSync(initialPw, salt);
    isDefault = envPw ? 0 : 1;
    if (!envPw) {
      let where = "(impossible d'écrire le fichier)";
      try {
        const file = path.join(getConfig().dataDir, "INITIAL_ADMIN_PASSWORD.txt");
        fs.writeFileSync(
          file,
          `Auralis — compte admin initial\nutilisateur: ${DEFAULT_ADMIN}\nmot de passe: ${initialPw}\n\n` +
            `Connectez-vous, changez ce mot de passe, puis supprimez ce fichier.\n`,
          { mode: 0o600 },
        );
        try { fs.chmodSync(file, 0o600); } catch { /* best-effort on platforms without POSIX modes */ }
        where = file;
      } catch {
        /* data dir not writable — fall through with the notice below */
      }
      log.warn(
        "No admin account found — generated a temporary admin password. " +
          `It was written to ${where}. Log in, change it, then delete that file ` +
          "(or set AURALIS_ADMIN_PASSWORD to avoid this).",
        { username: DEFAULT_ADMIN },
      );
    }
  }
  // The first insert into the empty table gets id=1, matching the user_id the v2
  // migration assigned to all pre-existing favorites / playlists / history.
  db.prepare(
    "INSERT INTO users (username, password_hash, password_salt, is_admin, is_default, created_at) VALUES (?, ?, ?, 1, ?, ?)",
  ).run(DEFAULT_ADMIN, hash, salt, isDefault, Date.now());
}

export function revokeSessionToken(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function getUserById(id: number): UserRow | null {
  return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
}

export function getUserByName(username: string): UserRow | null {
  return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE username = ?").get(username) as UserRow | undefined) ?? null;
}

/** Verify a username/password pair. Returns the user row on success, else null. */
export async function verifyCredentials(username: string, password: string): Promise<UserRow | null> {
  ensureAuth();
  const row = getDb()
    .prepare("SELECT id, username, password_hash, password_salt, is_admin, is_default, created_at FROM users WHERE username = ?")
    .get(username) as (UserRow & { password_hash: string; password_salt: string }) | undefined;
  if (!row) return null;
  const candidate = await hashPassword(password, row.password_salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(row.password_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { id: row.id, username: row.username, is_admin: row.is_admin, is_default: row.is_default, created_at: row.created_at };
}

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 6) return "Le mot de passe doit faire au moins 6 caractères";
  return null;
}

export async function isPasswordCompromised(password: string): Promise<boolean> {
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return false;
    const text = await res.text();
    return text.split('\n').some(line => line.split(':')[0] === suffix);
  } catch {
    return false;
  }
}

function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

export async function createUser(username: string, password: string, isAdmin = false): Promise<{ ok: boolean; error?: string; id?: number }> {
  ensureAuth();
  const uname = normalizeUsername(username);
  if (!/^[a-z0-9._-]{2,32}$/.test(uname)) return { ok: false, error: "Identifiant invalide (2–32 caractères : lettres, chiffres, . _ -)" };
  const pwErr = validatePassword(password);
  if (pwErr) return { ok: false, error: pwErr };
  if (getUserByName(uname)) return { ok: false, error: "Cet identifiant existe déjà" };
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
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
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
  return { ok: true };
}

/** Set a new password for a user (admin reset or self-change). */
export async function setUserPassword(userId: number, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const pwErr = validatePassword(newPassword);
  if (pwErr) return { ok: false, error: pwErr };
  if (!getUserById(userId)) return { ok: false, error: "Compte introuvable" };
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(newPassword, salt);
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, is_default = 0, token_version = token_version + 1 WHERE id = ?").run(hash, salt, userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return { ok: true };
}

/** Self password change — requires the current password. */
export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const user = getUserById(userId);
  if (!user) return { ok: false, error: "Compte introuvable" };
  if (!verifyCredentials(user.username, currentPassword)) return { ok: false, error: "Mot de passe actuel incorrect" };
  return setUserPassword(userId, newPassword);
}

export function isDefaultPassword(userId: number): boolean {
  return getUserById(userId)?.is_default === 1;
}





export function createSessionToken(userId: number, request?: Request): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const ip = request ? request.headers.get("x-forwarded-for")?.split(',')[0].trim() || "127.0.0.1" : null;
  const ua = request ? request.headers.get("user-agent") : null;
  const now = Date.now();
  
  getDb().prepare(
    "INSERT INTO sessions (id, user_id, user_agent, ip_address, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(token, userId, ua, ip, now, now);
  
  return token;
}

/** Verify a session token and return the user ID it carries, or null. */
function decodeSessionToken(token: string | undefined | null, request?: Request): number | null {
  if (!token) return null;
  try {
    const row = getDb().prepare("SELECT user_id, last_used_at FROM sessions WHERE id = ?").get(token) as { user_id: number; last_used_at: number } | undefined;
    if (!row) return null;
    
    // Update last_used_at if it's older than 1 hour (to avoid constant DB writes)
    const now = Date.now();
    if (now - row.last_used_at > 3600000) {
      const ip = request ? request.headers.get("x-forwarded-for")?.split(',')[0].trim() || "127.0.0.1" : null;
      const ua = request ? request.headers.get("user-agent") : null;
      getDb().prepare("UPDATE sessions SET last_used_at = ?, ip_address = coalesce(?, ip_address), user_agent = coalesce(?, user_agent) WHERE id = ?").run(now, ip, ua, token);
    }
    return row.user_id;
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

let queryTokenWarned = false;
function warnQueryToken(requestUrl: string) {
  if (!queryTokenWarned) {
    queryTokenWarned = true;
    log.warn(`Deprecation: Authentication via '?token=' in URL is deprecated and will be removed in a future release because URLs are logged by proxies. Please use 'Authorization: Bearer <token>' instead. (Seen on: ${new URL(requestUrl).pathname})`);
  }
}

/** Resolve the authenticated user for a request (cookie, bearer/?token=, or the
 *  static AURALIS_TOKEN which maps to the first admin). Returns null if none. */
export function getRequestUser(request: Request): UserRow | null {
  ensureAuth();
  const cookie = parseCookie(request.headers.get("cookie"), COOKIE_NAME);
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const queryToken = new URL(request.url).searchParams.get("token");

  if (queryToken) warnQueryToken(request.url);

  const uid = decodeSessionToken(cookie, request) ?? decodeSessionToken(bearer, request) ?? decodeSessionToken(queryToken, request);
  if (uid) {
    const user = getUserById(uid);
    if (user) return user;
  }

  const { authToken } = getConfig();
  if (authToken && matchesAuthToken(authToken, bearer, queryToken)) {
    return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1").get() as UserRow | undefined) ?? null;
  }
  return null;
}

/** Resolve the authenticated user from a request's bearer / ?token= ONLY — the
 *  session cookie is deliberately ignored. Used by the CSRF guard: a cookie is
 *  auto-attached by the browser (the CSRF vector), whereas a bearer / ?token= is
 *  never sent automatically, so a request that authenticates *purely* via a valid
 *  token can be safely exempted. A merely *present* (but forged/expired/stale)
 *  token returns null here. */
export function getTokenUser(request: Request): UserRow | null {
  ensureAuth();
  const header = request.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const queryToken = new URL(request.url).searchParams.get("token");

  if (queryToken) warnQueryToken(request.url);

  const uid = decodeSessionToken(bearer, request) ?? decodeSessionToken(queryToken, request);
  if (uid) {
    const user = getUserById(uid);
    if (user) return user;
  }

  const { authToken } = getConfig();
  if (authToken && matchesAuthToken(authToken, bearer, queryToken)) {
    return (getDb().prepare("SELECT id, username, is_admin, is_default, created_at FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1").get() as UserRow | undefined) ?? null;
  }
  return null;
}

export function isAuthenticated(request: Request): boolean {
  return getRequestUser(request) !== null;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000);

/** Cookie options for the session cookie, shared by every route that sets it so
 *  the flags never drift apart. `Secure` is added whenever the request arrived
 *  over HTTPS (directly or via a terminating reverse proxy that sets
 *  X-Forwarded-Proto), so the 30-day session token is never sent back in clear
 *  once the deployment is served over TLS — while plain-HTTP LAN installs still
 *  work (a Secure cookie would be dropped there and lock the user out). */
export function sessionCookieOptions(request: Request): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
} {
  let https = false;
  try {
    https = new URL(request.url).protocol === "https:";
  } catch {
    /* malformed URL — treat as non-HTTPS */
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0].trim().toLowerCase() === "https") https = true;
  return { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_S, secure: https };
}
