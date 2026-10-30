package local.auralis.client.model

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the pure hum-to-search logic (model/Recognize.kt): score
 *  formatting, download-query building and the /api/recognize wire parsing. */
class RecognizeLogicTest {

    // ---- scorePercent ------------------------------------------------------

    @Test
    fun `score percent clamps and rounds the zero-to-one score`() {
        assertEquals(0, scorePercent(-0.5))
        assertEquals(0, scorePercent(0.0))
        assertEquals(50, scorePercent(0.5))
        assertEquals(87, scorePercent(0.872))
        assertEquals(100, scorePercent(1.0))
        assertEquals(100, scorePercent(1.4))
    }

    // ---- remoteQuery ------------------------------------------------------

    @Test
    fun `remote query joins the artists and the title`() {
        assertEquals(
            "Daft Punk Get Lucky",
            remoteQuery(RecognizeRemoteMatch("Get Lucky", listOf("Daft Punk"), 0.9, "humming")),
        )
        assertEquals(
            "A B Solo Title",
            remoteQuery(RecognizeRemoteMatch("Solo Title", listOf("A", "B"), 0.2, "music")),
        )
        assertEquals("Solo", remoteQuery(RecognizeRemoteMatch("Solo", emptyList(), 0.0, "music")))
    }

    @Test
    fun `remote match query property delegates to remoteQuery`() {
        val m = RecognizeRemoteMatch("Get Lucky", listOf("Daft Punk"), 0.9, "humming")
        assertEquals(remoteQuery(m), m.query)
    }

    // ---- wire parsing -----------------------------------------------------

    @Test
    fun `recognize result parses the wire shape`() {
        val o = JSONObject(
            """
            {
              "available": true,
              "indexSize": 3,
              "local": [
                { "trackhash": "abc", "title": "T", "artist": "A", "album": "Al",
                  "image": "/api/art/x", "duration": 12.5, "score": 0.83 }
              ],
              "remote": [
                { "title": "R", "artists": ["X", "Y"], "score": 0.7, "source": "music" }
              ],
              "ffmpeg": true,
              "remoteEnabled": true
            }
            """.trimIndent(),
        )
        val r = RecognizeResult.from(o)
        assertTrue(r.available)
        assertEquals(3, r.indexSize)
        assertTrue(r.ffmpeg)
        assertTrue(r.remoteEnabled)
        assertEquals(1, r.local.size)
        assertEquals("abc", r.local[0].trackhash)
        assertEquals("T", r.local[0].title)
        assertEquals(0.83, r.local[0].score, 1e-9)
        val remote = r.remote
        assertEquals(1, remote?.size)
        assertEquals("R", remote?.get(0)?.title)
        assertEquals(listOf("X", "Y"), remote?.get(0)?.artists)
        assertEquals(0.7, remote?.get(0)?.score!!, 1e-9)
        assertEquals("music", remote[0].source)
    }

    @Test
    fun `explicit null remote stays null while empty array is empty`() {
        // null = the remote engine is off/unreachable — NOT the same as [].
        assertNull(RecognizeResult.from(JSONObject("""{ "remote": null }""")).remote)
        assertNull(RecognizeResult.from(JSONObject("{}")).remote)
        assertEquals(
            emptyList<RecognizeRemoteMatch>(),
            RecognizeResult.from(JSONObject("""{ "remote": [] }""")).remote,
        )
    }

    @Test
    fun `recognize result defaults are safe on an old server`() {
        val r = RecognizeResult.from(JSONObject("{}"))
        assertEquals(RecognizeResult.EMPTY.copy(), r)
    }

    @Test
    fun `melody status parses the wire shape`() {
        val st = MelodyStatus.from(JSONObject("""{ "running": true, "indexed": 12, "total": 47, "ffmpeg": true }"""))
        assertTrue(st.running)
        assertEquals(12, st.indexed)
        assertEquals(47, st.total)
        assertTrue(st.ffmpeg)
        val empty = MelodyStatus.from(JSONObject("{}"))
        assertEquals(MelodyStatus(false, 0, 0, false), empty)
    }
}
