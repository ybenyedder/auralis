package local.auralis.client.playback

import android.content.ComponentName
import android.content.Context
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import local.auralis.client.data.Prefs
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/** The state fields this class owns; AppViewModel merges them into its UiState. */
data class AccountingState(
    val playCounts: Map<String, Int> = emptyMap(),
    val recents: List<String> = emptyList(),
    val stats: ListeningStats = ListeningStats.EMPTY,
    val forYou: List<Track> = emptyList(),
    val recoScores: Map<String, Double> = emptyMap(),
    val sleepActive: Boolean = false,
    /** SystemClock.elapsedRealtime() based (monotonic — wall-clock NTP jumps during
     *  playback used to fire the timer early/late). Not display-formatted anywhere. */
    val sleepEndsAt: Long? = null,
    val sleepEndOfTrack: Boolean = false,
)

/**
 * Process-lifetime owner of the play accounting: scrobble gate, skip detection,
 * sleep timer, last-session persistence, stats + taste-profile refresh.
 *
 * WHY this exists: these loops used to live in AppViewModel's viewModelScope, so
 * swiping the app away cancelled them while PlaybackService kept playing —
 * scrobbles, recents, session save and the sleep timer all died with the UI.
 * This singleton is keyed on the application context, outlives every
 * Activity/ViewModel teardown and only dies with the process. Both
 * PlaybackService.onCreate and AppViewModel.init call [get] + [start]; the
 * companion + [started] flag guarantee exactly one instance and one ticker.
 *
 * It binds its OWN MediaController to the session: the UI's PlayerHolder is still
 * released with the ViewModel (that also drops its SSE SyncManager), while this
 * controller keeps observing/pausing playback for as long as the process lives.
 *
 * Concurrency: the scope is Main (every MediaController call must run on the
 * controller's application thread); the gate/skip/sleep fields below are only
 * touched from that scope plus the ViewModel's main-thread calls, so plain
 * vars are safe. API calls hop to IO internally.
 */
class PlaybackAccounting private constructor(private val context: Context) {

    companion object {
        @Volatile private var instance: PlaybackAccounting? = null

        /** Process-wide singleton: safe to call from both the service and the VM. */
        fun get(context: Context): PlaybackAccounting =
            instance ?: synchronized(this) {
                instance ?: PlaybackAccounting(context.applicationContext).also { instance = it }
            }
    }

    // Application-scoped on purpose: NOT tied to any ViewModel/Service scope —
    // cancelled only at process death.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val prefs = Prefs(context)
    val api = AuralisApi()

    private val _state = MutableStateFlow(AccountingState())
    val state: StateFlow<AccountingState> = _state.asStateFlow()

    /** One-shot user-facing messages (toasts). Events fired while no UI collects —
     *  e.g. a sleep-timer stop with the app swiped away — are dropped, which is
     *  exactly what a toast should do. */
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private val started = AtomicBoolean(false)
    private var controller: MediaController? = null

    /** trackhash -> Track index pushed by the ViewModel after loadAll; durations
     *  feed skip ratios and [refreshRecoNow] maps reco hashes to Tracks. The
     *  service-only path (Auto started playback, UI never came up) runs with an
     *  empty index: skips are still recorded, with the ratio falling back to the
     *  controller duration captured at arm time. */
    @Volatile private var library: Map<String, Track> = emptyMap()

    // ---- scrobble gate state (main-confined) --------------------------------

    /** Trackhashes whose departure must NOT count as a skip (previous-nav, or a
     *  resumed-session track). One-shot: cleared on the next transition. */
    private val skipExempt = HashSet<String>()
    private var armedFor: String? = null
    private var armedDurMs = 0L
    private var listenedMs = 0L
    private var lastPos = 0L
    private var scrobbled = false
    private var lastSessionJson: String? = null
    private var recoJob: Job? = null

    fun start() {
        if (!started.compareAndSet(false, true)) return // one instance/ticker per process
        scope.launch {
            val p = prefs.load()
            api.configure(p.serverBase, p.token)
            connectController()
        }
        scope.launch { tickerLoop() }
    }

