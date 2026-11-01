package local.auralis.client.model

import local.auralis.client.i18n.Messages
import org.json.JSONArray
import org.json.JSONObject

// Plain Kotlin mirrors of the Auralis server's JSON wire shapes. Parsing is done
// with android's built-in org.json (no kotlinx-serialization compiler plugin, which
// keeps the offline build dependency-free). Every nullable wire field is nullable here.

// ---- small JSON helpers ----------------------------------------------------

internal fun JSONObject.str(key: String): String? =
    if (isNull(key)) null else optString(key, null)

internal fun JSONObject.strOr(key: String, fallback: String): String =
    if (isNull(key)) fallback else optString(key, fallback)

internal fun JSONObject.intOrNull(key: String): Int? =
    if (has(key) && !isNull(key)) optInt(key) else null

internal fun JSONObject.longOrNull(key: String): Long? =
    if (has(key) && !isNull(key)) optLong(key) else null

internal fun JSONObject.doubleOrNull(key: String): Double? =
    if (has(key) && !isNull(key)) optDouble(key) else null

internal fun JSONObject.boolOr(key: String, fallback: Boolean): Boolean =
    if (has(key) && !isNull(key)) optBoolean(key, fallback) else fallback

internal fun JSONArray.objects(): List<JSONObject> =
    (0 until length()).mapNotNull { optJSONObject(it) }

internal fun JSONArray.strings(): List<String> =
    (0 until length()).mapNotNull { if (isNull(it)) null else optString(it) }

internal fun JSONObject.stringArray(key: String): List<String> =
    optJSONArray(key)?.strings() ?: emptyList()

// ---- core entities ---------------------------------------------------------

data class ArtistRef(val artisthash: String, val name: String) {
    companion object {
        fun from(o: JSONObject) = ArtistRef(
            artisthash = o.strOr("artisthash", ""),
            name = o.strOr("name", ""),
        )
    }
}

data class Track(
    val trackhash: String,
    val title: String,
    val artist: String?,
    val album: String?,
    val albumhash: String?,
    val duration: Double?,
    val filepath: String?,
    val folder: String?,
    val image: String?,
    val isFavorite: Boolean,
    val playcount: Int,
    val disc: Int?,
    val track: Int?,
    val year: Int?,
    val genre: String?,
    /** Mood id from the server's audio-analysis classifier (see Moods). */
    val mood: String?,
    /** 0..1 RMS loudness/energy from analysis. */
    val energy: Double?,
    val bpm: Double?,
    /** ReplayGain-style gain in dB toward −14 dBFS (drives volume normalization). */
    val gain: Double?,
    val bitrate: Int?,
    val samplerate: Int?,
    val codec: String?,
    val lossless: Boolean,
    val size: Long?,
    val hasLyrics: Boolean,
    val addedAt: Long?,
    val color: List<String>?,
    val artists: List<ArtistRef>,
) {
    val displayArtist: String
        get() = artist ?: artists.firstOrNull()?.name ?: Messages.t("common.unknownArtist")

    val primaryArtistHash: String?
        get() = artists.firstOrNull()?.artisthash

    companion object {
        fun from(o: JSONObject): Track {
            val colors = o.optJSONArray("color")?.strings()?.takeIf { it.isNotEmpty() }
            return Track(
                trackhash = o.strOr("trackhash", ""),
                title = o.strOr("title", Messages.t("common.unknownTitle")),
                artist = o.str("artist"),
                album = o.str("album"),
                albumhash = o.str("albumhash"),
                duration = o.doubleOrNull("duration"),
                filepath = o.str("filepath"),
                folder = o.str("folder"),
                image = o.str("image"),
                isFavorite = o.boolOr("is_favorite", false),
                playcount = o.intOrNull("playcount") ?: 0,
                disc = o.intOrNull("disc"),
                track = o.intOrNull("track"),
                year = o.intOrNull("year"),
                genre = o.str("genre"),
                mood = o.str("mood"),
                energy = o.doubleOrNull("energy"),
                bpm = o.doubleOrNull("bpm"),
                gain = o.doubleOrNull("gain"),
                bitrate = o.intOrNull("bitrate"),
                samplerate = o.intOrNull("samplerate"),
                codec = o.str("codec"),
                lossless = o.boolOr("lossless", false),
                size = o.longOrNull("size"),
                hasLyrics = o.boolOr("hasLyrics", false),
                addedAt = o.longOrNull("addedAt"),
                color = colors,
                artists = o.optJSONArray("artists")?.objects()?.map { ArtistRef.from(it) } ?: emptyList(),
            )
        }
    }
}

