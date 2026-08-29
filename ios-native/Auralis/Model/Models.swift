import Foundation

// Plain Swift mirrors of the Auralis server's JSON wire shapes, parsed with a small
// tolerant wrapper over JSONSerialization (no Codable ceremony — the `settings` map is
// heterogeneous and several fields are optional, which a hand parser handles cleanly).
// This is the Swift counterpart of android-native's model/Models.kt.

/// Tolerant JSON accessor over `Any?` decoded by JSONSerialization.
struct JSON {
    let raw: Any?
    init(_ raw: Any?) { self.raw = raw }

    static func parse(_ data: Data) -> JSON {
        JSON(try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]))
    }

    subscript(_ key: String) -> JSON { JSON((raw as? [String: Any])?[key]) }
    subscript(_ index: Int) -> JSON {
        guard let arr = raw as? [Any], index >= 0, index < arr.count else { return JSON(nil) }
        return JSON(arr[index])
    }

    var string: String? { raw as? String }
    func string(or fallback: String) -> String { (raw as? String) ?? fallback }
    var int: Int? { (raw as? Int) ?? (raw as? NSNumber)?.intValue ?? (raw as? Double).map(Int.init) }
    var double: Double? { (raw as? Double) ?? (raw as? NSNumber)?.doubleValue ?? (raw as? Int).map(Double.init) }
    var bool: Bool { (raw as? Bool) ?? ((raw as? NSNumber)?.boolValue ?? false) }
    var int64: Int64? { (raw as? NSNumber)?.int64Value ?? (raw as? Int).map(Int64.init) }
    var array: [JSON] { (raw as? [Any])?.map { JSON($0) } ?? [] }
    var stringArray: [String] { (raw as? [Any])?.compactMap { $0 as? String } ?? [] }
    var dictionary: [String: JSON] { ((raw as? [String: Any]) ?? [:]).mapValues { JSON($0) } }
    var exists: Bool { raw != nil && !(raw is NSNull) }
}

struct ArtistRef: Identifiable, Hashable {
    let artisthash: String
    let name: String
    var id: String { artisthash }
    static func from(_ o: JSON) -> ArtistRef {
        ArtistRef(artisthash: o["artisthash"].string(or: ""), name: o["name"].string(or: ""))
    }
}

struct Track: Identifiable, Hashable {
    let trackhash: String
    let title: String
    let artist: String?
    let album: String?
    let albumhash: String?
    let duration: Double?
    let filepath: String?
    let folder: String?
    let image: String?
    let isFavorite: Bool
    let playcount: Int
    let year: Int?
    let genre: String?
    let lossless: Bool
    let hasLyrics: Bool
    let addedAt: Int64?
    let color: [String]?
    let artists: [ArtistRef]

    var id: String { trackhash }
    var displayArtist: String { artist ?? artists.first?.name ?? "Artiste inconnu" }
    var primaryArtistHash: String? { artists.first?.artisthash }

    static func from(_ o: JSON) -> Track {
        let colors = o["color"].stringArray
        return Track(
            trackhash: o["trackhash"].string(or: ""),
            title: o["title"].string(or: "Sans titre"),
            artist: o["artist"].string,
            album: o["album"].string,
            albumhash: o["albumhash"].string,
            duration: o["duration"].double,
            filepath: o["filepath"].string,
            folder: o["folder"].string,
            image: o["image"].string,
            isFavorite: o["is_favorite"].bool,
            playcount: o["playcount"].int ?? 0,
            year: o["year"].int,
            genre: o["genre"].string,
            lossless: o["lossless"].bool,
            hasLyrics: o["hasLyrics"].bool,
            addedAt: o["addedAt"].int64,
            color: colors.isEmpty ? nil : colors,
            artists: o["artists"].array.map(ArtistRef.from)
        )
    }
}

struct Album: Identifiable, Hashable {
    let albumhash: String
    let title: String
    let albumartists: [ArtistRef]
    let image: String?
    let year: Int?
    let trackcount: Int?
    let genres: [String]
    let color: [String]?

    var id: String { albumhash }
    var artistName: String { albumartists.first?.name ?? "Artiste inconnu" }

    static func from(_ o: JSON) -> Album {
        let colors = o["color"].stringArray
        return Album(
            albumhash: o["albumhash"].string(or: ""),
            title: o["title"].string(or: "Album"),
            albumartists: o["albumartists"].array.map(ArtistRef.from),
            image: o["image"].string,
            year: o["year"].int,
            trackcount: o["trackcount"].int,
            genres: o["genres"].stringArray,
            color: colors.isEmpty ? nil : colors
        )
    }
}

