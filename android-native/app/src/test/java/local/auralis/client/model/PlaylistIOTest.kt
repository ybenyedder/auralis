package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the playlist file port in [PlaylistIO.kt]: external-track
 * matching (src/lib/auralis/playlistIO.ts matchLibraryTracks), M3U/JSON file
 * parsing (parsePlaylistFile) and the byte-compatible exports — round-tripped so
 * a file exported here re-imports on both the app and the web client.
 */
class PlaylistIOTest {

    private fun track(
        hash: String,
        title: String,
        artist: String? = "Artiste",
        album: String? = "Album",
        filepath: String? = null,
        duration: Double? = null,
        artists: List<ArtistRef> = emptyList(),
    ) = Track(
        trackhash = hash, title = title, artist = artist, album = album, albumhash = null,
        duration = duration, filepath = filepath, folder = null, image = null,
        isFavorite = false, playcount = 0, disc = null, track = null, year = null,
        genre = null, mood = null, energy = null, bpm = null, gain = null,
        bitrate = null, samplerate = null, codec = null, lossless = false,
        size = null, hasLyrics = false, addedAt = null, color = null, artists = artists,
    )

    private val neon = track("h1", "Neon", artist = "Carpenter Brut", filepath = "music/Carpenter Brut/Neon.flac")
    private val ete = track("h2", "Été", artist = "Kavinsky", filepath = "music/Kavinsky/Été.flac", duration = 296.5)
    private val divaA = track("h3", "Diva", artist = "Artist A", filepath = "music/Artist A/Diva.flac")
    private val divaB = track("h4", "Diva", artist = "Band B")
    private val solo = track("h5", "Solo", artist = "Someone", artists = listOf(ArtistRef("ah1", "Someone")))
    private val lib = listOf(neon, ete, divaA, divaB, solo)

    // ---- matchLibraryTracks ------------------------------------------------

    @Test
    fun `external entries match by title and artist folding noise and accents`() {
        val entries = listOf(
            ExternalTrackEntry("Neon (Remastered 2011)", "Carpenter Brut"),
            ExternalTrackEntry("Été - Radio Edit", "Kavinsky"),
            ExternalTrackEntry("Ghost Song", "Nobody"),
        )
        val res = matchLibraryTracks(entries, lib)
        assertEquals(listOf("h1", "h2"), res.hashes)
        assertEquals(2, res.matched)
        assertEquals(3, res.total)
        assertEquals(listOf("Nobody — Ghost Song"), res.misses)
    }

    @Test
    fun `title matches fall back to overlapping artist words`() {
        // "artist a live" shares the significant word "artist" with "Artist A" —
        // the single-letter word "a" is not significant.
        val res = matchLibraryTracks(listOf(ExternalTrackEntry("Diva", "artist a live")), lib)
        assertEquals(listOf("h3"), res.hashes)
    }

    @Test
    fun `title-only fallback takes a lone candidate`() {
        // Nothing overlaps with "Nobody", but "Solo" is the only candidate.
        val res = matchLibraryTracks(listOf(ExternalTrackEntry("Solo", "Nobody")), lib)
        assertEquals(listOf("h5"), res.hashes)
        // With two same-title candidates and no overlap nothing is guessed.
        val res2 = matchLibraryTracks(listOf(ExternalTrackEntry("Diva", "Nobody")), lib)
        assertTrue(res2.hashes.isEmpty())
    }

    @Test
    fun `matched hashes are deduped in source order`() {
        val res = matchLibraryTracks(
            listOf(
                ExternalTrackEntry("Neon", "Carpenter Brut"),
                ExternalTrackEntry("Neon (2011 Remaster)", "Carpenter Brut"),
            ),
            lib,
        )
        assertEquals(listOf("h1"), res.hashes)
        assertEquals(1, res.matched)
        assertEquals(2, res.total)
    }

    @Test
    fun `misses are formatted with the artist and capped at 60`() {
        val entries = (1..70).map { ExternalTrackEntry("Introuvable $it", "Ghost") }
        val res = matchLibraryTracks(entries, lib)
        assertEquals(70, res.total)
        assertEquals(60, res.misses.size)
        assertEquals("Ghost — Introuvable 1", res.misses[0])
        val noArtist = matchLibraryTracks(listOf(ExternalTrackEntry("SansArtiste", null)), lib)
        assertEquals(listOf("SansArtiste"), noArtist.misses)
    }

    // ---- parsePlaylistFile -------------------------------------------------

    @Test
    fun `m3u files resolve by stream url trackhash and extinf title`() {
        val text = """
            #EXTM3U
            #PLAYLIST:Ma playlist

            #EXTINF:123,Artist A - Diva
            /api/stream/music/Artist%20A/Diva.flac
            #EXTINF:296,Kavinsky - Été
            music/Kavinsky/Été.flac
            #EXTINF:100,Someone - Solo
            h2
        """.trimIndent()
        val res = parsePlaylistFile("fichier.m3u8", text, lib)
        assertEquals("Ma playlist", res.name)
        // 1) URL path, 2) bare path, 3) raw trackhash fallback.
        assertEquals(listOf("h3", "h2", "h2"), res.hashes)
        assertEquals(3, res.matched)
        assertEquals(3, res.total)
    }