data class Album(
    val albumhash: String,
    val title: String,
    val albumartists: List<ArtistRef>,
    val image: String?,
    val year: Int?,
    val trackcount: Int?,
    val duration: Double?,
    val genres: List<String>,
    val color: List<String>?,
) {
    val artistName: String get() = albumartists.firstOrNull()?.name ?: Messages.t("common.unknownArtist")

    companion object {
        fun from(o: JSONObject) = Album(
            albumhash = o.strOr("albumhash", ""),
            title = o.strOr("title", "Album"),
            albumartists = o.optJSONArray("albumartists")?.objects()?.map { ArtistRef.from(it) } ?: emptyList(),
            image = o.str("image"),
            year = o.intOrNull("year"),
            trackcount = o.intOrNull("trackcount"),
            duration = o.doubleOrNull("duration"),
            genres = o.stringArray("genres"),
            color = o.optJSONArray("color")?.strings()?.takeIf { it.isNotEmpty() },
        )
    }
}

data class Artist(
    val artisthash: String,
    val name: String,
    val image: String?,
    val trackcount: Int?,
    val albumcount: Int?,
    val playcount: Int?,
    val genres: List<String>,
) {
    companion object {
        fun from(o: JSONObject) = Artist(
            artisthash = o.strOr("artisthash", ""),
            name = o.strOr("name", Messages.t("common.artistLabel")),
            image = o.str("image"),
            trackcount = o.intOrNull("trackcount"),
            albumcount = o.intOrNull("albumcount"),
            playcount = o.intOrNull("playcount"),
            genres = o.stringArray("genres"),
        )
    }
}

data class FolderNode(
    val name: String,
    val path: String,
    val trackcount: Int,
    val children: List<FolderNode>,
) {
    companion object {
        fun from(o: JSONObject): FolderNode = FolderNode(
            name = o.strOr("name", ""),
            path = o.strOr("path", ""),
            trackcount = o.intOrNull("trackcount") ?: 0,
            children = o.optJSONArray("children")?.objects()?.map { from(it) } ?: emptyList(),
        )
    }
}

data class PlaylistDto(
    val id: String,
    val name: String,
    val description: String?,
    val pinned: Boolean,
    val position: Int,
    val trackhashes: List<String>,
    /** Content-hash into the shared art cache (server art.ts); null = no custom cover. */
    val imageHash: String? = null,
    /** JSON-encoded SmartConfig for dynamic playlists; null for static ones. */
    val rules: String? = null,
    /** Owner marked this playlist shared/collaborative. */
    val shared: Boolean = false,
    /** Belongs to ANOTHER user who shared it: read + append, never rename/delete. */
    val collaborator: Boolean = false,
    /** Owner's username (only set on collaborator playlists, for the "de X" label). */
    val owner: String? = null,
) {
    val isSmart: Boolean get() = rules != null

    companion object {
        fun from(o: JSONObject) = PlaylistDto(
            id = o.strOr("id", ""),
            name = o.strOr("name", "Playlist"),
            description = o.str("description"),
            pinned = o.boolOr("pinned", false),
            position = o.intOrNull("position") ?: 0,
            trackhashes = o.stringArray("trackhashes"),
            imageHash = o.str("imageHash"),
            rules = o.str("rules"),
            shared = o.boolOr("shared", false),
            collaborator = o.boolOr("collaborator", false),
            owner = o.str("owner"),
        )
    }
}

// ---- aggregates ------------------------------------------------------------

/** The `scan` progress object carried by /api/library (web ScanProgress, scanner.ts):
 *  live scan progress plus the background mood-analysis progress that follows it. */
