// Locks in the 2026-07-02 opsec hardening pass:
//  - sessionCookieOptions() only sets Secure over HTTPS (direct or via a
//    trusted reverse proxy), never on plain-HTTP LAN installs.
//  - upsertPlaylist()/setSetting() bound hostile oversized input.
// Uses an isolated temp data dir so it never touches a real library DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-hardening-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const USER = 1;

async function setup() {
  const { getDb } = await import("../src/server/db");
  const state = await import("../src/server/state/userState");
  const db = getDb();
  db.exec("DELETE FROM playlists; DELETE FROM playlist_tracks; DELETE FROM user_settings; DELETE FROM users;");
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, is_admin) VALUES (?, 'owner', 'x', 'x', 0)").run(USER);
  return { db, state };
}

test("session cookie is Secure over HTTPS, but NOT over plain HTTP (LAN install stays usable)", async () => {
  const { sessionCookieOptions } = await import("../src/server/auth");
  assert.equal(sessionCookieOptions(new Request("http://192.168.1.10:1970/api/auth/login", { method: "POST" })).secure, false);
  assert.equal(sessionCookieOptions(new Request("https://music.example.com/api/auth/login", { method: "POST" })).secure, true);
  // Reverse proxy terminates TLS and forwards over http:// internally — honour the header.
  const proxied = new Request("http://127.0.0.1:1970/api/auth/login", { method: "POST", headers: { "x-forwarded-proto": "https" } });
  assert.equal(sessionCookieOptions(proxied).secure, true);
  // A comma-list from a proxy chain: the first hop wins.
  const chain = new Request("http://127.0.0.1:1970/api/auth/login", { method: "POST", headers: { "x-forwarded-proto": "https, http" } });
  assert.equal(sessionCookieOptions(chain).secure, true);
  // The flags that must never drift are always present.
  const opts = sessionCookieOptions(new Request("https://x/", { method: "POST" }));
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, "lax");
  assert.equal(opts.path, "/");
});

test("upsertPlaylist caps an oversized name/description instead of storing megabytes", async () => {
  const { db, state } = await setup();
  const id = state.upsertPlaylist(USER, { name: "N".repeat(10_000), description: "D".repeat(50_000) });
  const row = db.prepare("SELECT name, description FROM playlists WHERE id = ?").get(id) as { name: string; description: string };
  assert.equal(row.name.length, 200);
  assert.equal(row.description.length, 2000);
});

test("setSetting bounds the key and rejects a multi-MB value", async () => {
  const { db, state } = await setup();
  state.setSetting(USER, "K".repeat(500), { ok: true });
  const key = db.prepare("SELECT key FROM user_settings WHERE user_id = ?").get(USER) as { key: string };
  assert.equal(key.key.length, 128);
  assert.throws(() => state.setSetting(USER, "big", "V".repeat(20_000)), /too large/);
});
