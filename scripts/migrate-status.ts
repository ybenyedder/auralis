/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { getConfig } from "../src/server/config";

function getMigrations(): string[] {
  const dir = path.join(process.cwd(), "migrations");
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

function run() {
  const { dbPath } = getConfig();
  let db;
  try {
    db = new Database(dbPath, { fileMustExist: false });
  } catch (err) {
    console.error(`❌ Could not open database at ${dbPath}:`, err);
    process.exit(1);
  }

  const current = db.pragma("user_version", { simple: true }) as number;
  const migrations = getMigrations();
  const total = migrations.length;

  console.log(`Database: ${dbPath}`);
  console.log(`Current Version: ${current}`);
  console.log(`Available Migrations: ${total}`);

  if (current === total) {
    console.log("✅ Database is up to date.");
  } else if (current < total) {
    console.log(`⚠️ Database is behind by ${total - current} migrations.`);
    console.log("Pending migrations:");
    for (let i = current; i < total; i++) {
      console.log(`  - ${migrations[i]}`);
    }
  } else {
    console.log(`❓ Database version (${current}) is ahead of available migrations (${total}).`);
  }

  db.close();
}

run();
