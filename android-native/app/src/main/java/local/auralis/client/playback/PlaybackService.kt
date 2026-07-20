package local.auralis.client.playback

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import local.auralis.client.MainActivity
import local.auralis.client.data.Prefs
import local.auralis.client.model.Track
import local.auralis.client.net.AuralisApi
import java.io.File

// Native background playback AND an Android Auto / Automotive browse tree. A
// MediaLibraryService hosts ExoPlayer + a MediaLibrarySession: media3 publishes the
// system media notification + lock-screen controls AND exposes a browsable catalogue
// (Fait pour vous / Favoris / Récents) to Android Auto's head unit — the whole
// lossless collection in the car, no subscription. The UI process drives transport
// via MediaController; Auto browses via the library callback below.
class PlaybackService : MediaLibraryService() {

    private var session: MediaLibrarySession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var catalog: AutoCatalog

    override fun onCreate() {
        super.onCreate()
        catalog = AutoCatalog(this)
        val player = ExoPlayer.Builder(this)
            // Route playback through the implicit on-disk cache (offline replay).
            .setMediaSourceFactory(DefaultMediaSourceFactory(AuralisMediaCache.dataSourceFactory(this)))
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        // Tapping the media notification / lock-screen card brings the native app to
        // the front (singleTask + SINGLE_TOP reuses the existing task).
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(openApp)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || (!player.playWhenReady) || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }

    // --- Android Auto browse tree -------------------------------------------
    private inner class LibraryCallback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            return Futures.immediateFuture(LibraryResult.ofItem(browsable(ROOT, "Auralis"), params))
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val future = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            scope.launch {
                val items: List<MediaItem> = if (parentId == ROOT) {
                    listOf(
                        browsable(CAT_FORYOU, "Fait pour vous"),
                        browsable(CAT_FAVORITES, "Favoris"),
                        browsable(CAT_RECENTS, "Récents"),
                    )
                } else {
                    catalog.ensureLoaded()
                    catalog.tracksFor(parentId).map { playable(it) }
                }
                future.set(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
            }
            return future
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val track = catalog.track(mediaId.removePrefix(TRACK_PREFIX))
            return Futures.immediateFuture(
                if (track != null) LibraryResult.ofItem(playable(track), null)
                else LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE),
            )
        }

        // Resolve browse items (mediaId only, no URI) to real, playable MediaItems
        // when Auto requests playback. Items that already carry a URI (queued from the
        // phone UI) pass through untouched.
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> {
            val resolved = mediaItems.map { item ->
                if (item.localConfiguration != null) item
                else catalog.track(item.mediaId.removePrefix(TRACK_PREFIX))?.toMediaItem(catalog.api) ?: item
            }.toMutableList()
            return Futures.immediateFuture(resolved)
        }
    }

    private fun browsable(id: String, title: String): MediaItem {
        val meta = MediaMetadata.Builder()
            .setTitle(title)
            .setIsBrowsable(true)
            .setIsPlayable(false)
            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
            .build()
        return MediaItem.Builder().setMediaId(id).setMediaMetadata(meta).build()
    }

    private fun playable(track: Track): MediaItem {
        val meta = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.displayArtist)
            .setAlbumTitle(track.album)
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
            .apply { catalog.api.artUrl(track.image, 512)?.let { setArtworkUri(Uri.parse(it)) } }
            .build()
        return MediaItem.Builder().setMediaId(TRACK_PREFIX + track.trackhash).setMediaMetadata(meta).build()
    }

    companion object {
        private const val ROOT = "auralis_root"
        private const val CAT_FORYOU = "cat_foryou"
        private const val CAT_FAVORITES = "cat_favorites"
        private const val CAT_RECENTS = "cat_recents"
        private const val TRACK_PREFIX = "track:"
    }
}

