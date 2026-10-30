package local.auralis.client.playback

import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Visualizer
import androidx.media3.common.C
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.abs
import kotlin.math.max

// Process-lifetime owner of the playback audio session's effect chain: the real
// 6-band equalizer (mapped onto the device's EQ bands by EqCurve), the boost half
// of volume normalization (LoudnessEnhancer) and the waveform tap that feeds the
// visualizer overlay with real amplitudes.
//
// The ExoPlayer instance lives in PlaybackService (same process); the service
// publishes its audio session id via [onAudioSession] and this object (re)attaches
// every effect when the id changes — the id is only valid once the player has
// prepared, so it typically arrives with the first onEvents of a play and the
// attach happens then (and again if the audio sink ever rebuilds the session).
//
// Every audiofx call is wrapped in runCatching: devices without an effect engine
// (or without an own-session tap) throw, and the app must degrade — the
// equalizer card greys out ([eqAvailable]), the boost half of normalization falls
// back to the player volume (setBoostDb returns false) and the visualizer falls
// back to its decorative animation (amps stays null). The visualizer tap binds to
// OUR session only (never 0 / the output mix), so no RECORD_AUDIO permission is
// needed — and deliberately not requested.
object AudioFx {

    private const val BARS = 44 // matches VisualizerOverlay's bar count

    @Volatile private var sessionId: Int = C.AUDIO_SESSION_ID_UNSET
    private var equalizer: Equalizer? = null
    private var enhancer: LoudnessEnhancer? = null
    private var visualizer: Visualizer? = null

    // Desired settings — remembered across (re)attaches so a session that appears
    // later picks them up without the UI redoing anything.
    @Volatile private var eqEnabled = true
    @Volatile private var eqGains: List<Float> = EqCurve.PRESETS.getValue("flat")
    @Volatile private var boostDb = 0f
    @Volatile private var visualizerWanted = false

    private val _eqAvailable = MutableStateFlow(true)
    /** Flips to false when the device rejects an Equalizer — the settings card
     *  greys its section out; still true before the first attach attempt. */
    val eqAvailable: StateFlow<Boolean> = _eqAvailable.asStateFlow()

    private val _amps = MutableStateFlow<FloatArray?>(null)
    /** Per-bar waveform amplitudes (0..1) at capture rate; null while the tap is
     *  down — the visualizer overlay then draws its decorative animation. */
    val amps: StateFlow<FloatArray?> = _amps.asStateFlow()

    /** Called by PlaybackService with the ExoPlayer audio session id on every
     *  player event (cheap same-id no-op). A changed id re-attaches everything. */
    @Synchronized
    fun onAudioSession(id: Int) {
        if (id == sessionId) return
        releaseAll()
        sessionId = id
        // Guard id <= 0: besides the "not set yet" sentinel this also refuses
        // session 0 (the global output mix — a foreign signal and, for the
        // visualizer, a permission we don't hold).
        if (id <= 0) return
        attachEqualizer(id)
        attachEnhancer(id)
        if (visualizerWanted) attachVisualizer(id)
    }

    /** Release every effect (service teardown); [onAudioSession] re-attaches. */
    @Synchronized
    fun releaseAll() {
        releaseVisualizer()
        runCatching { equalizer?.release() }; equalizer = null
        runCatching { enhancer?.release() }; enhancer = null
    }

    // ---- equalizer ----------------------------------------------------------

    /** Store + apply the web curve (6 dB values). Disabled = every device band
     *  flattened to 0 dB (the web keeps the user's curve aside the same way). */
    @Synchronized
    fun setEq(enabled: Boolean, gains: List<Float>) {
        eqEnabled = enabled
        eqGains = gains
        equalizer?.let { applyEq(it, enabled, gains) }
    }

    private fun attachEqualizer(id: Int) {
        val eq = runCatching {
            Equalizer(0, id).also {
                applyEq(it, eqEnabled, eqGains)
                it.enabled = eqEnabled
            }
        }.getOrNull()
        equalizer = eq
        _eqAvailable.value = eq != null
    }

    private fun applyEq(eq: Equalizer, enabled: Boolean, gains: List<Float>) {
        runCatching {
            val range = eq.bandLevelRange
            val n = eq.numberOfBands.toInt()
            val centers = IntArray(n) { eq.getCenterFreq(it.toShort()) }
            val mapped = EqCurve.mapToDeviceBands(gains, centers)
            for (b in 0 until n) {
                val db = if (enabled) mapped.getOrElse(b) { 0f } else 0f
                eq.setBandLevel(b.toShort(), EqCurve.toMilliBels(db, range[0].toInt(), range[1].toInt()))
            }
        }
    }

    // ---- volume normalization boost (LoudnessEnhancer) ----------------------

    /** Apply the boost half of volume normalization (dB, ≥ 0). Returns false when
     *  the boost can't be represented here (no LoudnessEnhancer on this device)
     *  so the caller folds it into the player volume instead. */
    @Synchronized
    fun setBoostDb(db: Float): Boolean {
        boostDb = db.coerceAtLeast(0f)
        val e = enhancer ?: return boostDb <= 0f
        runCatching {
            e.setTargetGain((boostDb * 100).toInt())
            e.enabled = boostDb > 0f
        }
        return true
    }

    private fun attachEnhancer(id: Int) {
        enhancer = runCatching {
            LoudnessEnhancer(id).also { e ->
                if (boostDb > 0f) {
                    e.setTargetGain((boostDb * 100).toInt())
                    e.enabled = true
                }
            }
        }.getOrNull()
    }

    // ---- visualizer tap -----------------------------------------------------

    /** Start (or arm) the waveform tap; no-op while it's already running. */
    @Synchronized
    fun startVisualizer() {
        visualizerWanted = true
        attachVisualizer(sessionId)
    }

    /** Release the tap (overlay closed / playback stopped). */
    @Synchronized
    fun stopVisualizer() {
        visualizerWanted = false
        releaseVisualizer()
    }

    private fun attachVisualizer(id: Int) {
        if (id <= 0 || visualizer != null) return
        runCatching {
            visualizer = Visualizer(id).also { v ->
                // The smallest capture is plenty for 44 bars and cheapest to poll.
                v.captureSize = Visualizer.getCaptureSizeRange()[0]
                v.setDataCaptureListener(captureListener, Visualizer.getMaxCaptureRate(), true, false)
                v.enabled = true
            }
        }.onFailure { releaseVisualizer() }
    }

    private fun releaseVisualizer() {
        runCatching { visualizer?.enabled = false }
        runCatching { visualizer?.release() }
        visualizer = null
        _amps.value = null
    }

    private val captureListener = object : Visualizer.OnDataCaptureListener {
        override fun onWaveFormDataCapture(v: Visualizer, waveform: ByteArray, samplingRate: Int) {
            val n = BARS
            val per = (waveform.size / n).coerceAtLeast(1)
            val out = FloatArray(n)
            val prev = _amps.value
            for (i in 0 until n) {
                var peak = 0f
                val base = i * per
                for (j in 0 until per) {
                    val d = abs(waveform[base + j].toInt() - 128) / 128f
                    if (d > peak) peak = d
                }
                // Mild make-up gain (raw waveforms rarely reach full scale) plus
                // temporal smoothing: bars decay instead of jittering frame to frame.
                val amp = (peak * 1.6f).coerceAtMost(1f)
                out[i] = if (prev != null && prev.size == n) max(amp, prev[i] * 0.82f) else amp
            }
            _amps.value = out
        }

        override fun onFftDataCapture(v: Visualizer, fft: ByteArray, samplingRate: Int) = Unit
    }
}
