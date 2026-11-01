package local.auralis.client.playback

import kotlin.math.pow

// Pure volume-normalization + crossfade gain maths — NO Android dependencies so
// it unit-tests on the JVM. Mirrors the web client: src/app/page.tsx's
// "Volume normalization" effect (per-track = the track's ReplayGain-style `gain`,
// per-album = the album members' average `gain`, `dbToGain = 10^(db/20)`) and
// src/lib/auralis/audioGraph.ts's setGraphGain / fadeInGain.
//
// Android's player volume is clamped to 0..1, so the factor is SPLIT: the ≤1 half
// goes through the player volume (multiplied with the user's volume and the
// crossfade envelope) and the >0 dB boost half through the audio session's
// LoudnessEnhancer (AudioFx.setBoostDb). Without the split, a quiet master's
// +6 dB would blow a half-raised user volume straight to 100 %.
//
// SAFETY FLOOR: a track's stored `gain` is an ANALYSIS estimate. A corrupt or
// legacy row (or one written before the server clamped ±12 dB) can carry a wild
// negative value; fed straight into the volume stage that drives the player
// volume to ~0 — the track plays but is SILENT (the "Kanye West has no sound"
// report). Attenuation is therefore clamped to [MIN_VOLUME_FACTOR, 1] so a bad
// gain can quieten a track but never mute it, and NaN/∞ fall back to unity.
object PlaybackGains {

    /** Normalization modes — the web's NormalizationMode. */
    const val MODE_OFF = "off"
    const val MODE_TRACK = "track"
    const val MODE_ALBUM = "album"

    /** Loudest attenuation the volume stage may apply (−12 dB ≈ 0.25). Below this
     *  a "normalized" track is indistinguishable from muted — never allowed. */
    const val MIN_VOLUME_FACTOR = 0.25f

    /** dB → linear amplitude factor (e.g. -6 dB → ~0.50) — web dbToGain. */
    fun dbToGain(db: Double): Float = 10.0.pow(db / 20.0).toFloat()

    /** True for a usable, finite gain value (guards NaN/∞ from bad analysis rows). */
    private fun sane(db: Double?): Boolean = db != null && db.isFinite()

    /** Resolve the normalization dB adjustment for the current track (web page.tsx):
     *  "track" = the track's own gain; "album" = the mean of the album members'
     *  gains (falls back to the track's own when no member carries one);
     *  null when there is nothing to apply (off / no data). Non-finite inputs are
     *  ignored so one bad row can't poison the album average. */
    fun resolveGainDb(mode: String, trackGainDb: Double?, albumGainDbs: List<Double?>): Double? {
        if (mode == MODE_OFF) return null
        var db = if (sane(trackGainDb)) trackGainDb else null
        if (mode == MODE_ALBUM) {
            val gains = albumGainDbs.filterNotNull().filter { it.isFinite() }
            if (gains.isNotEmpty()) db = gains.average()
        }
        return if (sane(db)) db else null
    }

    /** The full linear factor for a resolved dB adjustment (1 = unchanged). */
    fun gainFactor(gainDb: Double?): Float =
        if (!sane(gainDb)) 1f else dbToGain(gainDb!!).coerceIn(MIN_VOLUME_FACTOR, 8f)

    /** The ≤1 half of the factor (player-volume stage): attenuation only, floored
     *  so normalization can never mute the track. */
    fun volumeFactor(gainDb: Double?): Float = gainFactor(gainDb).coerceIn(MIN_VOLUME_FACTOR, 1f)

    /** The ≥0 dB half of the factor (LoudnessEnhancer stage): boost only. */
    fun boostDb(gainDb: Double?): Float = (if (sane(gainDb)) gainDb!! else 0.0).coerceAtLeast(0.0).toFloat()

    /** user volume × normalization (volume stage) × crossfade fade envelope,
     *  clamped to the player's 0..1 volume range. */
    fun combinedVolume(userVolume: Float, volumeFactor: Float, fade: Float): Float =
        (userVolume * volumeFactor * fade).coerceIn(0f, 1f)
}
