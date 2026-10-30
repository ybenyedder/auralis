package local.auralis.client.playback

import local.auralis.client.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

/**
 * JVM unit tests for the queue-source constraint of endless autoplay
 * (playback/QueueContinuation.kt): a session seeded from the liked set or a
 * playlist NEVER grows outside that set — the continuation draws from it
 * shuffled, or stops when it is exhausted.
 */
class QueueContinuationTest {

    private fun track(hash: String, artistHash: String? = null, genre: String? = null) = Track(
        trackhash = hash, title = hash, artist = null, album = null, albumhash = null,
        duration = null, filepath = null, folder = null, image = null, isFavorite = false,
        playcount = 0, disc = null, track = null, year = null, genre = genre, mood = null,
        energy = null, bpm = null, gain = null, bitrate = null, samplerate = null,
        codec = null, lossless = false, size = null, hasLyrics = false, addedAt = null,
        color = null, artists = emptyList(),
    )

    private fun library(vararg hashes: String): Map<String, Track> =
        hashes.associateWith { track(it) }

    // ---- QueueSource tags (session persistence) ----------------------------

    @Test
    fun `source tags round-trip`() {
        val favorites = setOf("a", "b")
        val playlists = mapOf("p1" to listOf("x", "y"))
        assertEquals(QueueSource.Library, QueueSource.fromTag("library", favorites, playlists))
        assertEquals(
            QueueSource.Favorites(favorites),
            QueueSource.fromTag(QueueSource.Favorites(favorites).tag(), favorites, playlists),
        )
        val pl = QueueSource.Playlist("p1", setOf("x", "y"))
        assertEquals(pl, QueueSource.fromTag(pl.tag(), favorites, playlists))
        assertEquals("playlist:p1", pl.tag())
    }

    @Test
    fun `dangling or unknown source tags degrade to unconstrained library`() {
        assertEquals(
            QueueSource.Library,
            QueueSource.fromTag("playlist:deleted", emptySet(), emptyMap()),
        )
        assertEquals(QueueSource.Library, QueueSource.fromTag("garbage", emptySet(), emptyMap()))
    }

    @Test
    fun `allowed hashes are null for library and the seeded set otherwise`() {
        assertEquals(null, QueueSource.Library.allowedHashes())
        assertEquals(setOf("a"), QueueSource.Favorites(setOf("a")).allowedHashes())
        assertEquals(setOf("p"), QueueSource.Playlist("id", setOf("p")).allowedHashes())
    }

    // ---- constrained continuation (FAVORITES / PLAYLIST) -------------------

    @Test
    fun `favorites continuation draws only liked tracks`() {
        val liked = setOf("f1", "f2", "f3")
        val all = library("f1", "f2", "f3", "u1", "u2", "u3", "u4")
        val source = QueueSource.Favorites(liked)
        repeat(25) { seed ->
            val picked = QueueContinuation.plan(
                source, all["f1"], all, queued = setOf("f1"), dislikes = emptySet(),
                random = Random(seed.toLong()),
            )
            assertTrue(picked.isNotEmpty())
            assertTrue(
                "unliked track leaked into the favorites queue: $picked",
                picked.all { it.trackhash in liked },
            )
        }
    }

    @Test
    fun `playlist continuation draws only playlist tracks`() {
        val inPlaylist = setOf("p1", "p2")
        val all = library("p1", "p2", "o1", "o2", "o3", "o4", "o5")
        val source = QueueSource.Playlist("pl", inPlaylist)
        repeat(25) { seed ->
            val picked = QueueContinuation.plan(
                source, all["p1"], all, queued = setOf("p1"), dislikes = emptySet(),
                random = Random(seed.toLong()),
            )
            assertTrue("playlist queue leaked: $picked", picked.all { it.trackhash in inPlaylist })
        }
    }

    @Test
    fun `constrained continuation excludes queued current and disliked tracks`() {
        val allowed = setOf("a", "b", "c", "d")
        val all = library("a", "b", "c", "d")
        val picked = QueueContinuation.plan(
            QueueSource.Favorites(allowed), all["a"], all,
            queued = setOf("a", "b"), dislikes = setOf("c"),
            random = Random(1),
        )
        assertEquals(listOf("d"), picked.map { it.trackhash })
    }

    @Test
    fun `an exhausted constrained set stops the session instead of recycling`() {
        // Every liked track is already in the queue: the continuation must be
        // EMPTY (the queue simply ends) — never a repeat, never a library track.
        val liked = setOf("f1", "f2")
        val all = library("f1", "f2", "u1", "u2")
        val picked = QueueContinuation.plan(
            QueueSource.Favorites(liked), all["f1"], all,
            queued = setOf("f1", "f2"), dislikes = emptySet(),
            random = Random(2),
        )
        assertTrue("exhausted set must not extend the queue: $picked", picked.isEmpty())
    }

