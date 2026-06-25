import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSyncedLyrics, isSynced, serializeLrc } from "../src/server/lyrics/lrc";

test("parseSyncedLyrics parses timestamps and strips tags", () => {
  const lrc = "[00:18.20] Hello, it's me\n[00:23.54] I was wondering\n[ar:Adele]";
  const lines = parseSyncedLyrics(lrc);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "Hello, it's me");
  assert.ok(Math.abs(lines[0].time - 18.2) < 0.001);
  assert.ok(Math.abs(lines[1].time - 23.54) < 0.001);
});

test("parseSyncedLyrics orders lines by time", () => {
  const lines = parseSyncedLyrics("[00:30.00] later\n[00:05.00] earlier");
  assert.equal(lines[0].text, "earlier");
  assert.equal(lines[1].text, "later");
});

test("parseSyncedLyrics handles multiple timestamps on one line", () => {
  const lines = parseSyncedLyrics("[00:01.00][00:10.00] repeated chorus");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "repeated chorus");
  assert.equal(lines[1].text, "repeated chorus");
});

test("parseSyncedLyrics applies the [offset:] tag (positive shifts earlier)", () => {
  const earlier = parseSyncedLyrics("[offset:+500]\n[00:10.00] line");
  assert.ok(Math.abs(earlier[0].time - 9.5) < 0.001, `expected 9.5, got ${earlier[0].time}`);
  const later = parseSyncedLyrics("[offset:-500]\n[00:10.00] line");
  assert.ok(Math.abs(later[0].time - 10.5) < 0.001, `expected 10.5, got ${later[0].time}`);
  // A bare positive value (no sign) behaves the same as +.
  const bare = parseSyncedLyrics("[offset:250]\n[00:10.00] line");
  assert.ok(Math.abs(bare[0].time - 9.75) < 0.001, `expected 9.75, got ${bare[0].time}`);
  // Times are kept raw (not clamped to 0) so early lines stay individually
  // selectable — a negative time just means "already active at playback start".
  const negative = parseSyncedLyrics("[offset:+5000]\n[00:01.00] line");
  assert.ok(Math.abs(negative[0].time - -4) < 0.001, `expected -4, got ${negative[0].time}`);
});

test("parseSyncedLyrics parses enhanced (word-synced) LRC into per-word timing", () => {
  const lines = parseSyncedLyrics("[00:12.30]<00:12.30>Hello <00:12.90>world <00:13.50>now");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "Hello world now");
  assert.ok(lines[0].words, "expected per-word timing");
  assert.equal(lines[0].words.length, 3);
  assert.deepEqual(lines[0].words.map((w) => w.text), ["Hello", "world", "now"]);
  assert.ok(Math.abs(lines[0].words[0].time - 12.3) < 0.001);
  assert.ok(Math.abs(lines[0].words[1].time - 12.9) < 0.001);
  assert.ok(Math.abs(lines[0].words[2].time - 13.5) < 0.001);
});

test("parseSyncedLyrics word timing honours the [offset:] tag", () => {
  const lines = parseSyncedLyrics("[offset:+500]\n[00:12.30]<00:12.30>Hi <00:13.00>there");
  assert.ok(Math.abs(lines[0].time - 11.8) < 0.001, `line ${lines[0].time}`);
  const words = lines[0].words;
  assert.ok(words, "expected per-word timing");
  assert.ok(Math.abs(words[0].time - 11.8) < 0.001, `w0 ${words[0].time}`);
  assert.ok(Math.abs(words[1].time - 12.5) < 0.001, `w1 ${words[1].time}`);
});

test("parseSyncedLyrics leaves words undefined for line-level LRC", () => {
  const lines = parseSyncedLyrics("[00:18.20] Hello, it's me");
  assert.equal(lines[0].words, undefined);
});

test("parseSyncedLyrics returns [] for plain text", () => {
  assert.deepEqual(parseSyncedLyrics("just a plain line\nanother"), []);
  assert.deepEqual(parseSyncedLyrics(""), []);
});

test("isSynced detects timestamps", () => {
  assert.equal(isSynced("[00:01.00] x"), true);
  assert.equal(isSynced("plain"), false);
  assert.equal(isSynced(null), false);
});

test("serializeLrc round-trips through the parser", () => {
  const lines = [
    { time: 18.2, text: "Hello, it's me" },
    { time: 23.54, text: "I was wondering" },
  ];
  const text = serializeLrc(lines);
  const reparsed = parseSyncedLyrics(text);
  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].text, "Hello, it's me");
  assert.ok(Math.abs(reparsed[0].time - 18.2) < 0.02);
});

test("serializeLrc preserves enhanced per-word timing on round-trip", () => {
  const original = parseSyncedLyrics("[00:12.30]<00:12.30>Hello <00:12.90>world <00:13.50>now");
  const text = serializeLrc(original);
  assert.ok(/<00:12\.90>world/.test(text), `expected word stamps, got: ${text}`);
  const reparsed = parseSyncedLyrics(text);
  assert.ok(reparsed[0].words, "expected per-word timing to survive");
  assert.equal(reparsed[0].words.length, 3);
  assert.deepEqual(reparsed[0].words.map((w) => w.text), ["Hello", "world", "now"]);
  assert.ok(Math.abs(reparsed[0].words[1].time - 12.9) < 0.02, `w1 ${reparsed[0].words[1].time}`);
});

test("serializeLrc rolls 100 centiseconds into the next second", () => {
  const text = serializeLrc([{ time: 12.999, text: "x" }]);
  assert.equal(text, "[00:13.00]x");
});
