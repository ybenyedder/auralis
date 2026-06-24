// Content-addressed cover-art cache. Embedded pictures and folder covers are
// written to disk keyed by the SHA-1 of their bytes (automatic de-duplication),
// then served by /api/art/[hash]. Files are stored without an extension; the MIME
// type is sniffed from magic bytes at serve time, so one hash maps to one file.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getConfig } from "../config";

const FOLDER_COVER_NAMES = [
  "cover.jpg", "cover.jpeg", "cover.png", "cover.webp",
  "folder.jpg", "folder.jpeg", "folder.png",
  "front.jpg", "front.jpeg", "front.png",
  "album.jpg", "albumart.jpg", "albumartsmall.jpg",
];

function sha1(data: Buffer): string {
  return crypto.createHash("sha1").update(data).digest("hex");
}

function artPathFor(hash: string): string {
  return path.join(getConfig().artDir, hash);
}

/** Persist an image buffer to the art cache and return its content hash. */
export function cacheArtBuffer(data: Buffer): string | null {
  if (!data || data.length === 0) return null;
  const hash = sha1(data);
  const file = artPathFor(hash);
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, data);
    return hash;
  } catch {
    return null;
  }
}

/** Look for a sidecar cover image in a directory and cache it. */
export function cacheFolderCover(dir: string): string | null {
  for (const name of FOLDER_COVER_NAMES) {
    const candidate = path.join(dir, name);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size > 0 && stat.size < 25 * 1024 * 1024) {
        return cacheArtBuffer(fs.readFileSync(candidate));
      }
    } catch {
      // not present — keep looking
    }
  }
  return null;
}

export interface CachedArt {
  buffer: Buffer;
  contentType: string;
}

/** Read a cached art file and detect its content type from magic bytes. */
export function readCachedArt(hash: string): CachedArt | null {
  if (!/^[a-f0-9]{40}$/.test(hash)) return null;
  const file = artPathFor(hash);
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return null;
  }
  return { buffer, contentType: sniffImageMime(buffer) };
}

/** Detect a raster image MIME type from the leading bytes of a buffer. */
export function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  if (buf.length >= 6 && buf.toString("ascii", 0, 6) === "GIF87a") return "image/gif";
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp";
  return "application/octet-stream";
}
