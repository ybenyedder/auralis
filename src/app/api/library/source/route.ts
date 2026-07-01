import fs from "fs";
import path from "path";
import { getConfig, setMusicDir } from "@/server/config";
import { runScan } from "@/server/library/scanner";
import { requireAdmin, json, checkCsrf, checkBodySize } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → the current music source folder (and whether it exists on disk).
// Admin-only: the absolute host path is operator-level information.
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { musicDir } = getConfig();
  return json({ musicDir, exists: fs.existsSync(musicDir) });
}

// POST { dir } → repoint the library at a host-chosen folder, then rescan.
// Lets the self-hoster move their music without editing env vars.
// Admin-only: repointing the root neutralises every per-file path guard, so a
// non-admin must never reach this (it would expose arbitrary host audio files).
export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const denied = requireAdmin(request);
  if (denied) return denied;
  const tooBig = checkBodySize(request);
  if (tooBig) return tooBig;

  let body: { dir?: unknown };
  try {
    body = (await request.json()) as { dir?: unknown };
  } catch {
    return json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const raw = typeof body.dir === "string" ? body.dir.trim() : "";
  if (!raw) return json({ error: "Chemin de dossier requis" }, { status: 400 });

  const abs = path.resolve(raw);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return json({ error: "Dossier introuvable" }, { status: 400 });
  }
  if (!stat.isDirectory()) {
    return json({ error: "Le chemin n'est pas un dossier" }, { status: 400 });
  }

  setMusicDir(abs);
  const scan = await runScan();
  return json({ musicDir: abs, scan });
}
