package local.auralis.client.ui

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import local.auralis.client.data.Prefs
import local.auralis.client.i18n.Locale
import local.auralis.client.i18n.Messages
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.model.BlendMember
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.MonthlyRecap
import local.auralis.client.model.DownloadJobDto
import local.auralis.client.model.ExternalTrackEntry
import local.auralis.client.model.MelodyStatus
import local.auralis.client.model.MoodAffinity
import local.auralis.client.model.OnlineTrack
import local.auralis.client.model.PlaylistDto
import local.auralis.client.model.RecognizeLocalMatch
import local.auralis.client.model.RecognizeRemoteMatch
import local.auralis.client.model.RecognizeResult
import local.auralis.client.model.ScanProgress
import local.auralis.client.model.SearchResult
import local.auralis.client.model.ShareLinks
import local.auralis.client.model.SmartConfig
import local.auralis.client.model.Track
import local.auralis.client.model.downloadItems
import local.auralis.client.model.isoWeekKey
import local.auralis.client.model.matchLibraryTracks
import local.auralis.client.model.parsePlaylistFile
import local.auralis.client.model.randomRadioSeed
import local.auralis.client.model.str
import local.auralis.client.model.strOr
import local.auralis.client.net.AuralisApi
import local.auralis.client.playback.AudioFx
import local.auralis.client.playback.EqCurve
import local.auralis.client.playback.PlaybackAccounting
import local.auralis.client.playback.PlaybackGains
import local.auralis.client.playback.PlaybackSnapshot
import local.auralis.client.playback.PlayerHolder
import local.auralis.client.playback.QueueOps
import org.json.JSONArray
import org.json.JSONObject

enum class Phase { BOOT, CONNECT, LOGIN, LOADING, READY, ERROR }

enum class ViewId { HOME, NEW, RADIO, EXPLORE, LIBRARY, FAVORITES, RECENTS, FOLDERS, INSIGHTS, ALBUM, ARTIST, PLAYLIST, SETTINGS }

/** The five Apple Music tab roots — tapping one starts a fresh navigation stack. */
val rootViewIds = setOf(ViewId.HOME, ViewId.NEW, ViewId.RADIO, ViewId.EXPLORE, ViewId.LIBRARY)

data class NavTarget(val view: ViewId, val id: String? = null)

/** The "Télécharger les N titres manquants" offer shown after a playlist import
 *  (file or link) left entries without a library counterpart. */
data class ImportDownloadOffer(
    val playlistId: String,
    val playlistName: String,
    val entries: List<ExternalTrackEntry>,
)

/** Live progress of the import-missing-tracks download batch. */
data class ImportDownloadState(
    val playlistId: String,
    val total: Int,
    val done: Int = 0,
    val failed: Int = 0,
    val running: Boolean = true,
)