data class ScanProgress(
    val status: String, // idle | scanning | ready | error
    val phase: String,
    val processed: Int,
    val total: Int,
    val scannedAt: String?,
    val error: String?,
    val analyzing: Boolean,
    val analyzed: Int,
    val analyzeTotal: Int,
) {
    companion object {
        val IDLE = ScanProgress("idle", "idle", 0, 0, null, null, false, 0, 0)

        fun from(o: JSONObject) = ScanProgress(
            status = o.strOr("status", "idle"),
            phase = o.strOr("phase", "idle"),
            processed = o.intOrNull("processed") ?: 0,
            total = o.intOrNull("total") ?: 0,
            scannedAt = o.str("scannedAt"),
            error = o.str("error"),
            analyzing = o.boolOr("analyzing", false),
            analyzed = o.intOrNull("analyzed") ?: 0,
            analyzeTotal = o.intOrNull("analyzeTotal") ?: 0,
        )
    }
}

data class LibrarySnapshot(
    val tracks: List<Track>,
    val albums: List<Album>,
    val artists: List<Artist>,
    val folders: List<FolderNode>,
    val root: String?,
    val scannedAt: String?,
    val error: String?,
    /** Live scan/mood-analysis progress (`scan` object); IDLE on older servers. */
    val scan: ScanProgress = ScanProgress.IDLE,
) {
    companion object {
        fun from(o: JSONObject) = LibrarySnapshot(
            tracks = o.optJSONArray("tracks")?.objects()?.map { Track.from(it) } ?: emptyList(),
            albums = o.optJSONArray("albums")?.objects()?.map { Album.from(it) } ?: emptyList(),
            artists = o.optJSONArray("artists")?.objects()?.map { Artist.from(it) } ?: emptyList(),
            folders = o.optJSONArray("folders")?.objects()?.map { FolderNode.from(it) } ?: emptyList(),
            root = o.str("root"),
            scannedAt = o.str("scannedAt"),
            error = o.str("error"),
            scan = o.optJSONObject("scan")?.let { ScanProgress.from(it) } ?: ScanProgress.IDLE,
        )
    }
}

data class UserState(
    val favorites: List<String>,
    val dislikes: List<String>,
    val playCounts: Map<String, Int>,
    val recents: List<String>,
    val playlists: List<PlaylistDto>,
    val settings: Map<String, String>,
) {
    companion object {
        fun from(o: JSONObject): UserState {
            val pc = HashMap<String, Int>()
            o.optJSONObject("playCounts")?.let { pcObj ->
                pcObj.keys().forEach { k -> pc[k] = pcObj.optInt(k) }
            }
            val settings = HashMap<String, String>()
            o.optJSONObject("settings")?.let { s ->
                s.keys().forEach { k -> if (!s.isNull(k)) settings[k] = s.get(k).toString() }
            }
            return UserState(
                favorites = o.stringArray("favorites"),
                dislikes = o.stringArray("dislikes"),
                playCounts = pc,
                recents = o.stringArray("recents"),
                playlists = o.optJSONArray("playlists")?.objects()?.map { PlaylistDto.from(it) } ?: emptyList(),
                settings = settings,
            )
        }
    }
}

// ---- recommendations + monthly mood recap ----------------------------------

data class RecoTrack(val trackhash: String, val score: Double, val reason: String) {
    companion object {
        fun from(o: JSONObject) = RecoTrack(
            trackhash = o.strOr("trackhash", ""),
            score = o.doubleOrNull("score") ?: 0.0,
            reason = o.strOr("reason", Messages.t("home.recommendedForYou")),
        )
    }
}

/** One mood's signed taste weight from the reco profile (web MoodAffinity). */
data class MoodAffinity(val mood: String, val weight: Double)

data class RecommendResult(
    val forYou: List<RecoTrack>,
    val disliked: List<String>,
    /** Moods sorted by how much the user gravitates to (positive weight) / rejects
     *  (negative) them — drives the "Pour votre humeur" home shelf. */
    val moods: List<MoodAffinity> = emptyList(),
) {
    companion object {
        val EMPTY = RecommendResult(emptyList(), emptyList())
        fun from(o: JSONObject) = RecommendResult(
            forYou = o.optJSONArray("forYou")?.objects()?.map { RecoTrack.from(it) } ?: emptyList(),
            disliked = o.optJSONObject("profile")?.stringArray("disliked") ?: emptyList(),
            moods = o.optJSONObject("profile")?.optJSONArray("moods")?.objects()?.map {
                MoodAffinity(it.strOr("mood", ""), it.doubleOrNull("weight") ?: 0.0)
            } ?: emptyList(),
        )
    }
}

