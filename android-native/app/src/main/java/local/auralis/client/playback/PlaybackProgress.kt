package local.auralis.client.playback

/**
 * Pure progress arithmetic for the player scrubbers (JVM-testable).
 *
 * The fullscreen bar used `(positionMs / durMs).toFloat()` on two `Long`s — an
 * INTEGER division that evaluates to 0 for every position shorter than the
 * whole track, so the scrubber and its time labels stayed pinned at 0:00 for a
 * full song. Centralising the maths here (floating-point, guarded against a
 * missing/zero duration) keeps that class of bug in one tested place.
 */
object PlaybackProgress {

    /** Fraction played in `0f..1f`, or 0f when the duration is unknown. */
    fun fraction(positionMs: Long, durationMs: Long): Float =
        if (durationMs > 0L) (positionMs.toDouble() / durationMs.toDouble()).toFloat().coerceIn(0f, 1f) else 0f

    /** Seconds remaining, for the `-m:ss` label; clamped so it never shows `-0:xx`
     *  past the end while an async seek lands. */
    fun remainingSeconds(positionMs: Long, durationMs: Long): Double =
        ((durationMs - positionMs).coerceAtLeast(0L)) / 1000.0
}
