package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the playlist-import "download missing tracks" logic:
 *  bulk-download item building (downloadQuery / downloadItems) and the unmatched
 *  entries surfaced by matchLibraryTracks / parsePlaylistFile. */
class PlaylistIOMissingTest {

    private fun track(
        hash: String,
        title: String,
        artist: String? = "Artiste",
        filepath: String? = null,
    ) = Track(
        trackhash = hash, title = title, artist = artist, album = "Album", albumhash = null,
        duration = null, filepath = filepath, folder = null, image = null,
        isFavorite = false, playcount = 0, disc = null, track = null, year = null,
        genre = null, mood = null, energy = null, bpm = null, gain = null,
        bitrate = null, samplerate = null, codec = null, lossless = false,
        size = null, hasLyrics = false, addedAt = null, color = null, artists = emptyList(),
    )

    private val lib = listOf(
        track("t1", "Diva", artist = "Artist A", filepath = "music/Artist A/Diva.flac"),
        track("t2", "Neon", artist = "Carpenter Brut"),
    )

    // ---- downloadQuery / downloadItems ------------------------------------

    @Test
    fun `download query joins artist and title`() {
        assertEquals("artist a Diva", downloadQuery(ExternalTrackEntry("Diva", "artist a")))
        assertEquals("Diva", downloadQuery(ExternalTrackEntry("Diva", null)))
        assertEquals("Diva", downloadQuery(ExternalTrackEntry("Diva", "  ")))
        assertEquals("Only Artist", downloadQuery(ExternalTrackEntry("  ", "Only Artist")))
    }

    @Test
    fun `download items dedupe by query and cap at the server batch limit`() {
        val dup = listOf(
            ExternalTrackEntry("Diva", "A"),
            ExternalTrackEntry("Diva", "a"),
            ExternalTrackEntry("Other", "A"),
        )
        val items = downloadItems(dup)
        assertEquals(2, items.size)
        assertEquals("A Diva", items[0].query)
        assertEquals("Diva", items[0].title)
        assertEquals("A Other", items[1].query)

        val many = (1..250).map { ExternalTrackEntry("Song $it", "Artist $it") }
        assertEquals(200, downloadItems(many).size)
    }

    @Test
    fun `download items drop blank entries and keep the title for the job label`() {
        val items = downloadItems(listOf(ExternalTrackEntry("  ", null), ExternalTrackEntry("Solo", "  ")))
        assertEquals(1, items.size)
        assertEquals("Solo", items[0].query)
        assertEquals("Solo", items[0].title)
    }

    // ---- unmatched entries from the import matchers ------------------------

    @Test
    fun `matchLibraryTracks reports every miss as a structured entry`() {
        val entries = listOf(
            ExternalTrackEntry("Diva", "artist a"),
            ExternalTrackEntry("Ghost Song", "Nobody"),
            ExternalTrackEntry("Other Ghost", "Somebody"),
        )
        val res = matchLibraryTracks(entries, lib)
        assertEquals(listOf("t1"), res.hashes)
        assertEquals(
            listOf(
                ExternalTrackEntry("Ghost Song", "Nobody"),
                ExternalTrackEntry("Other Ghost", "Somebody"),
            ),
            res.unmatched,
        )
    }

    @Test
    fun `matchLibraryTracks keeps unmatched entries past the 60-miss display cap`() {
        val entries = (1..80).map { ExternalTrackEntry("Introuvable $it", "Ghost") }
        val res = matchLibraryTracks(entries, lib)
        assertEquals(60, res.misses.size) // display hint stays capped
        assertEquals(80, res.unmatched.size) // the download offer does not
    }

    @Test
    fun `parsePlaylistFile reports unmatched m3u entries from extinf`() {
        val text = "#EXTM3U\n#EXTINF:180,Nobody - Ghost Song\n/music/nobody.mp3\n"
        val res = parsePlaylistFile("f.m3u", text, lib)
        assertEquals(0, res.hashes.size)
        assertEquals(1, res.total)
        assertEquals(listOf(ExternalTrackEntry("Ghost Song", "Nobody")), res.unmatched)
    }

    @Test
    fun `parsePlaylistFile falls back to the file name for unmatched paths`() {
        val text = "#EXTM3U\n/music/unknown track.mp3\n"
        val res = parsePlaylistFile("f.m3u", text, lib)
        assertEquals(listOf(ExternalTrackEntry("unknown track", null)), res.unmatched)
    }

    @Test
    fun `parsePlaylistFile reports unmatched json entries and keeps matched hashes`() {
        val text = """
            {"auralisPlaylist":1,"name":"X","tracks":[
              {"title":"Ghost","artist":"Nobody"},
              {"trackhash":"t1"},
              {"filepath":"music/Artist A/Diva.flac"},
              {"title":"  "}
            ]}
        """.trimIndent()
        val res = parsePlaylistFile("x.json", text, lib)
        assertEquals(listOf("t1", "t1"), res.hashes)
        assertEquals(listOf(ExternalTrackEntry("Ghost", "Nobody")), res.unmatched)
        // Every entry counts toward the display total; the blank-title one is
        // simply not searchable (no download query can be built for it).
        assertEquals(4, res.total)
    }

    @Test
    fun `matched-only imports leave no download offer`() {
        val res = parsePlaylistFile("f.m3u", "#EXTM3U\n/music/Artist A/Diva.flac\n", lib)
        assertEquals(listOf("t1"), res.hashes)
        assertTrue(res.unmatched.isEmpty())
    }
}
