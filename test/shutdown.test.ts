// Verifies the SIGTERM/SIGINT graceful-shutdown hook (src/server/db.ts) actually
// does the right thing when a real OS signal lands on a real process — closeDb()
// called directly (as other tests might) can't exercise the process.on() wiring
// or prove the process exits promptly instead of hanging / needing a SIGKILL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(dirname, "fixtures", "shutdownChild.ts");

test("SIGTERM lets the child close the DB and exit cleanly (not killed/hung)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-shutdown-test-"));
  try {
    const child = spawn(process.execPath, ["--import", "tsx", fixture], {
      cwd: path.join(dirname, ".."),
      env: { ...process.env, AURALIS_DATA_DIR: tmp },
      stdio: ["ignore", "pipe", "inherit"],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("child never printed READY")), 10_000);
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("READY")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on("error", reject);
    });

    // The WAL file exists and has content once the insert lands — this is the
    // "unmerged writes" state a hard kill would leave behind.
    const walPath = path.join(tmp, "auralis.db-wal");
    assert.ok(fs.existsSync(walPath) && fs.statSync(walPath).size > 0, "WAL has pending frames before shutdown");

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("child did not exit within 5s of SIGTERM — hook is not working")), 5_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.kill("SIGTERM");
    });

    assert.equal(exitCode, 0, "graceful handler should exit(0), not be killed or crash");

    // TRUNCATE checkpoint on shutdown merges the WAL into the main file and
    // resets it to empty — a non-empty WAL here means the writes never made it
    // into auralis.db and a hard crash right after would have lost them.
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
    assert.equal(walSize, 0, "WAL should be checkpointed (empty) after a graceful shutdown");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
