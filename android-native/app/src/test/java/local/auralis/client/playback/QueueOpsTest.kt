package local.auralis.client.playback

import local.auralis.client.model.Track
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the "Vider" undo re-anchoring (web clearQueue undo). */
class QueueOpsTest {

    private fun track(hash: String) = Track(
        trackhash = hash, title = hash, artist = null, album = null, albumhash = null,
        duration = null, filepath = null, folder = null, image = null, isFavorite = false,
        playcount = 0, disc = null, track = null, year = null, genre = null, mood = null,
        energy = null, bpm = null, gain = null, bitrate = null, samplerate = null,
        codec = null, lossless = false, size = null, hasLyrics = false, addedAt = null,
        color = null, artists = emptyList(),
    )

    @Test
    fun `restores the snapshot untouched when nothing is playing`() {
        val snap = listOf(track("a"), track("b"), track("c"))
        val (queue, index) = QueueOps.anchorRestore(snap, 1, null)
        assertEquals(listOf("a", "b", "c"), queue.map { it.trackhash })
        assertEquals(1, index)
    }

    @Test
    fun `re-anchors on the live current track inside the snapshot`() {
        val snap = listOf(track("a"), track("b"), track("c"))
        // The snapshot index drifted (the track advanced during the undo window):
        // the restored index must point at the LIVE current track, not the stale one.
        val (queue, index) = QueueOps.anchorRestore(snap, 0, track("c"))
        assertEquals(snap, queue)
        assertEquals(2, index)
    }

    @Test
    fun `splices a foreign current track in at the snapshot position`() {
        val snap = listOf(track("a"), track("b"))
        val (queue, index) = QueueOps.anchorRestore(snap, 1, track("autoplay"))
        assertEquals(listOf("a", "autoplay", "b"), queue.map { it.trackhash })
        assertEquals(1, index)
    }

    @Test
    fun `clamps an out-of-range snapshot index`() {
        val snap = listOf(track("a"))
        val (_, index) = QueueOps.anchorRestore(snap, 9, null)
        assertTrue(index in snap.indices)
    }
}
