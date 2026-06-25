package local.auralis.client.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi

data class PlaybackSnapshot(
    val currentId: String? = null,
    val isPlaying: Boolean = false,
    val shuffle: Boolean = false,
    val repeat: String = "off",
    val queueIds: List<String> = emptyList(),
    val currentIndex: Int = -1,
    val durationMs: Long = 0L,
    val hasItems: Boolean = false,
)

// UI-side bridge to the playback service. Connects a MediaController, mirrors the
// player state into flows for Compose, and exposes transport/queue controls. Maps
// MediaItem.mediaId == trackhash so the ViewModel can resolve back to Track objects.
class PlayerHolder(
    private val context: Context,
    private val api: AuralisApi,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var controller: MediaController? = null

    private val _snapshot = MutableStateFlow(PlaybackSnapshot())
    val snapshot: StateFlow<PlaybackSnapshot> = _snapshot

    private val _position = MutableStateFlow(0L)
    val position: StateFlow<Long> = _position

    /** Invoked whenever the active media item changes (id may be null). */
    var onTrackChanged: ((String?) -> Unit)? = null

    /** Invoked when the queue runs dry while autoplay should continue. */
    var onNeedContinuation: (() -> Unit)? = null

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            pushSnapshot()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            onTrackChanged?.invoke(mediaItem?.mediaId)
            maybeContinue()
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_ENDED) maybeContinue()
        }
    }

    fun connect() {
        if (controller != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener({
            controller = future.get().also { c ->
                c.addListener(listener)
                pushSnapshot()
                onTrackChanged?.invoke(c.currentMediaItem?.mediaId)
            }
            startTicker()
        }, ContextCompat.getMainExecutor(context))
    }

    fun release() {
        controller?.removeListener(listener)
        controller?.release()
        controller = null
    }

    private fun startTicker() {
        scope.launch {
            while (true) {
                controller?.let { _position.value = it.currentPosition.coerceAtLeast(0L) }
                delay(250)
            }
        }
    }

    private fun maybeContinue() {
        val c = controller ?: return
        // Near the tail of the queue with nothing after → ask for more (endless listening).
        if (c.mediaItemCount > 0 && c.currentMediaItemIndex >= c.mediaItemCount - 1 &&
            c.repeatMode == Player.REPEAT_MODE_OFF
        ) {
            onNeedContinuation?.invoke()
        }
    }

    private fun pushSnapshot() {
        val c = controller ?: return
        val ids = (0 until c.mediaItemCount).map { c.getMediaItemAt(it).mediaId }
        _snapshot.value = PlaybackSnapshot(
            currentId = c.currentMediaItem?.mediaId,
            isPlaying = c.isPlaying,
            shuffle = c.shuffleModeEnabled,
            repeat = when (c.repeatMode) {
                Player.REPEAT_MODE_ALL -> "all"
                Player.REPEAT_MODE_ONE -> "one"
                else -> "off"
            },
            queueIds = ids,
            currentIndex = c.currentMediaItemIndex,
            durationMs = c.duration.coerceAtLeast(0L),
            hasItems = c.mediaItemCount > 0,
        )
    }

    // ---- controls ----------------------------------------------------------

    fun playTracks(tracks: List<Track>, startIndex: Int) {
        val c = controller ?: return
        if (tracks.isEmpty()) return
        c.setMediaItems(tracks.map { it.toMediaItem(api) }, startIndex.coerceIn(0, tracks.lastIndex), 0L)
        c.prepare()
        c.playWhenReady = true
    }

    fun appendTracks(tracks: List<Track>) {
        val c = controller ?: return
        c.addMediaItems(tracks.map { it.toMediaItem(api) })
    }

    /** Restore a queue without auto-playing — seeks to [positionMs] and stays paused. */
    fun playTracksPaused(tracks: List<Track>, startIndex: Int, positionMs: Long) {
        val c = controller ?: return
        if (tracks.isEmpty()) return
        c.setMediaItems(tracks.map { it.toMediaItem(api) }, startIndex.coerceIn(0, tracks.lastIndex), positionMs)
        c.prepare()
        c.playWhenReady = false
    }

    fun positionMs(): Long = controller?.currentPosition?.coerceAtLeast(0L) ?: 0L

    fun addNext(track: Track) {
        val c = controller ?: return
        if (c.mediaItemCount == 0) { playTracks(listOf(track), 0); return }
        c.addMediaItem(c.currentMediaItemIndex + 1, track.toMediaItem(api))
    }

    fun addToEnd(track: Track) {
        val c = controller ?: return
        if (c.mediaItemCount == 0) { playTracks(listOf(track), 0); return }
        c.addMediaItem(track.toMediaItem(api))
    }

    fun togglePlay() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else { c.prepare(); c.play() }
    }

    fun play() { controller?.play() }
    fun pause() { controller?.pause() }
    fun next() { controller?.seekToNextMediaItem() }
    fun prev() {
        val c = controller ?: return
        if (c.currentPosition > 3000) c.seekTo(0) else c.seekToPreviousMediaItem()
    }
    fun seekTo(ms: Long) { controller?.seekTo(ms.coerceAtLeast(0L)) }
    fun seekBy(deltaMs: Long) {
        val c = controller ?: return
        c.seekTo((c.currentPosition + deltaMs).coerceAtLeast(0L))
    }
    fun jumpTo(index: Int) {
        val c = controller ?: return
        if (index in 0 until c.mediaItemCount) { c.seekTo(index, 0L); c.play() }
    }
    fun removeAt(index: Int) {
        val c = controller ?: return
        if (index in 0 until c.mediaItemCount && index != c.currentMediaItemIndex) c.removeMediaItem(index)
    }
    fun clearQueueExceptCurrent() {
        val c = controller ?: return
        val keep = c.currentMediaItemIndex
        for (i in c.mediaItemCount - 1 downTo 0) if (i != keep) c.removeMediaItem(i)
    }
    fun setShuffle(on: Boolean) { controller?.shuffleModeEnabled = on }
    fun toggleShuffle() { controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled } }
    fun setRepeat(mode: String) {
        controller?.repeatMode = when (mode) {
            "all" -> Player.REPEAT_MODE_ALL
            "one" -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }
    fun cycleRepeat() {
        val c = controller ?: return
        c.repeatMode = when (c.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }
    fun setVolume(v: Float) { controller?.volume = v.coerceIn(0f, 1f) }
    fun stop() { controller?.stop() }
}

fun Track.toMediaItem(api: AuralisApi): MediaItem {
    val meta = MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(displayArtist)
        .setAlbumTitle(album)
        .apply { api.assetUrl(image)?.let { setArtworkUri(Uri.parse(it)) } }
        .build()
    return MediaItem.Builder()
        .setMediaId(trackhash)
        .setUri(api.streamUrl(filepath ?: ""))
        .setMediaMetadata(meta)
        .build()
}
