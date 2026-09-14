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
import kotlinx.coroutines.withContext
import local.auralis.client.data.Prefs
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi
import local.auralis.client.sync.SyncManager
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
 * sleep timer, last-session persistence, stats + taste-profile refresh, endless
 * autoplay (queue continuation) and the Auralis Connect session.
 *
 * WHY this exists: these loops used to live in AppViewModel's viewModelScope, so
 * swiping the app away cancelled them while PlaybackService kept playing —
 * scrobbles, recents, session save and the sleep timer all died with the UI.
 * This singleton is keyed on the application context, outlives every
 * Activity/ViewModel teardown and only dies with the process. Both
 * PlaybackService.onCreate and AppViewModel.init call [get] + [start]; the
 * companion + [started] flag guarantee exactly one instance and one ticker.
 *
 * It binds its OWN MediaController to the session: the UI's PlayerHolder is
 * released with the ViewModel, while this controller keeps observing/pausing
 * playback for as long as the process lives. The same controller is the single
 * executor for (a) remote transport commands arriving over Auralis Connect and
 * (b) endless-autoplay appends — both used to run through the UI's controller
 * and stopped working at the first app swipe.
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

    // Auralis Connect (SSE hub client), a process-lifetime singleton in its own
    // right: built on THIS class' api so hub credentials follow onServerConfigured
    // exactly like the accounting's own HTTP calls. Owned here rather than in the
    // ViewModel so the phone stays registered on the hub (and keeps executing
    // remote commands) after the UI is swiped away.
    private val sync = SyncManager.get(context, api)

    // Pass-through surfaces for the UI (device roster, connection state). Types
    // are inferred from SyncManager so this class stays free of sync-model imports.
    val syncConnected get() = sync.connected
    val syncDevices get() = sync.devices
    val syncNowPlaying get() = sync.nowPlaying
    val syncControllingId get() = sync.controllingId

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
            // Register on the Auralis Connect hub right away: the stream loop waits
            // for a configured token on its own (pre-login polling), so connecting
            // unconditionally matches the old UI-driven timing while also covering
            // UI-less starts (Android Auto started playback first).
            sync.connect()
            listenForRemoteCommands()
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
            c.addListener(listener)
            controller = c
            // Arm the gate for whatever is already playing (we may be attaching
            // mid-track after a UI death). NOTE: everything below runs AFTER the
            // controller field is assigned — these helpers read it, and the old
            // `controller = c.also { … }` shape silently hid the field from them.
            onTransition(c.currentMediaItem?.mediaId, Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED)
            // Announce ourselves on the hub immediately (onEvents only fires on
            // the next state change; the roster would otherwise wait for one).
            publishNowPlaying()
            // Continuation is deliberately NOT triggered at attach: like the
            // PlayerHolder it replaces, it fires on transition/STATE_ENDED only —
            // a restored queue paused on its last item must not grow at boot.
        }, ContextCompat.getMainExecutor(context))
    }

    /**
     * Execute transport commands arriving over Auralis Connect against THIS class'
     * controller — the single process-lifetime executor. The collector used to live
     * in PlayerHolder's scope, so a remote "next"/"pause" stopped working the
     * moment the UI was swiped away; commands are semantics-identical to
     * PlayerHolder.handleRemoteCommand (including prev's 3s restart rule).
     */
    private fun listenForRemoteCommands() {
        scope.launch {
            sync.incomingCommand.collect { cmd ->
                val c = controller ?: return@collect
                when (cmd?.type) {
                    "play" -> c.play()
                    "pause" -> c.pause()
                    "next" -> c.seekToNextMediaItem()
                    "prev" -> if (c.currentPosition > 3000) c.seekTo(0) else c.seekToPreviousMediaItem()
                    "seek" -> cmd.position?.let { c.seekTo(it.coerceAtLeast(0L)) }
                }
            }
        }
    }

    /** Push this device's now-playing snapshot to the hub. Driven from THIS class'
     *  controller listener (was PlayerHolder's pushSnapshot): the roster keeps
     *  seeing the phone's progress after the UI dies. SyncManager throttles and
     *  skips publishes on its own (not connected / remote-controlling another
     *  device), so firing on every player event is cheap. */
    private fun publishNowPlaying() {
        val c = controller ?: return
        val meta = c.currentMediaItem?.mediaMetadata
        sync.publishState(
            trackhash = c.currentMediaItem?.mediaId,
            title = meta?.title?.toString(),
            artist = meta?.artist?.toString(),
            image = meta?.artworkUri?.toString(),
            position = c.currentPosition.coerceAtLeast(0L),
            duration = c.duration.coerceAtLeast(0L),
            isPlaying = c.playWhenReady,
        )
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            onTransition(mediaItem?.mediaId, reason)
            // A transition onto the last queue item is itself a tail — ask for more
            // now so ~20 tracks always sit ahead (same trigger as PlayerHolder).
            maybeContinue()
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) maybeContinue()
        }

        override fun onEvents(player: Player, events: Player.Events) {
            publishNowPlaying()
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

    // ---- endless autoplay (queue continuation) ------------------------------

    /** Guards a double-append: near-tail fires from BOTH the transition onto the
     *  last item and STATE_ENDED, and a second trigger can land before the first
     *  append does. Main-confined (this scope + the ViewModel's main-thread
     *  calls), so a plain flag is enough — same mechanism the ViewModel used. */
    private var continuationInFlight = false

    /** Queue sits at its tail with repeat off → ask for more (endless listening).
     *  Trigger points and conditions are copied verbatim from PlayerHolder, which
     *  owned this before the loop moved into the process-lifetime scope. */
    private fun maybeContinue() {
        val c = controller ?: return
        if (c.mediaItemCount > 0 && c.currentMediaItemIndex >= c.mediaItemCount - 1 &&
            c.repeatMode == Player.REPEAT_MODE_OFF
        ) {
            appendContinuation()
        }
    }

    private fun appendContinuation() {
        if (!autoplay) return // endless listening disabled — stop at queue end
        if (continuationInFlight) return // a continuation is already computed/appended
        val c = controller ?: return
        // The service-only path (Auto started playback, UI never came up) runs with
        // an empty library index: no current Track to rank around — same early-out
        // as the ViewModel's currentTrack() ?: return.
        val current = library[c.currentMediaItem?.mediaId] ?: return
        // Capture everything the ranking needs BEFORE hopping off the main thread.
        val queued = (0 until c.mediaItemCount).map { c.getMediaItemAt(it).mediaId }.toSet()
        val dis = dislikes
        val tracks = library.values.toList() // same encounter order as ui.tracks
        val counts = _state.value.playCounts
        val scores = _state.value.recoScores
        continuationInFlight = true
        scope.launch {
            try {
                // Build + rank the radio pool off the main thread — two full-library
                // filters and a sort over 10k tracks at every queue end (this used
                // to jank the UI thread from the ViewModel).
                val ranked = withContext(Dispatchers.Default) {
                    rankContinuation(current, tracks, queued, dis, counts, scores)
                }
                // Back on Main (this scope) — MediaController.addMediaItems must run
                // on the controller's application thread. Appending through THIS
                // controller mutates the shared session queue, so the UI's own
                // PlayerHolder snapshot (and the queue screen) still sees the growth.
                if (ranked.isNotEmpty()) c.addMediaItems(ranked.map { it.toMediaItem(api) })
            } finally {
                continuationInFlight = false
            }
        }
    }

    /** Radio-pool ranking, logic identical to the ViewModel's appendContinuation:
     *  prefer never-played tracks close to the current vibe; once everything has
     *  been heard, fall back to least-played; recycle (shuffled, dislikes and the
     *  current track excluded) rather than stopping dead. */
    private fun rankContinuation(
        current: Track,
        tracks: List<Track>,
        queued: Set<String>,
        dis: Set<String>,
        counts: Map<String, Int>,
        scores: Map<String, Double>,
    ): List<Track> {
        fun eligible(t: Track) = t.trackhash !in queued && t.trackhash !in dis
        fun close(t: Track) =
            (t.primaryArtistHash != null && t.primaryArtistHash == current.primaryArtistHash) ||
                (t.genre != null && t.genre == current.genre)
        val never = tracks.filter { eligible(it) && (counts[it.trackhash] ?: 0) == 0 }
        return when {
            never.isNotEmpty() -> {
                val closeNever = never.filter { close(it) }
                val pick = if (closeNever.size >= 10) closeNever else never
                pick.shuffled().take(20)
            }
            else -> {
                val fresh = tracks.filter { eligible(it) }
                if (fresh.isNotEmpty()) {
                    // Least-played first (a light taste-score jitter breaks ties),
                    // then shuffled so consecutive appends don't march the same list.
                    fresh.sortedWith(
                        compareBy({ counts[it.trackhash] ?: 0 }, { -(scores[it.trackhash] ?: 0.0) })
                    ).take(40).shuffled().take(20)
                } else {
                    tracks.filter { it.trackhash != current.trackhash && it.trackhash !in dis }
                        .shuffled().take(20)
                }
            }
        }
    }

    // ---- inputs from the UI / service ----------------------------------------

    fun setLibrary(index: Map<String, Track>) { library = index }

    /** Current dislike set, pushed by the ViewModel whenever its UiState one
     *  changes (server truth after a state fetch + every toggle). The continuation
     *  picker must honor it even though the loop no longer runs in the ViewModel. */
    @Volatile private var dislikes: Set<String> = emptySet()
    fun setDislikes(set: Set<String>) { dislikes = set }

    /** Endless-listening toggle (Settings), pushed by the ViewModel on change and
     *  at boot. Defaults to true — the same value UiState boots with. */
    @Volatile private var autoplay = true
    fun setAutoplay(on: Boolean) { autoplay = on }

    /** Keep the accounting's API credentials — and the Auralis Connect session —
     *  in step with the UI session: the hub registration follows the token, so the
     *  device leaves the roster the moment it is cleared (logout / server change)
     *  and re-registers on login. */
    fun onServerConfigured(base: String, token: String?) {
        api.configure(base, token)
        if (token.isNullOrBlank()) sync.disconnect() else sync.connect()
    }

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