    @Test
    fun `a full favorites session never leaves the liked set until exhaustion`() {
        // Simulate the real lifecycle: "Lire" queues the liked set shuffled, then
        // the continuation keeps growing the queue until it stops. Every appended
        // track must be liked — "pas des titres que je n'ai pas likés".
        val liked = setOf("f1", "f2", "f3", "f4", "f5")
        val all = library("f1", "f2", "f3", "f4", "f5", "u1", "u2", "u3", "u4", "u5", "u6")
        val queued = liked.toMutableSet()
        val random = Random(7)
        repeat(10) {
            val picked = QueueContinuation.plan(
                QueueSource.Favorites(liked), all["f1"], all,
                queued = queued, dislikes = emptySet(), random = random,
            )
            assertTrue(picked.all { it.trackhash in liked })
            if (picked.isEmpty()) return@repeat
            queued += picked.map { it.trackhash }
        }
        // The set is finite: the queue ends with every liked track queued once.
        assertEquals(liked, queued)
    }

    @Test
    fun `constrained candidates are shuffled and capped at the batch size`() {
        val allowed = (1..50).map { "f$it" }.toSet()
        val all = library(*allowed.toTypedArray())
        val a = QueueContinuation.constrainedCandidates(allowed, all, emptySet(), emptySet(), null, Random(1))
        val b = QueueContinuation.constrainedCandidates(allowed, all, emptySet(), emptySet(), null, Random(2))
        assertEquals(QueueContinuation.BATCH, a.size)
        assertTrue("different seeds must reshuffle", a.map { it.trackhash } != b.map { it.trackhash })
    }

    // ---- unconstrained continuation (LIBRARY) ------------------------------

    @Test
    fun `library continuation excludes queued and disliked tracks`() {
        val all = mapOf(
            "a" to track("a", artistHash = "ar1"),
            "b" to track("b", artistHash = "ar1"),
            "c" to track("c"),
            "d" to track("d"),
        )
        val picked = QueueContinuation.plan(
            QueueSource.Library, all["a"], all,
            queued = setOf("a", "b"), dislikes = setOf("c"),
            random = Random(3),
        )
        assertEquals(listOf("d"), picked.map { it.trackhash })
    }

    @Test
    fun `library continuation prefers never-played tracks close to the current vibe`() {
        val sameArtist = (1..12).map { "s$it" }
        val others = (1..12).map { "o$it" }
        val all = sameArtist.associate { it to track(it, artistHash = "ar") } +
            others.associate { it to track(it, artistHash = "xx") }
        val counts = (sameArtist + others).associateWith { 5 } + mapOf("n1" to 0)
        val withNew = all + ("n1" to track("n1", artistHash = "ar"))
        val picked = QueueContinuation.plan(
            QueueSource.Library, withNew["s1"], withNew,
            queued = setOf("s1"), dislikes = emptySet(), counts = counts, random = Random(4),
        )
        // Only n1 is never-played — everything else has plays, so the picker must
        // surface exactly that one.
        assertEquals(listOf("n1"), picked.map { it.trackhash })
    }

    @Test
    fun `library continuation falls back to least-played when all is heard`() {
        // 50 heard tracks with distinct play counts: the ranked head is the 40
        // least-played, shuffled — the 10 most-played never surface.
        val all = (1..50).associate { "t$it" to track("t$it") }
        val counts = (1..50).associate { "t$it" to it }
        val picked = QueueContinuation.plan(
            QueueSource.Library, all["t50"], all,
            queued = setOf("t50"), dislikes = emptySet(), counts = counts, random = Random(5),
        )
        assertEquals(20, picked.size)
        val leastPlayedHead = (1..40).map { "t$it" }.toSet()
        assertTrue(
            "most-played tracks leaked into the continuation: $picked",
            picked.all { it.trackhash in leastPlayedHead },
        )
    }

    @Test
    fun `library continuation recycles rather than dying when everything is queued`() {
        val all = mapOf("a" to track("a"), "b" to track("b"), "c" to track("c"))
        val counts = mapOf("b" to 3, "c" to 3) // everything eligible has been heard
        val picked = QueueContinuation.plan(
            QueueSource.Library, all["a"], all,
            queued = setOf("a", "b", "c"), dislikes = emptySet(), counts = counts, random = Random(6),
        )
        // The recycle branch re-offers queued items (but never the current one) —
        // the LIBRARY session keeps going; constrained sessions would stop.
        assertEquals(setOf("b", "c"), picked.map { it.trackhash }.toSet())
    }
}
