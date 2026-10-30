package local.auralis.client.playback

import kotlinx.coroutines.flow.MutableStateFlow
import local.auralis.client.model.RecognizeResult

// Process-wide bridge between [ShazamBubbleService] (bubble, capture pipeline,
// notifications) and the Compose UI (Settings "Bulle Shazam" card, recognition
// sheet). Both live in the same process — plain StateFlows keep it dependency
// free and instant. Mirrored into AppViewModel.UiState on the UI side.

object BubbleBus {

    /** Capture flavour: the device's own playback audio (like real Shazam). */
    const val MODE_INTERNAL = "internal"
    /** Mic capture — API 24-28 fallback (no AudioPlaybackCapture) or a revoked
     *  screen-capture permission with a usable mic. */
    const val MODE_MIC = "mic"

    /** The bubble service is running (bubble on screen, notification up). */
    val active = MutableStateFlow(false)

    /** Current capture mode ([MODE_INTERNAL] / [MODE_MIC]). */
    val captureMode = MutableStateFlow(MODE_INTERNAL)

    /** Verdict of the last bubble identification (shown in the hum sheet). */
    val lastResult = MutableStateFlow<RecognizeResult?>(null)

    /** Notification mapping of the last bubble identification. */
    val lastOutcome = MutableStateFlow<BubbleOutcome?>(null)
}
