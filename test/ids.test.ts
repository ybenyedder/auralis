import { test } from "node:test";
import assert from "node:assert/strict";
import { artistHash, albumHash, trackHashForPath, normalizeName } from "../src/server/library/ids";

test("hashes are deterministic", () => {
  assert.equal(artistHash("Aurora Veil"), artistHash("Aurora Veil"));
  assert.equal(albumHash("Aurora Veil", "Neon Atlas"), albumHash("Aurora Veil", "Neon Atlas"));
  assert.equal(trackHashForPath("a/b/c.mp3"), trackHashForPath("a/b/c.mp3"));
});

test("hashes carry their type prefix", () => {
  assert.match(artistHash("x"), /^artist-[a-f0-9]{16}$/);
  assert.match(albumHash("x", "y"), /^album-[a-f0-9]{16}$/);
  assert.match(trackHashForPath("p"), /^track-[a-f0-9]{16}$/);
});

test("artist/album hashing is diacritic- and case-insensitive", () => {
  assert.equal(artistHash("Beyoncé"), artistHash("beyonce"));
  assert.equal(albumHash("Café", "Tabac"), albumHash("cafe", "tabac"));
});

test("distinct inputs produce distinct hashes", () => {
  assert.notEqual(artistHash("A"), artistHash("B"));
  assert.notEqual(albumHash("Artist", "One"), albumHash("Artist", "Two"));
  assert.notEqual(trackHashForPath("a.mp3"), trackHashForPath("b.mp3"));
});

test("normalizeName strips accents and lowercases", () => {
  assert.equal(normalizeName("  Crème Brûlée "), "creme brulee");
  assert.equal(normalizeName(undefined), "");
});