/** Household Blend response `?blend=<user>`: the shared mix + a 0..100 match score. */
data class BlendResult(val username: String, val forYou: List<RecoTrack>, val match: Int) {
    companion object {
        val EMPTY = BlendResult("", emptyList(), 0)
        fun from(o: JSONObject) = BlendResult(
            username = o.strOr("blend", ""),
            forYou = o.optJSONArray("forYou")?.objects()?.map { RecoTrack.from(it) } ?: emptyList(),
            match = o.intOrNull("match") ?: 0,
        )
    }
}

/** One other account offered on the "Blend du foyer" shelf (its mix + match score). */
data class BlendMember(val username: String, val match: Int, val tracks: List<Track>)

data class MoodShare(val mood: String, val share: Double, val plays: Int)
data class RecapTrackRef(val trackhash: String, val plays: Int)
data class RecapArtistRef(val artisthash: String, val name: String, val plays: Int)

data class MonthlyRecap(
    val month: String,
    val label: String,
    val inProgress: Boolean,
    val totalPlays: Int,
    val listeningSeconds: Long,
    val distinctTracks: Int,
    val dominantMood: String?,
    val moodWord: String?,
    val arousal: Double,
    val valence: Double,
    val moods: List<MoodShare>,
    val topTracks: List<RecapTrackRef>,
    val topArtists: List<RecapArtistRef>,
    val narrative: String,
    val previousMood: String?,
) {
    companion object {
        fun from(o: JSONObject) = MonthlyRecap(
            month = o.strOr("month", ""),
            label = o.strOr("label", ""),
            inProgress = o.boolOr("inProgress", false),
            totalPlays = o.intOrNull("totalPlays") ?: 0,
            listeningSeconds = o.longOrNull("listeningSeconds") ?: 0,
            distinctTracks = o.intOrNull("distinctTracks") ?: 0,
            dominantMood = o.str("dominantMood"),
            moodWord = o.str("moodWord"),
            arousal = o.doubleOrNull("arousal") ?: 0.5,
            valence = o.doubleOrNull("valence") ?: 0.5,
            moods = o.optJSONArray("moods")?.objects()?.map {
                MoodShare(it.strOr("mood", ""), it.doubleOrNull("share") ?: 0.0, it.intOrNull("plays") ?: 0)
            } ?: emptyList(),
            topTracks = o.optJSONArray("topTracks")?.objects()?.map {
                RecapTrackRef(it.strOr("trackhash", ""), it.intOrNull("plays") ?: 0)
            } ?: emptyList(),
            topArtists = o.optJSONArray("topArtists")?.objects()?.map {
                RecapArtistRef(it.strOr("artisthash", ""), it.strOr("name", Messages.t("common.artistLabel")), it.intOrNull("plays") ?: 0)
            } ?: emptyList(),
            narrative = o.strOr("narrative", ""),
            previousMood = o.str("previousMood"),
        )
    }
}

data class RecapResult(val months: List<String>, val recap: MonthlyRecap?) {
    companion object {
        val EMPTY = RecapResult(emptyList(), null)
        fun from(o: JSONObject) = RecapResult(
            months = o.stringArray("months"),
            recap = o.optJSONObject("recap")?.let { MonthlyRecap.from(it) },
        )
    }
}

/** The 6 moods, mirroring src/lib/auralis/mood.ts — label/emoji/gradient for the
 *  recap UI plus the genre-keyword heuristic used to bucket unanalysed tracks
 *  (the server classifier's per-track `mood` verdict wins when present). Labels
 *  resolve through the i18n catalogue (web mood.* keys), so they follow the
 *  active locale. */
