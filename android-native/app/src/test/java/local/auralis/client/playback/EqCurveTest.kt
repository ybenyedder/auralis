package local.auralis.client.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the pure equalizer-curve maths in [EqCurve]: the web preset
 * values (copied from src/store/slices/eqSlice.ts), preset matching, and the
 * log-frequency projection of the 6-band web curve onto device EQ bands.
 */
class EqCurveTest {

    @Test
    fun `presets match the web EQ_PRESETS exactly`() {
        assertEquals(listOf(0f, 0f, 0f, 0f, 0f, 0f), EqCurve.PRESETS["flat"])
        assertEquals(listOf(6f, 4f, 1.5f, 0f, 0f, 1f), EqCurve.PRESETS["bass"])
        assertEquals(listOf(0f, 0f, 0f, 1.5f, 4f, 6f), EqCurve.PRESETS["treble"])
        assertEquals(listOf(-2f, -1f, 2f, 4f, 2f, 0f), EqCurve.PRESETS["vocal"])
        assertEquals(listOf(4.5f, 2.5f, -1f, 2f, 4f, 4f), EqCurve.PRESETS["rock"])
        assertEquals(listOf(5f, 2f, 0f, -1.5f, 3f, 4.5f), EqCurve.PRESETS["electronic"])
        assertEquals(listOf(3f, 1.5f, 2f, 2f, 1.5f, 2f), EqCurve.PRESETS["acoustic"])
        assertEquals(listOf(3f, 1f, 0f, -1f, -2f, -4f), EqCurve.PRESETS["lateNight"])
    }

    @Test
    fun `preset ids and labels are complete`() {
        assertEquals(
            setOf("flat", "bass", "treble", "vocal", "rock", "electronic", "acoustic", "lateNight"),
            EqCurve.PRESETS.keys,
        )
        // The 8 web presets with their French names.
        assertEquals("Neutre", EqCurve.PRESET_LABELS["flat"])
        assertEquals("Basses +", EqCurve.PRESET_LABELS["bass"])
        assertEquals("Aigus +", EqCurve.PRESET_LABELS["treble"])
        assertEquals("Voix", EqCurve.PRESET_LABELS["vocal"])
        assertEquals("Rock", EqCurve.PRESET_LABELS["rock"])
        assertEquals("Électro", EqCurve.PRESET_LABELS["electronic"])
        assertEquals("Acoustique", EqCurve.PRESET_LABELS["acoustic"])
        assertEquals("Nuit", EqCurve.PRESET_LABELS["lateNight"])
    }

    @Test
    fun `clampDb enforces the slider range and roundDb keeps one decimal`() {
        assertEquals(-12f, EqCurve.clampDb(-30f))
        assertEquals(12f, EqCurve.clampDb(42f))
        assertEquals(3.5f, EqCurve.clampDb(3.5f))
        assertEquals(1.2f, EqCurve.roundDb(1.24f))
        assertEquals(-0.3f, EqCurve.roundDb(-0.26f))
    }

    @Test
    fun `matchesPreset compares band-for-band with tolerance`() {
        val bass = EqCurve.PRESETS.getValue("bass")
        assertTrue(EqCurve.matchesPreset(bass.toList(), bass))
        assertTrue(EqCurve.matchesPreset(listOf(6f, 4f, 1.5f, 0.0005f, 0f, 1f), bass))
        assertFalse(EqCurve.matchesPreset(listOf(6f, 4f, 1.5f, 0.5f, 0f, 1f), bass))
        assertFalse(EqCurve.matchesPreset(listOf(6f, 4f), bass))
        assertFalse(EqCurve.matchesPreset(bass, null))
    }

    @Test
    fun `gainAt returns the band gain at the exact band centres`() {
        val gains = EqCurve.PRESETS.getValue("rock")
        EqCurve.BAND_FREQS.forEachIndexed { i, f ->
            assertEquals(gains[i], EqCurve.gainAt(gains, f))
        }
    }

    @Test
    fun `gainAt interpolates linearly in log frequency`() {
        // 200→800 Hz is two octaves; 400 Hz is exactly half-way in log2 space.
        val gains = listOf(0f, 2f, 6f, 0f, 0f, 0f)
        assertEquals(4f, EqCurve.gainAt(gains, 400.0), 0.001f)
        // 800→2600 (gains 6→0): t = ln(1600/800) / ln(2600/800).
        val t = (Math.log(1600.0 / 800.0) / Math.log(2600.0 / 800.0)).toFloat()
        assertEquals(6f + (0f - 6f) * t, EqCurve.gainAt(gains, 1600.0), 0.01f)
    }

    @Test
    fun `gainAt holds the end gains outside the band extremes`() {
        val gains = listOf(6f, 4f, 1.5f, 0f, -1f, -4f)
        assertEquals(6f, EqCurve.gainAt(gains, 20.0))
        assertEquals(-4f, EqCurve.gainAt(gains, 20000.0))
    }

    @Test
    fun `mapToDeviceBands reproduces the curve when the device bands match`() {
        val gains = EqCurve.PRESETS.getValue("vocal")
        val webCenters = IntArray(EqCurve.BAND_FREQS.size) { (EqCurve.BAND_FREQS[it] * 1000).toInt() }
        assertEquals(gains, EqCurve.mapToDeviceBands(gains, webCenters))
    }

    @Test
    fun `mapToDeviceBands projects onto a typical 5-band device EQ`() {
        // A common hardware layout: 60 / 230 / 910 / 4000 / 14000 Hz (milliHz).
        val gains = listOf(6f, 4f, 1.5f, 0f, 0f, 1f) // "bass"
        val device = intArrayOf(60_000, 230_000, 910_000, 4_000_000, 14_000_000)
        val mapped = EqCurve.mapToDeviceBands(gains, device)
        assertEquals(5, mapped.size)
        assertEquals(6f, mapped[0]) // low shelf edge-hold
        assertEquals(1f, mapped[4]) // high shelf edge-hold
        // 230 Hz sits between the 200 (4 dB) and 800 (1.5 dB) web bands.
        assertTrue(mapped[1] < 4f && mapped[1] > 1.5f)
    }

    @Test
    fun `toMilliBels rounds and clamps to the device band range`() {
        assertEquals(450, EqCurve.toMilliBels(4.5f, -1500, 1500).toInt())
        assertEquals(-300, EqCurve.toMilliBels(-3f, -1500, 1500).toInt())
        assertEquals(1200, EqCurve.toMilliBels(12f, -1500, 1500).toInt())
        // Beyond the device range → clamped.
        assertEquals(1500, EqCurve.toMilliBels(20f, -1500, 1500).toInt())
        assertEquals(-1000, EqCurve.toMilliBels(-12f, -1000, 1000).toInt())
    }
}
