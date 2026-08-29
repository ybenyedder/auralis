package local.auralis.client.net

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import local.auralis.client.model.AuthResult
import local.auralis.client.model.LibrarySnapshot
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.RecapResult
import local.auralis.client.model.RecommendResult
import local.auralis.client.model.SearchResult
import local.auralis.client.model.UserState
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// Thin OkHttp client for the Auralis server HTTP API. Auth is a bearer session
// token; media streaming attaches it as an Authorization header (see the media
// DataSource) rather than a ?token= query, so the token never lands in the
// server/proxy access logs. Bearer clients are exempt from CSRF, so state
// mutations need no CSRF token. JSON is parsed via model companions (org.json).
class AuralisApi {

    @Volatile var base: String = ""
        private set

    @Volatile var token: String? = null
        private set

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun configure(base: String, token: String?) {
        this.base = normalizeBase(base)
        this.token = token
        sessionToken = token
    }

    fun isConfigured(): Boolean = base.isNotBlank() && !token.isNullOrBlank()

    // ---- URL builders (used by the player / image loader) ------------------

    // No ?token= on the URL: the media DataSource attaches the token as an
    // Authorization header instead, keeping it out of access/proxy logs.
    fun streamUrl(filepath: String): String {
        val encoded = filepath.split(Regex("[\\\\/]+"))
            .filter { it.isNotBlank() }
            .joinToString("/") { Uri.encode(it) }
        return "$base/api/stream/$encoded"
    }

    /** Absolute URL for an `image` field like "/api/art/<hash>". The art endpoint is
     *  open (no auth), so no token is appended — one less place the session token
     *  could leak via a cached/logged URL. */
    fun assetUrl(image: String?): String? {
        if (image.isNullOrBlank()) return null
        val path = if (image.startsWith("http")) return image else image
        return base + (if (path.startsWith("/")) path else "/$path")
    }

    /** Sized variant of [assetUrl] for the media3 session artwork (notification,
     *  lock-screen AND the car head-unit). A compact `?w=` thumbnail is decisive for
     *  Bluetooth AVRCP cover-art: head-units like BMW iDrive silently drop the
     *  full-resolution cover, so only the downsized image actually reaches the dash.
     *  External (http) art URLs are returned untouched — only our /api/art endpoint
     *  understands `?w=`. */
    fun artUrl(image: String?, width: Int): String? {
        val url = assetUrl(image) ?: return null
        if (!url.contains("/api/art/")) return url
        return url + (if (url.contains("?")) "&" else "?") + "w=$width"
    }

    // ---- auth --------------------------------------------------------------

