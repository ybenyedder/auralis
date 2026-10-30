package local.auralis.client.playback

import kotlin.math.pow

// Pure volume-normalization + crossfade gain maths — NO Android dependencies so
// it unit-tests on the JVM. Mirrors the web client: src/app/page.tsx's
// "Volume normalization" effect (per-track = the track's ReplayGain-style `gain`,
// per-album = the album members' average `gain`, `dbToGain = 10^(db/20)`) and
// src/lib/auralis/audioGraph.ts's setGraphGain / fadeInGain.
//
// The web pushes the whole factor through a Web Audio GainNode that can exceed 1
// (clamped at +6 dB). Android's player volume is clamped to 0..1, so the factor
// is SPLIT: the ≤1 half goes through the player volume (multiplied with the
// user's volume and the crossfade envelope) and the >0 dB boost half through the
// audio session's LoudnessEnhancer (AudioFx.setBoostDb). Without the split, a
// quiet master's +6 dB would blow a half-raised user volume straight to 100 %.
// When no LoudnessEnhancer is available the caller folds the full factor into
// the player volume as a degraded fallback (combinedVolume clamps it).
object PlaybackGains {

    /** Normalization modes — the web's NormalizationMode. */
    const val MODE_OFF = "off"
    const val MODE_TRACK = "track"
    const val MODE_ALBUM = "album"

    /** dB → linear amplitude factor (e.g. -6 dB → ~0.50) — web dbToGain. */
    fun dbToGain(db: Double): Float = 10.0.pow(db / 20.0).toFloat()

    /** Resolve the normalization dB adjustment for the current track (web page.tsx):
     *  "track" = the track's own gain; "album" = the mean of the album members'
     *  gains (falls back to the track's own when no member carries one);
     *  null when there is nothing to apply (off / no data). */
    fun resolveGainDb(mode: String, trackGainDb: Double?, albumGainDbs: List<Double?>): Double? {
        if (mode == MODE_OFF) return null
        var db = trackGainDb
        if (mode == MODE_ALBUM) {
            val gains = albumGainDbs.filterNotNull()
            if (gains.isNotEmpty()) db = gains.average()
        }
        return db
    }

    /** The full linear factor for a resolved dB adjustment (1 = unchanged). */
    fun gainFactor(gainDb: Double?): Float = if (gainDb == null) 1f else dbToGain(gainDb)

    /** The ≤1 half of the factor (player-volume stage): attenuation only. */
    fun volumeFactor(gainDb: Double?): Float = gainFactor(gainDb).coerceAtMost(1f)

    /** The ≥0 dB half of the factor (LoudnessEnhancer stage): boost only. */
    fun boostDb(gainDb: Double?): Float = (gainDb ?: 0.0).coerceAtLeast(0.0).toFloat()

    /** user volume × normalization (volume stage) × crossfade fade envelope,
     *  clamped to the player's 0..1 volume range. */
    fun combinedVolume(userVolume: Float, volumeFactor: Float, fade: Float): Float =
        (userVolume * volumeFactor * fade).coerceIn(0f, 1f)
}
