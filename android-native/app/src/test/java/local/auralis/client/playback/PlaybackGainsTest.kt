package local.auralis.client.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * JVM unit tests for the volume-normalization / crossfade gain maths in
 * [PlaybackGains] — the semantics of the web client's normalization effect
 * (src/app/page.tsx) and its GainNode split across Android's volume stages.
 */
class PlaybackGainsTest {

    @Test
    fun `dbToGain converts dB to a linear factor`() {
        assertEquals(1f, PlaybackGains.dbToGain(0.0), 1e-6f)
        assertEquals(0.5012f, PlaybackGains.dbToGain(-6.0), 0.001f)
        assertEquals(1.9953f, PlaybackGains.dbToGain(6.0), 0.001f)
    }

    @Test
    fun `resolveGainDb returns null when normalization is off`() {
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_OFF, -3.0, listOf(-3.0)))
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_OFF, null, emptyList()))
    }

    @Test
    fun `resolveGainDb uses the track's own gain in track mode`() {
        assertEquals(-4.5, PlaybackGains.resolveGainDb(PlaybackGains.MODE_TRACK, -4.5, emptyList())!!, 1e-9)
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_TRACK, null, emptyList()))
    }

    @Test
    fun `album mode averages the album members' gains`() {
        val db = PlaybackGains.resolveGainDb(PlaybackGains.MODE_ALBUM, -3.0, listOf(-3.0, -6.0, null, 0.0))
        assertEquals(-3.0, db!!, 1e-9)
    }

    @Test
    fun `album mode falls back to the track gain when no member has one`() {
        val db = PlaybackGains.resolveGainDb(PlaybackGains.MODE_ALBUM, -2.0, listOf(null, null))
        assertEquals(-2.0, db!!, 1e-9)
        // No album members AND no own gain → nothing to apply.
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_ALBUM, null, listOf(null)))
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_ALBUM, null, emptyList()))
    }

    @Test
    fun `gain factor splits into an attenuating volume stage and a boost stage`() {
        // Unity.
        assertEquals(1f, PlaybackGains.gainFactor(null), 1e-6f)
        assertEquals(1f, PlaybackGains.volumeFactor(null), 1e-6f)
        assertEquals(0f, PlaybackGains.boostDb(null), 1e-6f)
        // Attenuation rides the player volume entirely.
        assertEquals(0.5012f, PlaybackGains.volumeFactor(-6.0), 0.001f)
        assertEquals(0f, PlaybackGains.boostDb(-6.0), 1e-6f)
        // Boost rides the LoudnessEnhancer; the volume stage stays at unity.
        assertEquals(1f, PlaybackGains.volumeFactor(6.0), 1e-6f)
        assertEquals(6f, PlaybackGains.boostDb(6.0), 1e-6f)
    }

    @Test
    fun `combinedVolume multiplies the chain and clamps to the player range`() {
        assertEquals(0.5f, PlaybackGains.combinedVolume(0.5f, 1f, 1f), 1e-6f)
        assertEquals(0.25f, PlaybackGains.combinedVolume(0.5f, 0.5f, 1f), 1e-6f)
        // Mid-crossfade envelope halves the target.
        assertEquals(0.125f, PlaybackGains.combinedVolume(0.5f, 0.5f, 0.5f), 1e-6f)
        // Degraded fallback (no LoudnessEnhancer): a >1 factor clamps at 1.
        assertEquals(1f, PlaybackGains.combinedVolume(1f, 2f, 1f), 1e-6f)
        assertEquals(0f, PlaybackGains.combinedVolume(0f, 1f, 1f), 1e-6f)
    }
}