data class MoodInfo(
    val id: String,
    val emoji: String,
    val c0: String,
    val c1: String,
    /** Lower-case genre substrings that map a track into this mood. */
    val keywords: List<String> = emptyList(),
) {
    /** Localized mood name (web "mood.<id>" catalogue key). */
    val label: String get() = Messages.t("mood.$id")
}

object Moods {
    // Order matters: the first mood with a matching keyword wins, so the more
    // specific buckets (party/focus) are listed before the broad ones.
    val ALL = listOf(
        MoodInfo("energetic", "⚡️", "#ef4444", "#f97316",
            listOf("metal", "punk", "hardcore", "hard rock", "rock", "edm", "electro", "electronic",
                "house", "techno", "trance", "drum and bass", "drum & bass", "dnb", "dubstep", "industrial",
                "big room", "power", "thrash", "speed")),
        MoodInfo("party", "🔥", "#db2777", "#a855f7",
            listOf("hip hop", "hip-hop", "rap", "trap", "r&b", "rnb", "reggaeton", "club", "dancehall",
                "grime", "drill", "crunk", "bass", "twerk", "moombahton")),
        MoodInfo("happy", "☀️", "#f59e0b", "#fde047",
            listOf("pop", "funk", "disco", "reggae", "ska", "afro", "afrobeat", "latin", "salsa",
                "tropical", "feel good", "synthpop", "synth-pop", "k-pop", "dance pop")),
        MoodInfo("focus", "🎧", "#0d9488", "#10b981",
            listOf("classical", "instrumental", "piano", "soundtrack", "score", "study", "post-rock",
                "post rock", "cinematic", "orchestra", "orchestral", "baroque", "minimal", "modern classical")),
        MoodInfo("chill", "🌙", "#0ea5e9", "#22d3ee",
            listOf("chill", "lofi", "lo-fi", "ambient", "downtempo", "lounge", "bossa", "easy",
                "mellow", "trip hop", "trip-hop", "new age", "smooth jazz", "chillout", "chill-out")),
        MoodInfo("melancholy", "🌧️", "#6366f1", "#8b5cf6",
            listOf("sad", "blues", "soul", "indie", "emo", "ballad", "slowcore", "melanch",
                "singer-songwriter", "folk", "acoustic", "shoegaze", "dream pop", "jazz")),
    )
    private val BY_ID = ALL.associateBy { it.id }
    fun byId(id: String?): MoodInfo? = id?.let { BY_ID[it] }

    /** Map a raw genre string to a mood id, or null if nothing matches. */
    fun forGenre(genre: String?): String? {
        if (genre.isNullOrBlank()) return null
        val g = genre.lowercase()
        return ALL.firstOrNull { m -> m.keywords.any { g.contains(it) } }?.id
    }

    /** The track's mood: the audio-analysis classifier's verdict when valid, else
     *  the genre heuristic (web moodForTrack). */
    fun forTrack(track: Track): String? =
        if (track.mood != null && BY_ID.containsKey(track.mood)) track.mood else forGenre(track.genre)

    /** Group a library into mood → tracks, dropping tracks whose genre maps nowhere. */
    fun groupByMood(tracks: List<Track>): Map<String, List<Track>> {
        val out = LinkedHashMap<String, MutableList<Track>>()
        for (t in tracks) {
            val id = forTrack(t) ?: continue
            out.getOrPut(id) { mutableListOf() }.add(t)
        }
        return out
    }
}

data class ListeningStats(
    val totalPlays: Int,
    val todayPlays: Int,
    val weekPlays: Int,
    val streak: Int,
    val playsByDay: List<DayCount>,
    val weekListeningSeconds: Long,
    val totalListeningSeconds: Long,
) {
    data class DayCount(val day: String, val count: Int)

    companion object {
        val EMPTY = ListeningStats(0, 0, 0, 0, emptyList(), 0, 0)

        fun from(o: JSONObject) = ListeningStats(
            totalPlays = o.intOrNull("totalPlays") ?: 0,
            todayPlays = o.intOrNull("todayPlays") ?: 0,
            weekPlays = o.intOrNull("weekPlays") ?: 0,
            streak = o.intOrNull("streak") ?: 0,
            playsByDay = o.optJSONArray("playsByDay")?.objects()?.map {
                DayCount(it.strOr("day", ""), it.intOrNull("count") ?: 0)
            } ?: emptyList(),
            weekListeningSeconds = o.longOrNull("weekListeningSeconds") ?: 0,
            totalListeningSeconds = o.longOrNull("totalListeningSeconds") ?: 0,
        )
    }
}

