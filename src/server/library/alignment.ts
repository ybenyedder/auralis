// ============================================================================
// FORCED ALIGNMENT — upgrade line-level lyrics to WORD-by-word karaoke, locally.
// ----------------------------------------------------------------------------
// Musixmatch/LRCLIB give reliable LINE-level timing for most tracks but per-word
// ("richsync") timing only for a few. This background pass closes that gap with
// zero network: it hands each track's known line text + its audio to a Python
// forced-aligner (torchaudio MMS_FA, + optional Demucs vocal isolation) which
// refines every line to per-word timestamps, then rewrites the .lrc sidecar in
// the same enhanced format the karaoke renderer already consumes.
//
// It is HEAVY (ML on audio), so unlike the mood pass it is OPT-IN
// (config.lyricsForcedAlign) and a no-op when the script or its Python deps are
// absent. The real work — DB walk, alignment, sidecar writing — all lives in
// scripts/forced_align.py; this module only orchestrates it off the request path.
// ============================================================================

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getConfig } from "../config";
import { getDb } from "../db";
import { createLogger } from "../logger";

const log = createLogger("alignment");

let aligning = false;

/** Locate the bundled aligner script; absent in trimmed standalone builds. */
function scriptPath(): string | null {
  const candidate = path.join(process.cwd(), "scripts", "forced_align.py");
  return fs.existsSync(candidate) ? candidate : null;
}

/** How many line-level lyrics still lack per-word timing (cheap gate query). */
function pendingCount(): number {
  try {
    const row = getDb()
      .prepare(
        // Synced (has a line stamp) but NOT yet enhanced (no inline <..> word tag).
        "SELECT COUNT(*) AS n FROM lyrics WHERE synced LIKE '%[%' AND synced NOT LIKE '%<%'",
      )
      .get() as { n: number } | undefined;
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

function pythonBin(): string {
  return process.env.AURALIS_PYTHON?.trim() || (process.platform === "win32" ? "python" : "python3");
}

/**
 * Run the forced-alignment pass for every track whose lyrics are line-level but
 * not yet word-level. Safe to call repeatedly: it no-ops while running, when the
 * feature is disabled, when the script is missing, or when nothing is pending.
 * Failures (no Python, missing torch) are swallowed — the line-level lyrics stay
 * untouched and the karaoke just keeps estimating word cadence by character count.
 */
export async function runForcedAlignment(): Promise<void> {
  if (aligning) return;
  if (!getConfig().lyricsForcedAlign) return;

  const script = scriptPath();
  if (!script) return;
  if (pendingCount() === 0) return;

  const { musicDir, dataDir } = getConfig();
  aligning = true;
  log.info("forced alignment started");

  await new Promise<void>((resolve) => {
    let child;
    try {
      child = spawn(pythonBin(), [script, "--separate", "auto"], {
        cwd: process.cwd(),
        env: { ...process.env, AURALIS_DATA_DIR: dataDir, AURALIS_MUSIC_DIR: musicDir },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      log.warn("forced alignment could not start", { message: error instanceof Error ? error.message : "unknown" });
      return resolve();
    }

    let upgraded = 0;
    const onLine = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split("\n")) {
        if (line.includes("✓ MOT")) upgraded++;
      }
    };
    child.stdout?.on("data", onLine);
    // The script logs a one-line install hint to stderr when torch is missing.
    child.stderr?.on("data", (b: Buffer) => {
      const msg = b.toString("utf8").trim();
      if (msg) log.warn("forced alignment", { message: msg.slice(0, 200) });
    });
    child.on("error", (error) => {
      log.warn("forced alignment failed to spawn", { message: error.message });
      resolve();
    });
    child.on("close", (code) => {
      log.info("forced alignment complete", { upgraded, code: code ?? -1 });
      resolve();
    });
  }).finally(() => {
    aligning = false;
  });
}