    @Test
    fun `m3u extinf titles fall back to the title artist key`() {
        val text = "#EXTM3U\n#EXTINF:100,Someone - Solo\n/path/inconnu.flac"
        val res = parsePlaylistFile("x.m3u", text, lib)
        assertEquals(listOf("h5"), res.hashes)
        assertEquals(1, res.total)
    }

    @Test
    fun `m3u parsing skips comments blanks and a BOM and keeps crlf order`() {
        val text = "\uFEFF#EXTM3U\r\n#EXTINF:1,Kavinsky - Été\r\n\r\nunknown/path.flac\r\nh1\r\n# a comment\r\n"
        val res = parsePlaylistFile("x.m3u8", text, lib)
        assertEquals("x", res.name) // filename minus extension
        // First entry via the EXTINF "artist - title" fallback, second via trackhash.
        assertEquals(listOf("h2", "h1"), res.hashes)
        assertEquals(2, res.total)
    }

    @Test
    fun `json files resolve by trackhash filepath and title artist`() {
        val text = """
            {"name":"Export","tracks":[
              {"trackhash":"h1"},
              {"filepath":"Music/Kavinsky/été.flac"},
              {"title":"Diva","artist":"Band B"},
              {"trackhash":"inconnu"}
            ]}
        """.trimIndent()
        val res = parsePlaylistFile("export.json", text, lib)
        assertEquals("Export", res.name)
        assertEquals(listOf("h1", "h2", "h4"), res.hashes)
        assertEquals(3, res.matched)
        assertEquals(4, res.total)
    }

    @Test
    fun `json detection sniffs the content when the name is unknown`() {
        val res = parsePlaylistFile("playlist", """{"name":"Sniffed","tracks":[{"trackhash":"h1"}]}""", lib)
        assertEquals("Sniffed", res.name)
        assertEquals(listOf("h1"), res.hashes)
    }

    // ---- exports (byte-compatible with the web) ----------------------------

    @Test
    fun `m3u export matches the web format byte for byte`() {
        val content = exportPlaylistM3U("Ma Playlist", listOf(ete, divaB), "https://srv.example.com")
        val expected = listOf(
            "#EXTM3U",
            "#PLAYLIST:Ma Playlist",
            "#EXTINF:297,Kavinsky - Été",
            "https://srv.example.com/api/stream/music/Kavinsky/%C3%89t%C3%A9.flac",
            "#EXTINF:0,Band B - Diva",
            "h4",
        ).joinToString("\n")
        assertEquals(expected, content)
    }

    @Test
    fun `json export matches JSON stringify null 2 byte for byte`() {
        val content = exportPlaylistJSON(
            "Ma Playlist",
            listOf(
                ete.copy(title = "Été \"Live\""),
                divaB.copy(artist = null, artists = listOf(ArtistRef("ah9", "Carpenter Brut")), album = "Trilogy", filepath = ""),
            ),
            "2026-01-01T00:00:00.000Z",
        )
        val expected = """
            {
              "auralisPlaylist": 1,
              "name": "Ma Playlist",
              "exportedAt": "2026-01-01T00:00:00.000Z",
              "tracks": [
                {
                  "trackhash": "h2",
                  "title": "Été \"Live\"",
                  "artist": "Kavinsky",
                  "album": "Album",
                  "filepath": "music/Kavinsky/Été.flac"
                },
                {
                  "trackhash": "h4",
                  "title": "Diva",
                  "artist": "Carpenter Brut",
                  "album": "Trilogy",
                  "filepath": ""
                }
              ]
            }
        """.trimIndent()
        assertEquals(expected, content)
    }

    @Test
    fun `json export of an empty playlist is an empty array`() {
        val content = exportPlaylistJSON("Vide", emptyList(), "2026-01-01T00:00:00.000Z")
        assertTrue(content.contains("\"tracks\": []"))
    }

    @Test
    fun `exported playlists round-trip through the parser`() {
        val tracks = listOf(neon, ete, divaB)
        // JSON: lossless round-trip keyed on trackhash.
        val json = exportPlaylistJSON("RT", tracks, "2026-01-01T00:00:00.000Z")
        assertEquals(tracks.map { it.trackhash }, parsePlaylistFile("rt.json", json, lib).hashes)
        // M3U: resolves via the exported stream URLs (and the trackhash line).
        val m3u = exportPlaylistM3U("RT", tracks, "https://srv.example.com")
        assertEquals(tracks.map { it.trackhash }, parsePlaylistFile("rt.m3u8", m3u, lib).hashes)
    }

    @Test
    fun `playlistSlug mirrors the web download filename slug`() {
        assertEquals("ma-playlist", playlistSlug("Ma Playlist!"))
        assertEquals("les-été-2024", playlistSlug("Les Été — 2024"))
        assertEquals("playlist", playlistSlug("   "))
        assertEquals("playlist", playlistSlug("///"))
    }
}
