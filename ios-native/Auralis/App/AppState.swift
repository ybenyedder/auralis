import Foundation
import SwiftUI
import Combine

// Central app store — phase router, session, library + per-user state, playback queue,
// and the /api/state action mutations. Mirrors android-native's ui/AppViewModel.kt.
@MainActor
final class AppState: ObservableObject {
    enum Phase { case boot, connect, login, loading, ready, error }

    @Published var phase: Phase = .boot
    @Published var errorMessage: String?

    // Session
    @Published var base: String = Prefs.serverBase
    @Published var username: String = Prefs.username
    @Published var isAdmin = false

    // Library + user state
    @Published var library = LibrarySnapshot.empty
    @Published var user = UserState.empty
    @Published var forYou: [Track] = []
    @Published var stats = ListeningStats.empty
    @Published var recap = RecapResult.empty

    // Playback
    @Published var queue: [Track] = []
    @Published var currentIndex = 0
    @Published var lyrics = LyricsResult.none
    @Published var showPlayer = false

    // Theme id (drives accent + backdrop tint)
    @Published var theme: String = Prefs.theme

    let api = AuralisAPI()
    let player = AudioPlayer()

    private var trackIndex: [String: Track] = [:]
    private var cancellables = Set<AnyCancellable>()

    var currentTrack: Track? {
        guard currentIndex >= 0, currentIndex < queue.count else { return nil }
        return queue[currentIndex]
    }

