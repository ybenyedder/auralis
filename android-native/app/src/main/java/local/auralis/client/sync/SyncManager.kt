package local.auralis.client.sync

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import local.auralis.client.net.AuralisApi
import local.auralis.client.util.DeviceIdUtil
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.util.concurrent.TimeUnit

/**
 * Realtime sync client for Auralis Connect (Spotify Connect-like), mirroring the
 * web client's src/store/sync.ts. One long-lived SSE connection to /api/sync/stream
 * carries the device roster, every device's now-playing snapshot and transport
 * commands aimed at us; we publish our own snapshot over POST /api/sync.
 *
 * SSE is parsed by hand over the streaming response body — the okhttp-sse artifact
 * isn't in the offline Gradle cache this project pins its deps to, and the wire
 * format is just "event:"/"data:" lines, so a tiny parser avoids the dependency.
 */
class SyncManager(
    private val api: AuralisApi,
    context: Context,
) {
    companion object {
        private const val TAG = "AuralisSync"
        private const val PREFS = "auralis_sync"
        private const val KEY_ID = "device_id"
        private const val KEY_NAME = "device_name"
        private const val DEFAULT_NAME = "Téléphone"
        /** Minimum gap between two state POSTs (the listener fires on every event). */
        private const val PUBLISH_MIN_INTERVAL_MS = 1500L
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        // The SSE stream is idle between heartbeats (25s server-side), so the read
        // timeout must exceed that or OkHttp kills a perfectly healthy connection.
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private var deviceId: String? = null
    private var streamJob: Job? = null

    @Volatile private var wantConnected = false

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    private val _devices = MutableStateFlow<List<SyncDevice>>(emptyList())
    val devices: StateFlow<List<SyncDevice>> = _devices

    private val _nowPlaying = MutableStateFlow<Map<String, RemoteNowPlaying>>(emptyMap())
    val nowPlaying: StateFlow<Map<String, RemoteNowPlaying>> = _nowPlaying

    /** Device this app is remote-controlling (null = local playback). */
    private val _controllingId = MutableStateFlow<String?>(null)
    val controllingId: StateFlow<String?> = _controllingId

    /** Transport commands aimed at this device, for PlayerHolder to execute. */
    private val _incomingCommand = MutableStateFlow<RemoteCommand?>(null)
    val incomingCommand: StateFlow<RemoteCommand?> = _incomingCommand

    // Publish throttling: pushSnapshot() fires on every player event, but the hub
    // only needs a snapshot when the track/transport actually changes. The last
    // published (trackhash + isPlaying) pair forces an immediate re-publish on
    // change; everything else waits out PUBLISH_MIN_INTERVAL_MS.
    private var lastPublishAt = 0L
    private var lastPublishedKey: String? = null

    fun getOrCreateDeviceId(): String {
        deviceId?.let { return it }
        val stored = prefs.getString(KEY_ID, null)
        val id = stored ?: DeviceIdUtil.getDeviceId(appContext).also {
            prefs.edit().putString(KEY_ID, it).apply()
        }
        deviceId = id
        return id
    }

    fun deviceName(): String = prefs.getString(KEY_NAME, null) ?: DEFAULT_NAME

    fun setDeviceName(name: String) {
        prefs.edit().putString(KEY_NAME, name).apply()
        // Re-register under the new name (the roster shows the query-param name).
        if (wantConnected) { wantConnected = false; streamJob?.cancel(); connect() }
    }

    /** Open (or re-open, forever with backoff) the SSE stream. Safe to call repeatedly. */
    fun connect() {
        if (wantConnected) return
        wantConnected = true
        streamJob = scope.launch { streamLoop() }
    }

    fun disconnect() {
        wantConnected = false
        streamJob?.cancel()
        streamJob = null
        _connected.value = false
        _devices.value = emptyList()
        _nowPlaying.value = emptyMap()
        _controllingId.value = null
    }

    /** Start/stop remote-controlling another device. */
    fun control(deviceId: String?) {
        _controllingId.value = deviceId?.takeIf { it != getOrCreateDeviceId() }
    }

    /**
     * Push this device's playback snapshot to the hub. Fire-and-forget: called from
     * PlayerHolder's listener callbacks (not a coroutine), so it launches its own
     * IO job and throttles repeats.
     */
    fun publishState(
        trackhash: String?,
        title: String?,
        artist: String?,
        image: String?,
        position: Long,
        duration: Long,
        isPlaying: Boolean,
    ) {
        if (!wantConnected) return // hub doesn't know us until the stream registers
        if (_controllingId.value != null) return // remote mode: don't speak for the phone
        val now = System.currentTimeMillis()
        val key = "$trackhash|$isPlaying"
        if (key == lastPublishedKey && now - lastPublishAt < PUBLISH_MIN_INTERVAL_MS) return
        lastPublishAt = now
        lastPublishedKey = key
        val payload = JSONObject()
            .put("action", "state")
            .put("deviceId", getOrCreateDeviceId())
            .put("trackhash", trackhash ?: JSONObject.NULL)
            .put("title", title ?: JSONObject.NULL)
            .put("artist", artist ?: JSONObject.NULL)
            .put("image", image ?: JSONObject.NULL)
            .put("position", position)
            .put("duration", duration)
            .put("isPlaying", isPlaying)
        scope.launch {
            runCatching { postSync(payload) }
                .onFailure { Log.d(TAG, "publishState failed: ${it.message}") }
        }
    }

    /** Send a transport command (play/pause/next/prev/seek) to the controlled device. */
    fun sendCommand(type: String, position: Long? = null) {
        val target = _controllingId.value ?: return
        val payload = JSONObject()
            .put("action", "command")
            .put("target", target)
            .put("from", getOrCreateDeviceId())
            .put("type", type)
            .apply { position?.let { put("position", it) } }
        scope.launch {
            runCatching { postSync(payload) }
                .onFailure { Log.d(TAG, "sendCommand failed: ${it.message}") }
        }
    }

    private suspend fun postSync(payload: JSONObject) = withContext(Dispatchers.IO) {
        val token = api.token ?: throw IllegalStateException("not logged in")
        val req = Request.Builder()
            .url("${api.base}/api/sync")
            .header("Authorization", "Bearer $token")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
        }
    }

    /**
     * Keep a live stream up while [wantConnected]: waits for login when the token
     * isn't configured yet, then blocks reading SSE frames; on any drop, reconnects
     * with exponential backoff (mirrors the web client's error handler).
     */
    private suspend fun streamLoop() {
        var backoff = 1000L
        while (wantConnected) {
            val token = api.token
            if (api.base.isBlank() || token.isNullOrBlank()) {
                delay(5000) // pre-login: PlayerHolder connects before boot() finishes
                continue
            }
            try {
                readStream(token)
                backoff = 1000L // clean server close: reset
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.d(TAG, "stream dropped: ${e.message}")
            }
            _connected.value = false
            if (!wantConnected) break
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(30_000L)
        }
    }

    private suspend fun readStream(token: String) = withContext(Dispatchers.IO) {
        // The token rides in the Authorization header, never in the query:
        // EventSource can't set headers but this is a hand-rolled OkHttp call,
        // and a token in a URL lands in the server/proxy access logs forever.
        val qs = "device=${getOrCreateDeviceId()}&name=${deviceName()}&kind=mobile"
        val url = "${api.base}/api/sync/stream?$qs"
        val req = Request.Builder().url(url).get()
            .header("Authorization", "Bearer $token")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IllegalStateException("stream HTTP ${resp.code}")
            _connected.value = true
            Log.i(TAG, "sync stream connected as ${deviceName()}")
            val reader = BufferedReader(resp.body?.charStream() ?: throw IllegalStateException("empty body"))
            var event = "message"
            val data = StringBuilder()
            while (wantConnected) {
                // A blocking read can't be cancelled by Job.cancel(); readLine only
                // unblocks on real data / stream close, so the 60s read timeout is
                // what actually bounds shutdown latency here.
                val line = reader.readLine() ?: break
                when {
                    line.startsWith("event:") -> event = line.removePrefix("event:").trim()
                    line.startsWith("data:") -> {
                        if (data.isNotEmpty()) data.append('\n')
                        data.append(line.removePrefix("data:").trim())
                    }
                    line.isEmpty() && data.isNotEmpty() -> {
                        handleFrame(event, data.toString())
                        event = "message"
                        data.setLength(0)
                    }
                }
            }
        }
    }

    private fun handleFrame(event: String, data: String) {
        runCatching {
            when (event) {
                "devices" -> {
                    val arr = JSONArray(data)
                    _devices.value = (0 until arr.length()).map { i ->
                        val o = arr.getJSONObject(i)
                        SyncDevice(
                            id = o.getString("id"),
                            name = o.getString("name"),
                            kind = o.getString("kind"),
                            lastSeen = o.optLong("lastSeen"),
                            playing = o.optBoolean("playing"),
                        )
                    }
                    // The device we controlled vanished → fall back to local control.
                    val ctrl = _controllingId.value
                    if (ctrl != null && _devices.value.none { it.id == ctrl }) control(null)
                }
                "nowplaying" -> {
                    val o = JSONObject(data)
                    val id = o.getString("deviceId")
                    val np = RemoteNowPlaying(
                        deviceId = id,
                        trackhash = o.optString("trackhash").takeIf { it.isNotEmpty() && it != "null" },
                        title = o.optString("title").takeIf { it.isNotEmpty() && it != "null" },
                        artist = o.optString("artist").takeIf { it.isNotEmpty() && it != "null" },
                        image = o.optString("image").takeIf { it.isNotEmpty() && it != "null" },
                        position = o.optLong("position"),
                        duration = o.optLong("duration"),
                        isPlaying = o.optBoolean("isPlaying"),
                        receivedAt = System.currentTimeMillis(),
                    )
                    _nowPlaying.value = _nowPlaying.value + (id to np)
                }
                "command" -> {
                    val o = JSONObject(data)
                    val target = o.getString("target")
                    if (target == getOrCreateDeviceId() && o.optString("from") != getOrCreateDeviceId()) {
                        // Don't execute remote commands while we control another
                        // device (the web client pauses local audio for that).
                        if (_controllingId.value == null) {
                            _incomingCommand.value = RemoteCommand(
                                type = o.getString("type"),
                                position = if (o.has("position") && !o.isNull("position")) o.optLong("position") else null,
                            )
                        }
                    }
                }
                // "heartbeat" keep-alive and unknown events: ignored.
            }
        }.onFailure { Log.d(TAG, "bad frame ($event): ${it.message}") }
    }
}

/** Another device on the user's hub (the roster from the `devices` event). */
data class SyncDevice(
    val id: String,
    val name: String,
    val kind: String,
    val lastSeen: Long,
    val playing: Boolean,
)

/** A remote device's now-playing snapshot (`nowplaying` event). */
data class RemoteNowPlaying(
    val deviceId: String,
    val trackhash: String?,
    val title: String?,
    val artist: String?,
    val image: String?,
    val position: Long,
    val duration: Long,
    val isPlaying: Boolean,
    /** Local arrival time — the scrubber interpolates from this, never server clocks. */
    val receivedAt: Long,
)

/** A transport command aimed at this device (`command` event). */
data class RemoteCommand(
    val type: String,
    val position: Long? = null,
)
