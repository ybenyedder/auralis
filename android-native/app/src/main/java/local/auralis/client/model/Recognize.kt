package local.auralis.client.model

import local.auralis.client.i18n.Messages
import org.json.JSONObject
import kotlin.math.roundToInt

// "Identifier la musique" (music recognition) wire shapes + pure helpers.
// Mirrors POST /api/recognize (src/app/api/recognize/route.ts) and GET/POST
// /api/library/melody (src/app/api/library/melody/route.ts). Pure Kotlin
// (org.json only) — JVM-unit-testable.

/** One local melody-index match (score is 0..1). */
data class RecognizeLocalMatch(
    val trackhash: String,
    val title: String,
    val artist: String,
    val album: String?,
    val image: String?,
    val duration: Double,
    val score: Double,
) {
    companion object {
        fun from(o: JSONObject) = RecognizeLocalMatch(
            trackhash = o.strOr("trackhash", ""),
            title = o.strOr("title", Messages.t("common.unknownTitle")),
            artist = o.strOr("artist", Messages.t("common.unknownArtist")),
            album = o.str("album"),
            image = o.str("image"),
            duration = o.doubleOrNull("duration") ?: 0.0,
            score = o.doubleOrNull("score") ?: 0.0,
        )
    }
}

/** One global identification: any song in the world, title + artists. The
 *  server runs REAL Shazam first (`source: "shazam"`), ACRCloud appended when
 *  configured (`"humming"` | "music"`). */
data class RecognizeRemoteMatch(
    val title: String,
    val artists: List<String>,
    val score: Double,
    /** "shazam" | "humming" (hummed snippet) | "music" (ambient capture). */
    val source: String,
) {
    /** Download query for "Ajouter à la bibliothèque" ("<artists> <title>"). */
    val query: String get() = remoteQuery(this)

    companion object {
        fun from(o: JSONObject) = RecognizeRemoteMatch(
            title = o.strOr("title", ""),
            artists = o.stringArray("artists"),
            score = o.doubleOrNull("score") ?: 0.0,
            source = o.strOr("source", "humming"),
        )
    }
}

/** POST /api/recognize response (music recognition). */
data class RecognizeResult(
    /** Local engine readiness (ffmpeg + a non-empty melody index). */
    val available: Boolean,
    /** Tracks currently in the melody index. */
    val indexSize: Int,
    val local: List<RecognizeLocalMatch>,
    /** Global-catalog matches, null when unconfigured/unreachable. */
    val remote: List<RecognizeRemoteMatch>?,
    val ffmpeg: Boolean,
    val remoteEnabled: Boolean,
) {
    companion object {
        val EMPTY = RecognizeResult(false, 0, emptyList(), null, false, false)

        fun from(o: JSONObject): RecognizeResult {
            // `remote` is null (not []) when the remote engine is off/unreachable —
            // the distinction drives the results sheet's section visibility.
            val remote = o.optJSONArray("remote")?.let { arr ->
                arr.objects().map { RecognizeRemoteMatch.from(it) }
            }
            return RecognizeResult(
                available = o.boolOr("available", false),
                indexSize = o.intOrNull("indexSize") ?: 0,
                local = o.optJSONArray("local")?.objects()?.map { RecognizeLocalMatch.from(it) } ?: emptyList(),
                remote = remote,
                ffmpeg = o.boolOr("ffmpeg", false),
                remoteEnabled = o.boolOr("remoteEnabled", false),
            )
        }
    }
}

/** GET /api/library/melody — melody-index status (settings "Reconnaissance
 *  audio" card). */
data class MelodyStatus(
    val running: Boolean,
    val indexed: Int,
    val total: Int,
    val ffmpeg: Boolean,
) {
    companion object {
        fun from(o: JSONObject) = MelodyStatus(
            running = o.boolOr("running", false),
            indexed = o.intOrNull("indexed") ?: 0,
            total = o.intOrNull("total") ?: 0,
            ffmpeg = o.boolOr("ffmpeg", false),
        )
    }
}

// ---- pure helpers ----------------------------------------------------------

/** A 0..1 match score as a 0..100 integer percent (clamped, rounded). */
fun scorePercent(score: Double): Int =
    (score.coerceIn(0.0, 1.0) * 100).roundToInt()

/** YouTube search query for a global-catalog match ("<artists> <title>"). */
fun remoteQuery(m: RecognizeRemoteMatch): String =
    (m.artists + m.title).joinToString(" ").trim()
