package local.auralis.client.ui.components

import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

// A tiny async network image: OkHttp fetch + BitmapFactory decode, backed by a
// two-tier cache — an in-memory LRU AND a persistent on-disk layer under cacheDir/art.
// Cover art is content-addressed and immutable, so the disk key is the SHA-1 of the
// URL with its rotating ?token stripped: the same cover keeps one cache entry across
// token rotations AND across app restarts (no re-download on every cold start, and the
// lock-screen artwork survives offline).
private object ArtCache {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    // ~32 MB of decoded bitmaps.
    private val cache = object : LruCache<String, ImageBitmap>(32 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }

    /** Stable disk key: drop the rotating token param so one cover = one file. */
    private fun diskKey(url: String): String {
        val noToken = url.replace(Regex("([?&])token=[^&]*"), "$1").trimEnd('?', '&')
        val digest = MessageDigest.getInstance("SHA-1").digest(noToken.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun cached(url: String): ImageBitmap? = cache.get(url)

    suspend fun load(url: String, cacheDir: File): ImageBitmap? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { return@withContext it }
        val dir = File(cacheDir, "art").apply { mkdirs() }
        val file = File(dir, diskKey(url))
        // Disk hit → decode without touching the network (works fully offline).
        if (file.exists()) {
            runCatching {
                val bytes = file.readBytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }.getOrNull()?.let { cache.put(url, it); return@withContext it }
        }
        // Miss → fetch, write through to disk, decode.
        runCatching {
            val req = Request.Builder().url(url).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val bytes = resp.body?.bytes() ?: return@use null
                runCatching { file.writeBytes(bytes) } // best-effort persistence
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { cache.put(url, it) }
            }
        }.getOrNull()
    }
}

@Composable
fun NetworkImage(
    url: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallback: @Composable () -> Unit = {},
) {
    if (url.isNullOrBlank()) {
        Box(modifier) { fallback() }
        return
    }
    val context = LocalContext.current
    var image by remember(url) { mutableStateOf(ArtCache.cached(url)) }
    LaunchedEffect(url) {
        if (image == null) image = ArtCache.load(url, context.cacheDir)
    }
    val bmp = image
    if (bmp != null) {
        Image(bitmap = bmp, contentDescription = null, modifier = modifier.fillMaxSize(), contentScale = contentScale)
    } else {
        Box(modifier) { fallback() }
    }
}
