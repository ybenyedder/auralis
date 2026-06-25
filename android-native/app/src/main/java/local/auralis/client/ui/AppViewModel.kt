package local.auralis.client.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import local.auralis.client.data.Prefs
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.PlaylistDto
import local.auralis.client.model.SearchResult
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi
import local.auralis.client.playback.PlaybackSnapshot
import local.auralis.client.playback.PlayerHolder
import org.json.JSONArray
import org.json.JSONObject

enum class Phase { BOOT, CONNECT, LOGIN, LOADING, READY, ERROR }

enum class ViewId { HOME, EXPLORE, LIBRARY, FAVORITES, RECENTS, FOLDERS, INSIGHTS, ALBUM, ARTIST, PLAYLIST, SETTINGS }

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
    val recents: List<String> = emptyList(),
    val playCounts: Map<String, Int> = emptyMap(),
    val playlists: List<PlaylistDto> = emptyList(),
    val stats: ListeningStats = ListeningStats.EMPTY,

    val nav: NavTarget = NavTarget(ViewId.HOME),
    val backStack: List<NavTarget> = emptyList(),

    val searchQuery: String = "",
    val searchResult: SearchResult = SearchResult.EMPTY,

    val lyrics: LyricsResult = LyricsResult.NONE,
    val lyricsLoading: Boolean = false,
    val karaoke: Boolean = true,
    val lyricsOffset: Float = 0.15f,

    val theme: String = "oxide",
    val donateDue: Boolean = false,
    val contextTrack: Track? = null,

    val commandOpen: Boolean = false,
    val visualizerOpen: Boolean = false,
    val volume: Float = 0.85f,
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

    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()

    val playback: StateFlow<PlaybackSnapshot> get() = player.snapshot
    val position: StateFlow<Long> get() = player.position

    // index helpers
    private var trackIndex: Map<String, Track> = emptyMap()
    fun track(hash: String?): Track? = hash?.let { trackIndex[it] }
    fun currentTrack(): Track? = track(player.snapshot.value.currentId)

    init {
        player.onTrackChanged = { id -> onTrackChanged(id) }
        player.onNeedContinuation = { appendContinuation() }
        player.connect()
        boot()
        observeScrobble()
        observeSleep()
        observeSessionPersist()
    }

    // ---- boot / auth -------------------------------------------------------

    private fun boot() {
        viewModelScope.launch {
            val p = prefs.load()
            // Donation reminder: due on the first launch, then every 3 launches after
            // it (launches 1, 4, 7, …). Shown once the app reaches the library.
            val launches = prefs.bumpLaunchCount()
            val donateDue = launches == 1 || (launches - 1) % 3 == 0
            _ui.update { it.copy(theme = p.theme, karaoke = p.karaoke, lyricsOffset = p.lyricsOffset, donateDue = donateDue, volume = p.volume) }
            player.setRepeat(p.repeat)
            player.setShuffle(p.shuffle)
            player.setVolume(p.volume)
            if (p.serverBase.isBlank()) {
                _ui.update { it.copy(phase = Phase.CONNECT) }
                return@launch
            }
            if (!p.token.isNullOrBlank()) {
                api.configure(p.serverBase, p.token)
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
            _ui.update { it.copy(phase = Phase.CONNECT, message = null) }
        }
    }

    fun logout() {
        viewModelScope.launch {
            player.stop()
            prefs.clearSession()
            api.configure(_ui.value.serverBase, null)
            _ui.update { it.copy(phase = Phase.LOGIN) }
        }
    }

    // ---- data --------------------------------------------------------------

    fun loadAll(onAuthError: (() -> Unit)? = null) {
        viewModelScope.launch {
            _ui.update { it.copy(phase = if (_ui.value.tracks.isEmpty()) Phase.LOADING else _ui.value.phase) }
            try {
                val lib = api.library()
                trackIndex = lib.tracks.associateBy { it.trackhash }
                _ui.update {
                    it.copy(
                        phase = Phase.READY,
                        tracks = lib.tracks,
                        albums = lib.albums,
                        artists = lib.artists,
                        folders = lib.folders,
                        root = lib.root,
                        trackByHash = trackIndex,
                    )
                }
                refreshState()
                refreshStats()
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
            _ui.update {
                it.copy(
                    favorites = st.favorites.toSet(),
                    favoritesOrder = st.favorites,
                    recents = st.recents,
                    playCounts = st.playCounts,
                    playlists = st.playlists.sortedBy { p -> p.position },
                )
            }
        }
    }

    private suspend fun refreshStats() {
        val s = runCatching { api.stats() }.getOrDefault(ListeningStats.EMPTY)
        _ui.update { it.copy(stats = s) }
        checkMilestone(s.streak)
    }

    fun refreshStatsAsync() { viewModelScope.launch { refreshStats() } }

    // ---- navigation --------------------------------------------------------

    fun navigate(view: ViewId, id: String? = null) {
        _ui.update {
            it.copy(
                backStack = (it.backStack + it.nav).takeLast(24),
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

    fun togglePlay() = player.togglePlay()
    fun next() = player.next()
    fun prev() = player.prev()
    fun seekTo(ms: Long) = player.seekTo(ms)

    fun toggleShuffle() {
        player.toggleShuffle()
        viewModelScope.launch { prefs.setPlayback(shuffle = player.snapshot.value.shuffle) }
    }

    fun cycleRepeat() {
        player.cycleRepeat()
        viewModelScope.launch { prefs.setPlayback(repeat = player.snapshot.value.repeat) }
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

    private fun appendContinuation() {
        val current = currentTrack() ?: return
        val ui = _ui.value
        val queued = player.snapshot.value.queueIds.toSet()
        val byArtist = ui.tracks.filter {
            it.trackhash !in queued && it.primaryArtistHash != null &&
                it.primaryArtistHash == current.primaryArtistHash
        }
        val byGenre = ui.tracks.filter {
            it.trackhash !in queued && it.genre != null && it.genre == current.genre
        }
        val pool = (byArtist + byGenre).distinctBy { it.trackhash }
            .ifEmpty { ui.tracks.filter { it.trackhash !in queued } }
        if (pool.isNotEmpty()) player.appendTracks(pool.shuffled().take(20))
    }

    // ---- track change → lyrics + recents bump ------------------------------

    private fun onTrackChanged(id: String?) {
        // Sleep "end of track": the previous track just finished and advanced — stop here.
        if (_ui.value.sleepEndOfTrack) {
            player.pause()
            _ui.update { it.copy(sleepActive = false, sleepEndOfTrack = false, sleepEndsAt = null) }
            notify("Lecture arrêtée (fin de titre)")
        }
        scrobbleArmedFor = id
        listenedMs = 0L
        lastPos = 0L
        scrobbled = false
        _ui.update { it.copy(lyrics = LyricsResult.NONE) }
        // Fetch lyrics for the now-playing track (lazy; only when a track is active).
        if (id != null) fetchLyrics(force = false)
    }

    // ---- scrobble gate (30s or 50% of duration of real listening) ----------

    private var scrobbleArmedFor: String? = null
    private var listenedMs = 0L
    private var lastPos = 0L
    private var scrobbled = false

    private fun observeScrobble() {
        viewModelScope.launch {
            while (true) {
                delay(1000)
                val snap = player.snapshot.value
                val pos = player.position.value
                if (snap.isPlaying && snap.currentId != null) {
                    val delta = pos - lastPos
                    if (delta in 1..2000) listenedMs += delta
                    lastPos = pos
                    val dur = snap.durationMs
                    val threshold = if (dur > 0) minOf(30_000L, dur / 2) else 30_000L
                    if (!scrobbled && listenedMs >= threshold) {
                        scrobbled = true
                        scrobble(snap.currentId!!)
                    }
                } else {
                    lastPos = pos
                }
            }
        }
    }

    private fun scrobble(trackhash: String) {
        viewModelScope.launch {
            // optimistic local bump
            _ui.update {
                val pc = it.playCounts.toMutableMap()
                pc[trackhash] = (pc[trackhash] ?: 0) + 1
                val recents = (listOf(trackhash) + it.recents.filter { r -> r != trackhash }).take(100)
                it.copy(playCounts = pc, recents = recents)
            }
            api.putState(JSONObject().put("action", "play").put("trackhash", trackhash))
            refreshStats()
        }
    }

    // ---- favorites ---------------------------------------------------------

    fun toggleFavorite(trackhash: String) {
        val isFav = _ui.value.favorites.contains(trackhash)
        _ui.update {
            val next = it.favorites.toMutableSet()
            if (isFav) next.remove(trackhash) else next.add(trackhash)
            it.copy(favorites = next)
        }
        notify(if (isFav) "Retiré des favoris" else "Ajouté aux favoris")
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "favorite").put("trackhash", trackhash).put("value", !isFav))
        }
    }

    fun isFavorite(trackhash: String): Boolean = _ui.value.favorites.contains(trackhash)

    fun dismissDonate() { _ui.update { it.copy(donateDue = false) } }

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

    fun setVolume(v: Float) {
        val nv = v.coerceIn(0f, 1f)
        player.setVolume(nv)
        _ui.update { it.copy(volume = nv) }
        viewModelScope.launch { prefs.setPlayback(volume = nv) }
    }

    // ---- shuffle play ------------------------------------------------------

    fun playShuffled(list: List<Track>) {
        if (list.isEmpty()) return
        player.setShuffle(true)
        viewModelScope.launch { prefs.setPlayback(shuffle = true) }
        player.playTracks(list.shuffled(), 0)
    }

    // ---- sleep timer -------------------------------------------------------

    fun startSleepTimer(minutes: Int) {
        _ui.update { it.copy(sleepActive = true, sleepEndsAt = System.currentTimeMillis() + minutes * 60_000L, sleepEndOfTrack = false) }
        notify("Minuteur : $minutes min")
    }
    fun sleepAfterTrack() {
        _ui.update { it.copy(sleepActive = true, sleepEndsAt = null, sleepEndOfTrack = true) }
        notify("Arrêt en fin de titre")
    }
    fun cancelSleepTimer() {
        _ui.update { it.copy(sleepActive = false, sleepEndsAt = null, sleepEndOfTrack = false) }
        notify("Minuteur annulé")
    }
    private fun observeSleep() {
        viewModelScope.launch {
            while (true) {
                delay(1000)
                val s = _ui.value
                val endsAt = s.sleepEndsAt
                if (s.sleepActive && endsAt != null && System.currentTimeMillis() >= endsAt) {
                    player.pause()
                    _ui.update { it.copy(sleepActive = false, sleepEndsAt = null, sleepEndOfTrack = false) }
                    notify("Lecture arrêtée (minuteur)")
                }
            }
        }
    }

    // ---- session resume ----------------------------------------------------

    private fun observeSessionPersist() {
        viewModelScope.launch {
            while (true) {
                delay(5000)
                val snap = player.snapshot.value
                if (snap.currentId != null && snap.queueIds.isNotEmpty()) {
                    val idx = snap.currentIndex.coerceAtLeast(0)
                    val start = (idx - 100).coerceAtLeast(0)
                    val window = snap.queueIds.drop(start).take(200)
                    val json = JSONObject()
                        .put("trackhash", snap.currentId)
                        .put("hashes", JSONArray(window))
                        .put("index", idx - start)
                        .put("position", player.positionMs())
                    runCatching { prefs.saveLastSession(json.toString()) }
                }
            }
        }
    }
    private suspend fun restoreLastSession() {
        if (player.snapshot.value.hasItems) return
        val raw = runCatching { prefs.loadLastSession() }.getOrNull() ?: return
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val hashes = o.optJSONArray("hashes") ?: return
        val tracks = (0 until hashes.length()).mapNotNull { trackIndex[hashes.optString(it)] }
        if (tracks.isEmpty()) return
        val idx = o.optInt("index", 0).coerceIn(0, tracks.lastIndex)
        val pos = o.optLong("position", 0L)
        player.playTracksPaused(tracks, idx, pos)
    }

    // ---- streak milestones -------------------------------------------------

    private fun checkMilestone(streak: Int) {
        viewModelScope.launch {
            val milestones = listOf(3, 7, 14, 30, 60, 100, 200, 365)
            val last = prefs.lastMilestone()
            val top = milestones.filter { it <= streak }.maxOrNull() ?: 0
            if (top > last) { prefs.setMilestone(top); notify("🔥 $top jours d'affilée !") }
            else if (top < last) prefs.setMilestone(top)
        }
    }

    // ---- playlists ---------------------------------------------------------

    fun createPlaylist(name: String, onCreated: (String) -> Unit = {}) {
        viewModelScope.launch {
            val pl = JSONObject().put("name", name)
            val res = api.putState(JSONObject().put("action", "playlist.upsert").put("playlist", pl))
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
        }
    }

    fun deletePlaylist(playlistId: String) {
        _ui.update { it.copy(playlists = it.playlists.filter { p -> p.id != playlistId }) }
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "playlist.delete").put("id", playlistId))
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

    // ---- settings: account / library / data --------------------------------

    fun changePassword(current: String, newPw: String, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            val res = api.post("/api/auth/password", JSONObject().put("currentPassword", current).put("newPassword", newPw))
            if (res.optBoolean("ok", false)) {
                val token = if (res.isNull("token")) null else res.optString("token", null)
                if (token != null) {
                    api.configure(_ui.value.serverBase, token)
                    prefs.setServer(_ui.value.serverBase, token, _ui.value.username)
                }
                notify("Mot de passe mis à jour")
                onResult(true, null)
            } else onResult(false, res.optString("error", "Échec du changement"))
        }
    }

    fun resetStats() {
        _ui.update { it.copy(playCounts = emptyMap(), recents = emptyList()) }
        viewModelScope.launch {
            api.putState(JSONObject().put("action", "resetStats"))
            refreshStats()
        }
        notify("Historique réinitialisé")
    }

    fun rescan() {
        viewModelScope.launch {
            notify("Scan lancé…")
            api.post("/api/library/scan", JSONObject())
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

    fun setTheme(id: String) {
        _ui.update { it.copy(theme = id) }
        viewModelScope.launch {
            prefs.setPlayback(theme = id)
            api.putState(JSONObject().put("action", "setting").put("key", "theme").put("value", id))
        }
    }

    override fun onCleared() {
        player.release()
        super.onCleared()
    }
}