    suspend fun health(probeBase: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val req = Request.Builder().url("${normalizeBase(probeBase)}/api/health").get().build()
            client.newCall(req).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    suspend fun login(probeBase: String, username: String, password: String): AuthResult =
        withContext(Dispatchers.IO) {
            val b = normalizeBase(probeBase)
            val body = JSONObject().put("username", username).put("password", password)
            val req = Request.Builder()
                .url("$b/api/auth/login")
                .post(body.toString().toRequestBody(JSON))
                .build()
            runCatching {
                client.newCall(req).execute().use { resp ->
                    val json = resp.body?.string()?.let { JSONObject(it) } ?: JSONObject()
                    if (resp.isSuccessful && json.optBoolean("ok", false)) {
                        AuthResult(
                            ok = true,
                            token = json.optString("token", null),
                            username = json.optString("username", username),
                            isAdmin = json.optBoolean("isAdmin", false),
                            defaultPassword = json.optBoolean("defaultPassword", false),
                            error = null,
                        )
                    } else {
                        AuthResult(false, null, null, false, false,
                            json.optString("error", "Identifiant ou mot de passe incorrect"))
                    }
                }
            }.getOrElse { AuthResult(false, null, null, false, false, "Serveur injoignable") }
        }

    /** Account list for the Netflix-style profile picker. Falls back to ["admin"]
     * on older servers / no accounts endpoint, so the login flow is identical. */
    suspend fun accounts(probeBase: String): List<String> = withContext(Dispatchers.IO) {
        val b = normalizeBase(probeBase)
        runCatching {
            val req = Request.Builder().url("$b/api/auth/accounts").get().build()
            client.newCall(req).execute().use { resp ->
                val arr = resp.body?.string()?.let { JSONObject(it) }?.optJSONArray("usernames")
                (0 until (arr?.length() ?: 0)).map { i -> arr!!.getString(i) }
            }
        }.getOrDefault(emptyList()).ifEmpty { listOf("admin") }
    }

    // ---- library / state / stats ------------------------------------------

    suspend fun library(): LibrarySnapshot = getJson("/api/library").let { LibrarySnapshot.from(it) }

    suspend fun userState(): UserState = getJson("/api/state").let { UserState.from(it) }

    suspend fun stats(): ListeningStats =
        runCatching { ListeningStats.from(getJson("/api/stats")) }.getOrDefault(ListeningStats.EMPTY)

    /** Personalised "Made for you" mix from the server taste engine. */
    suspend fun recommend(): RecommendResult =
        runCatching { RecommendResult.from(getJson("/api/recommend?limit=120")) }.getOrDefault(RecommendResult.EMPTY)

    /** Monthly mood recap (most recent month with data, or a specific YYYY-MM). */
    suspend fun recap(month: String?): RecapResult = withContext(Dispatchers.IO) {
        val path = if (month.isNullOrBlank()) "/api/recap" else "/api/recap?month=${Uri.encode(month)}"
        runCatching { RecapResult.from(getJson(path)) }.getOrDefault(RecapResult.EMPTY)
    }

    suspend fun search(query: String): SearchResult = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext SearchResult.EMPTY
        runCatching {
            // Build the URL INSIDE runCatching: a malformed base makes
            // toHttpUrlOrNull() null, and the old `!!` threw the NPE out of search()
            // — uncaught in the setSearch coroutine → crash. Now it degrades to EMPTY.
            val url = ("$base/api/search".toHttpUrlOrNull() ?: return@runCatching SearchResult.EMPTY).newBuilder()
                .addQueryParameter("q", query)
                .addQueryParameter("limit", "60")
                .build()
            client.newCall(authed(Request.Builder().url(url).get())).execute().use { resp ->
                resp.body?.string()?.let { SearchResult.from(JSONObject(it)) } ?: SearchResult.EMPTY
            }
        }.getOrDefault(SearchResult.EMPTY)
    }

    suspend fun lyrics(trackhash: String, force: Boolean): LyricsResult = withContext(Dispatchers.IO) {
        val url = "$base/api/lyrics/${Uri.encode(trackhash)}"
        val builder = Request.Builder().url(url)
        if (force) builder.post("".toRequestBody(JSON)) else builder.get()
        runCatching {
            client.newCall(authed(builder)).execute().use { resp ->
                resp.body?.string()?.let { LyricsResult.from(JSONObject(it)) } ?: LyricsResult.NONE
            }
        }.getOrDefault(LyricsResult.NONE)
    }

    /** PUT /api/state with an action payload. Returns the response JSON (or empty). */
    suspend fun putState(payload: JSONObject): JSONObject = put("/api/state", payload)

    // ---- generic verbs (settings, admin, library ops) ----------------------

    suspend fun getObj(path: String): JSONObject = withContext(Dispatchers.IO) {
        runCatching { getJson(path) }.getOrDefault(JSONObject())
    }

    suspend fun post(path: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").post(body.toString().toRequestBody(JSON)))
        runCatching {
            client.newCall(req).execute().use { it.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject() }
        }.getOrDefault(JSONObject())
    }

    suspend fun put(path: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").put(body.toString().toRequestBody(JSON)))
        runCatching {
            client.newCall(req).execute().use { it.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject() }
        }.getOrDefault(JSONObject())
    }

    suspend fun delete(path: String): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").delete())
        runCatching {
            client.newCall(req).execute().use { it.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject() }
        }.getOrDefault(JSONObject())
    }

    // ---- helpers -----------------------------------------------------------

    private suspend fun getJson(path: String): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").get())
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            if (!resp.isSuccessful) throw ApiException(resp.code, text)
            JSONObject(text)
        }
    }

    private fun authed(builder: Request.Builder): Request {
        token?.let { builder.header("Authorization", "Bearer $it") }
        return builder.build()
    }

    class ApiException(val code: Int, val bodyText: String) : Exception("HTTP $code")

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        // Process-wide latest session token so the media DataSource (built in the
        // PlaybackService, which holds no api instance) can attach it as an
        // Authorization header at stream-open time instead of a ?token= query.
        @Volatile
        var sessionToken: String? = null
            private set

        fun normalizeBase(raw: String): String {
            var v = raw.trim()
            if (v.isEmpty()) return v
            if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) v = "http://$v"
            return v.trimEnd('/')
        }
    }
}
