// Content-addressed cover-art cache. Embedded pictures and folder covers are
// written to disk keyed by the SHA-1 of their bytes (automatic de-duplication),
// then served by /api/art/[hash]. Files are stored without an extension; the MIME
// type is sniffed from magic bytes at serve time, so one hash maps to one file.

import crypto from "crypto";
import fs from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
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
export async function readCachedArt(hash: string): Promise<CachedArt | null> {
  if (!/^[a-f0-9]{40}$/.test(hash)) return null;
  const file = artPathFor(hash);
  let buffer: Buffer;
  try {
    buffer = await readFile(file);
  } catch {
    return null;
  }
  return { buffer, contentType: sniffImageMime(buffer) };
}

// ---------------------------------------------------------------------------
// Thumbnail variants — embedded covers are frequently 1000–3000px originals
// (up to several MB each), so serving them verbatim for a 160px card means
// dozens of MB on first paint. We resize on demand to a handful of webp buckets,
// cache them to disk (and a small in-memory LRU), and the route serves the
// nearest one via `?w=`. Falls back to the original bytes if sharp is missing,
// so art always renders even where the native module can't load.
// ---------------------------------------------------------------------------
export const ART_VARIANT_SIZES = [96, 160, 256, 384, 640] as const;
const VARIANTS = new Set<number>(ART_VARIANT_SIZES);

// Lazy, cached sharp handle. `undefined` = not tried yet, `null` = unavailable.
type SharpFn = (input: Buffer, opts?: { failOn?: string }) => {
  rotate: () => ReturnType<SharpFn>;
  resize: (w: number, h: number, o: Record<string, unknown>) => ReturnType<SharpFn>;
  webp: (o: Record<string, unknown>) => ReturnType<SharpFn>;
  toBuffer: () => Promise<Buffer>;
};
let sharpFn: SharpFn | null | undefined;
async function getSharp(): Promise<SharpFn | null> {
  if (sharpFn !== undefined) return sharpFn;
  try {
    const mod = (await import("sharp")) as unknown as { default: SharpFn };
    sharpFn = mod.default;
  } catch {
    sharpFn = null;
  }
  return sharpFn;
}

// Small LRU so hot thumbnails skip the disk entirely.
const MEM_MAX = 256;
const memCache = new Map<string, CachedArt>();
function memGet(key: string): CachedArt | undefined {
  const v = memCache.get(key);
  if (v) {
    memCache.delete(key);
    memCache.set(key, v);
  }
  return v;
}
function memSet(key: string, art: CachedArt): void {
  memCache.set(key, art);
  if (memCache.size > MEM_MAX) {
    const oldest = memCache.keys().next().value;
    if (oldest !== undefined) memCache.delete(oldest);
  }
}

/**
 * Read (or lazily generate + cache) a square webp thumbnail of the given size.
 * Unknown sizes fall back to the full-resolution original; so does any sharp
 * failure, so the caller always gets a usable image.
 */
export async function readArtVariant(hash: string, size: number): Promise<CachedArt | null> {
  if (!/^[a-f0-9]{40}$/.test(hash)) return null;
  if (!VARIANTS.has(size)) return readCachedArt(hash);

  const key = `${hash}_${size}`;
  const hit = memGet(key);
  if (hit) return hit;

  const thumbDir = path.join(getConfig().artDir, "thumbs");
  const thumbFile = path.join(thumbDir, `${key}.webp`);
  try {
    const buffer = await readFile(thumbFile);
    const art: CachedArt = { buffer, contentType: "image/webp" };
    memSet(key, art);
    return art;
  } catch {
    // not generated yet
  }

  const original = await readCachedArt(hash);
  if (!original) return null;

  const sharp = await getSharp();
  if (!sharp) return original; // graceful: serve the original untouched

  try {
    const out = await sharp(original.buffer, { failOn: "none" })
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    const art: CachedArt = { buffer: out, contentType: "image/webp" };
    memSet(key, art);
    mkdir(thumbDir, { recursive: true })
      .then(() => writeFile(thumbFile, out))
      .catch(() => {/* cache write best-effort */});
    return art;
  } catch {
    return original;
  }
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
