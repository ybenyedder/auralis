import { test } from "node:test";
import assert from "node:assert/strict";
import { sniffImageMime } from "../src/server/library/art";

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
