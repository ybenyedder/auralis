package local.auralis.client.model

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the DSP / audio-analysis fields of [Track.from] (the wire
 * shape is src/server/library/repository.ts mapTrack): gain, energy, bpm, mood,
 * samplerate and friends must survive parsing — volume normalization reads
 * `gain` from here.
 */
class TrackDspParsingTest {

    @Test
    fun `from reads the DSP analysis fields`() {
        val o = JSONObject()
            .put("trackhash", "dsp1")
            .put("gain", -4.2)
            .put("energy", 0.73)
            .put("bpm", 123.5)
            .put("mood", "energetic")
            .put("lossless", true)
            .put("bitrate", 1411)
            .put("samplerate", 44100)
            .put("codec", "flac")
            .put("addedAt", 1730000000000L)
            .put("year", 2001)
            .put("genre", "Art rock")
        val t = Track.from(o)
        assertEquals(-4.2, t.gain!!, 0.0)
        assertEquals(0.73, t.energy!!, 0.0)
        assertEquals(123.5, t.bpm!!, 0.0)
        assertEquals("energetic", t.mood)
        assertTrue(t.lossless)
        assertEquals(1411, t.bitrate)
        assertEquals(44100, t.samplerate)
        assertEquals("flac", t.codec)
        assertEquals(1730000000000L, t.addedAt)
        assertEquals(2001, t.year)
        assertEquals("Art rock", t.genre)
    }

    @Test
    fun `from treats missing DSP fields as null`() {
        val t = Track.from(JSONObject().put("trackhash", "dsp2"))
        assertNull(t.gain)
        assertNull(t.energy)
        assertNull(t.bpm)
        assertNull(t.mood)
        assertNull(t.samplerate)
        assertNull(t.bitrate)
        assertNull(t.codec)
        assertNull(t.addedAt)
    }

    @Test
    fun `from accepts integer wire values for double fields`() {
        // The server may emit whole numbers (e.g. "bpm": 120) — optDouble must cope.
        val t = Track.from(JSONObject().put("trackhash", "dsp3").put("bpm", 120).put("gain", -3))
        assertEquals(120.0, t.bpm!!, 0.0)
        assertEquals(-3.0, t.gain!!, 0.0)
    }
}