data class LyricsLine(val time: Double, val text: String, val words: List<Word>) {
    data class Word(val time: Double, val text: String)
}

data class LyricsResult(
    val status: String,   // found | instrumental | notfound
    val synced: Boolean,
    val lines: List<LyricsLine>,
    val plain: String?,
    /** Which provider served these lyrics (musixmatch | netease | lrclib | qq |
     *  lyricsovh | sidecar | manual) — shown on the Liner-style source pill. */
    val source: String? = null,
) {
    val isSynced: Boolean get() = synced && (lines.size > 1 || lines.any { it.time > 0 })

    companion object {
        val NONE = LyricsResult("notfound", false, emptyList(), null)

        fun from(o: JSONObject): LyricsResult {
            val lines = o.optJSONArray("lines")?.objects()?.map { ln ->
                LyricsLine(
                    time = ln.doubleOrNull("time") ?: 0.0,
                    text = ln.strOr("text", ""),
                    words = ln.optJSONArray("words")?.objects()?.map { w ->
                        LyricsLine.Word(w.doubleOrNull("time") ?: 0.0, w.strOr("text", ""))
                    } ?: emptyList(),
                )
            } ?: emptyList()
            return LyricsResult(
                status = o.strOr("status", "notfound"),
                synced = o.boolOr("synced", false),
                lines = lines,
                plain = o.str("plain"),
                source = o.str("source"),
            )
        }
    }
}

data class SearchResult(
    val tracks: List<Track>,
    val albums: List<Album>,
    val artists: List<Artist>,
) {
    companion object {
        val EMPTY = SearchResult(emptyList(), emptyList(), emptyList())

        fun from(o: JSONObject): SearchResult = SearchResult(
            tracks = o.optJSONArray("tracks")?.objects()?.map { Track.from(it) } ?: emptyList(),
            albums = o.optJSONArray("albums")?.objects()?.map { Album.from(it) } ?: emptyList(),
            artists = o.optJSONArray("artists")?.objects()?.map { Artist.from(it) } ?: emptyList(),
        )
    }
}

// ---- online (downloadable) search + download jobs ---------------------------

/** A YouTube hit offered for download when the library can't answer the query. */
data class OnlineTrack(
    val videoId: String,
    val title: String,
    val uploader: String,
    val duration: Double,
    val thumbnail: String?,
    val url: String,
) {
    companion object {
        fun from(o: JSONObject): OnlineTrack = OnlineTrack(
            videoId = o.strOr("videoId", ""),
            title = o.strOr("title", ""),
            uploader = o.strOr("uploader", "YouTube"),
            duration = o.doubleOrNull("duration") ?: 0.0,
            thumbnail = o.str("thumbnail"),
            url = o.strOr("url", ""),
        )
    }
}

/** One bulk-download request item (POST /api/download `{ items: [...] }`). */
data class DownloadItem(val query: String, val title: String?)

/** Server-side download job (downloader.ts wire shape). */
data class DownloadJobDto(
    val id: String,
    val status: String, // queued | resolving | downloading | scanning | done | error
    val progress: Int,
    val trackhash: String?,
    val error: String?,
    val title: String?,
) {
    val busy: Boolean get() = status == "queued" || status == "resolving" || status == "downloading" || status == "scanning"

    companion object {
        fun from(o: JSONObject): DownloadJobDto = DownloadJobDto(
            id = o.strOr("id", ""),
            status = o.strOr("status", "error"),
            progress = o.intOrNull("progress") ?: 0,
            trackhash = o.str("trackhash"),
            error = o.str("error"),
            title = o.str("title"),
        )
    }
}

data class AuthResult(
    val ok: Boolean,
    val token: String?,
    val username: String?,
    val isAdmin: Boolean,
    val defaultPassword: Boolean,
    val error: String?,
)
