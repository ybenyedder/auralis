package local.auralis.client.playback

import local.auralis.client.model.Track

/**
 * Pure queue bookkeeping shared by the "Vider" undo path (web queueSlice
 * clearQueue). Clearing keeps only the current track and snapshots the rest;
 * the undo must re-anchor on the LIVE current track — during the undo window
 * playback can advance (autoplay/ended), so blindly restoring the snapshot
 * index would desync the queue from what is actually playing.
 */
object QueueOps {

    /** Re-anchor a queue snapshot around the live [current] track. Returns the
     *  restored queue and the index the current track sits at. When the live
     *  current track is not part of the snapshot (a fresh autoplay pick), it is
     *  spliced in at the snapshot position so the invariant always holds. */
    fun anchorRestore(snapshot: List<Track>, snapshotIndex: Int, current: Track?): Pair<List<Track>, Int> {
        if (current == null) {
            val index = snapshotIndex.coerceIn(0, (snapshot.size - 1).coerceAtLeast(0))
            return snapshot to index
        }
        val idx = snapshot.indexOfFirst { it.trackhash == current.trackhash }
        if (idx >= 0) return snapshot to idx
        val queue = snapshot.toMutableList()
        val at = snapshotIndex.coerceIn(0, queue.size)
        queue.add(at, current)
        return queue to at
    }
}
