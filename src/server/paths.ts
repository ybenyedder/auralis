// Path safety + audio MIME helpers shared by the streaming, lyrics and art layers.
// Every filesystem access derived from a client-supplied path goes through
// resolveLibraryPath, which guarantees the result stays inside the music root.

import fs from "fs";
import path from "path";
import { getConfig } from "./config";

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".m4a", ".m4b", ".aac", ".wav", ".flac", ".ogg", ".oga",
  ".opus", ".webm", ".aiff", ".aif", ".wma", ".alac", ".ape", ".mpc",
]);

/** Resolve a library-relative path to an absolute path, or null if it escapes the root. */
export function resolveLibraryPath(relativePath: string): string | null {
  const root = getConfig().musicDir;
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return target;
}

/**
 * Resolve a library-relative path and verify its *real* (symlink-followed) location
 * still lives inside the music root. The lexical {@link resolveLibraryPath} guard
 * blocks `..` traversal, but a symlink inside the library can point outside it; this
 * follows the link with realpath and re-checks containment to stop exfiltration.
 * Returns null if the path escapes the root or the file does not exist.
 */
export async function resolveRealLibraryPath(relativePath: string): Promise<string | null> {
  const lexicalPath = resolveLibraryPath(relativePath);
  if (!lexicalPath) return null;

  try {
    const root = await fs.promises.realpath(getConfig().musicDir);
    const real = await fs.promises.realpath(lexicalPath);
    const relative = path.relative(root, real);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return real;
  } catch {
    // realpath throws on a missing file (ENOENT) or broken symlink — treat as absent.
    return null;
  }
}

export function isSupportedAudioPath(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp3": return "audio/mpeg";
    case ".m4a":
    case ".m4b":
    case ".aac": return "audio/mp4";
    case ".wav": return "audio/wav";
    case ".flac": return "audio/flac";
    case ".ogg":
    case ".oga": return "audio/ogg";
    case ".opus": return "audio/opus";
    case ".webm": return "audio/webm";
    case ".aiff":
    case ".aif": return "audio/aiff";
    default: return "application/octet-stream";
  }
}
