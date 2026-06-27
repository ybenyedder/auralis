package local.auralis.client.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

/** A newer build published on the GitHub release page. */
data class UpdateInfo(
    val version: String,        // e.g. "1.6.0" (the tag minus a leading "v")
    val notes: String,          // release body / changelog
    val apkUrl: String,         // browser_download_url of the .apk asset
    val sizeBytes: Long,
)

/**
 * In-app self-update for the native Android client.
 *
 * The CI publishes a `Auralis-vX.Y.Z.apk` asset on every `v*` GitHub release
 * (.github/workflows/release.yml). This checks the latest release, compares its
 * tag to the running [versionName], and — if newer — downloads the APK and hands
 * it to the system package installer. There is no silent install on stock Android
 * (only a system/owner app can do that), so the user taps "Installer" once; every
 * other step is automatic.
 */
object UpdateManager {

    // The public repo the releases live in (see electron-builder.yml / release.yml).
    private const val OWNER = "ybenyedder"
    private const val REPO = "auralis"
    private const val LATEST_URL = "https://api.github.com/repos/$OWNER/$REPO/releases/latest"

    private const val UPDATE_DIR = "updates"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    /** Returns the published update when it is strictly newer than [currentVersion], else null. */
    suspend fun check(currentVersion: String): UpdateInfo? = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder()
                .url(LATEST_URL)
                .header("Accept", "application/vnd.github+json")
                // GitHub rejects API calls without a User-Agent.
                .header("User-Agent", "Auralis-Android")
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val body = resp.body?.string() ?: return@withContext null
                val json = JSONObject(body)
                if (json.optBoolean("draft") || json.optBoolean("prerelease")) return@withContext null

                val tag = json.optString("tag_name").trim().removePrefix("v")
                if (tag.isEmpty() || compareVersions(tag, currentVersion) <= 0) return@withContext null

                // Pick the first .apk asset.
                val assets = json.optJSONArray("assets") ?: return@withContext null
                var apkUrl: String? = null
                var size = 0L
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name").endsWith(".apk", ignoreCase = true)) {
                        apkUrl = a.optString("browser_download_url")
                        size = a.optLong("size")
                        break
                    }
                }
                val url = apkUrl ?: return@withContext null
                UpdateInfo(version = tag, notes = json.optString("body").trim(), apkUrl = url, sizeBytes = size)
            }
        }.getOrNull()
    }

    /** Streams the APK into external cache, reporting fractional progress (0f..1f). */
    suspend fun download(context: Context, info: UpdateInfo, onProgress: (Float) -> Unit): File? =
        withContext(Dispatchers.IO) {
            runCatching {
                // Prefer external cache (more room); fall back to internal when external
                // storage is unavailable. Both are registered FileProvider roots.
                val cacheRoot = context.externalCacheDir ?: context.cacheDir
                val dir = File(cacheRoot, UPDATE_DIR).apply { mkdirs() }
                // Re-download fresh each time; clear any stale partials.
                dir.listFiles()?.forEach { it.delete() }
                val out = File(dir, "auralis-${info.version}.apk")

                val req = Request.Builder().url(info.apkUrl).header("User-Agent", "Auralis-Android").build()
                client.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    val bodyStream = resp.body?.byteStream() ?: return@withContext null
                    val total = if (info.sizeBytes > 0) info.sizeBytes else resp.body?.contentLength() ?: -1L
                    bodyStream.use { input ->
                        out.outputStream().use { output ->
                            val buf = ByteArray(64 * 1024)
                            var read = 0L
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                output.write(buf, 0, n)
                                read += n
                                if (total > 0) onProgress((read.toFloat() / total).coerceIn(0f, 1f))
                            }
                        }
                    }
                }
                onProgress(1f)
                out
            }.getOrNull()
        }

    /** Launches the system package installer for a downloaded APK. */
    fun install(context: Context, apk: File) {
        val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /** Semantic-ish compare: 1 if a>b, -1 if a<b, 0 if equal. Missing parts are 0. */
    internal fun compareVersions(a: String, b: String): Int {
        val pa = a.split(".")
        val pb = b.split(".")
        val n = maxOf(pa.size, pb.size)
        for (i in 0 until n) {
            val na = pa.getOrNull(i)?.takeWhile { it.isDigit() }?.toIntOrNull() ?: 0
            val nb = pb.getOrNull(i)?.takeWhile { it.isDigit() }?.toIntOrNull() ?: 0
            if (na != nb) return if (na > nb) 1 else -1
        }
        return 0
    }
}
