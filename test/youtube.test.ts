// Unit tests for the pure-JS YouTube engine's text helpers (the network parts
// stay out of CI). They pin the metadata cleanup that turns raw YouTube titles
// into library-quality artist/title pairs.

import { test } from "vitest";
import assert from "node:assert/strict";
import { cleanTitle, splitArtistTitle, audioExtFor } from "../src/server/library/youtube";

test("cleanTitle strips the noise brackets YouTube titles drown in", () => {
  assert.equal(cleanTitle("Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams"), "Daft Punk - Get Lucky ft. Pharrell Williams");
  assert.equal(cleanTitle("Indila - Dernière Danse [Clip Officiel] (Official Video)"), "Indila - Dernière Danse [Clip Officiel]");
  assert.equal(cleanTitle("Some Song (Lyrics)"), "Some Song");
  assert.equal(cleanTitle("Some Song [HQ]"), "Some Song");
  assert.equal(cleanTitle("Mix (Visualizer)"), "Mix");
  assert.equal(cleanTitle("Clip #shorts"), "Clip");
});

test("cleanTitle keeps meaningful parentheses", () => {
  assert.equal(cleanTitle("Get Lucky (feat. Pharrell Williams)"), "Get Lucky (feat. Pharrell Williams)");
  assert.equal(cleanTitle("Strobe (Radio Edit)"), "Strobe (Radio Edit)");
  assert.equal(cleanTitle("Wake Me Up (Remix)"), "Wake Me Up (Remix)");
  // A trailing noise token after a meaningful one is still trimmed, the
  // meaningful one survives.
  assert.equal(cleanTitle("Wake Me Up (feat. X) (Official Audio)"), "Wake Me Up (feat. X)");
});

test("splitArtistTitle splits the standard YouTube 'Artist - Title' shape", () => {
  assert.deepEqual(splitArtistTitle("Daft Punk - Get Lucky"), { artist: "Daft Punk", title: "Get Lucky" });
  assert.deepEqual(splitArtistTitle("Indila – Dernière Danse"), { artist: "Indila", title: "Dernière Danse" });
  // Non-greedy on the artist side: a " - " inside the TITLE keeps the title whole.
  assert.deepEqual(splitArtistTitle("Artist - Title - Live"), { artist: "Artist", title: "Title - Live" });
  assert.equal(splitArtistTitle("No separator here"), null);
  assert.equal(splitArtistTitle("Way too long artist name ".repeat(4) + " - Title"), null);
});

test("audioExtFor maps stream mimes to container extensions", () => {
  assert.equal(audioExtFor('audio/mp4; codecs="mp4a.40.2"'), ".m4a");
  assert.equal(audioExtFor("audio/webm; codecs=\"opus\""), ".webm");
  assert.equal(audioExtFor("audio/mpeg"), ".mp3");
  assert.equal(audioExtFor(undefined), ".m4a");
});
