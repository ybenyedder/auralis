// Auralis server configuration — resolves all runtime paths and options from the
// environment with safe, documented local-first defaults. No third-party services.
//
// This module is server-only. It must never be imported from a client component.

import fs from "fs";
import os from "os";
import path from "path";

export interface AuralisConfig {
  /** Absolute path to the music library that is scanned and streamed. */
  musicDir: string;
  /** Absolute path to the writable data directory (database, art cache, logs). */
  dataDir: string;
  /** Absolute path to the SQLite database file. */
  dbPath: string;
  /** Absolute path to the on-disk cover-art cache. */
  artDir: string;
  /** TCP port the standalone/desktop server binds to. */
  port: number;
  /** Optional bearer token required for API access (LAN hardening). Empty = open. */
  authToken: string;
  /** Whether the lyrics provider may reach the network (LRCLIB). */
  lyricsOnline: boolean;
  /** Base URL of the open lyrics database. Self-hostable LRCLIB mirrors are supported. */
  lyricsEndpoint: string;
  /** Keyless plain-lyrics fallback used when LRCLIB has nothing (lyrics.ovh). Empty disables it. */
  lyricsFallbackEndpoint: string;
  /** Whether to write fetched lyrics back to a .lrc sidecar (self-hosting). */
  lyricsWriteSidecar: boolean;
  /** Max files scanned in one pass (guards pathological trees). */
  maxScanFiles: number;
  /** Max directory recursion depth. */
  maxScanDepth: number;
}

function firstDefined(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function resolveDataDir(): string {
  const explicit = firstDefined(process.env.AURALIS_DATA_DIR);
  if (explicit) return path.resolve(/*turbopackIgnore: true*/ explicit);

  // XDG Base Directory on Linux, sensible equivalents elsewhere.
  const xdg = firstDefined(process.env.XDG_DATA_HOME);
  if (xdg) return path.resolve(xdg, "auralis");

  if (process.platform === "win32") {
    const appData = firstDefined(process.env.APPDATA);
    if (appData) return path.resolve(appData, "Auralis");
  }
  if (process.platform === "darwin") {
    return path.resolve(os.homedir(), "Library", "Application Support", "Auralis");
  }
  return path.resolve(os.homedir(), ".local", "share", "auralis");
}

// Host-chosen settings (e.g. the music folder picked from the desktop app) are
// persisted next to the database so they survive restarts and outrank the env
// default. The self-hoster can repoint the library without touching env vars.
function hostSettingsPath(): string {
  return path.join(resolveDataDir(), "host-settings.json");
}
function readHostSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ hostSettingsPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveMusicDir(): string {
  const stored = readHostSettings().musicDir;
  const configured = firstDefined(typeof stored === "string" ? stored : undefined, process.env.AURALIS_MUSIC_DIR);
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  return path.resolve(os.homedir(), "Music");
}

/** Persist a host-chosen music directory and reset the cached config so the next
 *  scan reads the new folder. Returns the resolved absolute path. */
export function setMusicDir(dir: string): string {
  const abs = path.resolve(dir);
  fs.mkdirSync(resolveDataDir(), { recursive: true });
  const next = { ...readHostSettings(), musicDir: abs };
  fs.writeFileSync(hostSettingsPath(), JSON.stringify(next, null, 2));
  resetConfigCache();
  return abs;
}

function parsePort(): number {
  const raw = firstDefined(process.env.AURALIS_PORT, process.env.PORT);
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 4237;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  const v = value?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

let cached: AuralisConfig | null = null;

export function getConfig(): AuralisConfig {
  if (cached) return cached;

  const dataDir = resolveDataDir();
  const config: AuralisConfig = {
    musicDir: resolveMusicDir(),
    dataDir,
    dbPath: path.join(dataDir, "auralis.db"),
    artDir: path.join(dataDir, "art"),
    port: parsePort(),
    authToken: firstDefined(process.env.AURALIS_TOKEN) ?? "",
    lyricsOnline: parseBool(process.env.AURALIS_LYRICS_ONLINE, true),
    lyricsEndpoint: firstDefined(process.env.AURALIS_LYRICS_ENDPOINT) ?? "https://lrclib.net",
    lyricsFallbackEndpoint: process.env.AURALIS_LYRICS_FALLBACK ?? "https://api.lyrics.ovh",
    lyricsWriteSidecar: parseBool(process.env.AURALIS_LYRICS_SIDECAR, true),
    maxScanFiles: Number.parseInt(process.env.AURALIS_MAX_SCAN_FILES ?? "", 10) || 200_000,
    maxScanDepth: Number.parseInt(process.env.AURALIS_MAX_SCAN_DEPTH ?? "", 10) || 12,
  };

  // The data directory must exist and be writable; the music directory may be empty.
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.artDir, { recursive: true });

  cached = config;
  return config;
}

/** Reset cached config — used by tests that mutate the environment. */
export function resetConfigCache(): void {
  cached = null;
}