data class UiState(
    val phase: Phase = Phase.BOOT,
    val serverBase: String = "",
    val username: String? = null,
    val isAdmin: Boolean = false,
    val message: String? = null,
    val connecting: Boolean = false,

    /** UI language (web uiSlice.locale) — persisted in Prefs, default FR. */
    val locale: Locale = Locale.FR,
    /** Appearance mode (web Mode): "dark" | "light" | "auto" (system). */
    val themeMode: String = "auto",

    val tracks: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val folders: List<local.auralis.client.model.FolderNode> = emptyList(),
    val root: String? = null,
    /** Last completed scan time (library `scannedAt`). */
    val scannedAt: String? = null,
    /** Live scan / mood-analysis progress (`scan` object of /api/library). */
    val scan: ScanProgress = ScanProgress.IDLE,

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
    /** The profile's learned mood affinities ("Pour votre humeur" home shelf). */
    val moodAffinities: List<MoodAffinity> = emptyList(),
    /** Household Blend shelf: other accounts, each with its engine match score. */
    val blendMembers: List<BlendMember> = emptyList(),
    /** "À découvrir cette semaine" — the server ?mode=discovery mix, frozen per ISO week. */
    val discoverTracks: List<Track> = emptyList(),
    val recap: MonthlyRecap? = null,
    val recapMonths: List<String> = emptyList(),

    val nav: NavTarget = NavTarget(ViewId.HOME),
    val backStack: List<NavTarget> = emptyList(),

    val searchQuery: String = "",
    val searchResult: SearchResult = SearchResult.EMPTY,

    // Online (downloadable) search results + their download jobs, keyed by videoId.
    val onlineResults: List<OnlineTrack> = emptyList(),
    val onlineEnabled: Boolean = false,
    val onlineLoading: Boolean = false,
    val downloadJobs: Map<String, DownloadJobDto> = emptyMap(),

    // "Chercher en chantant" (hum-to-search): the recording sheet + the
    // POST /api/recognize verdict. `humError` holds a catalogue KEY (not a
    // translated string) so the sheet follows a live language switch.
    val humSheetOpen: Boolean = false,
    val humUploading: Boolean = false,
    val humResult: RecognizeResult? = null,
    val humError: String? = null,
    /** Download jobs for global-catalog matches ("Ajouter à la bibliothèque"),
     *  keyed by the match's query. */
    val humRemoteJobs: Map<String, DownloadJobDto> = emptyMap(),

    // Melody index status (settings "Reconnaissance audio" card).
    val melody: MelodyStatus? = null,

    // Playlist import → download the missing tracks into the new playlist.
    val importOffer: ImportDownloadOffer? = null,
    val importDownload: ImportDownloadState? = null,

    val lyrics: LyricsResult = LyricsResult.NONE,
    val lyricsLoading: Boolean = false,
    /** Forced word-by-word alignment job in flight (web `aligning`). */
    val lyricsAligning: Boolean = false,
    val karaoke: Boolean = true,
    val lyricsOffset: Float = 0.15f,

    val donateDue: Boolean = false,
    // Context-menu targets (web ContextMenu track/album/artist menus).
    val contextTrack: Track? = null,
    val contextAlbum: Album? = null,
    val contextArtist: Artist? = null,

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

    // DSP — volume normalization / crossfade / equalizer (persisted in Prefs).
    /** off | track | album — the web's NormalizationMode (default "track"). */
    val normalization: String = PlaybackGains.MODE_TRACK,
    /** Fade-in duration in seconds on each track transition (0/3/6/12). */
    val crossfade: Int = 0,
    val eqEnabled: Boolean = true,
    val eqPreset: String = "flat",
    val eqGains: List<Float> = listOf(0f, 0f, 0f, 0f, 0f, 0f),

    val sleepActive: Boolean = false,
    val sleepEndsAt: Long? = null,
    val sleepEndOfTrack: Boolean = false,
    val toast: String? = null,
    /** Optional undo/action label rendered inside the toast (web toast action). */
    val toastActionLabel: String? = null,

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

    /** Translate a catalogue key in the UI's current locale (toast strings). */
    private fun tr(key: String, params: Map<String, Any> = emptyMap()): String =
        Messages.translate(_ui.value.locale, key, params = params)

    private companion object {
        /** Web DEFAULT_LYRICS_OFFSET — the sync-offset reset target. */
        const val DEFAULT_LYRICS_OFFSET = 0.15f
    }

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
                        moodAffinities = st.moodAffinities,
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
            Messages.current = Locale.from(p.locale)
            // Donation reminder: due on the first launch, then every 3 launches after
            // it (launches 1, 4, 7, …). Shown once the app reaches the library.
            val launches = prefs.bumpLaunchCount()
            val donateDue = launches == 1 || (launches - 1) % 3 == 0
            _ui.update {
                it.copy(
                    karaoke = p.karaoke,
                    lyricsOffset = p.lyricsOffset,
                    donateDue = donateDue,
                    volume = p.volume,
                    autoplay = p.autoplay,
                    normalization = p.normalization,
                    crossfade = p.crossfade,
                    eqEnabled = p.eqEnabled,
                    eqPreset = p.eqPreset,
                    eqGains = p.eqBands,
                    locale = Locale.from(p.locale),
                    themeMode = p.theme,
                )
            }
            player.setRepeat(p.repeat)
            player.setShuffle(p.shuffle)
            player.setVolume(p.volume)
            player.crossfadeSeconds = p.crossfade.toFloat()
            AudioFx.setEq(p.eqEnabled, p.eqBands)
            applyNormalization()
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
                _ui.update { it.copy(connecting = false, message = tr("connect.unreachable")) }
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
                _ui.update { it.copy(connecting = false, message = res.error ?: tr("auth.denied")) }
            }
        }
    }

    fun changeServer() {
        viewModelScope.launch {
            player.stop()
            AudioFx.stopVisualizer()
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
            AudioFx.stopVisualizer()
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
                        scannedAt = lib.scannedAt,
                        scan = lib.scan,
                        trackByHash = index,
                    )
                }
                refreshState()
                refreshStats()
                accounting.refreshRecoNow()
                fetchRecapAndMaybeNotify()
                refreshDiscoverMix()
                loadBlendShelf()
                restoreLastSession()
            } catch (e: AuralisApi.ApiException) {
                if (e.code == 401) {
                    if (onAuthError != null) onAuthError() else _ui.update { it.copy(phase = Phase.LOGIN) }
                } else {
                    _ui.update { it.copy(phase = Phase.ERROR, message = tr("error.loading", mapOf("code" to e.code))) }
                }
            } catch (e: Exception) {
                _ui.update { it.copy(phase = Phase.ERROR, message = tr("toast.serverUnreachable")) }
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
            notify(tr("toast.unheardNone"))
            return
        }
        player.setShuffle(true)
        viewModelScope.launch { prefs.setPlayback(shuffle = true) }
        player.playTracks(list.shuffled(), 0)
        notify(if (never.isNotEmpty()) tr("toast.unheardMix", mapOf("count" to never.size))
               else tr("toast.unheardFallback", mapOf("count" to list.size)))
    }

    // ---- recommendation radios (web playbackSlice.startRadio & co.) ---------
    // Every flavour fetches `/api/recommend?…` from the server taste engine and
    // plays the result as the queue ("Radio" mode), exactly like the web client.

    /// Personalised radio around a seed track (track / album / artist menus, heroes).
    fun startRadio(seed: Track) {
        notify(tr("toast.loadingRadio"))
        viewModelScope.launch {
            // The server engine ranks the whole library by similarity-to-seed ×
            // taste, excluding the seed + dislikes. Empty only when nothing has
            // audio features yet.
            val radio = api.recommendRadio(seed.trackhash, limit = 50)
                .mapNotNull { trackIndex[it.trackhash] }
            // Seed first, its radio continuation after (web startRadio).
            val list = listOf(seed) + radio.filter { it.trackhash != seed.trackhash }
            if (list.isEmpty()) {
                notify(tr("toast.radioUnavailable"))
                return@launch
            }
            playList(list, 0)
            notify(tr("toast.radioTitled", mapOf("title" to seed.title)))
        }
    }

    /// "Radio aléatoire" (web RadioView): a station seeded from a RANDOM library track.
    fun startRandomRadio() {
        val seed = randomRadioSeed(_ui.value.tracks)
        if (seed == null) { notify(tr("library.emptyNoTracks")); return }
        startRadio(seed)
    }

    /// Mood-trajectory radio (web MoodMixes → startTrajectory): a set that glides
    /// along a named arc through feeling-space ("winddown", "warmup", …).
    fun startTrajectory(path: String, label: String) {
        notify(tr("toast.preparingJourney"))
        viewModelScope.launch {
            val list = api.recommendTrajectory(path).mapNotNull { trackIndex[it.trackhash] }
            if (list.isEmpty()) {
                notify(tr("toast.journeyUnavailable"))
                return@launch
            }
            playList(list, 0)
            notify(if (label.isNotBlank()) tr("toast.journeyTitled", mapOf("label" to label)) else tr("toast.journeyStarted"))
        }
    }

    /// Household Blend (web BlendShelf → startBlend): a mix averaging both tastes.
    fun startBlend(username: String, label: String = username) {
        notify(tr("toast.preparingBlend"))
        viewModelScope.launch {
            val list = api.recommendBlend(username).forYou.mapNotNull { trackIndex[it.trackhash] }
            if (list.isEmpty()) {
                notify(tr("toast.blendUnavailable"))
                return@launch
            }
            playList(list, 0)
            notify(tr("toast.blendTitled", mapOf("label" to label.ifBlank { username })))
        }
    }

    // ---- "Blend du foyer" shelf + weekly discover mix ------------------------
    // (web BlendShelf.tsx + DailyMixes.tsx — the localStorage weekly freeze is
    // ported to Prefs/DataStore.)

    /** Other accounts on this server, each with a Blend mix + its match score. */
    fun loadBlendShelf() {
        viewModelScope.launch {
            val me = _ui.value.username.orEmpty().lowercase()
            val others = api.accountNames().filter { it.lowercase() != me }
            val members = others.map { u ->
                val res = api.recommendBlend(u)
                BlendMember(u, res.match, res.forYou.mapNotNull { trackIndex[it.trackhash] })
            }
            _ui.update { it.copy(blendMembers = members) }
        }
    }

    /** "À découvrir cette semaine" — the server ?mode=discovery mix, frozen for the
     *  whole ISO week so the card doesn't reshuffle on every visit. */
    fun refreshDiscoverMix() {
        viewModelScope.launch {
            val week = isoWeekKey()
            val stored = prefs.discoverMix()
            val hashes = if (stored != null && stored.first == week && stored.second.isNotEmpty()) {
                stored.second
            } else {
                val fetched = api.recommendDiscovery(60).map { it.trackhash }
                if (fetched.isNotEmpty()) prefs.setDiscoverMix(week, fetched)
                fetched
            }
            _ui.update { it.copy(discoverTracks = hashes.mapNotNull { h -> trackIndex[h] }) }
        }
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
        notify(if (next) tr("toast.autoplayOn") else tr("toast.autoplayOff"))
    }

    fun addNext(track: Track) { player.addNext(track); notify(tr("toast.playNext", mapOf("title" to track.title))) }
    fun addToEnd(track: Track) { player.addToEnd(track); notify(tr("toast.addedToQueue", mapOf("title" to track.title))) }

    /** Append many tracks in ONE controller write + ONE toast (web addTracksToQueueEnd). */
    fun addTracksToEnd(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        player.addTracksToEnd(tracks)
        notify(tr("toast.addedToQueue", mapOf("title" to tracks.first().title)))
    }

    // ---- context menus (track / album / artist) ----------------------------

    fun openTrackMenu(track: Track) { _ui.update { it.copy(contextTrack = track) } }
    fun openAlbumMenu(album: Album) { _ui.update { it.copy(contextAlbum = album) } }
    fun openArtistMenu(artist: Artist) { _ui.update { it.copy(contextArtist = artist) } }
    fun closeTrackMenu() = closeMenus()
    fun closeMenus() { _ui.update { it.copy(contextTrack = null, contextAlbum = null, contextArtist = null) } }

    /** Create a playlist and immediately drop a track into it (used from the menu). */
    fun createPlaylistWithTrack(name: String, trackhash: String) {
        createPlaylist(name) { id -> addToPlaylist(id, trackhash) }
    }
    fun jumpTo(index: Int) = player.jumpTo(index)
    fun removeFromQueue(index: Int) = player.removeAt(index)

    /** Move one queue item up/down (web reorderQueue, QueueList move up/down). */
    fun moveQueueItem(from: Int, to: Int) = player.moveMediaItem(from, to)

    /** "Lecture aléatoire" queue shortcut (web QueueList): shuffle the WHOLE
     *  library into the queue. */
    fun playLibraryShuffled() {
        val tracks = _ui.value.tracks
        if (tracks.isEmpty()) { notify(tr("library.emptyNoTracks")); return }
        playList(tracks.shuffled(), 0)
    }

    /** One "Vider" snapshot awaiting the UNDO action (web clearQueue). */
    private data class QueueSnapshot(val queue: List<Track>, val index: Int)
    private var pendingQueueSnapshot: QueueSnapshot? = null

    /// "Vider" (web queueSlice.clearQueue): keep only the current track — with an
    /// UNDO toast restoring the snapshot.
    fun clearQueue() {
        val snap = player.snapshot.value
        // Nothing meaningful to clear (empty, or just the current track).
        if (snap.queueIds.size <= (if (snap.currentId != null) 1 else 0)) return
        pendingQueueSnapshot = QueueSnapshot(snap.queueIds.mapNotNull { trackIndex[it] }, snap.currentIndex)
        player.clearQueueExceptCurrent()
        notify(tr("toast.queueCleared"), actionLabel = tr("common.cancel")) { undoClearQueue() }
    }

    private fun undoClearQueue() {
        val snap = pendingQueueSnapshot ?: return
        pendingQueueSnapshot = null
        // Re-anchor on the LIVE current track (web clearQueue's undo): during the
        // undo window the track can advance (autoplay/ended), so blindly restoring
        // the snapshot index would desync the queue from what is playing.
        val cur = player.snapshot.value.currentId?.let { trackIndex[it] }
        val (queue, index) = QueueOps.anchorRestore(snap.queue, snap.index, cur)
        player.restoreQueue(queue, index, player.positionMs(), player.snapshot.value.isPlaying)
    }

    // ---- share (web share.ts) ----------------------------------------------

    fun shareTrack(track: Track) = share(
        title = track.title,
        label = ShareLinks.label(track.title, track.displayArtist),
        url = ShareLinks.trackUrl(_ui.value.serverBase, track.trackhash),
    )

    fun shareAlbum(album: Album) = share(
        title = album.title,
        label = ShareLinks.label(album.title, album.artistName),
        url = ShareLinks.albumUrl(_ui.value.serverBase, album.albumhash),
    )

    fun shareArtist(artist: Artist) = share(
        title = artist.name,
        label = artist.name,
        url = ShareLinks.artistUrl(_ui.value.serverBase, artist.artisthash),
    )

    /** System share sheet (ACTION_SEND) with the web's share text + deep link;
     *  falls back to the clipboard when no share target exists (web share.ts). */
    private fun share(title: String, label: String, url: String) {
        val text = ShareLinks.text(label, url)
        val ctx = getApplication<Application>()
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        val launched = runCatching {
            ctx.startActivity(Intent.createChooser(send, tr("ctx.share")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }.isSuccess
        if (launched) return
        // No Web Share and no clipboard used to silently "succeed" on the web —
        // surface the copy result honestly instead.
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (cm == null) {
            notify(tr("toast.shareUnavailable"))
            return
        }
        runCatching { cm.setPrimaryClip(ClipData.newPlainText(title, text)) }
            .onSuccess { notify(tr("toast.trackCopied")) }
            .onFailure { notify(tr("toast.shareUnavailable")) }
    }

    // ---- track change → lyrics ----------------------------------------------
    // Skip detection, the scrobble gate, the sleep end-of-track stop, the
    // whole 1s/5s accounting loops AND endless autoplay (queue continuation)
    // live in PlaybackAccounting (they must keep running after this ViewModel
    // is cleared); only the UI-side lyrics reset and fetch remain here.

    private fun onTrackChanged(id: String?) {
        _ui.update { it.copy(lyrics = LyricsResult.NONE) }
        // The normalization multiplier is track-specific — recompute it for the
        // new track (its fade-in envelope is already ramping in PlayerHolder).
        applyNormalization()
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
        notify(if (isFav) tr("toast.removedFromFavorites") else tr("toast.addedToFavorites"))
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
        notify(if (isDis) tr("toast.dislikeRemoved") else tr("toast.dislikeAdded"))
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
        notify("🗓️ " + tr("toast.recapReady", mapOf("month" to monthLabel(elapsed))))
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
    private fun monthLabel(key: String): String = Messages.monthLabel(key)

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
                    notify(tr("update.signatureRejected"))
                }
            } else {
                _ui.update { it.copy(updateDownloading = false, updateProgress = 0f) }
                notify(tr("update.downloadFailed"))
            }
        }
    }

    fun openCommand() { _ui.update { it.copy(commandOpen = true) } }
    fun closeCommand() { _ui.update { it.copy(commandOpen = false) } }

    // ---- audio visualizer ----------------------------------------------------
    // The waveform tap is owned by playback/AudioFx (bound to our own ExoPlayer
    // audio session; amps stay null when the device refuses and the overlay falls
    // back to its decorative animation).

    /** Per-bar amplitudes (0..1) at capture rate, null while the tap is down. */
    val visualizerAmps: StateFlow<FloatArray?> get() = AudioFx.amps

    fun toggleVisualizer() {
        val open = !_ui.value.visualizerOpen
        _ui.update { it.copy(visualizerOpen = open) }
        if (open) AudioFx.startVisualizer() else AudioFx.stopVisualizer()
    }

    // ---- toast -------------------------------------------------------------

    private var toastJob: kotlinx.coroutines.Job? = null
    private var toastAction: (() -> Unit)? = null

    /** Show a toast, optionally with ONE action label (e.g. the queue "Annuler"). */
    fun notify(msg: String, actionLabel: String? = null, action: (() -> Unit)? = null) {
        toastAction = action
        _ui.update { it.copy(toast = msg, toastActionLabel = actionLabel) }
        toastJob?.cancel()
        toastJob = viewModelScope.launch {
            delay(2600)
            toastAction = null
            _ui.update { it.copy(toast = null, toastActionLabel = null) }
        }
    }

    /** Fire the toast's action (if any) and dismiss it. */
    fun runToastAction() {
        val action = toastAction
        clearToast()
        action?.invoke()
    }

    fun clearToast() {
        toastAction = null
        _ui.update { it.copy(toast = null, toastActionLabel = null) }
    }

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

    // ---- volume normalization + crossfade ------------------------------------
    // Gain maths lives in playback/PlaybackGains (web page.tsx mirror); the
    // resolved multiplier is split between the player volume (attenuation × user
    // volume × crossfade envelope) and the audio session's LoudnessEnhancer
    // (boost) — see playback/AudioFx.

    /** Resolve the current track's dB adjustment (per-track / per-album / off) and
     *  push both halves down the gain chain. Recomputed on track change. */
    private fun applyNormalization() {
        val ui = _ui.value
        val current = trackIndex[player.snapshot.value.currentId]
        val albumGains = current?.albumhash?.let { ah ->
            ui.tracks.filter { it.albumhash == ah }.map { it.gain }
        } ?: emptyList()
        val db = PlaybackGains.resolveGainDb(ui.normalization, current?.gain, albumGains)
        // Boost rides the LoudnessEnhancer when the device has one; without it the
        // full factor falls back to the player volume (clamped at 1, degraded).
        val boostApplied = AudioFx.setBoostDb(PlaybackGains.boostDb(db))
        player.setNormalizationFactor(
            if (boostApplied) PlaybackGains.volumeFactor(db) else PlaybackGains.gainFactor(db),
        )
    }

    fun setNormalization(mode: String) {
        _ui.update { it.copy(normalization = mode) }
        viewModelScope.launch { prefs.setPlayback(normalization = mode) }
        applyNormalization()
        notify(
            when (mode) {
                PlaybackGains.MODE_OFF -> tr("toast.normOff")
                PlaybackGains.MODE_ALBUM -> tr("toast.normAlbum")
                else -> tr("toast.normTrack")
            },
        )
    }

    fun setCrossfade(seconds: Int) {
        val v = seconds.coerceIn(0, 12)
        _ui.update { it.copy(crossfade = v) }
        viewModelScope.launch { prefs.setPlayback(crossfade = v) }
        player.crossfadeSeconds = v.toFloat()
        notify(if (v > 0) tr("settings.crossfadeValue", mapOf("v" to v)) else tr("settings.crossfadeOff"))
    }

    // ---- equalizer ------------------------------------------------------------
    // Curve maths + presets live in playback/EqCurve (web eqSlice/audioGraph
    // mirror); the device effect attach lives in playback/AudioFx. Enabled, the
    // preset id and the 6 gains persist in Prefs and restore at boot.

    /** False when the device has no effect engine — the settings card greys out. */
    val eqAvailable: StateFlow<Boolean> get() = AudioFx.eqAvailable

    fun toggleEqEnabled() {
        val enabled = !_ui.value.eqEnabled
        val gains = _ui.value.eqGains
        _ui.update { it.copy(eqEnabled = enabled) }
        AudioFx.setEq(enabled, gains)
        viewModelScope.launch { prefs.setPlayback(eqEnabled = enabled) }
        notify(if (enabled) tr("eq.toastOn") else tr("eq.toastOff"))
    }

    fun applyEqPreset(presetId: String) {
        val preset = EqCurve.PRESETS[presetId] ?: return
        val enabled = _ui.value.eqEnabled
        _ui.update { it.copy(eqPreset = presetId, eqGains = preset) }
        AudioFx.setEq(enabled, preset)
        viewModelScope.launch { prefs.setPlayback(eqPreset = presetId, eqBands = preset) }
        notify(tr("eq.toastPreset", mapOf("preset" to EqCurve.presetLabel(presetId))))
    }

    fun setEqBand(index: Int, db: Float) {
        if (index !in 0..5) return
        val value = EqCurve.roundDb(EqCurve.clampDb(db))
        val next = _ui.value.eqGains.toMutableList().also { it[index] = value }
        // A curve that still matches its preset keeps the preset id; anything else
        // becomes "custom" (web setEqBand).
        val stillPreset = EqCurve.matchesPreset(next, EqCurve.PRESETS[_ui.value.eqPreset])
        val preset = if (stillPreset) _ui.value.eqPreset else "custom"
        val enabled = _ui.value.eqEnabled
        _ui.update { it.copy(eqGains = next, eqPreset = preset) }
        AudioFx.setEq(enabled, next)
        viewModelScope.launch { prefs.setPlayback(eqPreset = preset, eqBands = next) }
    }

    fun resetEq() = applyEqPreset("flat")

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
        notify(tr("toast.sleepTimerSet", mapOf("minutes" to minutes)))
    }
    fun sleepAfterTrack() {
        accounting.sleepAfterTrack()
        notify(tr("toast.sleepAtEnd"))
    }
    fun cancelSleepTimer() {
        accounting.cancelSleepTimer()
        notify(tr("toast.sleepCancelled"))
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
            if (!api.apiLastOk) { notify(tr("toast.playlistCreateFailed")); return@launch }
            val id = res.optString("id", "")
            refreshState()
            if (id.isNotBlank()) onCreated(id)
        }
    }

    /** Create a SMART playlist from a rule config — stored through the SAME
     *  `playlist.upsert` action the web uses (the config rides the `rules` JSON
     *  field), so web and Android see each other's smart playlists. */
    fun createSmartPlaylist(config: SmartConfig, onCreated: (String) -> Unit = {}) {
        viewModelScope.launch {
            val name = config.label?.takeIf { it.isNotBlank() } ?: "Smart playlist"
            val pl = JSONObject()
                .put("name", name)
                .put("trackhashes", JSONArray())
                .put("rules", SmartConfig.toJson(config))
            val res = api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", pl))
            if (!api.apiLastOk) { notify(tr("toast.playlistCreateFailed")); return@launch }
            val id = res.optString("id", "")
            refreshState()
            notify(tr("toast.smartCreated", mapOf("name" to name)))
            if (id.isNotBlank()) onCreated(id)
        }
    }

    /** Import a matched set of trackhashes as a NEW playlist. One upsert with the
     *  full ordered set (N addToPlaylist calls would fire N server round-trips).
     *  `missing` carries the entries with no library counterpart: they trigger
     *  the "Télécharger les N titres manquants" offer once the playlist exists. */
    fun importPlaylist(
        name: String,
        hashes: List<String>,
        missing: List<ExternalTrackEntry> = emptyList(),
        onCreated: (String) -> Unit = {},
    ) {
        val clean = name.trim().ifBlank { tr("library.importedName") }
        val unique = hashes.distinct()
        viewModelScope.launch {
            val pl = JSONObject().put("name", clean).put("trackhashes", JSONArray(unique))
            val res = api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", pl))
            if (!api.apiLastOk) { notify(tr("toast.playlistImportFailed")); return@launch }
            val id = res.optString("id", "")
            refreshState()
            notify(tr("toast.playlistImported", mapOf("name" to clean, "count" to unique.size)))
            if (id.isNotBlank()) {
                if (missing.isNotEmpty()) {
                    _ui.update { it.copy(importOffer = ImportDownloadOffer(id, clean, missing)) }
                }
                onCreated(id)
            }
        }
    }

    /** Paste a Spotify / Deezer / Apple Music / YouTube playlist (or album) link:
     *  the server resolves it to a plain tracklist, we match those titles against
     *  THIS library, then create the playlist (web onImportUrl). The server
     *  rate-limits to 10 imports/minute per account — its French error is surfaced. */
    fun importPlaylistFromUrl(url: String, onDone: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val res = api.post("/api/playlist/import", JSONObject().put("url", url))
            val err = res.optString("error", "")
            if (!api.apiLastOk) {
                notify(err.ifBlank { tr("library.linkImportFailed") })
                onDone(false)
                return@launch
            }
            if (err.isNotBlank()) {
                notify(err)
                onDone(false)
                return@launch
            }
            val arr = res.optJSONArray("tracks")
            val entries = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                arr?.optJSONObject(i)?.let { o ->
                    ExternalTrackEntry(title = o.strOr("title", ""), artist = o.str("artist"), album = o.str("album"))
                }
            }
            if (entries.isEmpty()) {
                notify(tr("library.linkNoTracks"))
                onDone(false)
                return@launch
            }
            val m = withContext(Dispatchers.Default) { matchLibraryTracks(entries, _ui.value.tracks) }
            if (m.hashes.isEmpty() && m.unmatched.isEmpty()) {
                notify(tr("library.linkNoTracks"))
                onDone(false)
                return@launch
            }
            importPlaylist(res.optString("name", ""), m.hashes, m.unmatched) { id -> navigate(ViewId.PLAYLIST, id) }
            if (m.matched < m.total) notify(tr("toast.matchedCount", mapOf("matched" to m.matched, "total" to m.total)))
            onDone(true)
        }
    }

    /** Parse a .m3u/.m3u8/.json playlist file (SAF text), match against the library
     *  and create the playlist (web onImportFile). */
    fun importPlaylistFromText(fileName: String, text: String) {
        viewModelScope.launch {
            val parsed = runCatching {
                withContext(Dispatchers.Default) { parsePlaylistFile(fileName, text, _ui.value.tracks) }
            }.getOrNull()
            if (parsed == null) {
                notify(tr("library.invalidFile"))
                return@launch
            }
            if (parsed.hashes.isEmpty() && parsed.unmatched.isEmpty()) {
                notify(tr("library.linkNoTracks"))
                return@launch
            }
            importPlaylist(parsed.name, parsed.hashes, parsed.unmatched) { id -> navigate(ViewId.PLAYLIST, id) }
            if (parsed.matched < parsed.total) notify(tr("toast.matchedCount", mapOf("matched" to parsed.matched, "total" to parsed.total)))
        }
    }

    // ---- playlist import → download the missing tracks ----------------------
    // After an import, entries with no library counterpart can be fetched through
    // the server download engine (POST /api/download { items }, one job each) and
    // dropped into the just-created playlist as each job completes.

    fun dismissImportOffer() { _ui.update { it.copy(importOffer = null) } }

    /** Hide the progress dialog — the batch keeps running in the background and
     *  the completion toast still fires. */
    fun dismissImportDownload() { _ui.update { it.copy(importDownload = null) } }

    /** Enqueue every unmatched entry as a download batch, poll the jobs (one bare
     *  GET covers the whole batch) and add each finished track to the playlist. */
    fun startImportDownload() {
        val offer = _ui.value.importOffer ?: return
        if (_ui.value.importDownload?.running == true) return
        val playlistId = offer.playlistId
        _ui.update {
            it.copy(importOffer = null, importDownload = ImportDownloadState(playlistId, offer.entries.size))
        }
        viewModelScope.launch {
            val jobs = api.startDownloadBatch(downloadItems(offer.entries))
            if (jobs.isEmpty()) {
                _ui.update { it.copy(importDownload = null) }
                notify(tr("toast.downloadStartFailed"))
                return@launch
            }
            // The batch is deduped/capped (≤ 200 jobs server-side) — rebase the
            // total on what was actually enqueued so the counter can reach it.
            _ui.update { it.copy(importDownload = it.importDownload?.copy(total = jobs.size)) }
            val pending = jobs.map { it.id }.toMutableSet()
            val seenHashes = HashSet<String>()
            var done = 0
            var failed = 0
            var misses = 0
            while (isActive && pending.isNotEmpty()) {
                delay(2000)
                val all = api.downloadJobs()
                if (all == null) {
                    // Transient poll failures are fine; give up after a long outage.
                    if (++misses > 60) {
                        failed += pending.size
                        pending.clear()
                    }
                    continue
                }
                misses = 0
                for (j in all) {
                    if (j.id !in pending) continue
                    when (j.status) {
                        "done" -> {
                            pending.remove(j.id)
                            done++
                            val h = j.trackhash
                            if (!h.isNullOrBlank() && seenHashes.add(h)) addDownloadedToPlaylist(playlistId, h)
                        }
                        "error" -> {
                            pending.remove(j.id)
                            failed++
                        }
                        else -> Unit // queued / resolving / downloading / scanning
                    }
                }
                _ui.update { s -> s.copy(importDownload = s.importDownload?.copy(done = done, failed = failed)) }
            }
            _ui.update { s -> s.copy(importDownload = s.importDownload?.copy(done = done, failed = failed, running = false)) }
            loadAll()
            notify(
                when {
                    failed > 0 && done > 0 -> tr("import.downloadPartial", mapOf("done" to done, "failed" to failed))
                    failed > 0 -> tr("toast.downloadFailed")
                    else -> tr("import.downloadComplete", mapOf("done" to done))
                },
            )
        }
    }

    /** Append a freshly downloaded track to the import's playlist — silent
     *  variant of [addToPlaylist] (one toast per batch, not per track). */
    private fun addDownloadedToPlaylist(playlistId: String, trackhash: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        if (trackhash in pl.trackhashes) return
        val next = pl.trackhashes + trackhash
        if (pl.collaborator) {
            // Collaborator playlists must use the GRANULAR add — the full upsert is
            // owner-scoped and would be IDOR-rejected (see addToPlaylist).
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(trackhashes = next) else p }) }
            viewModelScope.launch {
                api.putState(JSONObject().put("action", "playlist.addTrack").put("id", playlistId).put("trackhash", trackhash))
            }
        } else {
            upsertPlaylist(pl.copy(trackhashes = next))
        }
    }

    fun addToPlaylist(playlistId: String, trackhash: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        if (pl.trackhashes.contains(trackhash)) { notify(tr("toast.alreadyInPlaylist", mapOf("name" to pl.name))); return }
        val next = pl.trackhashes + trackhash
        if (pl.collaborator) {
            // Collaborator playlists (owned by another user) must use the GRANULAR
            // add — the full upsert is owner-scoped and would be IDOR-rejected.
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(trackhashes = next) else p }) }
            viewModelScope.launch {
                api.putState(JSONObject().put("action", "playlist.addTrack").put("id", playlistId).put("trackhash", trackhash))
            }
        } else {
            upsertPlaylist(pl.copy(trackhashes = next))
        }
        notify(tr("toast.addedToPlaylist", mapOf("name" to pl.name)))
    }

    /** Batched "add to playlist" (album/artist menus): ONE upsert with every new
     *  hash instead of one server round-trip per track. */
    fun addTracksToPlaylist(playlistId: String, trackhashes: List<String>) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        val add = trackhashes.filter { it !in pl.trackhashes }
        if (add.isEmpty()) { notify(tr("toast.alreadyInPlaylist", mapOf("name" to pl.name))); return }
        val next = pl.trackhashes + add
        if (pl.collaborator) {
            // Collaborator playlists must use the GRANULAR add — the full upsert is
            // owner-scoped and would be IDOR-rejected (see addToPlaylist).
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(trackhashes = next) else p }) }
            viewModelScope.launch {
                add.forEach { h ->
                    api.putState(JSONObject().put("action", "playlist.addTrack").put("id", playlistId).put("trackhash", h))
                }
            }
        } else {
            upsertPlaylist(pl.copy(trackhashes = next))
        }
        notify(tr("toast.addedToPlaylist", mapOf("name" to pl.name)))
    }

    fun removeFromPlaylist(playlistId: String, trackhash: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        val next = pl.trackhashes.filter { it != trackhash }
        if (pl.collaborator) {
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(trackhashes = next) else p }) }
            viewModelScope.launch {
                api.putState(JSONObject().put("action", "playlist.removeTrack").put("id", playlistId).put("trackhash", trackhash))
            }
        } else {
            upsertPlaylist(pl.copy(trackhashes = next))
        }
        notify(tr("toast.removedFromPlaylist", mapOf("name" to pl.name)))
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
                // The JSON-encoded SmartConfig rides along so rename/pin/reorder
                // don't silently strip a smart playlist's rules (web pushPlaylist).
                .put("rules", pl.rules ?: JSONObject.NULL)
            api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", json))
            if (!api.apiLastOk) {
                notify(tr("toast.playlistSyncFailed", mapOf("name" to pl.name)))
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
            if (!res.optBoolean("ok", false)) { notify(tr("toast.coverUploadFailed")); return@launch }
            val hash = res.optString("imageHash", "").ifBlank { null }
            _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(imageHash = hash) else p }) }
        }
    }

    /** Owner-only: share a playlist (or revoke — the server drops collaborators). */
    fun sharePlaylist(playlistId: String, shared: Boolean) {
        _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(shared = shared) else p }) }
        notify(if (shared) tr("toast.shareEnabled") else tr("toast.shareDisabled"))
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "playlist.share").put("id", playlistId).put("value", shared))
        }
    }

    /** Owner-only: invite a collaborator by username (also marks the playlist shared). */
    fun addPlaylistCollaborator(playlistId: String, username: String) {
        viewModelScope.launch {
            val res = api.putState(
                JSONObject().put("action", "playlist.collaborator").put("id", playlistId).put("username", username),
            )
            if (res.optBoolean("ok", false)) {
                _ui.update { it.copy(playlists = it.playlists.map { p -> if (p.id == playlistId) p.copy(shared = true) else p }) }
                notify(tr("toast.collaboratorAdded", mapOf("username" to username)))
            } else {
                notify(tr("toast.collaboratorNotFound"))
            }
        }
    }

    fun togglePin(playlistId: String) {
        val pl = _ui.value.playlists.find { it.id == playlistId } ?: return
        upsertPlaylist(pl.copy(pinned = !pl.pinned))
        notify(if (!pl.pinned) tr("toast.pinned") else tr("toast.unpinned"))
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
        if (seeds.isEmpty()) { notify(tr("toast.selectOneTrack")); return }
        if (_ui.value.generating) return
        _ui.update { it.copy(generating = true) }
        notify(tr("toast.creatingMix"))
        viewModelScope.launch {
            try {
                val body = JSONObject()
                    .put("action", "playlist.generateFromSeeds")
                    .put("seeds", JSONArray(seeds))
                    .put("count", count)
                val res = api.putState(body)
                val id = res.optString("id", "")
                val name = res.optString("name", tr("common.aiMix"))
                refreshState()
                _ui.update { it.copy(generating = false, selectionMode = false, selected = emptySet()) }
                if (id.isNotBlank()) {
                    navigate(ViewId.PLAYLIST, id)
                    notify(tr("toast.aiMixReady", mapOf("name" to name)))
                } else notify(tr("toast.mixFailed"))
            } catch (e: Exception) {
                _ui.update { it.copy(generating = false) }
                notify(tr("toast.mixFailed"))
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
                notify(tr("toast.passwordChanged"))
                onResult(true, null)
            } else onResult(false, res.optString("error", tr("toast.passwordChangeFailed")))
        }
    }

    fun resetStats() {
        accounting.clearLocalCounts() // authoritative owner of counts/recents
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "resetStats"))
            refreshStats()
            accounting.refreshRecoNow()
        }
        notify(tr("toast.statsReset"))
    }

    fun rescan() {
        viewModelScope.launch {
            notify(tr("toast.scanStarted"))
            api.post("/api/library/scan", JSONObject())
            if (!api.apiLastOk) {
                notify(tr("toast.scanFailed"))
                return@launch
            }
            pollScanProgress()
        }
    }

    /** "Analyser l'humeur" (settings, admin): POST /api/library/analyze, then
     *  follow the `analyzing/analyzed/analyzeTotal` progress in the /api/library
     *  snapshot exactly like the web settings rows. */
    fun analyzeMood() {
        viewModelScope.launch {
            if (!api.analyzeLibrary()) {
                notify(tr("toast.scanFailed"))
                return@launch
            }
            pollScanProgress()
        }
    }

    /** Poll the /api/library `scan` object while a scan / mood analysis runs
     *  (the web polls the same endpoint), then refresh the library once it
     *  settles. */
    private fun pollScanProgress() {
        viewModelScope.launch {
            while (isActive) {
                delay(2500)
                val scan = api.scanProgress() ?: break
                _ui.update { it.copy(scan = scan) }
                if (scan.status != "scanning" && !scan.analyzing) break
            }
            loadAll()
        }
    }

    // ---- melody index ("Reconnaissance audio" settings card) ----------------

    private var melodyPollJob: kotlinx.coroutines.Job? = null

    /** Fetch GET /api/library/melody and keep polling while an index pass runs. */
    fun refreshMelodyStatus() {
        viewModelScope.launch {
            val st = runCatching { api.melodyStatus() }.getOrNull()
            if (st != null) _ui.update { it.copy(melody = st) }
            if (st?.running == true) pollMelodyStatus()
        }
    }

    private fun pollMelodyStatus() {
        if (melodyPollJob?.isActive == true) return
        melodyPollJob = viewModelScope.launch {
            while (isActive) {
                delay(2500)
                val st = runCatching { api.melodyStatus() }.getOrNull() ?: break
                _ui.update { it.copy(melody = st) }
                if (!st.running) break
            }
        }
    }

    /** "Indexer la bibliothèque" (admin): POST /api/library/melody, then follow
     *  the progress through the same GET. */
    fun startIndexingMelody() {
        viewModelScope.launch {
            val res = api.startMelodyIndex()
            if (api.apiLastOk && res.optBoolean("started", false)) {
                notify(tr("settings.melodyIndexStarted"))
                _ui.update { it.copy(melody = it.melody?.copy(running = true) ?: MelodyStatus(true, 0, 0, true)) }
                pollMelodyStatus()
            } else {
                notify(res.optString("error").ifBlank { tr("settings.melodyIndexFailed") })
            }
        }
    }

    fun changeMusicDir(dir: String) {
        viewModelScope.launch {
            val res = api.post("/api/library/source", JSONObject().put("dir", dir))
            if (res.has("error")) notify(res.optString("error")) else { notify(tr("toast.musicDirUpdated")); loadAll() }
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
            notify(if (ok) tr("toast.dataImported") else tr("toast.importFailed"))
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
            if (r.optBoolean("ok", false) || r.has("id")) { notify(tr("toast.accountCreated")); onDone(true, null) }
            else onDone(false, r.optString("error", tr("toast.resetFailed")))
        }
    }

    fun resetUserPassword(id: Int, password: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val r = api.put("/api/auth/users", JSONObject().put("id", id).put("password", password))
            val ok = r.optBoolean("ok", false)
            notify(if (ok) tr("toast.passwordReset") else tr("toast.resetFailed"))
            onDone(ok)
        }
    }

    fun deleteUser(id: Int, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val r = api.delete("/api/auth/users?id=$id")
            val ok = r.optBoolean("ok", false)
            notify(if (ok) tr("toast.userDeleted") else r.optString("error", tr("toast.resetFailed")))
            onDone(ok)
        }
    }

    /** "Télécharger la sauvegarde" (admin): POST /api/backup → the streamed
     *  SQLite snapshot. Errors (like the 3-per-10-min rate limit) surface their
     *  server message. */
    fun downloadBackup(onFile: (ByteArray, String) -> Unit) {
        viewModelScope.launch {
            val res = api.downloadBackup()
            val bytes = res.bytes
            if (bytes == null) notify(res.error ?: tr("toast.backupFailed"))
            else onFile(bytes, res.filename)
        }
    }

    // ---- search ------------------------------------------------------------

    fun setSearch(query: String) {
        _ui.update { it.copy(searchQuery = query) }
        if (query.isBlank()) {
            _ui.update { it.copy(searchResult = SearchResult.EMPTY, onlineResults = emptyList(), onlineLoading = false) }
            return
        }
        viewModelScope.launch {
            delay(180) // debounce
            if (_ui.value.searchQuery != query) return@launch
            val res = api.search(query)
            if (_ui.value.searchQuery == query) _ui.update { it.copy(searchResult = res) }
            // The library answers poorly (or not at all) → also ask the server's
            // YouTube engine for downloadable hits ("that song isn't here — fetch it").
            if (_ui.value.searchQuery == query && query.length >= 2 && res.tracks.size < 5) {
                _ui.update { it.copy(onlineLoading = true) }
                val (enabled, online) = api.searchOnline(query)
                if (_ui.value.searchQuery == query) {
                    _ui.update { it.copy(onlineEnabled = enabled, onlineResults = online, onlineLoading = false) }
                }
            } else if (_ui.value.searchQuery == query) {
                _ui.update { it.copy(onlineResults = emptyList(), onlineLoading = false) }
            }
        }
    }

    /** Download an online hit onto the server, watch the job, then play the
     *  imported track. The button state comes from downloadJobs[videoId]. */
    fun downloadOnline(hit: OnlineTrack) {
        val existing = _ui.value.downloadJobs[hit.videoId]
        if (existing != null && existing.busy) return
        _ui.update {
            it.copy(downloadJobs = it.downloadJobs + (hit.videoId to DownloadJobDto("", "queued", 0, null, null, hit.title)))
        }
        viewModelScope.launch {
            val job = runCatching { api.startDownload(hit.videoId, hit.title, _ui.value.searchQuery.ifBlank { hit.title }) }.getOrNull()
            if (job == null) {
                _ui.update {
                    it.copy(downloadJobs = it.downloadJobs + (hit.videoId to DownloadJobDto("", "error", 0, null, tr("toast.downloadStartFailed"), hit.title)))
                }
                notify(tr("toast.downloadFailed"))
                return@launch
            }
            var current: DownloadJobDto = job
            var misses = 0
            while (isActive) {
                _ui.update { it.copy(downloadJobs = it.downloadJobs + (hit.videoId to current)) }
                if (current.status == "done" || current.status == "error") break
                delay(1500)
                val next: DownloadJobDto? = runCatching { api.downloadJob(job.id) }.getOrNull()
                if (next == null) {
                    // Transient poll failures are fine; give up after a long outage.
                    if (++misses > 60) {
                        current = current.copy(status = "error", error = tr("toast.serverUnreachable"))
                        break
                    }
                    continue
                }
                misses = 0
                current = next
            }
            _ui.update { it.copy(downloadJobs = it.downloadJobs + (hit.videoId to current)) }
            if (current.status == "error") {
                notify(current.error?.takeIf { it.isNotBlank() } ?: tr("toast.downloadFailed"))
                return@launch
            }
            notify(tr("search.downloadDone"))
            // Reload so the new file is indexed, then play it as soon as it
            // materialises in the track index.
            loadAll()
            val hash = current.trackhash
            if (hash != null) {
                var tries = 0
                while (tries++ < 30) {
                    val track = trackIndex[hash]
                    if (track != null) {
                        playTrack(track, listOf(track))
                        return@launch
                    }
                    delay(500)
                }
            }
        }
    }

    // ---- "Chercher en chantant" (hum-to-search recognition) ------------------
    // The mic sheet records ~12 s (MediaRecorder, in HumSearch.kt) and posts the
    // raw bytes to /api/recognize; the matches land in UiState for the sheet.

    fun openHumSheet() {
        _ui.update { it.copy(humSheetOpen = true, humUploading = false, humResult = null, humError = null) }
    }

    fun closeHumSheet() {
        _ui.update { it.copy(humSheetOpen = false, humUploading = false) }
    }

    /** Clear the sheet's error banner (e.g. before a retry). */
    fun clearHumError() { _ui.update { it.copy(humError = null) } }

    /** Clear the results so the sheet returns to the recording state. */
    fun clearHumResult() { _ui.update { it.copy(humResult = null, humError = null) } }

    /** The recorder produced nothing usable (no mic, empty file…). */
    fun failHumRecording() {
        _ui.update { it.copy(humUploading = false, humResult = null, humError = "hum.uploadFailed") }
    }

    /** Upload the raw recording to POST /api/recognize and keep the verdict. */
    fun submitHumRecording(audio: ByteArray, contentType: String) {
        if (audio.isEmpty()) { failHumRecording(); return }
        _ui.update { it.copy(humUploading = true, humResult = null, humError = null) }
        viewModelScope.launch {
            val res = api.recognize(audio, contentType)
            if (!api.apiLastOk) {
                _ui.update { it.copy(humUploading = false, humError = "hum.uploadFailed") }
                return@launch
            }
            _ui.update { it.copy(humUploading = false, humResult = RecognizeResult.from(res)) }
        }
    }

    /** Play a local (library) recognition match — the other matches become the queue. */
    fun playHumMatch(match: RecognizeLocalMatch) {
        val res = _ui.value.humResult ?: return
        val track = trackIndex[match.trackhash] ?: return
        val list = res.local.mapNotNull { trackIndex[it.trackhash] }
        playTrack(track, list.ifEmpty { listOf(track) }, list.indexOf(track))
        closeHumSheet()
    }

    /** "Ajouter à la bibliothèque" for a global-catalog match: start a query
     *  download, follow the job, then reload the library (no autoplay — the
     *  point is to OWN the track, not to interrupt what's playing). */
    fun downloadHumMatch(match: RecognizeRemoteMatch) {
        val key = match.query
        if (key.isBlank()) return
        val existing = _ui.value.humRemoteJobs[key]
        if (existing != null && existing.busy) return
        _ui.update {
            it.copy(humRemoteJobs = it.humRemoteJobs + (key to DownloadJobDto("", "queued", 0, null, null, match.title)))
        }
        viewModelScope.launch {
            val job = runCatching { api.startDownloadQuery(key, match.title) }.getOrNull()
            if (job == null) {
                _ui.update {
                    it.copy(humRemoteJobs = it.humRemoteJobs +
                        (key to DownloadJobDto("", "error", 0, null, tr("toast.downloadStartFailed"), match.title)))
                }
                notify(tr("toast.downloadFailed"))
                return@launch
            }
            var current: DownloadJobDto = job
            var misses = 0
            while (isActive) {
                _ui.update { it.copy(humRemoteJobs = it.humRemoteJobs + (key to current)) }
                if (current.status == "done" || current.status == "error") break
                delay(1500)
                val next: DownloadJobDto? = runCatching { api.downloadJob(job.id) }.getOrNull()
                if (next == null) {
                    // Transient poll failures are fine; give up after a long outage.
                    if (++misses > 60) {
                        current = current.copy(status = "error", error = tr("toast.serverUnreachable"))
                        break
                    }
                    continue
                }
                misses = 0
                current = next
            }
            _ui.update { it.copy(humRemoteJobs = it.humRemoteJobs + (key to current)) }
            if (current.status == "error") {
                notify(current.error?.takeIf { it.isNotBlank() } ?: tr("toast.downloadFailed"))
                return@launch
            }
            notify(tr("hum.addedToLibrary"))
            loadAll()
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

    /** Reset the lyrics sync offset to its default (web resetLyricsOffset). */
    fun resetLyricsOffset() {
        _ui.update { it.copy(lyricsOffset = DEFAULT_LYRICS_OFFSET) }
        viewModelScope.launch { prefs.setPlayback(lyricsOffset = DEFAULT_LYRICS_OFFSET) }
    }

    /** Forced word-by-word karaoke alignment (web playbackSlice.alignLyrics):
     *  POST /api/lyrics/<hash>/align, then poll GET the same URL until the
     *  detached server job resolves (ok / failed / unavailable), re-fetching the
     *  lyrics on success. Heavy work runs server-side; this just follows it. */
    fun alignLyrics() {
        val hash = player.snapshot.value.currentId ?: return
        if (_ui.value.lyricsAligning) return
        _ui.update { it.copy(lyricsAligning = true) }
        viewModelScope.launch {
            try {
                val start = api.lyricsAlignStart(hash)
                when (start.optString("state", "")) {
                    "ready" -> {
                        // Already word-by-word — just refresh the pane.
                        fetchLyrics(force = false)
                        notify(tr("toast.alreadyWordByWord"))
                    }
                    "no-source" -> notify(tr("toast.noSyncLyrics"))
                    else -> {
                        // The job runs detached on the server; poll until it
                        // resolves (the first ever run also downloads the model,
                        // hence the generous 12-minute ceiling).
                        val deadline = System.currentTimeMillis() + 12 * 60 * 1000
                        while (isActive && System.currentTimeMillis() < deadline) {
                            delay(3000)
                            // User moved on to another track — stop quietly, the
                            // job still finishes on the server.
                            if (player.snapshot.value.currentId != hash) break
                            val st = runCatching { api.lyricsAlignStatus(hash) }.getOrNull() ?: continue
                            when (st.optString("state", "")) {
                                "ok" -> {
                                    fetchLyrics(force = false)
                                    notify(tr("toast.karaokeReady"))
                                    _ui.update { it.copy(lyricsAligning = false) }
                                    return@launch
                                }
                                "failed", "unavailable" -> {
                                    notify(st.optString("message").ifBlank { tr("toast.generationFailed") })
                                    _ui.update { it.copy(lyricsAligning = false) }
                                    return@launch
                                }
                                // "running" / "idle" — keep polling.
                            }
                        }
                        if (player.snapshot.value.currentId == hash) notify(tr("toast.stillWorking"))
                    }
                }
            } catch (e: Exception) {
                notify(tr("toast.alignUnavailable"))
            }
            _ui.update { it.copy(lyricsAligning = false) }
        }
    }

    // ---- language + theme ----------------------------------------------------

    /** Switch the UI language live (web uiSlice.setLocale); persisted in Prefs. */
    fun setLocale(locale: Locale) {
        Messages.current = locale
        _ui.update { it.copy(locale = locale) }
        viewModelScope.launch { prefs.setLocale(locale.id) }
    }

    /** Switch the appearance mode ("dark" | "light" | "auto"), persisted and
     *  applied live by AuralisTheme (web setMode). */
    fun setThemeMode(mode: String) {
        _ui.update { it.copy(themeMode = mode) }
        viewModelScope.launch { prefs.setTheme(mode) }
    }

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
