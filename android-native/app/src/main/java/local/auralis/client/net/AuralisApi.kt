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
// token (also accepted as ?token= for media/streaming, which ExoPlayer uses since
// it can't easily attach headers). Bearer clients are exempt from CSRF, so state
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
    }

    fun isConfigured(): Boolean = base.isNotBlank() && !token.isNullOrBlank()

    // ---- URL builders (used by the player / image loader) ------------------

    fun streamUrl(filepath: String): String {
        val encoded = filepath.split(Regex("[\\\\/]+"))
            .filter { it.isNotBlank() }
            .joinToString("/") { Uri.encode(it) }
        return appendToken("$base/api/stream/$encoded")
    }

    /** Absolute URL for an `image` field like "/api/art/<hash>" (art is open; token harmless). */
    fun assetUrl(image: String?): String? {
        if (image.isNullOrBlank()) return null
        val path = if (image.startsWith("http")) return image else image
        return appendToken(base + (if (path.startsWith("/")) path else "/$path"))
    }

    private fun appendToken(url: String): String {
        val t = token ?: return url
        val sep = if (url.contains('?')) '&' else '?'
        return "$url${sep}token=${Uri.encode(t)}"
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
        val url = "$base/api/search".toHttpUrlOrNull()!!.newBuilder()
            .addQueryParameter("q", query)
            .addQueryParameter("limit", "60")
            .build()
        runCatching {
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

        fun normalizeBase(raw: String): String {
            var v = raw.trim()
            if (v.isEmpty()) return v
            if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) v = "http://$v"
            return v.trimEnd('/')
        }
    }
}
