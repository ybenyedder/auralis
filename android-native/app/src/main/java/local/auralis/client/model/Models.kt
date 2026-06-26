package local.auralis.client.model

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
    val bitrate: Int?,
    val codec: String?,
    val lossless: Boolean,
    val size: Long?,
    val hasLyrics: Boolean,
    val addedAt: Long?,
    val color: List<String>?,
    val artists: List<ArtistRef>,
) {
    val displayArtist: String
        get() = artist ?: artists.firstOrNull()?.name ?: "Artiste inconnu"

    val primaryArtistHash: String?
        get() = artists.firstOrNull()?.artisthash

    companion object {
        fun from(o: JSONObject): Track {
            val colors = o.optJSONArray("color")?.strings()?.takeIf { it.isNotEmpty() }
            return Track(
                trackhash = o.strOr("trackhash", ""),
                title = o.strOr("title", "Sans titre"),
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
                bitrate = o.intOrNull("bitrate"),
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
    val artistName: String get() = albumartists.firstOrNull()?.name ?: "Artiste inconnu"

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
            name = o.strOr("name", "Artiste"),
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
) {
    companion object {
        fun from(o: JSONObject) = PlaylistDto(
            id = o.strOr("id", ""),
            name = o.strOr("name", "Playlist"),
            description = o.str("description"),
            pinned = o.boolOr("pinned", false),
            position = o.intOrNull("position") ?: 0,
            trackhashes = o.stringArray("trackhashes"),
        )
    }
}

// ---- aggregates ------------------------------------------------------------

data class LibrarySnapshot(
    val tracks: List<Track>,
    val albums: List<Album>,
    val artists: List<Artist>,
    val folders: List<FolderNode>,
    val root: String?,
    val scannedAt: String?,
    val error: String?,
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
            reason = o.strOr("reason", "Recommandé pour vous"),
        )
    }
}

data class RecommendResult(
    val forYou: List<RecoTrack>,
    val disliked: List<String>,
) {
    companion object {
        val EMPTY = RecommendResult(emptyList(), emptyList())
        fun from(o: JSONObject) = RecommendResult(
            forYou = o.optJSONArray("forYou")?.objects()?.map { RecoTrack.from(it) } ?: emptyList(),
            disliked = o.optJSONObject("profile")?.stringArray("disliked") ?: emptyList(),
        )
    }
}

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
                RecapArtistRef(it.strOr("artisthash", ""), it.strOr("name", "Artiste"), it.intOrNull("plays") ?: 0)
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
 *  recap UI (the native client doesn't carry per-track mood, the server does). */
data class MoodInfo(val id: String, val label: String, val emoji: String, val c0: String, val c1: String)

object Moods {
    private val ALL = listOf(
        MoodInfo("energetic", "Énergie", "⚡️", "#ef4444", "#f97316"),
        MoodInfo("party", "Fête", "🔥", "#db2777", "#a855f7"),
        MoodInfo("happy", "Bonne humeur", "☀️", "#f59e0b", "#fde047"),
        MoodInfo("focus", "Concentration", "🎧", "#0d9488", "#10b981"),
        MoodInfo("chill", "Détente", "🌙", "#0ea5e9", "#22d3ee"),
        MoodInfo("melancholy", "Mélancolie", "🌧️", "#6366f1", "#8b5cf6"),
    )
    private val BY_ID = ALL.associateBy { it.id }
    fun byId(id: String?): MoodInfo? = id?.let { BY_ID[it] }
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

        fun from(o: JSONObject) = SearchResult(
            tracks = o.optJSONArray("tracks")?.objects()?.map { Track.from(it) } ?: emptyList(),
            albums = o.optJSONArray("albums")?.objects()?.map { Album.from(it) } ?: emptyList(),
            artists = o.optJSONArray("artists")?.objects()?.map { Artist.from(it) } ?: emptyList(),
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
