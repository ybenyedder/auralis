package local.auralis.client.net

import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import local.auralis.client.i18n.Messages
import local.auralis.client.model.AuthResult
import local.auralis.client.model.BlendResult
import local.auralis.client.model.DownloadItem
import local.auralis.client.model.DownloadJobDto
import local.auralis.client.model.LibrarySnapshot
import local.auralis.client.model.ListeningStats
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.MelodyStatus
import local.auralis.client.model.OnlineTrack
import local.auralis.client.model.RecapResult
import local.auralis.client.model.RecoTrack
import local.auralis.client.model.RecommendResult
import local.auralis.client.model.ScanProgress
import local.auralis.client.model.SearchResult
import local.auralis.client.model.UserState
import local.auralis.client.model.objects
import local.auralis.client.model.stringArray
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
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
                            json.optString("error", Messages.t("auth.wrongCredentials")))
                    }
                }
            }.getOrElse { AuthResult(false, null, null, false, false, Messages.t("toast.serverUnreachable")) }
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

    // ---- recommendation flavours (web store/reco.ts fetch*) -----------------
    // All mirror the web fetchers: hashes only on the wire (the caller resolves
    // them against its library snapshot) and empty results on failure.

    /** Personalised radio around a seed track (web fetchRadio). */
    suspend fun recommendRadio(
        seed: String,
        exclude: List<String> = emptyList(),
        limit: Int = 25,
    ): List<RecoTrack> {
        val qs = StringBuilder("/api/recommend?seed=").append(Uri.encode(seed)).append("&limit=").append(limit)
        if (exclude.isNotEmpty()) qs.append("&exclude=").append(Uri.encode(exclude.take(200).joinToString(",")))
        return recoTracks(qs.toString())
    }

    /** "Discover" mix — taste-ranked tracks the user has never played (web fetchDiscovery). */
    suspend fun recommendDiscovery(limit: Int = 60): List<RecoTrack> =
        recoTracks("/api/recommend?mode=discovery&limit=$limit")

    /** Household Blend mix with another account (web fetchBlend): the shared mix
     *  plus its 0..100 compatibility score. */
    suspend fun recommendBlend(username: String, limit: Int = 80): BlendResult =
        runCatching { BlendResult.from(getObj("/api/recommend?blend=${Uri.encode(username)}&limit=$limit")) }
            .getOrDefault(BlendResult.EMPTY)

    /** One `{ tracks: RecoTrack[] }` recommend flavour; empty on failure. */
    private suspend fun recoTracks(path: String): List<RecoTrack> =
        runCatching { getObj(path).optJSONArray("tracks")?.objects()?.map { RecoTrack.from(it) } ?: emptyList() }
            .getOrDefault(emptyList())

    /** Account usernames (Blend shelf) minus nothing — the caller drops itself. */
    suspend fun accountNames(): List<String> =
        runCatching { getJson("/api/auth/accounts").stringArray("usernames") }.getOrDefault(emptyList())

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

    /** Local search + downloadable YouTube hits (server JS YouTube engine).
     *  online.enabled is false when the server has downloads disabled — callers
     *  hide the section then. Best-effort: offline/old servers get an empty result. */
    suspend fun searchOnline(query: String): Pair<Boolean, List<OnlineTrack>> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext false to emptyList()
        runCatching {
            val url = ("$base/api/search".toHttpUrlOrNull() ?: return@runCatching false to emptyList()).newBuilder()
                .addQueryParameter("q", query)
                .addQueryParameter("limit", "8")
                .addQueryParameter("online", "1")
                .build()
            client.newCall(authed(Request.Builder().url(url).get())).execute().use { resp ->
                val body = resp.body?.string()?.let { JSONObject(it) } ?: return@use false to emptyList()
                val online = body.optJSONObject("online") ?: return@use false to emptyList()
                val enabled = online.optBoolean("enabled", false)
                val arr = online.optJSONArray("results")
                val results = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                    arr?.optJSONObject(i)?.let { OnlineTrack.from(it) }?.takeIf { it.videoId.isNotBlank() }
                }
                enabled to results
            }
        }.getOrDefault(false to emptyList())
    }

    /** Start (or join) a server-side download job for one online hit. */
    suspend fun startDownload(videoId: String?, title: String, query: String): DownloadJobDto? {
        val body = JSONObject().put("title", title).put("query", query)
        if (videoId != null) body.put("videoId", videoId)
        val res = post("/api/download", body)
        val job = res.optJSONObject("job") ?: return null
        return DownloadJobDto.from(job).takeIf { it.id.isNotBlank() }
    }

    /** Start (or join) a download job from a plain text query — the hum-to-search
     *  "Ajouter à la bibliothèque" flow (query-only, no videoId). */
    suspend fun startDownloadQuery(query: String, title: String?): DownloadJobDto? {
        val body = JSONObject().put("query", query)
        if (title != null) body.put("title", title)
        val res = post("/api/download", body)
        val job = res.optJSONObject("job") ?: return null
        return DownloadJobDto.from(job).takeIf { it.id.isNotBlank() }
    }

    /** Bulk enqueue (playlist import → missing tracks): one job per item, in
     *  item order (POST /api/download `{ items }`, max 200 per batch). The
     *  server's own error text rides along so a failed start is never silent. */
    data class DownloadBatchResult(val jobs: List<DownloadJobDto>, val error: String?)

    suspend fun startDownloadBatch(items: List<DownloadItem>): DownloadBatchResult {
        if (items.isEmpty()) return DownloadBatchResult(emptyList(), null)
        val arr = JSONArray()
        for (item in items) {
            arr.put(JSONObject().put("query", item.query).apply {
                if (item.title != null) put("title", item.title)
            })
        }
        val res = post("/api/download", JSONObject().put("items", arr))
        val error = res.optString("error").ifBlank { null }
        if (!apiLastOk) return DownloadBatchResult(emptyList(), error)
        val jobs = res.optJSONArray("jobs")?.objects()?.map { DownloadJobDto.from(it) } ?: emptyList()
        return DownloadBatchResult(jobs, error)
    }

    /** Cancel a queued/running download job (DELETE /api/download?job=).
     *  Queued jobs and in-flight fetches both settle as "error"/"Annulé". */
    suspend fun cancelDownload(id: String): Boolean {
        if (id.isBlank()) return false
        return runCatching {
            delete("/api/download?job=${Uri.encode(id)}").optBoolean("ok", false)
        }.getOrDefault(false)
    }

    /** Every download job owned by this account (bare GET /api/download) — one
     *  request to poll a whole batch. Null on failure. */
    suspend fun downloadJobs(): List<DownloadJobDto>? = runCatching {
        getObj("/api/download").optJSONArray("jobs")?.objects()?.map { DownloadJobDto.from(it) } ?: emptyList()
    }.getOrNull()

    /** Poll one download job's status. */
    suspend fun downloadJob(id: String): DownloadJobDto? {
        val res = runCatching { getObj("/api/download?job=${Uri.encode(id)}") }.getOrDefault(JSONObject())
        val job = res.optJSONObject("job") ?: return null
        return DownloadJobDto.from(job).takeIf { it.id.isNotBlank() }
    }

    // ---- hum-to-search recognition + melody index --------------------------

    /** POST /api/recognize — upload the RAW recording bytes (humming, singing,
     *  whistling); the body is the audio itself, decoded server-side via ffmpeg.
     *  Returns the response JSON — check [apiLastOk] and the `error` field for
     *  failures (413 too big, 415 wrong type…). */
    suspend fun recognize(audio: ByteArray, contentType: String): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(
            Request.Builder().url("$base/api/recognize")
                .post(audio.toRequestBody(contentType.toMediaType())),
        )
        runCatching {
            client.newCall(req).execute().use { resp ->
                apiLastOk = resp.isSuccessful
                resp.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject()
            }
        }.getOrElse { apiLastOk = false; JSONObject() }
    }

    /** GET /api/library/melody — melody-index status (settings card). */
    suspend fun melodyStatus(): MelodyStatus? =
        runCatching { MelodyStatus.from(getJson("/api/library/melody")) }.getOrNull()

    /** POST /api/library/melody — start a melody-index pass (admin). Returns the
     *  response body; check [apiLastOk] + `error` for the failure verdict. */
    suspend fun startMelodyIndex(): JSONObject = post("/api/library/melody", JSONObject())

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

    // ---- lyrics forced alignment (web playbackSlice.alignLyrics) -------------

    /** POST /api/lyrics/<hash>/align — start (or join) the word-by-word karaoke
     *  alignment job. Returns `{state, message}`; state "ready" = already
     *  word-by-word, "no-source" = no synced lyrics to align, anything else means
     *  the detached job is running (poll [lyricsAlignStatus]). */
    suspend fun lyricsAlignStart(trackhash: String): JSONObject =
        post("/api/lyrics/${Uri.encode(trackhash)}/align", JSONObject())

    /** GET the same URL — poll the running alignment job's state. */
    suspend fun lyricsAlignStatus(trackhash: String): JSONObject =
        getObj("/api/lyrics/${Uri.encode(trackhash)}/align")

    // ---- admin backup + library scan/analysis ------------------------------

    /** POST /api/backup — the streamed SQLite snapshot (admin-only, rate-limited
     *  3 per 10 min). On failure `error` carries the server's message (or a
     *  network-error message). */
    data class BackupResult(val bytes: ByteArray?, val filename: String, val error: String?)

    suspend fun downloadBackup(): BackupResult = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base/api/backup").post("".toRequestBody(JSON)))
        runCatching {
            client.newCall(req).execute().use { resp ->
                val body = resp.body
                if (!resp.isSuccessful) {
                    // The rate limit (429) and admin gate answer with {"error": …}.
                    val err = body?.string()?.let { s ->
                        runCatching { JSONObject(s) }.getOrNull()?.optString("error")?.takeIf { it.isNotBlank() }
                    }
                    return@use BackupResult(null, "", err ?: Messages.t("toast.backupFailed"))
                }
                val cd = resp.header("content-disposition") ?: ""
                val name = Regex("filename=\"([^\"]+)\"").find(cd)?.groupValues?.get(1)
                    ?: "auralis-backup.db"
                BackupResult(body?.bytes() ?: ByteArray(0), name, null)
            }
        }.getOrElse { BackupResult(null, "", Messages.t("toast.serverUnreachable")) }
    }

    /** POST /api/library/analyze — start the background mood analysis (admin). */
    suspend fun analyzeLibrary(): Boolean = post("/api/library/analyze", JSONObject()).let { apiLastOk }

    /** The live `scan` progress object from /api/library (the full snapshot also
     *  carries it; parsing just the object keeps the poll light). Null on failure. */
    suspend fun scanProgress(): ScanProgress? = runCatching {
        getJson("/api/library").optJSONObject("scan")?.let { ScanProgress.from(it) }
    }.getOrNull()

    /** PUT /api/state with an action payload. Returns the response JSON (or empty). */
    suspend fun putState(payload: JSONObject): JSONObject = put("/api/state", payload)

    // ---- generic verbs (settings, admin, library ops) ----------------------

    // Outcome of the last post/put/delete: these helpers swallow network and HTTP
    // errors into an empty JSONObject (call sites expect a parseable body either
    // way), so callers that must surface failures check this right after their
    // call. Best-effort signal, read immediately — a concurrent request can
    // overwrite it.
    @Volatile
    var apiLastOk: Boolean = true
        private set

    suspend fun getObj(path: String): JSONObject = withContext(Dispatchers.IO) {
        runCatching { getJson(path) }.getOrDefault(JSONObject())
    }

    suspend fun post(path: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").post(body.toString().toRequestBody(JSON)))
        runCatching {
            client.newCall(req).execute().use { resp ->
                apiLastOk = resp.isSuccessful
                resp.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject()
            }
        }.getOrElse { apiLastOk = false; JSONObject() }
    }

    suspend fun put(path: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").put(body.toString().toRequestBody(JSON)))
        runCatching {
            client.newCall(req).execute().use { resp ->
                apiLastOk = resp.isSuccessful
                resp.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject()
            }
        }.getOrElse { apiLastOk = false; JSONObject() }
    }

    suspend fun delete(path: String): JSONObject = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url("$base$path").delete())
        runCatching {
            client.newCall(req).execute().use { resp ->
                apiLastOk = resp.isSuccessful
                resp.body?.string()?.let { s -> JSONObject(s) } ?: JSONObject()
            }
        }.getOrElse { apiLastOk = false; JSONObject() }
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
            if (!Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(v)) {
                // No scheme typed: a LAN address (IP, localhost, .local) is a box
                // serving plain http, but a public hostname almost certainly has
                // TLS — default to https there instead of posting the password in
                // cleartext across the internet. An explicit http:// still wins.
                val host = v.substringBefore('/').substringBefore(':')
                val lan = host == "localhost" || host.endsWith(".local") ||
                    Regex("^(\\d{1,3}\\.){3}\\d{1,3}$").matches(host)
                v = (if (lan) "http://" else "https://") + v
            }
            return v.trimEnd('/')
        }
    }
}
