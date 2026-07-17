import { test } from "node:test";
import assert from "node:assert/strict";

import { matchLibraryTracks } from "../src/lib/auralis/playlistIO";
import { importPlaylistFromUrl, PlaylistImportError } from "../src/server/library/externalPlaylist";
import type { Track } from "../src/lib/auralis/types";

function track(trackhash: string, title: string, artist: string): Track {
  return { trackhash, title, artist };
}

const library: Track[] = [
  track("h1", "One More Time", "Daft Punk"),
  track("h2", "Get Lucky", "Daft Punk"),
  track("h3", "Halo", "Beyoncé"),
  track("h4", "Bohemian Rhapsody", "Queen"),
  track("h5", "Numb", "Linkin Park"),
];

test("matchLibraryTracks: exact title + artist", () => {
  const r = matchLibraryTracks([{ title: "Get Lucky", artist: "Daft Punk" }], library);
  assert.deepEqual(r.hashes, ["h2"]);
  assert.equal(r.matched, 1);
  assert.equal(r.total, 1);
  assert.equal(r.misses.length, 0);
});

test("matchLibraryTracks: folds accents and case", () => {
  const r = matchLibraryTracks([{ title: "halo", artist: "beyonce" }], library);
  assert.deepEqual(r.hashes, ["h3"]);
});

test("matchLibraryTracks: strips parenthetical + trailing remaster/edit noise", () => {
  const r = matchLibraryTracks(
    [
      { title: "Bohemian Rhapsody (Remastered 2011)", artist: "Queen" },
      { title: "One More Time - Radio Edit", artist: "Daft Punk" },
    ],
    library,
  );
  assert.deepEqual(r.hashes, ["h4", "h1"]);
  assert.equal(r.matched, 2);
});

test("matchLibraryTracks: strips featured artists and matches on primary", () => {
  const r = matchLibraryTracks([{ title: "Numb", artist: "Linkin Park feat. Jay-Z" }], library);
  assert.deepEqual(r.hashes, ["h5"]);
});

test("matchLibraryTracks: artist word overlap when the entry lists several", () => {
  const r = matchLibraryTracks([{ title: "Get Lucky", artist: "Daft Punk, Pharrell Williams" }], library);
  assert.deepEqual(r.hashes, ["h2"]);
});

test("matchLibraryTracks: records misses and preserves source order", () => {
  const r = matchLibraryTracks(
    [
      { title: "Nonexistent Song", artist: "Nobody" },
      { title: "Halo", artist: "Beyoncé" },
    ],
    library,
  );
  assert.deepEqual(r.hashes, ["h3"]);
  assert.equal(r.total, 2);
  assert.equal(r.matched, 1);
  assert.deepEqual(r.misses, ["Nobody — Nonexistent Song"]);
});

test("matchLibraryTracks: dedupes repeated matches to one hash", () => {
  const r = matchLibraryTracks(
    [
      { title: "Get Lucky", artist: "Daft Punk" },
      { title: "Get Lucky (Radio Edit)", artist: "Daft Punk" },
    ],
    library,
  );
  assert.deepEqual(r.hashes, ["h2"]);
  assert.equal(r.matched, 1);
});

// --- URL router error branches (all reject BEFORE any network call) ---------

async function rejectsWith(url: string, status: number) {
  await assert.rejects(
    () => importPlaylistFromUrl(url),
    (e: unknown) => e instanceof PlaylistImportError && e.status === status,
    `expected ${url} to reject with status ${status}`,
  );
}

test("importPlaylistFromUrl: rejects empty / malformed / unsupported inputs", async () => {
  await rejectsWith("", 400);
  await rejectsWith("   ", 400);
  await rejectsWith("not a url", 400);
  await rejectsWith("ftp://host/file", 400);
  await rejectsWith("https://example.com/some/page", 415);
});

test("importPlaylistFromUrl: rejects recognised hosts with a bad path", async () => {
  await rejectsWith("https://open.spotify.com/playlist/", 400); // no id
  await rejectsWith("https://www.deezer.com/fr/track/123", 400); // track, not playlist/album
  await rejectsWith("https://music.apple.com/us/song/x/1", 400); // song, not playlist/album
  await rejectsWith("https://www.youtube.com/watch?v=abcdefghijk", 400); // no ?list=
  await rejectsWith("https://link.deezer.com/s/xyz", 400); // short link not resolved
});
