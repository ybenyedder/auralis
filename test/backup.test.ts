// Integration tests for POST /api/backup — admin-only DB snapshot download.
// Verifies auth/CSRF gating AND that the downloaded bytes are a real, openable
// SQLite database containing the actual data (not just "some response came back").

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-backup-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.on("exit", () => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

const BACKUP_URL = "http://localhost:4237/api/backup";

async function mods() {
  const { getDb } = await import("../src/server/db");
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { POST: backupPost } = await import("../src/app/api/backup/route");
  return { db: getDb(), createUser, createSessionToken, backupPost };
}

test("a non-admin bearer token gets 403, not a backup", async () => {
  const { db, createUser, createSessionToken, backupPost } = await mods();
  db.exec("DELETE FROM users;");
  const created = createUser("backupuser", "correct-horse-battery-staple", false);
  assert.ok(created.id);
  const token = createSessionToken(created.id);

  const res = await backupPost(new Request(BACKUP_URL, { method: "POST", headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 403);
});

test("an unauthenticated cross-origin POST is rejected by CSRF before admin/auth even runs", async () => {
  const { backupPost } = await mods();
  const res = await backupPost(
    new Request(BACKUP_URL, { method: "POST", headers: { origin: "http://evil.test", host: "localhost:4237" } }),
  );
  assert.equal(res.status, 403);
});

test("an admin bearer token gets a real, openable SQLite snapshot containing the actual users table", async () => {
  const { db, createUser, createSessionToken, backupPost } = await mods();
  db.exec("DELETE FROM users;");
  const created = createUser("backupadmin", "correct-horse-battery-staple", true);
  assert.ok(created.id);
  const token = createSessionToken(created.id);

  const res = await backupPost(new Request(BACKUP_URL, { method: "POST", headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="auralis-backup-\d{4}-\d{2}-\d{2}\.db"/);

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.ok(bytes.length > 0, "backup body is non-empty");
  assert.equal(bytes.subarray(0, 16).toString("utf8"), "SQLite format 3\0", "downloaded bytes are a real SQLite file header");

  // Prove it's not just a valid header but an actually queryable copy of the
  // real data: write it out and open it as its own independent connection.
  const copyPath = path.join(tmp, "downloaded-copy.db");
  fs.writeFileSync(copyPath, bytes);
  const copy = new Database(copyPath, { readonly: true });
  try {
    const row = copy.prepare("SELECT username, is_admin FROM users WHERE username = ?").get("backupadmin") as
      | { username: string; is_admin: number }
      | undefined;
    assert.ok(row, "the admin user created before the backup is present in the downloaded copy");
    assert.equal(row?.is_admin, 1);
  } finally {
    copy.close();
  }
});

test("backups are rate-limited — a burst beyond the cap gets 429", async () => {
  const { db, createUser, createSessionToken, backupPost } = await mods();
  db.exec("DELETE FROM users;");
  const created = createUser("backupburst", "correct-horse-battery-staple", true);
  assert.ok(created.id);
  const token = createSessionToken(created.id);

  const statuses: number[] = [];
  // The limiter's window is process-global (key "backup"), already exercised by
  // the earlier admin-download test in this file, so this burst alone is enough
  // to cross the cap of 3 within the window.
  for (let i = 0; i < 3; i++) {
    const res = await backupPost(new Request(BACKUP_URL, { method: "POST", headers: { authorization: `Bearer ${token}` } }));
    statuses.push(res.status);
  }
  assert.ok(statuses.includes(429), `expected at least one 429 in the burst, got ${JSON.stringify(statuses)}`);
});
