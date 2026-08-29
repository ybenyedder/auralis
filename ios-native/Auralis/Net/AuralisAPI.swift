import Foundation

// Thin URLSession client for the Auralis server HTTP API — the Swift counterpart of
// android-native's net/AuralisApi.kt. Auth is a bearer session token attached as an
// Authorization header (never a ?token= query, so it stays out of access logs). Bearer
// clients are CSRF-exempt, so state mutations need no CSRF token.
actor AuralisAPI {
    private(set) var base: String = ""
    private(set) var token: String?

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 30
        cfg.waitsForConnectivity = true
        return URLSession(configuration: cfg)
    }()

    func configure(base: String, token: String?) {
        self.base = AuralisAPI.normalizeBase(base)
        self.token = token
    }

    var isConfigured: Bool { !base.isEmpty && !(token ?? "").isEmpty }

    // MARK: URL builders

    /// Stream URL for a track filepath. The token is NOT on the URL — playback attaches
    /// it as an Authorization header via the AVURLAsset header options.
    nonisolated static func streamURL(base: String, filepath: String) -> URL? {
        let encoded = filepath
            .split(whereSeparator: { $0 == "/" || $0 == "\\" })
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        return URL(string: "\(normalizeBase(base))/api/stream/\(encoded)")
    }

    /// Absolute URL for an `image` field like "/api/art/<hash>". The art endpoint is
    /// open (no auth), so no token is appended.
    nonisolated static func assetURL(base: String, image: String?) -> URL? {
        guard let image, !image.isEmpty else { return nil }
        if image.hasPrefix("http") { return URL(string: image) }
        let b = normalizeBase(base)
        return URL(string: b + (image.hasPrefix("/") ? image : "/\(image)"))
    }

    /// Sized variant of `assetURL` for the Now Playing artwork (lock-screen AND the
    /// car head-unit). A compact `?w=` thumbnail is decisive over CarPlay / Bluetooth
    /// cover-art: head-units such as BMW iDrive drop the full-resolution cover, so
    /// only the downsized image reaches the dashboard. Only our /api/art endpoint
    /// understands `?w=` — external URLs pass through untouched.
    nonisolated static func assetURL(base: String, image: String?, width: Int) -> URL? {
        guard let url = assetURL(base: base, image: image) else { return nil }
        guard url.absoluteString.contains("/api/art/"),
              var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "w", value: String(width))]
        return comps.url ?? url
    }

    // MARK: Auth

    func health(probeBase: String) async -> Bool {
        guard let url = URL(string: "\(AuralisAPI.normalizeBase(probeBase))/api/health") else { return false }
        do {
            let (_, resp) = try await session.data(from: url)
            return (resp as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
        } catch { return false }
    }

    func accounts(probeBase: String) async -> [String] {
        guard let url = URL(string: "\(AuralisAPI.normalizeBase(probeBase))/api/auth/accounts") else { return ["admin"] }
        do {
            let (data, _) = try await session.data(from: url)
            let names = JSON.parse(data)["usernames"].stringArray
            return names.isEmpty ? ["admin"] : names
        } catch { return ["admin"] }
    }

    func login(probeBase: String, username: String, password: String) async -> AuthResult {
        let b = AuralisAPI.normalizeBase(probeBase)
        guard let url = URL(string: "\(b)/api/auth/login") else {
            return AuthResult(ok: false, token: nil, username: nil, isAdmin: false, defaultPassword: false, error: "URL invalide")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["username": username, "password": password])
        do {
            let (data, resp) = try await session.data(for: req)
            let json = JSON.parse(data)
            let ok = ((resp as? HTTPURLResponse)?.statusCode ?? 500) < 400 && json["ok"].bool
            if ok {
                return AuthResult(ok: true, token: json["token"].string, username: json["username"].string(or: username),
                                  isAdmin: json["isAdmin"].bool, defaultPassword: json["defaultPassword"].bool, error: nil)
            }
            return AuthResult(ok: false, token: nil, username: nil, isAdmin: false, defaultPassword: false,
                              error: json["error"].string(or: "Identifiant ou mot de passe incorrect"))
        } catch {
            return AuthResult(ok: false, token: nil, username: nil, isAdmin: false, defaultPassword: false, error: "Serveur injoignable")
        }
    }

    // MARK: Library / state / stats

    func library() async -> LibrarySnapshot {
        guard let o = try? await getJSON("/api/library") else { return .empty }
        return LibrarySnapshot.from(o)
    }
    func userState() async -> UserState {
        guard let o = try? await getJSON("/api/state") else { return .empty }
        return UserState.from(o)
    }
    func stats() async -> ListeningStats {
        guard let o = try? await getJSON("/api/stats") else { return .empty }
        return ListeningStats.from(o)
    }
    func recommend() async -> RecommendResult {
        guard let o = try? await getJSON("/api/recommend?limit=120") else { return .empty }
        return RecommendResult.from(o)
    }
    func search(_ query: String) async -> SearchResult {
        guard !query.isEmpty,
              let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let o = try? await getJSON("/api/search?q=\(q)&limit=60") else { return .empty }
        return SearchResult.from(o)
    }
    func lyrics(trackhash: String, force: Bool) async -> LyricsResult {
        let path = "/api/lyrics/\(trackhash.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? trackhash)"
        do {
            let o = force ? try await requestJSON(path, method: "POST", body: [:]) : try await getJSON(path)
            return LyricsResult.from(o)
        } catch { return .none }
    }

    func recap(month: String?) async -> RecapResult {
        let path = (month?.isEmpty == false) ? "/api/recap?month=\(month!.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? month!)" : "/api/recap"
        guard let o = try? await getJSON(path) else { return .empty }
        return RecapResult.from(o)
    }

    @discardableResult
    func putState(_ payload: [String: Any]) async -> JSON {
        (try? await requestJSON("/api/state", method: "PUT", body: payload)) ?? JSON(nil)
    }
    @discardableResult
    func post(_ path: String, _ body: [String: Any]) async -> JSON {
        (try? await requestJSON(path, method: "POST", body: body)) ?? JSON(nil)
    }
    @discardableResult
    func put(_ path: String, _ body: [String: Any]) async -> JSON {
        (try? await requestJSON(path, method: "PUT", body: body)) ?? JSON(nil)
    }
    @discardableResult
    func delete(_ path: String) async -> JSON {
        (try? await requestJSON(path, method: "DELETE", body: nil)) ?? JSON(nil)
    }
    func getObj(_ path: String) async -> JSON {
        (try? await getJSON(path)) ?? JSON(nil)
    }

    // Admin user management.
    func listUsers() async -> (users: [UserRow], me: Int) {
        let o = await getObj("/api/auth/users")
        return (o["users"].array.map(UserRow.from), o["me"].int ?? -1)
    }

    // MARK: helpers

    private func getJSON(_ path: String) async throws -> JSON {
        try await requestJSON(path, method: "GET", body: nil)
    }

    private func requestJSON(_ path: String, method: String, body: [String: Any]?) async throws -> JSON {
        guard let url = URL(string: "\(base)\(path)") else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, resp) = try await session.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 { throw APIError.http(http.statusCode) }
        return JSON.parse(data)
    }

    enum APIError: Error { case badURL, http(Int) }

    nonisolated static func normalizeBase(_ raw: String) -> String {
        var v = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return v }
        if v.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) == nil { v = "http://\(v)" }
        while v.hasSuffix("/") { v.removeLast() }
        return v
    }
}
