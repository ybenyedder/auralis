package local.auralis.client.playback

import local.auralis.client.model.RecognizeLocalMatch
import local.auralis.client.model.RecognizeRemoteMatch
import local.auralis.client.model.RecognizeResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM tests for the Shazam bubble's pure result → notification/action mapping. */
class BubbleOutcomeTest {

    private fun local(title: String, artist: String = "Artist", trackhash: String = "h1", score: Double = 0.9) =
        RecognizeLocalMatch(trackhash, title, artist, null, null, 0.0, score)

    private fun remote(title: String, artists: List<String> = listOf("Artist"), score: Double = 0.9) =
        RecognizeRemoteMatch(title, artists, score, "shazam")

    private fun result(
        local: List<RecognizeLocalMatch> = emptyList(),
        remote: List<RecognizeRemoteMatch>? = null,
    ) = RecognizeResult(true, local.size, local, remote, true, remote != null)

    // ---- verdict mapping ----------------------------------------------------

    @Test
    fun `remote match wins when the song is not in the library`() {
        val outcome = BubbleOutcome.from(result(remote = listOf(remote("Yesterday", listOf("The Beatles")))))
        assertTrue(outcome is BubbleOutcome.RemoteFound)
        outcome as BubbleOutcome.RemoteFound
        assertEquals("Yesterday", outcome.title)
        assertEquals(listOf("The Beatles"), outcome.artists)
        assertEquals("The Beatles Yesterday", outcome.query)
    }

    @Test
    fun `a song already in the library reports the local match`() {
        val outcome = BubbleOutcome.from(
            result(
                local = listOf(local("Yesterday", "The Beatles", trackhash = "abc")),
                remote = listOf(remote("Yesterday", listOf("The Beatles"))),
            ),
        )
        assertTrue(outcome is BubbleOutcome.LocalFound)
        outcome as BubbleOutcome.LocalFound
        assertEquals("Yesterday", outcome.title)
        assertEquals("abc", outcome.trackhash)
    }

    @Test
    fun `best score wins among several matches`() {
        val outcome = BubbleOutcome.from(
            result(
                remote = listOf(
                    remote("Low", score = 0.2),
                    remote("High", score = 0.95),
                    remote("Mid", score = 0.5),
                ),
            ),
        )
        assertEquals("High", (outcome as BubbleOutcome.RemoteFound).title)

        val localOutcome = BubbleOutcome.from(
            result(
                local = listOf(local("Low", score = 0.1), local("High", score = 0.8)),
                remote = null,
            ),
        )
        assertEquals("High", (localOutcome as BubbleOutcome.LocalFound).title)
    }

    @Test
    fun `local-only verdict maps to a library match`() {
        val outcome = BubbleOutcome.from(result(local = listOf(local("Mine"))))
        assertTrue(outcome is BubbleOutcome.LocalFound)
    }

    @Test
    fun `empty verdict maps to not-found`() {
        assertEquals(BubbleOutcome.NotFound, BubbleOutcome.from(result()))
        assertEquals(BubbleOutcome.NotFound, BubbleOutcome.from(result(remote = emptyList())))
    }

    @Test
    fun `title matching ignores case punctuation spacing and diacritics`() {
        assertTrue(BubbleOutcome.sameTitle("L'Été indien", "lete indien"))
        assertTrue(BubbleOutcome.sameTitle("Hello, World!", "HELLO WORLD"))
        assertTrue(BubbleOutcome.sameTitle("  Bo   hé  me ", "boheme"))
        assertFalse(BubbleOutcome.sameTitle("Hello", "World"))
        assertFalse(BubbleOutcome.sameTitle("", ""))
    }

    // ---- notification mapping -----------------------------------------------

    @Test
    fun `remote outcome posts the added-to-library message with title and artist`() {
        val outcome = BubbleOutcome.RemoteFound("Yesterday", listOf("The Beatles"), "The Beatles Yesterday")
        assertEquals("bubble.notif.added", outcome.messageKey)
        assertEquals(
            mapOf("title" to "Yesterday", "artist" to "The Beatles"),
            outcome.messageParams(),
        )
    }

    @Test
    fun `local outcome posts the in-library message and keeps the play target`() {
        val outcome = BubbleOutcome.LocalFound("Yesterday", "The Beatles", "abc")
        assertEquals("bubble.notif.inLibrary", outcome.messageKey)
        assertEquals(mapOf("title" to "Yesterday"), outcome.messageParams())
        assertEquals("abc", outcome.trackhash)
    }

    @Test
    fun `not-found and failed outcomes carry plain messages`() {
        assertEquals("bubble.notif.notFound", BubbleOutcome.NotFound.messageKey)
        assertTrue(BubbleOutcome.NotFound.messageParams().isEmpty())
        assertEquals("bubble.failed", BubbleOutcome.Failed.messageKey)
        assertTrue(BubbleOutcome.Failed.messageParams().isEmpty())
    }
}
