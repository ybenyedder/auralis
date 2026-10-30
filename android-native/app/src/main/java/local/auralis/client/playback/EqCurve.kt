package local.auralis.client.playback

import local.auralis.client.i18n.Messages
import kotlin.math.abs
import kotlin.math.log2

// Pure 6-band equalizer curve maths — NO Android dependencies so it unit-tests on
// the JVM. Mirrors the web client exactly: the curve + presets come from
// src/store/slices/eqSlice.ts (EQ_PRESETS) and the band centres from
// src/lib/auralis/audioGraph.ts (EQ_BANDS). The Android-side effect (a device
// android.media.audiofx.Equalizer attached to the playback audio session) lives
// in AudioFx.kt and only consumes this mapping.
//
// Device EQs rarely expose the web's six centres (hardware effects usually have
// 4-5 bands at arbitrary frequencies), so the web curve is projected onto the
// device bands by interpolating linearly in log-frequency between the web
// centres and holding the end gains outside them (60 Hz is a low shelf and
// 14 kHz a high shelf on the web, so edge-hold reproduces the shelf behaviour
// best at the extremes).
object EqCurve {

    /** The six band centres in Hz — web EQ_BANDS (60 / 200 / 800 / 2.6k / 8k / 14k). */
    val BAND_FREQS = listOf(60.0, 200.0, 800.0, 2600.0, 8000.0, 14000.0)

    /** Short frequency labels under the six sliders (Hz, k = kHz) — web FREQ_LABELS. */
    val BAND_LABELS = listOf("60", "200", "800", "2.6k", "8k", "14k")

    /** Curated 6-band curves, one dB value per [BAND_FREQS] entry (clamped to ±12).
     *  Values copied EXACTLY from the web's EQ_PRESETS. */
    val PRESETS: Map<String, List<Float>> = linkedMapOf(
        "flat" to listOf(0f, 0f, 0f, 0f, 0f, 0f),
        "bass" to listOf(6f, 4f, 1.5f, 0f, 0f, 1f),
        "treble" to listOf(0f, 0f, 0f, 1.5f, 4f, 6f),
        "vocal" to listOf(-2f, -1f, 2f, 4f, 2f, 0f),
        "rock" to listOf(4.5f, 2.5f, -1f, 2f, 4f, 4f),
        "electronic" to listOf(5f, 2f, 0f, -1.5f, 3f, 4.5f),
        "acoustic" to listOf(3f, 1.5f, 2f, 2f, 1.5f, 2f),
        "lateNight" to listOf(3f, 1f, 0f, -1f, -2f, -4f),
    )

    /** French fallback labels for the preset chips (the localized [presetLabel]
     *  resolves through the i18n catalogue and falls back to these). */
    val PRESET_LABELS: Map<String, String> = mapOf(
        "flat" to "Neutre",
        "bass" to "Basses +",
        "treble" to "Aigus +",
        "vocal" to "Voix",
        "rock" to "Rock",
        "electronic" to "Électro",
        "acoustic" to "Acoustique",
        "lateNight" to "Nuit",
    )

    /** Localized preset chip label (web "eq.presets.<id>" catalogue keys). */
    fun presetLabel(id: String): String = Messages.t("eq.presets.$id", PRESET_LABELS[id] ?: id)

    /** The ±12 dB slider range — web clampDb. */
    fun clampDb(db: Float): Float = db.coerceIn(-12f, 12f)

    /** Keep one decimal max — web setEqBand rounds each change the same way. */
    fun roundDb(db: Float): Float = Math.round(db * 10f) / 10f

    /** True when `gains` reproduces `preset` band-for-band (0.001 dB tolerance) —
     *  the web's matchesPreset, which decides between a preset id and "custom". */
    fun matchesPreset(gains: List<Float>, preset: List<Float>?): Boolean {
        if (preset == null || gains.size != preset.size) return false
        return preset.indices.all { i -> abs(preset[i] - gains[i]) < 0.001f }
    }

    /** Curve value at an arbitrary frequency: linear interpolation in log2(f)
     *  between neighbouring web band centres, edge-hold outside the extremes. */
    fun gainAt(gains: List<Float>, freqHz: Double): Float {
        val f = freqHz.coerceAtLeast(1.0)
        val centers = BAND_FREQS
        val firstGain = gains.firstOrNull() ?: 0f
        val lastGain = gains.lastOrNull() ?: 0f
        if (f <= centers.first()) return firstGain
        if (f >= centers.last()) return lastGain
        for (i in 0 until centers.size - 1) {
            val lo = centers[i]
            val hi = centers[i + 1]
            if (f in lo..hi) {
                val t = ((log2(f) - log2(lo)) / (log2(hi) - log2(lo))).toFloat()
                val g0 = gains.getOrElse(i) { 0f }
                val g1 = gains.getOrElse(i + 1) { 0f }
                return g0 + (g1 - g0) * t
            }
        }
        return lastGain
    }

    /** Project the web curve onto the device EQ's bands: one dB value per device
     *  band. `deviceCentersMilliHz` comes from Equalizer.getCenterFreq(). */
    fun mapToDeviceBands(gains: List<Float>, deviceCentersMilliHz: IntArray): List<Float> =
        deviceCentersMilliHz.map { gainAt(gains, it / 1000.0) }

    /** dB → millibels for Equalizer.setBandLevel, clamped to the device's
     *  bandLevelRange (typically ±1500 mB = ±15 dB). */
    fun toMilliBels(db: Float, minMb: Int, maxMb: Int): Short =
        Math.round(db * 100f).toInt().coerceIn(minMb, maxMb).toShort()
}
