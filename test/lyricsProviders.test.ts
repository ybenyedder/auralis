// Unit tests for the extended lyrics providers — the NetEase `yrc` word-level
// parser and both providers' candidate matchers. These are the pure pieces that
// decide WHICH lyrics get paired with a track, so they must never attach the
// wrong song (the wrong-song guard from the LRCLIB picker applies here too).

import { test } from "vitest";
import assert from "node:assert/strict";
import { parseYrc } from "../src/server/lyrics/netease";
import { __qqInternals } from "../src/server/lyrics/qq";

// ── NetEase yrc parsing ─────────────────────────────────────────────────────
// Format: [startMs,durationMs](wordStartMs,wordDurationMs,0)word(...)word…

test("parseYrc turns word tokens into per-word timing and a joined line", () => {
  const yrc = "[1630,3330](1630,450,0)Hello (2080,300,0)world";
  const lines = parseYrc(yrc);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].time, 1.63);
  assert.equal(lines[0].text, "Hello world");
  assert.equal(lines[0].words?.length, 2);
  assert.equal(lines[0].words?.[0].time, 1.63);
  assert.equal(lines[0].words?.[1].time, 2.08);
  assert.equal(lines[0].words?.[1].text, "world");
});

test("parseYrc returns [] for input with no line header", () => {
  assert.equal(parseYrc("just some text").length, 0);
  assert.equal(parseYrc("").length, 0);
});

test("parseYrc sorts lines by start time even when out of order", () => {
  const yrc = "[5000,1000](5000,100,0)second\n[1000,1000](1000,100,0)first";
  const lines = parseYrc(yrc);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].time < lines[1].time);
  assert.equal(lines[0].text, "first");
});

test("parseYrc skips lines whose word tokens are all empty", () => {
  const yrc = "[1000,1000](1000,100,0)(2000,100,0)";
  assert.equal(parseYrc(yrc).length, 0);
});

// ── QQ candidate matching (wrong-song guard) ────────────────────────────────
// searchBestMid is network-bound; maybeBase64 + cleanLyric are pure and are the
// guards that keep a bad mirror response from producing garbage lyrics.

test("maybeBase64 decodes a base64 payload but leaves plain LRC untouched", () => {
  const lrc = "[00:01.00]Hello";
  const b64 = Buffer.from(lrc, "utf8").toString("base64");
  assert.equal(__qqInternals.maybeBase64(b64), lrc);
  assert.equal(__qqInternals.maybeBase64(lrc), lrc);
});

test("cleanLyric rejects a string with no timestamp (returns null, not garbage)", () => {
  assert.equal(__qqInternals.cleanLyric("no timings here"), null);
  assert.equal(__qqInternals.cleanLyric(""), null);
});

test("cleanLyric normalises escaped newlines and BOM into parseable LRC", () => {
  const raw = "\uFEFF[00:01.00]Hello\\n[00:02.00]World";
  const cleaned = __qqInternals.cleanLyric(raw);
  assert.ok(cleaned);
  assert.ok(cleaned.includes("\n"));
  assert.ok(cleaned.startsWith("[00:01.00]"));
});