/** Loads the catalogue once for the Auto browse tree, off the saved server + token.
 *  The service process has no UI state, so it re-fetches the library/favorites/recents
 *  itself (same pattern the audit prescribed). Best-effort: an offline head unit just
 *  shows empty categories. */
private class AutoCatalog(private val context: Context) {
    val api = AuralisApi()
    private var byHash: Map<String, Track> = emptyMap()
    private var favorites: List<String> = emptyList()
    private var recents: List<String> = emptyList()
    private var forYou: List<String> = emptyList()
    @Volatile private var loaded = false
    private val loadMutex = Mutex()

    suspend fun ensureLoaded() {
        if (loaded) return
        // Several onGetChildren callbacks can race here on the IO dispatcher: without
        // this lock they'd each fire api.library()/userState() and half-assign byHash/
        // favorites/... under one another (a reader could see a partially-built map).
        // Serialize, and re-check loaded inside the lock so only the first does the work.
        loadMutex.withLock {
            if (loaded) return
            val prefs = Prefs(context).load()
            if (prefs.serverBase.isBlank() || prefs.token.isNullOrBlank()) return
            api.configure(prefs.serverBase, prefs.token)
            runCatching {
                byHash = api.library().tracks.associateBy { it.trackhash }
                val state = api.userState()
                favorites = state.favorites
                recents = state.recents
                forYou = runCatching { api.recommend().forYou.map { it.trackhash } }.getOrDefault(emptyList())
                loaded = true
            }
        }
    }

    fun track(hash: String): Track? = byHash[hash]

    fun tracksFor(category: String): List<Track> = when (category) {
        "cat_favorites" -> favorites
        "cat_recents" -> recents
        "cat_foryou" -> forYou
        else -> emptyList()
    }.mapNotNull { byHash[it] }
}

// Implicit offline cache: every streamed track is written through a 2 GB on-disk
// SimpleCache, so anything played once replays with the server unreachable — the
// local-first offline win Spotify gates behind a subscription, here for free. The
// cache key strips the rotating ?token so a track keeps ONE entry across rotations.
object AuralisMediaCache {
    @Volatile private var cache: SimpleCache? = null

    private fun cache(context: Context): SimpleCache =
        cache ?: synchronized(this) {
            // Use the application context: this SimpleCache is a process-lifetime
            // static, and StandaloneDatabaseProvider holds onto whatever Context it's
            // given. Passing the Service here would leak that Service for the life of
            // the process. applicationContext outlives every Service anyway.
            cache ?: run {
                val appCtx = context.applicationContext
                SimpleCache(
                    File(appCtx.cacheDir, "media"),
                    LeastRecentlyUsedCacheEvictor(2L * 1024 * 1024 * 1024),
                    StandaloneDatabaseProvider(appCtx),
                ).also { cache = it }
            }
        }

    fun dataSourceFactory(context: Context): CacheDataSource.Factory {
        val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)
        // Attach the session token as an Authorization header, read fresh on EACH
        // stream open (not once at build): the factory is created in the service's
        // onCreate, possibly before login, so a token captured then would be stale
        // or null. This lambda runs per createDataSource() — i.e. per stream load,
        // which only happens on play, after the token is set — so it's always
        // current. Cross-protocol redirects stay OFF so the header can't be
        // forwarded across an https→http downgrade.
        val authed = DataSource.Factory {
            val t = AuralisApi.sessionToken
            http.setDefaultRequestProperties(
                if (t.isNullOrBlank()) emptyMap() else mapOf("Authorization" to "Bearer $t"),
            )
            http.createDataSource()
        }
        val upstream = DefaultDataSource.Factory(context, authed)
        return CacheDataSource.Factory()
            .setCache(cache(context))
            .setUpstreamDataSourceFactory(upstream)
            .setCacheKeyFactory(object : CacheKeyFactory {
                override fun buildCacheKey(dataSpec: DataSpec): String =
                    dataSpec.uri.buildUpon().clearQuery().build().toString()
            })
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}