    init() {
        player.onEnded = { [weak self] in self?.handleEnded() }
        player.onNext = { [weak self] in self?.playNext(manual: true) }
        player.onPrev = { [weak self] in self?.playPrev() }
        player.onTogglePlay = { [weak self] in self?.togglePlay() }
        // Re-publish AppState whenever the nested player changes (position / play state)
        // so views observing `app` update — SwiftUI doesn't observe nested ObservableObjects.
        player.objectWillChange
            .sink { [weak self] in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    // MARK: Bootstrap / auth

    func bootstrap() async {
        let savedBase = Prefs.serverBase
        let savedToken = Prefs.token
        guard !savedBase.isEmpty, let token = savedToken, !token.isEmpty else {
            phase = savedBase.isEmpty ? .connect : .login
            return
        }
        await api.configure(base: savedBase, token: token)
        base = savedBase
        phase = .loading
        if await api.health(probeBase: savedBase) {
            await loadAll()
        } else {
            phase = .login
        }
    }

    func connect(_ url: String) async {
        let normalized = AuralisAPI.normalizeBase(url)
        phase = .loading
        if await api.health(probeBase: normalized) {
            Prefs.serverBase = normalized
            base = normalized
            phase = .login
        } else {
            errorMessage = "Serveur injoignable à \(normalized)"
            phase = .connect
        }
    }

    func login(username: String, password: String) async {
        phase = .loading
        let result = await api.login(probeBase: base, username: username, password: password)
        guard result.ok, let token = result.token else {
            errorMessage = result.error ?? "Connexion échouée"
            phase = .login
            return
        }
        Prefs.token = token
        Prefs.username = result.username ?? username
        self.username = result.username ?? username
        self.isAdmin = result.isAdmin
        await api.configure(base: base, token: token)
        await loadAll()
    }

    func logout() {
        player.stop()
        Prefs.clearSession()
        queue = []
        library = .empty
        user = .empty
        phase = .login
    }

    func loadAll() async {
        phase = .loading
        async let lib = api.library()
        async let st = api.userState()
        let (library, user) = await (lib, st)
        self.library = library
        self.user = user
        trackIndex = Dictionary(library.tracks.map { ($0.trackhash, $0) }, uniquingKeysWith: { a, _ in a })
        if let t = user.settings["theme"], !t.isEmpty { theme = t; Prefs.theme = t }
        phase = .ready
        // Secondary data — non-blocking.
        Task { self.forYou = self.resolve((await api.recommend()).forYou.map { $0.trackhash }) }
        Task { self.stats = await api.stats() }
        Task { self.recap = await api.recap(month: nil) }
    }

    func reloadUserState() async { self.user = await api.userState() }

    // MARK: Resolution helpers

    func track(_ hash: String) -> Track? { trackIndex[hash] }
    func resolve(_ hashes: [String]) -> [Track] { hashes.compactMap { trackIndex[$0] } }

    func tracks(ofAlbum albumhash: String) -> [Track] {
        library.tracks.filter { $0.albumhash == albumhash }
            .sorted { ($0.title) < ($1.title) }
    }
    func tracks(ofArtist artisthash: String) -> [Track] {
        library.tracks.filter { $0.artists.contains { $0.artisthash == artisthash } }
    }
    var recentTracks: [Track] { resolve(user.recents) }
    var likedTracks: [Track] { library.tracks.filter { user.favorites.contains($0.trackhash) } }
    func tracks(inFolder path: String) -> [Track] { library.tracks.filter { $0.folder == path } }

    // MARK: Playlists (create / delete / add)

    func createPlaylist(name: String) async -> String? {
        let res = await api.putState(["action": "playlist.upsert", "playlist": ["name": name]])
        await reloadUserState()
        return res["id"].string
    }
    func deletePlaylist(_ id: String) {
        user.playlists.removeAll { $0.id == id }
        Task { await api.putState(["action": "playlist.delete", "id": id]); await reloadUserState() }
    }
    func addToPlaylist(_ playlistId: String, trackhash: String) {
        guard let pl = user.playlists.first(where: { $0.id == playlistId }) else { return }
        if pl.trackhashes.contains(trackhash) { return }
        let next = pl.trackhashes + [trackhash]
        Task {
            await api.putState(["action": "playlist.upsert", "playlist": [
                "id": pl.id, "name": pl.name, "pinned": pl.pinned, "trackhashes": next,
            ]])
            await reloadUserState()
        }
    }

    // MARK: Admin
    func loadUsers() async -> (users: [UserRow], me: Int) { await api.listUsers() }
    func createUser(_ username: String, _ password: String, isAdmin: Bool) async -> Bool {
        let r = await api.post("/api/auth/users", ["username": username, "password": password, "isAdmin": isAdmin])
        return r["ok"].bool || r["id"].exists
    }
    func resetUserPassword(_ id: Int, _ password: String) async -> Bool {
        await api.put("/api/auth/users", ["id": id, "password": password])["ok"].bool
    }
    func deleteUser(_ id: Int) async -> Bool {
        await api.delete("/api/auth/users?id=\(id)")["ok"].bool
    }

    // MARK: Playback

    func play(_ track: Track, in list: [Track]) {
        queue = list.isEmpty ? [track] : list
        currentIndex = queue.firstIndex { $0.trackhash == track.trackhash } ?? 0
        startCurrent(reportPlay: true)
    }

    func playAll(_ list: [Track], shuffled: Bool = false) {
        guard !list.isEmpty else { return }
        queue = shuffled ? list.shuffled() : list
        currentIndex = 0
        startCurrent(reportPlay: true)
    }

    private func startCurrent(reportPlay: Bool) {
        guard let track = currentTrack, let fp = track.filepath,
              let url = AuralisAPI.streamURL(base: base, filepath: fp) else { return }
        // Sized thumbnail (not full-res): CarPlay / Bluetooth cover-art on head-units
        // like BMW iDrive drops oversized covers — the 512px variant is what shows.
        let art = AuralisAPI.assetURL(base: base, image: track.image, width: 512)
        Task { let token = await api.token
            player.load(url: url, token: token, title: track.title, artist: track.displayArtist, artworkURL: art)
        }
        lyrics = .none
        if reportPlay { Task { await api.putState(["action": "play", "trackhash": track.trackhash]) } }
        Task { self.lyrics = await api.lyrics(trackhash: track.trackhash, force: false) }
    }

    func togglePlay() { player.toggle() }

    func playNext(manual: Bool) {
        if manual, let t = currentTrack, player.duration > 0 {
            let ratio = player.position / player.duration
            if ratio < 0.9 {
                let ms = Int(player.position * 1000)
                Task { await api.putState(["action": "skip", "trackhash": t.trackhash, "msPlayed": ms, "ratio": ratio]) }
            }
        }
        advance()
    }

    private func handleEnded() { advance() }

    private func advance() {
        guard !queue.isEmpty else { return }
        if Prefs.repeatMode == 2 { startCurrent(reportPlay: true); return } // repeat one
        if Prefs.shuffle && queue.count > 1 {
            var next = currentIndex
            while next == currentIndex { next = Int.random(in: 0..<queue.count) }
            currentIndex = next
        } else if currentIndex + 1 < queue.count {
            currentIndex += 1
        } else if Prefs.repeatMode == 1 {
            currentIndex = 0
        } else {
            return // end of queue
        }
        startCurrent(reportPlay: true)
    }

    func playPrev() {
        if player.position > 3 { player.seek(to: 0); return }
        guard !queue.isEmpty else { return }
        currentIndex = currentIndex > 0 ? currentIndex - 1 : queue.count - 1
        startCurrent(reportPlay: true)
    }

    // MARK: Mutations

    func toggleFavorite(_ hash: String) {
        let isFav = user.favorites.contains(hash)
        if isFav { user.favorites.remove(hash) } else { user.favorites.insert(hash) }
        Task { await api.putState(["action": "favorite", "trackhash": hash, "value": !isFav]) }
    }

    func toggleDislike(_ hash: String) {
        let isDis = user.dislikes.contains(hash)
        if isDis { user.dislikes.remove(hash) } else { user.dislikes.insert(hash) }
        Task { await api.putState(["action": "dislike", "trackhash": hash, "value": !isDis]) }
    }

    func setTheme(_ id: String) {
        theme = id
        Prefs.theme = id
        Task { await api.putState(["action": "setting", "key": "theme", "value": id]) }
    }

    var shuffle: Bool {
        get { Prefs.shuffle }
        set { Prefs.shuffle = newValue; objectWillChange.send() }
    }
    func cycleRepeat() { Prefs.repeatMode = (Prefs.repeatMode + 1) % 3; objectWillChange.send() }
    var repeatMode: Int { Prefs.repeatMode }

    func artURL(_ image: String?) -> URL? { AuralisAPI.assetURL(base: base, image: image) }
}