struct Artist: Identifiable, Hashable {
    let artisthash: String
    let name: String
    let image: String?
    let trackcount: Int?
    let albumcount: Int?
    let playcount: Int?
    let genres: [String]

    var id: String { artisthash }

    static func from(_ o: JSON) -> Artist {
        Artist(
            artisthash: o["artisthash"].string(or: ""),
            name: o["name"].string(or: "Artiste"),
            image: o["image"].string,
            trackcount: o["trackcount"].int,
            albumcount: o["albumcount"].int,
            playcount: o["playcount"].int,
            genres: o["genres"].stringArray
        )
    }
}

struct PlaylistDto: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let pinned: Bool
    let position: Int
    let trackhashes: [String]
    let imageHash: String?

    static func from(_ o: JSON) -> PlaylistDto {
        PlaylistDto(
            id: o["id"].string(or: ""),
            name: o["name"].string(or: "Playlist"),
            description: o["description"].string,
            pinned: o["pinned"].bool,
            position: o["position"].int ?? 0,
            trackhashes: o["trackhashes"].stringArray,
            imageHash: o["imageHash"].string
        )
    }
}

struct FolderNode: Identifiable, Hashable {
    let name: String
    let path: String
    let trackcount: Int
    let children: [FolderNode]
    var id: String { path }

    static func from(_ o: JSON) -> FolderNode {
        FolderNode(
            name: o["name"].string(or: ""),
            path: o["path"].string(or: ""),
            trackcount: o["trackcount"].int ?? 0,
            children: o["children"].array.map(FolderNode.from)
        )
    }
}

struct LibrarySnapshot {
    let tracks: [Track]
    let albums: [Album]
    let artists: [Artist]
    let folders: [FolderNode]
    let root: String?
    let scannedAt: String?
    let error: String?

    static let empty = LibrarySnapshot(tracks: [], albums: [], artists: [], folders: [], root: nil, scannedAt: nil, error: nil)

    static func from(_ o: JSON) -> LibrarySnapshot {
        LibrarySnapshot(
            tracks: o["tracks"].array.map(Track.from),
            albums: o["albums"].array.map(Album.from),
            artists: o["artists"].array.map(Artist.from),
            folders: o["folders"].array.map(FolderNode.from),
            root: o["root"].string,
            scannedAt: o["scannedAt"].string,
            error: o["error"].string
        )
    }
}

struct UserState {
    var favorites: Set<String>
    var dislikes: Set<String>
    var playCounts: [String: Int]
    var recents: [String]
    var playlists: [PlaylistDto]
    var settings: [String: String]

    static let empty = UserState(favorites: [], dislikes: [], playCounts: [:], recents: [], playlists: [], settings: [:])

    static func from(_ o: JSON) -> UserState {
        var pc: [String: Int] = [:]
        for (k, v) in o["playCounts"].dictionary { pc[k] = v.int ?? 0 }
        var settings: [String: String] = [:]
        for (k, v) in o["settings"].dictionary where v.exists {
            if let s = v.string { settings[k] = s }
            else if let i = v.int { settings[k] = String(i) }
            else if let b = v.raw as? Bool { settings[k] = b ? "true" : "false" }
        }
        return UserState(
            favorites: Set(o["favorites"].stringArray),
            dislikes: Set(o["dislikes"].stringArray),
            playCounts: pc,
            recents: o["recents"].stringArray,
            playlists: o["playlists"].array.map(PlaylistDto.from),
            settings: settings
        )
    }
}

struct RecoTrack {
    let trackhash: String
    let reason: String
    static func from(_ o: JSON) -> RecoTrack {
        RecoTrack(trackhash: o["trackhash"].string(or: ""), reason: o["reason"].string(or: "Recommandé pour vous"))
    }
}

struct RecommendResult {
    let forYou: [RecoTrack]
    static let empty = RecommendResult(forYou: [])
    static func from(_ o: JSON) -> RecommendResult {
        RecommendResult(forYou: o["forYou"].array.map(RecoTrack.from))
    }
}

struct ListeningStats {
    let totalPlays: Int
    let todayPlays: Int
    let weekPlays: Int
    let streak: Int
    let totalListeningSeconds: Int64

    static let empty = ListeningStats(totalPlays: 0, todayPlays: 0, weekPlays: 0, streak: 0, totalListeningSeconds: 0)

