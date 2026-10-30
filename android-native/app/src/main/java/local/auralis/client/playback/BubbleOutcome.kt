package local.auralis.client.playback

import local.auralis.client.model.RecognizeResult
import java.text.Normalizer

// Pure result → notification/action mapping for the Shazam bubble. The service
// (playback/ShazamBubbleService.kt) turns a POST /api/recognize verdict into one
// of these outcomes; each outcome knows its notification message KEY + params so
// the text follows a live language switch (same pattern as humError keys).
// No Android imports — JVM-unit-testable.

sealed class BubbleOutcome {

    /** Catalogue key of the notification text for this outcome. */
    abstract val messageKey: String

    /** `{name}` params for [messageKey]. */
    abstract fun messageParams(): Map<String, Any>

    /** A global-catalog hit (REAL Shazam) not yet in the library — the service
     *  auto-adds it, then posts this outcome's message ("Ajouté à ta
     *  bibliothèque : {title} — {artist}"). */
    data class RemoteFound(val title: String, val artists: List<String>, val query: String) : BubbleOutcome() {
        override val messageKey = "bubble.notif.added"
        override fun messageParams(): Map<String, Any> = mapOf(
            "title" to title,
            "artist" to artists.joinToString(", "),
        )
    }

    /** The identified song is ALREADY in the local melody-index matches — say
     *  "Dans ta bibliothèque : {title}" and offer play/queue (no download). */
    data class LocalFound(val title: String, val artist: String, val trackhash: String) : BubbleOutcome() {
        override val messageKey = "bubble.notif.inLibrary"
        override fun messageParams(): Map<String, Any> = mapOf("title" to title)
    }

    /** Capture succeeded but nothing matched — "Rien d'identifié — réessaie". */
    object NotFound : BubbleOutcome() {
        override val messageKey = "bubble.notif.notFound"
        override fun messageParams(): Map<String, Any> = emptyMap()
    }

    /** The capture/upload itself failed ("Impossible de capturer l'audio"). */
    object Failed : BubbleOutcome() {
        override val messageKey = "bubble.failed"
        override fun messageParams(): Map<String, Any> = emptyMap()
    }

    companion object {

        /**
         * Map a recognition verdict to the bubble's outcome. A global-catalog
         * (remote) match is the star: it wins UNLESS the same song is already in
         * the library (`local`) — then we report the local match instead of
         * downloading a duplicate.
         */
        fun from(result: RecognizeResult): BubbleOutcome {
            val remoteBest = result.remote.orEmpty()
                .filter { it.title.isNotBlank() }
                .maxByOrNull { it.score }
            val localBest = result.local
                .filter { it.title.isNotBlank() }
                .maxByOrNull { it.score }
            if (remoteBest == null) {
                return if (localBest == null) NotFound
                else LocalFound(localBest.title, localBest.artist, localBest.trackhash)
            }
            val inLibrary = result.local.firstOrNull { sameTitle(it.title, remoteBest.title) }
            return if (inLibrary != null) {
                LocalFound(inLibrary.title, inLibrary.artist, inLibrary.trackhash)
            } else {
                RemoteFound(remoteBest.title, remoteBest.artists, remoteBest.query)
            }
        }

        /** Title equality ignoring case, diacritics, punctuation and spacing. */
        fun sameTitle(a: String, b: String): Boolean {
            val na = normalizeTitle(a)
            return na.isNotEmpty() && na == normalizeTitle(b)
        }

        /** "L'Été indien" ≈ "lete indien" ≈ "L'Été  Indien!" — folded to a bare
         *  lowercase alphanumeric run for cross-engine title matching. */
        fun normalizeTitle(s: String): String =
            Normalizer.normalize(s, Normalizer.Form.NFD)
                .replace(Regex("\\p{M}"), "")
                .lowercase()
                .replace(Regex("[^a-z0-9]"), "")
    }
}
