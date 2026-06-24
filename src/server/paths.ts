// Path safety + audio MIME helpers shared by the streaming, lyrics and art layers.
// Every filesystem access derived from a client-supplied path goes through
// resolveLibraryPath, which guarantees the result stays inside the music root.

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
