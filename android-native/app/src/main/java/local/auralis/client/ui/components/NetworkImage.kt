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
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

// A tiny async network image: OkHttp fetch + BitmapFactory decode + an in-memory
// LRU cache, surfaced as a Compose painter. Replaces coil-compose (absent from the
// offline cache) with ~zero dependencies. Cover art is content-addressed and cached
// hard server-side, so a simple memory cache here is plenty.
private object ArtCache {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    // ~32 MB of decoded bitmaps.
    private val cache = object : LruCache<String, ImageBitmap>(32 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap): Int = value.width * value.height * 4
    }

    fun cached(url: String): ImageBitmap? = cache.get(url)

    suspend fun load(url: String): ImageBitmap? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { return@withContext it }
        runCatching {
            val req = Request.Builder().url(url).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                val bytes = resp.body?.bytes() ?: return@use null
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return@use null
                bmp.asImageBitmap().also { cache.put(url, it) }
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
    var image by remember(url) { mutableStateOf(ArtCache.cached(url)) }
    LaunchedEffect(url) {
        if (image == null) image = ArtCache.load(url)
    }
    val bmp = image
    if (bmp != null) {
        Image(bitmap = bmp, contentDescription = null, modifier = modifier.fillMaxSize(), contentScale = contentScale)
    } else {
        Box(modifier) { fallback() }
    }
}
