package local.auralis.client.model

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the JSON deserializers in [Models.kt]. These validate the
 * parsing of server responses (graceful defaults, fallbacks, the display-artist
 * resolution rule) without needing a device.
 */
class TrackParsingTest {

    @Test
    fun `from applies defaults for missing fields`() {
        val o = JSONObject().apply { put("trackhash", "h1") }
        val t = Track.from(o)
        assertEquals("h1", t.trackhash)
        assertEquals("Sans titre", t.title)
        assertEquals("Artiste inconnu", t.displayArtist)
        assertEquals(0, t.playcount)
        assertFalse(t.isFavorite)
        assertFalse(t.lossless)
        assertFalse(t.hasLyrics)
        assertNull(t.duration)
        assertNull(t.primaryArtistHash)
        assertTrue(t.artists.isEmpty())
    }

    @Test
    fun `from reads the full payload`() {
        val o = JSONObject()
            .put("trackhash", "h2")
            .put("title", "Pyramid Song")
            .put("artist", "Radiohead")
            .put("album", "Amnesiac")
            .put("duration", 296.5)
            .put("is_favorite", true)
            .put("lossless", true)
            .put("playcount", 7)
            .put("hasLyrics", true)
            .put(
                "artists",
                JSONArray().put(JSONObject().put("artisthash", "ah1").put("name", "Radiohead")),
            )
            .put(
                "color",
                JSONArray().put("#1c1c1e").put("#fa233b").put("#ffffff"),
            )
        val t = Track.from(o)
        assertEquals("Pyramid Song", t.title)
        assertEquals("Radiohead", t.displayArtist)
        assertEquals("ah1", t.primaryArtistHash)
        assertEquals(296.5, t.duration!!, 0.0)
        assertTrue(t.isFavorite)
        assertTrue(t.lossless)
        assertEquals(7, t.playcount)
        assertEquals(listOf("#1c1c1e", "#fa233b", "#ffffff"), t.color)
    }

    @Test
    fun `displayArtist falls back to the first artist when the artist field is missing`() {
        val o = JSONObject()
            .put("trackhash", "h3")
            .put(
                "artists",
                JSONArray().put(JSONObject().put("artisthash", "ah2").put("name", "Daft Punk")),
            )
        val t = Track.from(o)
        // No top-level "artist" → uses the first entry in artists[].
        assertEquals("Daft Punk", t.displayArtist)
        assertEquals("ah2", t.primaryArtistHash)
    }
}