    static func from(_ o: JSON) -> ListeningStats {
        ListeningStats(
            totalPlays: o["totalPlays"].int ?? 0,
            todayPlays: o["todayPlays"].int ?? 0,
            weekPlays: o["weekPlays"].int ?? 0,
            streak: o["streak"].int ?? 0,
            totalListeningSeconds: o["totalListeningSeconds"].int64 ?? 0
        )
    }
}

struct LyricsWord: Hashable { let time: Double; let text: String }
struct LyricsLine: Identifiable, Hashable {
    let id = UUID()
    let time: Double
    let text: String
    let words: [LyricsWord]
}

struct LyricsResult {
    let status: String   // found | instrumental | notfound
    let synced: Bool
    let lines: [LyricsLine]
    let plain: String?

    var isSynced: Bool { synced && (lines.count > 1 || lines.contains { $0.time > 0 }) }
    static let none = LyricsResult(status: "notfound", synced: false, lines: [], plain: nil)

    static func from(_ o: JSON) -> LyricsResult {
        let lines = o["lines"].array.map { ln in
            LyricsLine(
                time: ln["time"].double ?? 0,
                text: ln["text"].string(or: ""),
                words: ln["words"].array.map { LyricsWord(time: $0["time"].double ?? 0, text: $0["text"].string(or: "")) }
            )
        }
        return LyricsResult(
            status: o["status"].string(or: "notfound"),
            synced: o["synced"].bool,
            lines: lines,
            plain: o["plain"].string
        )
    }
}

struct SearchResult {
    let tracks: [Track]
    let albums: [Album]
    let artists: [Artist]
    static let empty = SearchResult(tracks: [], albums: [], artists: [])
    static func from(_ o: JSON) -> SearchResult {
        SearchResult(
            tracks: o["tracks"].array.map(Track.from),
            albums: o["albums"].array.map(Album.from),
            artists: o["artists"].array.map(Artist.from)
        )
    }
}

struct AuthResult {
    let ok: Bool
    let token: String?
    let username: String?
    let isAdmin: Bool
    let defaultPassword: Bool
    let error: String?
}

// ---- monthly mood recap ----------------------------------------------------

struct MoodShare: Identifiable { let mood: String; let share: Double; let plays: Int; var id: String { mood } }

struct MonthlyRecap {
    let month: String
    let label: String
    let inProgress: Bool
    let totalPlays: Int
    let distinctTracks: Int
    let moodWord: String?
    let dominantMood: String?
    let moods: [MoodShare]
    let narrative: String

    static func from(_ o: JSON) -> MonthlyRecap {
        MonthlyRecap(
            month: o["month"].string(or: ""),
            label: o["label"].string(or: ""),
            inProgress: o["inProgress"].bool,
            totalPlays: o["totalPlays"].int ?? 0,
            distinctTracks: o["distinctTracks"].int ?? 0,
            moodWord: o["moodWord"].string,
            dominantMood: o["dominantMood"].string,
            moods: o["moods"].array.map { MoodShare(mood: $0["mood"].string(or: ""), share: $0["share"].double ?? 0, plays: $0["plays"].int ?? 0) },
            narrative: o["narrative"].string(or: "")
        )
    }
}

struct RecapResult {
    let months: [String]
    let recap: MonthlyRecap?
    static let empty = RecapResult(months: [], recap: nil)
    static func from(_ o: JSON) -> RecapResult {
        RecapResult(months: o["months"].stringArray, recap: o["recap"].exists ? MonthlyRecap.from(o["recap"]) : nil)
    }
}

// ---- admin: user management ------------------------------------------------

struct UserRow: Identifiable {
    let id: Int
    let username: String
    let isAdmin: Bool
    static func from(_ o: JSON) -> UserRow {
        UserRow(id: o["id"].int ?? 0, username: o["username"].string(or: ""), isAdmin: o["isAdmin"].bool)
    }
}

/// A mood's French label + colours, mirroring src/lib/auralis/mood.ts.
struct MoodInfo { let label: String; let hexes: [String] }
enum Moods {
    static let byId: [String: MoodInfo] = [
        "energetic": MoodInfo(label: "Énergie", hexes: ["#ef4444", "#f97316"]),
        "party": MoodInfo(label: "Fête", hexes: ["#db2777", "#a855f7"]),
        "happy": MoodInfo(label: "Bonne humeur", hexes: ["#f59e0b", "#fde047"]),
        "focus": MoodInfo(label: "Concentration", hexes: ["#0d9488", "#10b981"]),
        "chill": MoodInfo(label: "Détente", hexes: ["#0ea5e9", "#22d3ee"]),
        "melancholy": MoodInfo(label: "Mélancolie", hexes: ["#6366f1", "#8b5cf6"]),
    ]
}
