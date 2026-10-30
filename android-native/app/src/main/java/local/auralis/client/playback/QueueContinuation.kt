package local.auralis.client.playback

import local.auralis.client.model.Track
import kotlin.random.Random

// Queue-source constraint for endless autoplay (pure Kotlin, JVM-testable).
//
// The queue continuation used to always rank the WHOLE library around the
// current track, so a session seeded from the liked tracks (or a playlist)
// drifted off into recommendation tracks nobody asked for. A session now
// carries the SOURCE it was seeded from, and the continuation honours it:
// FAVORITES/PLAYLIST sessions only ever grow inside their seeded set — and
// simply end when that set is exhausted — while LIBRARY sessions keep the
// original radio-pool behaviour.

/** Where the current queue was seeded from — carried in playback state and
 *  persisted with the last session so a restored queue continues correctly. */
sealed class QueueSource {

    /** Whole-library session (search, album/artist, mixes…): unconstrained. */
    object Library : QueueSource()

    /** Session seeded from the liked-tracks set — only liked tracks may follow. */
    data class Favorites(val trackhashes: Set<String>) : QueueSource()

    /** Session seeded from one playlist — only its tracks may follow. */
    data class Playlist(val id: String, val trackhashes: Set<String>) : QueueSource()

    /** The trackhashes the continuation may draw from; null = unconstrained. */
    fun allowedHashes(): Set<String>? = when (this) {
        is Library -> null
        is Favorites -> trackhashes
        is Playlist -> trackhashes
    }

    /** Persistable tag ("library" | "favorites" | "playlist:<id>"). */
    fun tag(): String = when (this) {
        is Library -> TAG_LIBRARY
        is Favorites -> TAG_FAVORITES
        is Playlist -> "$TAG_PLAYLIST$id"
    }

    companion object {
        const val TAG_LIBRARY = "library"
        const val TAG_FAVORITES = "favorites"
        const val TAG_PLAYLIST = "playlist:"

        /** Rebuild a source from its persisted tag. Unknown/dangling references
         *  (deleted playlist, cleared session) fall back to [Library] — an
         *  unconstrained continuation is the safe default. */
        fun fromTag(tag: String, favorites: Set<String>, playlists: Map<String, List<String>>): QueueSource = when {
            tag == TAG_FAVORITES -> Favorites(favorites)
            tag.startsWith(TAG_PLAYLIST) -> {
                val id = tag.removePrefix(TAG_PLAYLIST)
                val hashes = playlists[id]
                if (hashes != null) Playlist(id, hashes.toSet()) else Library
            }
            else -> Library
        }
    }
}

/** The endless-autoplay picker: the pure part of PlaybackAccounting's queue
 *  continuation (see appendContinuation there for the MediaController side). */
object QueueContinuation {

    /** Tracks appended per continuation. */
    const val BATCH = 20

    /**
     * The next batch to append at the queue tail, constrained by [source].
     *
     * FAVORITES / PLAYLIST: a shuffled draw from the seeded set ONLY — minus the
     * current track, what is already queued and dislikes. Empty once the set is
     * exhausted: the queue then simply ends, never a track outside the set.
     *
     * LIBRARY: the radio-pool ranking — prefer never-played tracks close to the
     * current vibe, fall back to least-played, recycle rather than stop dead.
     * Empty when nothing is eligible (the caller may then recycle the queue's
     * own items — still never outside the set, since the queue IS the set).
     */
    fun plan(
        source: QueueSource,
        current: Track?,
        tracksById: Map<String, Track>,
        queued: Set<String>,
        dislikes: Set<String>,
        counts: Map<String, Int> = emptyMap(),
        scores: Map<String, Double> = emptyMap(),
        random: Random = Random.Default,
    ): List<Track> {
        val allowed = source.allowedHashes()
        return if (allowed != null) {
            constrainedCandidates(allowed, tracksById, queued, dislikes, current?.trackhash, random)
        } else if (current != null) {
            rankLibrary(current, tracksById.values.toList(), queued, dislikes, counts, scores, random)
        } else {
            emptyList()
        }
    }

    /** Shuffled candidates from [allowed] only — never anything outside the set. */
    fun constrainedCandidates(
        allowed: Set<String>,
        tracksById: Map<String, Track>,
        queued: Set<String>,
        dislikes: Set<String>,
        currentId: String?,
        random: Random = Random.Default,
    ): List<Track> {
        val pool = allowed
            .mapNotNull { tracksById[it] }
            .filter { it.trackhash !in queued && it.trackhash !in dislikes && it.trackhash != currentId }
        return pool.shuffled(random).take(BATCH)
    }

    /** Radio-pool ranking (PlaybackAccounting.rankContinuation semantics):
     *  prefer never-played tracks close to the current vibe; once everything
     *  eligible has been heard, fall back to least-played first (a light
     *  taste-score jitter breaks ties), then shuffled so consecutive appends
     *  don't march the same list. */
    fun rankLibrary(
        current: Track,
        tracks: List<Track>,
        queued: Set<String>,
        dislikes: Set<String>,
        counts: Map<String, Int>,
        scores: Map<String, Double>,
        random: Random = Random.Default,
    ): List<Track> {
        fun eligible(t: Track) = t.trackhash !in queued && t.trackhash !in dislikes
        fun close(t: Track) =
            (t.primaryArtistHash != null && t.primaryArtistHash == current.primaryArtistHash) ||
                (t.genre != null && t.genre == current.genre)
        val never = tracks.filter { eligible(it) && (counts[it.trackhash] ?: 0) == 0 }
        return when {
            never.isNotEmpty() -> {
                val closeNever = never.filter { close(it) }
                val pick = if (closeNever.size >= 10) closeNever else never
                pick.shuffled(random).take(BATCH)
            }
            else -> {
                val fresh = tracks.filter { eligible(it) }
                if (fresh.isNotEmpty()) {
                    fresh.sortedWith(
                        compareBy({ counts[it.trackhash] ?: 0 }, { -(scores[it.trackhash] ?: 0.0) }),
                    ).take(40).shuffled(random).take(BATCH)
                } else {
                    tracks.filter { it.trackhash != current.trackhash && it.trackhash !in dislikes }
                        .shuffled(random).take(BATCH)
                }
            }
        }
    }
}
