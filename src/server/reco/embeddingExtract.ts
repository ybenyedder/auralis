// ============================================================================
// DEEP EMBEDDING EXTRACTION RUNNER  (opt-in, spawns the Python extractor)
// ----------------------------------------------------------------------------
// Bridges the Node server to scripts/extract_embeddings.py, which decodes each
// un-embedded track (embedded_at = 0), computes a dense timbre embedding
// (librosa / OpenL3) + optional Demucs stem summary, and writes them straight
// into `tracks.embedding` / `tracks.stems`. Heavy (a model + full decode per
// track), so it is STRICTLY OPT-IN — nothing runs unless AURALIS_EMBEDDINGS=1 is
// set — and it degrades to a clean no-op when Python or the deps are missing. The
// engine already treats embeddings as optional, so a library that never runs this
// simply scores on the 4-D vector.
//
// Runs as a detached-ish fire-and-forget child; SQLite WAL + busy_timeout lets the
// Python writer and the Node server share the DB file safely.
// ============================================================================

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getConfig } from "../config";
import { createLogger } from "../logger";

const log = createLogger("embedding-extract");

let running = false;
export function isExtractingEmbeddings(): boolean {
  return running;
}

function pythonBin(): string {
  return process.env.PYTHON_PATH || process.env.AURALIS_PYTHON || "python3";
}

/** Resolve the extractor script shipped in the repo (or an override path). */
function scriptPath(): string | null {
  const override = process.env.AURALIS_EMBEDDINGS_SCRIPT;
  const candidates = [
    override,
    path.join(process.cwd(), "scripts", "extract_embeddings.py"),
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * Kick the Python embedding extractor over tracks that still need it. No-ops
 * unless explicitly opted in, and never throws (best-effort background work).
 * Resolves when the child exits (or immediately if not opted in / unavailable).
 */
export async function runEmbeddingExtraction(): Promise<void> {
  if (process.env.AURALIS_EMBEDDINGS !== "1") return; // opt-in only
  if (running) return;

  const script = scriptPath();
  if (!script) {
    log.warn("embedding extractor script not found — skipping");
    return;
  }
  const { dbPath, musicDir } = getConfig();

  running = true;
  try {
    await new Promise<void>((resolve) => {
      let child;
      try {
        child = spawn(
          /*turbopackIgnore: true*/ pythonBin(),
          [script, "--db", dbPath, "--music", musicDir, "--limit", process.env.AURALIS_EMBEDDINGS_LIMIT || "0"],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (e) {
        log.warn("could not spawn python — is it installed?", { message: e instanceof Error ? e.message : "unknown" });
        resolve();
        return;
      }
      child.stdout?.on("data", (b: Buffer) => {
        const line = b.toString().trim();
        if (line) log.info("extractor", { line: line.slice(0, 200) });
      });
      child.stderr?.on("data", (b: Buffer) => {
        const line = b.toString().trim();
        if (line) log.warn("extractor", { line: line.slice(0, 200) });
      });
      child.on("error", () => resolve());
      child.on("close", (code) => {
        log.info("embedding extraction finished", { code });
        resolve();
      });
    });
  } finally {
    running = false;
  }
}
