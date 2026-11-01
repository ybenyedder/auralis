package local.auralis.client.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression guard for the fullscreen scrubber that stayed pinned at 0:00.
 * The old maths was `(positionMs / durMs).toFloat()` — an INTEGER division of two
 * Longs that returns 0 for every position below the full duration.
 */
class PlaybackProgressTest {

    @Test
    fun `mid-track position yields a real fraction, not zero`() {
        // 1:30 into a 3:00 track must be 0.5 — integer division returns 0 here.
        assertEquals(0.5f, PlaybackProgress.fraction(90_000L, 180_000L), 1e-6f)
    }

    @Test
    fun `near-end position is close to one`() {
        assertTrue(PlaybackProgress.fraction(179_000L, 180_000L) > 0.99f)
    }

    @Test
    fun `fraction is clamped to the valid range`() {
        assertEquals(1f, PlaybackProgress.fraction(250_000L, 180_000L), 1e-6f)
        assertEquals(0f, PlaybackProgress.fraction(-5L, 180_000L), 1e-6f)
    }

    @Test
    fun `unknown duration never yields NaN or Infinity`() {
        assertEquals(0f, PlaybackProgress.fraction(90_000L, 0L), 1e-6f)
        assertEquals(0f, PlaybackProgress.fraction(90_000L, -1L), 1e-6f)
    }

    @Test
    fun `remaining time counts down and clamps at zero`() {
        assertEquals(90.0, PlaybackProgress.remainingSeconds(90_000L, 180_000L), 1e-6)
        assertEquals(0.0, PlaybackProgress.remainingSeconds(250_000L, 180_000L), 1e-6)
    }
}
