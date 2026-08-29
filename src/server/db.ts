// SQLite access layer (better-sqlite3). Single shared connection per process,
// WAL mode for concurrent reads during a scan, and a tiny forward-only migration
// runner keyed on PRAGMA user_version.

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { getConfig } from "./config";
import { createLogger } from "./logger";

const log = createLogger("db");

let connection: DB | null = null;

import fs from "fs";
import path from "path";

function getMigrations(): string[] {
  const dir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  return files.map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
}

function migrate(db: DB) {
  const current = db.pragma("user_version", { simple: true }) as number;
  let migrations: string[] = [];
  try {
    migrations = getMigrations();
  } catch (err) {
    log.warn("failed to read migrations directory, skipping migrations", { err });
    return;
  }
  if (current >= migrations.length) return;

  for (let version = current; version < migrations.length; version++) {
    log.info("applying migration", { to: version + 1 });
    db.exec("BEGIN");
    try {
      db.exec(migrations[version]);
      db.pragma(`user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

let shutdownHooked = false;

// A SIGTERM/SIGINT lands mid-write without this (process manager restart,
// `docker stop`, Electron's `serverProcess.kill()` on quit — all send SIGTERM).
// Node's default reaction just dies immediately, leaving WAL frames unmerged
// into the main db file; better-sqlite3's own `.close()` only does a passive
// checkpoint attempt, not a guaranteed one. Hooked once per process, the first
// time a connection is opened, so every entrypoint (web, standalone, desktop's
// forked child) gets it for free without each needing its own shutdown wiring.
function hookGracefulShutdown(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const shutdown = (signal: string) => {
    log.info("shutting down", { signal });
    closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export function getDb(): DB {
  if (connection) return connection;

  const { dbPath } = getConfig();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);

  connection = db;
  hookGracefulShutdown();
  log.info("database ready", { dbPath });
  return db;
}

/** Write a consistent point-in-time copy of the database to `destinationFile`,
 *  via SQLite's online backup API (better-sqlite3's `.backup()`) — safe to run
 *  against a live WAL-mode connection with concurrent readers/writers, unlike a
 *  plain filesystem copy of the .db file (which could grab it mid-write or miss
 *  data still sitting in the WAL). Used by the admin backup-download route. */
export async function backupDbTo(destinationFile: string): Promise<void> {
  await getDb().backup(destinationFile);
}

/** Close the connection — used by tests and graceful shutdown. */
export function closeDb(): void {
  if (connection) {
    // TRUNCATE forces a full checkpoint (merge WAL into the main file, then
    // reset it to empty) rather than the default PASSIVE mode's best-effort
    // partial checkpoint, so an interrupted shutdown never sees a fatter WAL
    // than the writes since the last natural checkpoint actually warranted.
    try {
      connection.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // best effort — still close the handle below even if the checkpoint failed
    }
    connection.close();
  }
  connection = null;
}
