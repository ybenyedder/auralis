import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-art-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

import { sniffImageMime, cacheArtBuffer, readCachedArt } from "../src/server/library/art";

test("sniffImageMime detects common raster formats", () => {
  assert.equal(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
  assert.equal(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageMime(Buffer.from("GIF89a----", "ascii")), "image/gif");
  assert.equal(sniffImageMime(Buffer.from([0x42, 0x4d, 0x00])), "image/bmp");
});

test("sniffImageMime detects WEBP via RIFF container", () => {
  const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")]);
  assert.equal(sniffImageMime(webp), "image/webp");
});

test("sniffImageMime falls back to octet-stream", () => {
  assert.equal(sniffImageMime(Buffer.from([0x00, 0x01, 0x02, 0x03])), "application/octet-stream");
  assert.equal(sniffImageMime(Buffer.from([])), "application/octet-stream");
});

test("cacheArtBuffer rejects an empty buffer", () => {
  assert.equal(cacheArtBuffer(Buffer.from([])), null);
});

test("cacheArtBuffer is content-addressed: same bytes -> same hash, de-duplicated on disk", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const hash1 = cacheArtBuffer(png);
  const hash2 = cacheArtBuffer(png);
  assert.ok(hash1 && /^[a-f0-9]{40}$/.test(hash1), "returns a SHA-1 hex hash");
  assert.equal(hash1, hash2, "identical bytes hash identically — caching twice is a no-op, not a duplicate file");
});

test("readCachedArt round-trips the exact bytes and content type just cached", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
  const hash = cacheArtBuffer(png);
  assert.ok(hash);
  const art = await readCachedArt(hash!);
  assert.ok(art);
  assert.equal(art!.contentType, "image/png");
  assert.ok(art!.buffer.equals(png));
});

test("readCachedArt rejects a malformed hash instead of touching the filesystem with it", async () => {
  // /api/art/[hash] is a PUBLIC route — this regex IS the path-traversal boundary
  // (content-addressed hashes are safe to serve to anyone; arbitrary path segments
  // are not). A hash-shaped string that isn't valid SHA-1 hex must short-circuit
  // before artPathFor() ever builds a path from it.
  assert.equal(await readCachedArt("../../etc/passwd"), null);
  assert.equal(await readCachedArt("not-a-hash"), null);
  assert.equal(await readCachedArt(""), null);
});

test("readCachedArt returns null for a well-formed hash that was never cached", async () => {
  assert.equal(await readCachedArt("0".repeat(40)), null);
});