    private fun connectController() {
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            // Same failure mode as PlayerHolder: buildAsync can throw after process
            // death/service kill — degrade to no accounting rather than crash.
            val c = runCatching { future.get() }.getOrNull() ?: return@addListener
            controller = c.also {
                it.addListener(listener)
                // Arm the gate for whatever is already playing (we may be attaching
                // mid-track after a UI death).
                onTransition(it.currentMediaItem?.mediaId, Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            onTransition(mediaItem?.mediaId, reason)
        }
    }

    private fun onTransition(id: String?, reason: Int) {
        val c = controller
        // Outgoing-track accounting: a user-initiated departure (next / jump / a new
        // queue — NOT a natural end or repeat) before the scrobble threshold, and not
        // an exempt move (previous-nav / resumed session), is a SKIP — a negative
        // taste signal scaled by how little was heard. The >=1s guard ignores instant
        // re-selections so they don't poison the profile.
        val leaving = armedFor
        if (c != null && leaving != null && leaving != id) {
            val exempt = skipExempt.remove(leaving)
            val userInitiated = reason == Player.MEDIA_ITEM_TRANSITION_REASON_SEEK ||
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED
            if (userInitiated && !exempt && !scrobbled && listenedMs >= 1000) {
                val durSec = library[leaving]?.duration ?: (armedDurMs / 1000.0)
                val durMs = (durSec * 1000).toLong()
                val ratio = if (durMs > 0) (listenedMs.toDouble() / durMs).coerceIn(0.0, 1.0) else 0.0
                recordSkip(leaving, listenedMs, ratio)
            }
        }

        // Sleep "end of track": the previous track just finished and advanced — stop here.
        if (_state.value.sleepEndOfTrack) {
            c?.pause()
            _state.update { it.copy(sleepActive = false, sleepEndOfTrack = false, sleepEndsAt = null) }
            _messages.tryEmit("Lecture arrêtée (fin de titre)")
        }

        armedFor = id
        armedDurMs = c?.duration?.coerceAtLeast(0L) ?: 0L
        listenedMs = 0L
        lastPos = 0L
        scrobbled = false
    }

    /** 1s heartbeat: scrobble gate + sleep-timer expiry + 5s session persistence. */
    private suspend fun tickerLoop() {
        var tick = 0
        while (true) {
            delay(1000)
            val c = controller ?: continue
            val pos = c.currentPosition.coerceAtLeast(0L)
            val id = c.currentMediaItem?.mediaId
            if (c.playWhenReady && id != null) {
                val delta = pos - lastPos
                if (delta in 1..2000) listenedMs += delta
                lastPos = pos
                val dur = c.duration.coerceAtLeast(0L)
                val threshold = if (dur > 0) minOf(30_000L, dur / 2) else 30_000L
                if (!scrobbled && listenedMs >= threshold) {
                    scrobbled = true
                    scrobble(id)
                }
            } else {
                lastPos = pos
            }

            val s = _state.value
            val endsAt = s.sleepEndsAt
            if (s.sleepActive && endsAt != null && SystemClock.elapsedRealtime() >= endsAt) {
                c.pause()
                _state.update { it.copy(sleepActive = false, sleepEndsAt = null, sleepEndOfTrack = false) }
                _messages.tryEmit("Lecture arrêtée (minuteur)")
            }

            if (++tick % 5 == 0) persistSession(c)
        }
    }

    private fun persistSession(c: MediaController) {
        val id = c.currentMediaItem?.mediaId ?: return
        if (c.mediaItemCount == 0) return
        val idx = c.currentMediaItemIndex.coerceAtLeast(0)
        val start = (idx - 100).coerceAtLeast(0)
        val window = (start until c.mediaItemCount).take(200).map { c.getMediaItemAt(it).mediaId }
        val json = JSONObject()
            .put("trackhash", id)
            .put("hashes", JSONArray(window))
            .put("index", idx - start)
            .put("position", c.currentPosition.coerceAtLeast(0L))
            .toString()
        // Skip redundant DataStore writes: when paused (and not seeking) the
        // serialized session is identical tick after tick.
        if (json != lastSessionJson) {
            lastSessionJson = json
            scope.launch { runCatching { prefs.saveLastSession(json) } }
        }
    }

    private fun scrobble(trackhash: String) {
        // Optimistic local bump — the UI sees it through [state].
        _state.update {
            val pc = it.playCounts.toMutableMap()
            pc[trackhash] = (pc[trackhash] ?: 0) + 1
            it.copy(playCounts = pc, recents = (listOf(trackhash) + it.recents.filter { r -> r != trackhash }).take(100))
        }
        scope.launch {
            runCatching { api.putState(JSONObject().put("action", "play").put("trackhash", trackhash)) }
            refreshStatsNow()
        }
        requestReco() // a completed listen nudges the taste profile
    }

    /** Record a SKIP (advanced before the listen threshold): a negative taste signal,
     *  not a listen — it doesn't touch local play counts / recents. */
    private fun recordSkip(trackhash: String, msPlayed: Long, ratio: Double) {
        scope.launch {
            runCatching {
                api.putState(JSONObject().put("action", "skip").put("trackhash", trackhash).put("msPlayed", msPlayed).put("ratio", ratio))
            }
        }
        requestReco()
    }

    // ---- stats / taste profile ---------------------------------------------

    suspend fun refreshStatsNow() {
        val s = runCatching { api.stats() }.getOrDefault(ListeningStats.EMPTY)
        _state.update { it.copy(stats = s) }
        checkMilestone(s.streak)
    }

    private fun checkMilestone(streak: Int) {
        scope.launch {
            val milestones = listOf(3, 7, 14, 30, 60, 100, 200, 365)
            val last = prefs.lastMilestone()
            val top = milestones.filter { it <= streak }.maxOrNull() ?: 0
            if (top > last) { prefs.setMilestone(top); _messages.tryEmit("🔥 $top jours d'affilée !") }
            else if (top < last) prefs.setMilestone(top)
        }
    }

    /** Refresh the personalised mix shortly after a feedback event (debounced). */
    fun requestReco() {
        recoJob?.cancel()
        recoJob = scope.launch { delay(1500); refreshRecoNow() }
    }

    suspend fun refreshRecoNow() {
        val res = api.recommend()
        val scores = res.forYou.associate { it.trackhash to it.score }
        val disliked = res.disliked.toSet()
        val tracks = res.forYou.mapNotNull { library[it.trackhash] }
            .filter { it.trackhash !in disliked }
            .take(12)
        _state.update { it.copy(forYou = tracks, recoScores = scores) }
    }

    // ---- inputs from the UI / service ----------------------------------------

    fun setLibrary(index: Map<String, Track>) { library = index }

    /** Keep the accounting's own API credentials in step with the UI session. */
    fun onServerConfigured(base: String, token: String?) { api.configure(base, token) }

    /** Server truth after a state fetch — the accounting then stays authoritative
     *  via its optimistic scrobble bumps (single source, no merge conflicts). */
    fun seedCounts(playCounts: Map<String, Int>, recents: List<String>) {
        _state.update { it.copy(playCounts = playCounts, recents = recents) }
    }

    fun clearLocalCounts() {
        _state.update { it.copy(playCounts = emptyMap(), recents = emptyList()) }
    }

    /** Main-thread only (called from the ViewModel's click handlers). */
    fun exemptFromSkip(trackhash: String) { skipExempt.add(trackhash) }

    // ---- sleep timer ---------------------------------------------------------

    fun startSleepTimer(minutes: Int) {
        _state.update {
            it.copy(sleepActive = true, sleepEndsAt = SystemClock.elapsedRealtime() + minutes * 60_000L, sleepEndOfTrack = false)
        }
    }

    fun sleepAfterTrack() {
        _state.update { it.copy(sleepActive = true, sleepEndsAt = null, sleepEndOfTrack = true) }
    }

    fun cancelSleepTimer() {
        _state.update { it.copy(sleepActive = false, sleepEndsAt = null, sleepEndOfTrack = false) }
    }
}
