package local.auralis.client.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import local.auralis.client.data.Prefs
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.MonthlyRecap
import local.auralis.client.model.PlaylistDto
import local.auralis.client.model.SearchResult
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi
import local.auralis.client.playback.PlaybackAccounting
import local.auralis.client.playback.PlaybackSnapshot
import local.auralis.client.playback.PlayerHolder
import org.json.JSONArray
import org.json.JSONObject

enum class Phase { BOOT, CONNECT, LOGIN, LOADING, READY, ERROR }

enum class ViewId { HOME, NEW, RADIO, EXPLORE, LIBRARY, FAVORITES, RECENTS, FOLDERS, INSIGHTS, ALBUM, ARTIST, PLAYLIST, SETTINGS }

/** The five Apple Music tab roots — tapping one starts a fresh navigation stack. */
val rootViewIds = setOf(ViewId.HOME, ViewId.NEW, ViewId.RADIO, ViewId.EXPLORE, ViewId.LIBRARY)

data class NavTarget(val view: ViewId, val id: String? = null)

data class UiState(
    val phase: Phase = Phase.BOOT,
    val serverBase: String = "",
    val username: String? = null,
    val isAdmin: Boolean = false,
    val message: String? = null,
    val connecting: Boolean = false,

    val tracks: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val folders: List<local.auralis.client.model.FolderNode> = emptyList(),
    val root: String? = null,

    val favorites: Set<String> = emptySet(),
    val favoritesOrder: List<String> = emptyList(),
    val dislikes: Set<String> = emptySet(),
    val recents: List<String> = emptyList(),
    val playCounts: Map<String, Int> = emptyMap(),
    val playlists: List<PlaylistDto> = emptyList(),
    val stats: ListeningStats = ListeningStats.EMPTY,

    // Recommendations + monthly mood recap (server taste engine).
    val forYou: List<Track> = emptyList(),
    val recoScores: Map<String, Double> = emptyMap(),
    val recap: MonthlyRecap? = null,
    val recapMonths: List<String> = emptyList(),

    val nav: NavTarget = NavTarget(ViewId.HOME),
    val backStack: List<NavTarget> = emptyList(),

    val searchQuery: String = "",
    val searchResult: SearchResult = SearchResult.EMPTY,

    val lyrics: LyricsResult = LyricsResult.NONE,
    val lyricsLoading: Boolean = false,
    val karaoke: Boolean = true,
    val lyricsOffset: Float = 0.15f,

    val donateDue: Boolean = false,
    val contextTrack: Track? = null,

    // Spotify-style multi-select → "AI playlist from my picks".
    val selectionMode: Boolean = false,
    val selected: Set<String> = emptySet(),
    val generating: Boolean = false,

    // In-app self-update (GitHub release). `update` is non-null when a newer build
    // exists; the install flow streams the APK and reports `updateProgress`.
    val update: local.auralis.client.update.UpdateInfo? = null,
    val updateDownloading: Boolean = false,
    val updateProgress: Float = 0f,

    val commandOpen: Boolean = false,
    val visualizerOpen: Boolean = false,
    val volume: Float = 0.85f,
    /** Endless listening: when the queue ends, auto-append similar tracks. */
    val autoplay: Boolean = true,
    val sleepActive: Boolean = false,
    val sleepEndsAt: Long? = null,
    val sleepEndOfTrack: Boolean = false,
    val toast: String? = null,

    val trackByHash: Map<String, Track> = emptyMap(),
)

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val prefs = Prefs(app)
    val api = AuralisApi()
    val player = PlayerHolder(app, api)

    // Process-lifetime accounting (scrobbles, skips, sleep timer, session save,
    // stats/reco, endless autoplay, Auralis Connect). Owned OUTSIDE the
    // viewModelScope so it survives this ViewModel being cleared when the user
    // swipes the app away mid-playback.
    private val accounting = PlaybackAccounting.get(app)

    // Auralis Connect surfaces, process-lifetime (roster of hub devices, stream
    // state, which device this phone is remote-controlling). Pass-through: the
    // owner is the accounting singleton, so the data stays live across UI restarts.
    val syncConnected get() = accounting.syncConnected
    val syncDevices get() = accounting.syncDevices
    val syncNowPlaying get() = accounting.syncNowPlaying
    val syncControllingId get() = accounting.syncControllingId

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    val playback: StateFlow<PlaybackSnapshot> get() = player.snapshot
    val position: StateFlow<Long> get() = player.position

    // index helpers
    private var trackIndex: Map<String, Track> = emptyMap()
    fun track(hash: String?): Track? = hash?.let { trackIndex[it] }

    init {
        player.onTrackChanged = { id, _ -> onTrackChanged(id) }
        player.connect()
        accounting.setLibrary(trackIndex)
        accounting.start()
        // Mirror the accounting-owned state into the UI: scrobble bumps, streak,
        // taste mix and sleep-timer state keep updating here even when a NEW
        // ViewModel attaches after the previous one was cleared.
        viewModelScope.launch {
            accounting.state.collect { st ->
                _ui.update {
                    it.copy(
                        playCounts = st.playCounts,
                        recents = st.recents,
                        stats = st.stats,
                        forYou = st.forYou,
                        recoScores = st.recoScores,
                        sleepActive = st.sleepActive,
                        sleepEndsAt = st.sleepEndsAt,
                        sleepEndOfTrack = st.sleepEndOfTrack,
                    )
                }
            }
        }
        viewModelScope.launch { accounting.messages.collect { notify(it) } }
        // Push the UI-owned inputs the process-lifetime loops consume: the autoplay
        // toggle and the dislike set live in UiState (and Prefs), but the endless-
        // autoplay picker now runs in PlaybackAccounting and must see every change
        // (boot, settings toggle, server-truth refresh, per-track dislikes).
        viewModelScope.launch {
            _ui.map { it.autoplay }.distinctUntilChanged().collect { accounting.setAutoplay(it) }
        }
        viewModelScope.launch {
            _ui.map { it.dislikes }.distinctUntilChanged().collect { accounting.setDislikes(it) }
        }
        boot()
        checkForUpdate()
    }

    // ---- boot / auth -------------------------------------------------------

    private fun boot() {
        viewModelScope.launch {
            val p = prefs.load()
            // Donation reminder: due on the first launch, then every 3 launches after
            // it (launches 1, 4, 7, …). Shown once the app reaches the library.
            val launches = prefs.bumpLaunchCount()
            val donateDue = launches == 1 || (launches - 1) % 3 == 0
            _ui.update { it.copy(karaoke = p.karaoke, lyricsOffset = p.lyricsOffset, donateDue = donateDue, volume = p.volume, autoplay = p.autoplay) }
            player.setRepeat(p.repeat)
            player.setShuffle(p.shuffle)
            player.setVolume(p.volume)
            if (p.serverBase.isBlank()) {
                _ui.update { it.copy(phase = Phase.CONNECT) }
                return@launch
            }
            if (!p.token.isNullOrBlank()) {
                api.configure(p.serverBase, p.token)
                accounting.onServerConfigured(p.serverBase, p.token)
                _ui.update { it.copy(serverBase = p.serverBase, username = p.username) }
                // Validate by loading; on auth failure fall back to login.
                loadAll(onAuthError = {
                    _ui.update { it.copy(phase = Phase.LOGIN, serverBase = p.serverBase) }
                })
            } else {
                _ui.update { it.copy(phase = Phase.LOGIN, serverBase = p.serverBase) }
            }
        }
    }

    fun connect(rawBase: String) {
        viewModelScope.launch {
            _ui.update { it.copy(connecting = true, message = null) }
            val base = AuralisApi.normalizeBase(rawBase)
            val ok = api.health(base)
            if (!ok) {
                _ui.update { it.copy(connecting = false, message = "Serveur injoignable à cette adresse.") }
                return@launch
            }
            prefs.setServer(base, null, null)
            api.configure(base, null)
            accounting.onServerConfigured(base, null)
            _ui.update { it.copy(connecting = false, serverBase = base, phase = Phase.LOGIN, message = null) }
        }
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            _ui.update { it.copy(connecting = true, message = null) }
            val base = _ui.value.serverBase
            val res = api.login(base, username.ifBlank { "admin" }, password)
            if (res.ok && res.token != null) {
                api.configure(base, res.token)
                accounting.onServerConfigured(base, res.token)
                prefs.setServer(base, res.token, res.username)
                _ui.update {
                    it.copy(connecting = false, username = res.username, isAdmin = res.isAdmin, message = null)
                }
                loadAll()
            } else {
                _ui.update { it.copy(connecting = false, message = res.error ?: "Connexion refusée") }
            }
        }
    }

    fun changeServer() {
        viewModelScope.launch {
            player.stop()
            prefs.clearSession()
            // The accounting (and with it the Auralis Connect registration) follows
            // the cleared session — the phone leaves the hub instead of lingering
            // on the old server until the stream happens to drop.
            accounting.onServerConfigured(_ui.value.serverBase, null)
            _ui.update { it.copy(phase = Phase.CONNECT, message = null) }
        }
    }

    fun logout() {
        viewModelScope.launch {
            player.stop()
            prefs.clearSession()
            api.configure(_ui.value.serverBase, null)
            accounting.onServerConfigured(_ui.value.serverBase, null)
            _ui.update { it.copy(phase = Phase.LOGIN) }
        }
    }

    // ---- data --------------------------------------------------------------

    fun loadAll(onAuthError: (() -> Unit)? = null) {
        viewModelScope.launch {
            _ui.update { it.copy(phase = if (_ui.value.tracks.isEmpty()) Phase.LOADING else _ui.value.phase) }
            try {
                // Fetch AND map the snapshot off the main thread. api.library() only
                // ran the network + JSONObject parse on IO; LibrarySnapshot.from() (which
                // maps ~10k JSON rows into model objects) and the associateBy index then
                // ran on the Main dispatcher (loadAll launches on viewModelScope/Main) —
                // a real jank/ANR at scale. Default keeps the whole map off the UI thread.
                val (lib, index) = withContext(Dispatchers.Default) {
                    val snapshot = api.library()
                    snapshot to snapshot.tracks.associateBy { it.trackhash }
                }
                trackIndex = index
                accounting.setLibrary(index)
                _ui.update {
                    it.copy(
                        phase = Phase.READY,
                        tracks = lib.tracks,
                        albums = lib.albums,
                        artists = lib.artists,
                        folders = lib.folders,
                        root = lib.root,
                        trackByHash = index,
                    )
                }
                refreshState()
                refreshStats()
                accounting.refreshRecoNow()
                fetchRecapAndMaybeNotify()
                restoreLastSession()
            } catch (e: AuralisApi.ApiException) {
                if (e.code == 401) {
                    if (onAuthError != null) onAuthError() else _ui.update { it.copy(phase = Phase.LOGIN) }
                } else {
                    _ui.update { it.copy(phase = Phase.ERROR, message = "Erreur de chargement (${e.code})") }
                }
            } catch (e: Exception) {
                _ui.update { it.copy(phase = Phase.ERROR, message = "Serveur injoignable") }
            }
        }
    }

    private suspend fun refreshState() {
        runCatching { api.userState() }.getOrNull()?.let { st ->
            // Counts/recents belong to the accounting singleton (it keeps bumping
            // them after this ViewModel is gone); seed it, keep the rest local.
            accounting.seedCounts(st.playCounts, st.recents)
            _ui.update {
                it.copy(
                    favorites = st.favorites.toSet(),
                    favoritesOrder = st.favorites,
                    dislikes = st.dislikes.toSet(),
                    playlists = st.playlists.sortedBy { p -> p.position },
                )
            }
        }
    }

    private suspend fun refreshStats() {
        accounting.refreshStatsNow()
    }

    fun refreshStatsAsync() { viewModelScope.launch { refreshStats() } }

    // ---- navigation --------------------------------------------------------

    fun navigate(view: ViewId, id: String? = null) {
        _ui.update {
            // Switching tabs (Apple Music's five roots) resets the stack — each tab
            // is a fresh navigation context; pushing a tab would otherwise bury it.
            val switchTab = view in rootViewIds
            it.copy(
                backStack = if (switchTab) emptyList() else (it.backStack + it.nav).takeLast(24),
                nav = NavTarget(view, id),
            )
        }
    }

    fun back() {
        _ui.update {
            val prev = it.backStack.lastOrNull() ?: return@update it.copy(nav = NavTarget(ViewId.HOME))
            it.copy(nav = prev, backStack = it.backStack.dropLast(1))
        }
    }

    // ---- playback ----------------------------------------------------------

    fun playTrack(track: Track, list: List<Track> = listOf(track), startIndex: Int = list.indexOf(track)) {
        player.playTracks(list, if (startIndex < 0) 0 else startIndex)
    }

    fun playList(list: List<Track>, startIndex: Int = 0) {
        if (list.isNotEmpty()) player.playTracks(list, startIndex)
    }

    /// "Jamais écoutés": a RANDOM queue of every track this account never played
    /// (reshuffled on each call), dipping into the least-played tracks when the
    /// unheard pool runs small. Fully client-side — play counts are already in
    /// memory — so it opens instantly, offline included.
    fun playUnheardMix() {
        val ui = _ui.value
        val never = ui.tracks
            .filter { it.trackhash !in ui.dislikes && (ui.playCounts[it.trackhash] ?: 0) == 0 }
            .shuffled()
        val list = if (never.size >= 25) {
            never.take(60)
        } else {
            val least = ui.tracks
                .filter { it.trackhash !in ui.dislikes && (ui.playCounts[it.trackhash] ?: 0) > 0 }
                .sortedBy { ui.playCounts[it.trackhash] ?: 0 }
                .take(60)
            (never + least).distinctBy { it.trackhash }
        }
        if (list.isEmpty()) {
            notify("Aucun titre à découvrir pour l'instant")
            return
        }
        player.setShuffle(true)
        viewModelScope.launch { prefs.setPlayback(shuffle = true) }
        player.playTracks(list.shuffled(), 0)
        notify(if (never.isNotEmpty()) "Mix jamais écoutés : ${never.size} titres inédits"
               else "Tout est déjà écouté — mix des titres les moins joués")
    }

    fun togglePlay() = player.togglePlay()
    fun next() = player.next()
    fun prev() {
        // Going back isn't a rejection of the current track — exempt its departure
        // from skip detection (prev only changes track within the first 3 s).
        if (player.positionMs() <= 3000) player.snapshot.value.currentId?.let { accounting.exemptFromSkip(it) }
        player.prev()
    }
    fun seekTo(ms: Long) = player.seekTo(ms)

    fun toggleShuffle() {
        // Persist the value we're SETTING, not a read-back of the controller
        // snapshot: the new state only arrives after the IPC round-trip, so the
        // read-back raced and could persist the previous value (the restored
        // session would then play unshuffled even though the UI showed shuffle).
        val next = !player.snapshot.value.shuffle
        player.setShuffle(next)
        viewModelScope.launch { prefs.setPlayback(shuffle = next) }
    }

    fun cycleRepeat() {
        // Same race as toggleShuffle: compute the next mode locally (order
        // matches PlayerHolder.cycleRepeat: off -> all -> one -> off).
        val next = when (player.snapshot.value.repeat) {
            "all" -> "one"
            "one" -> "off"
            else -> "all"
        }
        player.setRepeat(next)
        viewModelScope.launch { prefs.setPlayback(repeat = next) }
    }

    fun toggleAutoplay() {
        val next = !_ui.value.autoplay
        _ui.update { it.copy(autoplay = next) }
        viewModelScope.launch { prefs.setPlayback(autoplay = next) }
        notify(if (next) "Lecture continue activée" else "Lecture continue désactivée")
    }

    fun addNext(track: Track) { player.addNext(track); notify("Jouera ensuite") }
    fun addToEnd(track: Track) { player.addToEnd(track); notify("Ajouté à la file") }

    // ---- track context menu ------------------------------------------------

    fun openTrackMenu(track: Track) { _ui.update { it.copy(contextTrack = track) } }
    fun closeTrackMenu() { _ui.update { it.copy(contextTrack = null) } }

    /** Create a playlist and immediately drop a track into it (used from the menu). */
    fun createPlaylistWithTrack(name: String, trackhash: String) {
        createPlaylist(name) { id -> addToPlaylist(id, trackhash) }
    }
    fun jumpTo(index: Int) = player.jumpTo(index)
    fun removeFromQueue(index: Int) = player.removeAt(index)
    fun clearQueue() { player.clearQueueExceptCurrent(); notify("File vidée") }

    // ---- track change → lyrics ----------------------------------------------
    // Skip detection, the scrobble gate, the sleep end-of-track stop, the
    // whole 1s/5s accounting loops AND endless autoplay (queue continuation)
    // live in PlaybackAccounting (they must keep running after this ViewModel
    // is cleared); only the UI-side lyrics reset and fetch remain here.

    private fun onTrackChanged(id: String?) {
        _ui.update { it.copy(lyrics = LyricsResult.NONE) }
        // Fetch lyrics for the now-playing track (lazy; only when a track is active).
        if (id != null) fetchLyrics(force = false)
    }

    // ---- favorites / dislikes ----------------------------------------------

    fun toggleFavorite(trackhash: String) {
        val isFav = _ui.value.favorites.contains(trackhash)
        _ui.update {
            val next = it.favorites.toMutableSet()
            val dis = it.dislikes.toMutableSet()
            if (isFav) next.remove(trackhash) else { next.add(trackhash); dis.remove(trackhash) } // like clears dislike
            it.copy(favorites = next, dislikes = dis)
        }
        notify(if (isFav) "Retiré des favoris" else "Ajouté aux favoris")
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "favorite").put("trackhash", trackhash).put("value", !isFav))
        }
        accounting.requestReco()
    }

    fun isFavorite(trackhash: String): Boolean = _ui.value.favorites.contains(trackhash)

    fun toggleDislike(trackhash: String) {
        val isDis = _ui.value.dislikes.contains(trackhash)
        _ui.update {
            val dis = it.dislikes.toMutableSet()
            val fav = it.favorites.toMutableSet()
            if (isDis) dis.remove(trackhash) else { dis.add(trackhash); fav.remove(trackhash) } // dislike clears like
            it.copy(dislikes = dis, favorites = fav)
        }
        notify(if (isDis) "Préférence retirée" else "Moins de titres comme celui-ci")
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "dislike").put("trackhash", trackhash).put("value", !isDis))
        }
        accounting.requestReco()
    }

    fun isDisliked(trackhash: String): Boolean = _ui.value.dislikes.contains(trackhash)

    // ---- recommendations + monthly recap -----------------------------------
    // (The "Fait pour vous" mix itself is owned by PlaybackAccounting, which
    // refreshes it after scrobbles/skips/favourites — see requestReco().)

    private suspend fun fetchRecapAndMaybeNotify() {
        val res = api.recap(null)
        _ui.update { it.copy(recap = res.recap, recapMonths = res.months) }
        // End-of-month nudge: the most recent fully-elapsed month with data, once.
        val thisMonth = currentMonthKey()
        val elapsed = res.months.firstOrNull { it < thisMonth } ?: return
        if (elapsed == prefs.lastRecapSeen()) return
        prefs.setRecapSeen(elapsed)
        notify("🗓️ Ton bilan d'humeur de ${monthLabel(elapsed)} est prêt")
    }

    /** Switch the recap to a specific month (from the Insights month selector). */
    fun selectRecapMonth(month: String) {
        viewModelScope.launch {
            val res = api.recap(month)
            _ui.update { it.copy(recap = res.recap, recapMonths = if (res.months.isNotEmpty()) res.months else it.recapMonths) }
        }
    }

    private fun currentMonthKey(): String {
        val c = java.util.Calendar.getInstance()
        return "%04d-%02d".format(c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1)
    }
    private fun monthLabel(key: String): String {
        val months = listOf("Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre")
        val parts = key.split("-")
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 1
        return "${months.getOrElse(m - 1) { key }} ${parts.getOrNull(0) ?: ""}".trim()
    }

    fun dismissDonate() { _ui.update { it.copy(donateDue = false) } }

    // ---- self-update -------------------------------------------------------

    // Ask GitHub once per launch whether a newer release exists. Best-effort and
    // silent on failure (offline, rate-limited): the app simply doesn't prompt.
    private fun checkForUpdate() {
        // Play flavor: never check for GitHub updates. That channel updates
        // through the store; the installer permission is stripped from its
        // manifest, and Play App Signing means a GitHub APK could not install
        // over a store-installed build anyway.
        if (!local.auralis.client.BuildConfig.SELF_UPDATE) return
        viewModelScope.launch {
            val info = local.auralis.client.update.UpdateManager.check(
                local.auralis.client.BuildConfig.VERSION_NAME,
            )
            if (info != null) _ui.update { it.copy(update = info) }
        }
    }

    fun dismissUpdate() { _ui.update { it.copy(update = null, updateDownloading = false, updateProgress = 0f) } }

    // Download the new APK and hand it to the system installer. The dialog stays up
    // (showing progress) until the installer opens, or a failure toast on error.
    fun installUpdate() {
        val info = _ui.value.update ?: return
        if (_ui.value.updateDownloading) return
        viewModelScope.launch {
            _ui.update { it.copy(updateDownloading = true, updateProgress = 0f) }
            val ctx = getApplication<Application>()
            val file = local.auralis.client.update.UpdateManager.download(ctx, info) { p ->
                _ui.update { it.copy(updateProgress = p) }
            }
            if (file != null) {
                val launched = local.auralis.client.update.UpdateManager.install(ctx, file)
                _ui.update { it.copy(update = null, updateDownloading = false, updateProgress = 0f) }
                if (!launched) {
                    file.delete()
                    notify("Mise à jour refusée : signature invalide")
                }
            } else {
                _ui.update { it.copy(updateDownloading = false, updateProgress = 0f) }
                notify("Échec du téléchargement de la mise à jour")
            }
        }
    }

    fun openCommand() { _ui.update { it.copy(commandOpen = true) } }
    fun closeCommand() { _ui.update { it.copy(commandOpen = false) } }
    fun toggleVisualizer() { _ui.update { it.copy(visualizerOpen = !it.visualizerOpen) } }

    // ---- toast -------------------------------------------------------------

    private var toastJob: kotlinx.coroutines.Job? = null
    fun notify(msg: String) {
        _ui.update { it.copy(toast = msg) }
        toastJob?.cancel()
        toastJob = viewModelScope.launch { delay(2600); _ui.update { it.copy(toast = null) } }
    }
    fun clearToast() { _ui.update { it.copy(toast = null) } }

    // ---- volume ------------------------------------------------------------

    private var volumePrefJob: kotlinx.coroutines.Job? = null
    fun setVolume(v: Float) {
        val nv = v.coerceIn(0f, 1f)
        player.setVolume(nv)
        _ui.update { it.copy(volume = nv) }
        // A volume drag fires this per tick and each run rewrites the whole
        // DataStore file. Apply immediately, persist debounced.
        volumePrefJob?.cancel()
        volumePrefJob = viewModelScope.launch {
            delay(600)
            prefs.setPlayback(volume = nv)
        }
    }

    // ---- shuffle play ------------------------------------------------------

    fun playShuffled(list: List<Track>) {
        if (list.isEmpty()) return
        player.setShuffle(true)
        viewModelScope.launch { prefs.setPlayback(shuffle = true) }
        player.playTracks(list.shuffled(), 0)
    }

    // ---- sleep timer -------------------------------------------------------
    // State + expiry loop live in PlaybackAccounting so an armed timer still
    // stops playback after the app is swiped away. The timer deadline is
    // SystemClock.elapsedRealtime()-based (monotonic) inside the accounting.

    fun startSleepTimer(minutes: Int) {
        accounting.startSleepTimer(minutes)
        notify("Minuteur : $minutes min")
    }
    fun sleepAfterTrack() {
        accounting.sleepAfterTrack()
        notify("Arrêt en fin de titre")
    }
    fun cancelSleepTimer() {
        accounting.cancelSleepTimer()
        notify("Minuteur annulé")
    }

    // ---- session resume ----------------------------------------------------
    // (The 5s persistence loop is in PlaybackAccounting; only the boot-time
    // restore, which needs the freshly loaded library, stays here.)

    private suspend fun restoreLastSession() {
        if (player.snapshot.value.hasItems) return
        val raw = runCatching { prefs.loadLastSession() }.getOrNull() ?: return
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val hashes = o.optJSONArray("hashes") ?: return
        val tracks = (0 until hashes.length()).mapNotNull { trackIndex[hashes.optString(it)] }
        if (tracks.isEmpty()) return
        val idx = o.optInt("index", 0).coerceIn(0, tracks.lastIndex)
        val pos = o.optLong("position", 0L)
        // A resumed track was already partly heard last session; leaving it now isn't
        // a fresh skip (the gate can't see the prior listening).
        if (pos > 0) tracks.getOrNull(idx)?.let { accounting.exemptFromSkip(it.trackhash) }
        player.playTracksPaused(tracks, idx, pos)
    }

    // ---- streak milestones --------------------------------------------------
    // (Milestone detection moved with the stats into PlaybackAccounting so a
    // streak earned during background playback still fires.)

    // ---- playlists ---------------------------------------------------------

    fun createPlaylist(name: String, onCreated: (String) -> Unit = {}) {
        viewModelScope.launch {
            val pl = JSONObject().put("name", name)
            val res = api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", pl))
            if (!api.apiLastOk) { notify("Impossible de créer la playlist"); return@launch }
            val id = res.optString("id", "")
            refreshState()
            if (id.isNotBlank()) onCreated(id)
        }
    }

    fun addToPlaylist(playlistId: String, trackhash: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        if (pl.trackhashes.contains(trackhash)) { notify("Déjà dans « ${pl.name} »"); return }
        val next = pl.trackhashes + trackhash
        upsertPlaylist(pl.copy(trackhashes = next))
        notify("Ajouté à « ${pl.name} »")
    }

    fun removeFromPlaylist(playlistId: String, trackhash: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        upsertPlaylist(pl.copy(trackhashes = pl.trackhashes.filter { it != trackhash }))
    }

    fun renamePlaylist(playlistId: String, name: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        upsertPlaylist(pl.copy(name = name))
    }

    private fun upsertPlaylist(pl: PlaylistDto) {
        // optimistic
        _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == pl.id) pl else p }) }
        viewModelScope.launch {
            val json = JSONObject()
                .put("id", pl.id).put("name", pl.name)
                .put("description", pl.description ?: JSONObject.NULL)
                .put("pinned", pl.pinned)
                .put("trackhashes", JSONArray(pl.trackhashes))
            api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", json))
            if (!api.apiLastOk) {
                notify("Échec de la synchronisation de « ${pl.name} »")
                refreshState() // revert the optimistic edit with the server's truth
            }
        }
    }

    fun deletePlaylist(playlistId: String) {
        _ui.update { it.copy(playlists = it.playlists.filter { p -> p.id != playlistId }) }
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "playlist.delete").put("id", playlistId))
        }
    }

    /** Upload (dataUrl, e.g. "data:image/jpeg;base64,...") or clear (null) a playlist's
     * custom cover. Owner-only server-side; mirrors web's setPlaylistCover. */
    fun setPlaylistCover(playlistId: String, dataUrl: String?) {
        viewModelScope.launch {
            val payload = JSONObject().put("action", "playlist.cover").put("id", playlistId)
                .put("imageDataUrl", dataUrl ?: JSONObject.NULL)
            val res = api.putState(payload)
            if (!res.optBoolean("ok", false)) { notify("Échec de l'envoi de la pochette"); return@launch }
            val hash = res.optString("imageHash", "").ifBlank { null }
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(imageHash = hash) else p }) }
        }
    }

    fun togglePin(playlistId: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        upsertPlaylist(pl.copy(pinned = !pl.pinned))
        notify(if (!pl.pinned) "Épinglée" else "Désépinglée")
    }

    fun movePlaylist(playlistId: String, dir: Int) {
        val list = _ui.value.playlists.toMutableList()
        val i = list.indexOfFirst { it.id == playlistId }
        if (i < 0) return
        val j = i + dir
        if (j !in list.indices) return
        val tmp = list[i]; list[i] = list[j]; list[j] = tmp
        _ui.update { it.copy(playlists = list) }
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "playlist.reorder").put("ids", JSONArray(list.map { it.id })))
        }
    }

    // ---- multi-select → AI playlist ----------------------------------------

    fun enterSelection(hash: String? = null) {
        _ui.update {
            val sel = if (hash != null) it.selected + hash else it.selected
            it.copy(selectionMode = true, selected = sel)
        }
    }

    fun toggleSelected(hash: String) {
        _ui.update {
            val sel = it.selected.toMutableSet()
            if (!sel.add(hash)) sel.remove(hash)
            it.copy(selectionMode = true, selected = sel)
        }
    }

    fun clearSelection() { _ui.update { it.copy(selected = emptySet()) } }
    fun exitSelection() { _ui.update { it.copy(selectionMode = false, selected = emptySet()) } }

    /** Play the current selection then leave selection mode. */
    fun playSelection() {
        val tracks = _ui.value.selected.mapNotNull { trackIndex[it] }
        if (tracks.isNotEmpty()) { playList(tracks, 0); exitSelection() }
    }

    /** Ask the server taste engine to build a playlist from the hand-picked seeds +
     *  the user's taste, then open it. */
    fun generateAiPlaylist(count: Int = 30) {
        val seeds = _ui.value.selected.toList()
        if (seeds.isEmpty()) { notify("Sélectionnez au moins un titre"); return }
        if (_ui.value.generating) return
        _ui.update { it.copy(generating = true) }
        notify("Création de votre Mix IA…")
        viewModelScope.launch {
            try {
                val body = JSONObject()
                    .put("action", "playlist.generateFromSeeds")
                    .put("seeds", JSONArray(seeds))
                    .put("count", count)
                val res = api.putState(body)
                val id = res.optString("id", "")
                val name = res.optString("name", "Mix IA")
                refreshState()
                _ui.update { it.copy(generating = false, selectionMode = false, selected = emptySet()) }
                if (id.isNotBlank()) {
                    navigate(ViewId.PLAYLIST, id)
                    notify("Mix IA « $name » prêt")
                } else notify("Impossible de générer la playlist")
            } catch (e: Exception) {
                _ui.update { it.copy(generating = false) }
                notify("Impossible de générer la playlist")
            }
        }
    }

    // ---- settings: account / library / data --------------------------------

    fun changePassword(current: String, newPw: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            val res = api.post("/api/auth/password", JSONObject().put("currentPassword", current).put("newPassword", newPw))
            if (res.optBoolean("ok", false)) {
                val token = if (res.isNull("token")) null else res.optString("token", null)
                if (token != null) {
                    api.configure(_ui.value.serverBase, token)
                    // Rotation must reach the accounting's api too: the accounting
                    // (scrobbles) and the sync client read THEIR instance, and a
                    // stale token there would fail every call after a password change.
                    accounting.onServerConfigured(_ui.value.serverBase, token)
                    prefs.setServer(_ui.value.serverBase, token, _ui.value.username)
                }
                notify("Mot de passe mis à jour")
                onResult(true, null)
            } else onResult(false, res.optString("error", "Échec du changement"))
        }
    }

    fun resetStats() {
        accounting.clearLocalCounts() // authoritative owner of counts/recents
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "resetStats"))
            refreshStats()
            accounting.refreshRecoNow()
        }
        notify("Historique réinitialisé")
    }

    fun rescan() {
        viewModelScope.launch {
            notify("Scan lancé…")
            api.post("/api/library/scan", JSONObject())
            if (!api.apiLastOk) {
                notify("Échec du scan — serveur injoignable")
                return@launch
            }
            loadAll()
        }
    }

    fun changeMusicDir(dir: String) {
        viewModelScope.launch {
            val res = api.post("/api/library/source", JSONObject().put("dir", dir))
            if (res.has("error")) notify(res.optString("error")) else { notify("Dossier mis à jour — indexation…"); loadAll() }
        }
    }

    fun exportState(onJson: (String) -> Unit) {
        viewModelScope.launch { onJson(api.getObj("/api/state").toString()) }
    }

    fun importState(json: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val state = runCatching { JSONObject(json) }.getOrNull()
            if (state == null) { onDone(false); return@launch }
            val r = api.putState(JSONObject().put("action", "replace").put("state", state))
            refreshState(); refreshStats()
            val ok = r.optBoolean("ok", false)
            notify(if (ok) "Données importées" else "Import échoué")
            onDone(ok)
        }
    }

    // ---- settings: admin user management -----------------------------------

    fun loadUsers(onResult: (JSONArray, Int) -> Unit) {
        viewModelScope.launch {
            val res = api.getObj("/api/auth/users")
            onResult(res.optJSONArray("users") ?: JSONArray(), res.optInt("me", -1))
        }
    }

    fun createUser(username: String, password: String, isAdmin: Boolean, onDone: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            val r = api.post("/api/auth/users", JSONObject().put("username", username).put("password", password).put("isAdmin", isAdmin))
            if (r.optBoolean("ok", false) || r.has("id")) { notify("Compte créé"); onDone(true, null) }
            else onDone(false, r.optString("error", "Échec"))
        }
    }

    fun resetUserPassword(id: Int, password: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val r = api.put("/api/auth/users", JSONObject().put("id", id).put("password", password))
            val ok = r.optBoolean("ok", false)
            notify(if (ok) "Mot de passe réinitialisé" else "Échec")
            onDone(ok)
        }
    }

    fun deleteUser(id: Int, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val r = api.delete("/api/auth/users?id=$id")
            val ok = r.optBoolean("ok", false)
            notify(if (ok) "Compte supprimé" else r.optString("error", "Échec"))
            onDone(ok)
        }
    }

    // ---- search ------------------------------------------------------------

    fun setSearch(query: String) {
        _ui.update { it.copy(searchQuery = query) }
        if (query.isBlank()) {
            _ui.update { it.copy(searchResult = SearchResult.EMPTY) }
            return
        }
        viewModelScope.launch {
            delay(180) // debounce
            if (_ui.value.searchQuery != query) return@launch
            val res = api.search(query)
            if (_ui.value.searchQuery == query) _ui.update { it.copy(searchResult = res) }
        }
    }

    // ---- lyrics ------------------------------------------------------------

    fun fetchLyrics(force: Boolean) {
        val id = player.snapshot.value.currentId ?: return
        viewModelScope.launch {
            _ui.update { it.copy(lyricsLoading = true) }
            val res = api.lyrics(id, force)
            if (player.snapshot.value.currentId == id) {
                _ui.update { it.copy(lyrics = res, lyricsLoading = false) }
            } else {
                _ui.update { it.copy(lyricsLoading = false) }
            }
        }
    }

    fun toggleKaraoke() {
        val next = !_ui.value.karaoke
        _ui.update { it.copy(karaoke = next) }
        viewModelScope.launch { prefs.setPlayback(karaoke = next) }
    }

    fun adjustLyricsOffset(delta: Float) {
        val next = (_ui.value.lyricsOffset + delta).coerceIn(-3f, 3f)
        _ui.update { it.copy(lyricsOffset = next) }
        viewModelScope.launch { prefs.setPlayback(lyricsOffset = next) }
    }

    // ---- theme -------------------------------------------------------------

    override fun onCleared() {
        // Deliberately NOT touching PlaybackAccounting: it must keep scrobbling,
        // saving the session, honoring the sleep timer, executing remote commands,
        // staying on the Auralis Connect hub and continuing endless autoplay while
        // the service keeps playing after the UI (this ViewModel) is gone.
        // Releasing the UI's PlayerHolder only drops this ViewModel's own controller.
        player.release()
        super.onCleared()
    }
}
