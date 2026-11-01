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

    // ── Silence guard ──────────────────────────────────────────────────────
    // A wild/legacy `gain` row must NEVER mute the track (the "Kanye West has no
    // sound" report): attenuation is floored at MIN_VOLUME_FACTOR, and non-finite
    // values fall back to unity.

    @Test
    fun `volumeFactor floors at MIN_VOLUME_FACTOR so a wild gain cannot mute the track`() {
        // A pathologically loud master (gain far below anything real) is quietened
        // but never silenced.
        assertEquals(PlaybackGains.MIN_VOLUME_FACTOR, PlaybackGains.volumeFactor(-60.0), 1e-6f)
        assertEquals(PlaybackGains.MIN_VOLUME_FACTOR, PlaybackGains.volumeFactor(-200.0), 1e-6f)
        // The full factor keeps the same floor, so the degraded (no-enhancer) path
        // can't mute either.
        assertEquals(PlaybackGains.MIN_VOLUME_FACTOR, PlaybackGains.gainFactor(-200.0), 1e-6f)
    }

    @Test
    fun `non-finite gain values fall back to unity instead of NaN silence`() {
        assertEquals(1f, PlaybackGains.volumeFactor(Double.NaN), 1e-6f)
        assertEquals(1f, PlaybackGains.volumeFactor(Double.POSITIVE_INFINITY), 1e-6f)
        assertEquals(1f, PlaybackGains.volumeFactor(Double.NEGATIVE_INFINITY), 1e-6f)
        assertEquals(1f, PlaybackGains.gainFactor(Double.NaN), 1e-6f)
        assertEquals(0f, PlaybackGains.boostDb(Double.NaN), 1e-6f)
    }

    @Test
    fun `resolveGainDb ignores non-finite members so one bad row cannot poison the album mean`() {
        // Album mode: the NaN/∞ members are dropped, the finite mean is used.
        val db = PlaybackGains.resolveGainDb(PlaybackGains.MODE_ALBUM, null, listOf(-4.0, Double.NaN, -2.0))
        assertEquals(-3.0, db!!, 1e-9)
        // Track mode with a bad own gain → nothing to apply (unity), not NaN.
        assertNull(PlaybackGains.resolveGainDb(PlaybackGains.MODE_TRACK, Double.NaN, emptyList()))
    }

    @Test
    fun `combinedVolume with a floored factor still produces audible output`() {
        // Even the worst-case gain + full user volume yields an audible floor, not 0.
        val v = PlaybackGains.combinedVolume(1f, PlaybackGains.volumeFactor(-200.0), 1f)
        assertEquals(PlaybackGains.MIN_VOLUME_FACTOR, v, 1e-6f)
    }
}
