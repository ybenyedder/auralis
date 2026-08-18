package local.auralis.client.sync

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import local.auralis.client.net.AuralisApi
import local.auralis.client.util.DeviceIdUtil
import local.auralis.client.util.logDebug
import local.auralis.client.util.logInfo
import okhttp3.*
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Real-time sync manager for Auralis Connect (Spotify Connect-like feature).
 * Manages SSE connection to /api/sync/stream, publishes device state,
 * and handles incoming remote commands from other devices.
 *
 * This allows an Android phone to control/be controlled by other Auralis instances
 * (desktop web, mobile web, etc.) running on the same user account.
 */
class SyncManager(
    private val api: AuralisApi,
    private val context: Context
) {
    companion object {
        private const val KEY_DEVICE_ID = "auralis_device_id"
        private const val KEY_DEVICE_NAME = "auralis_device_name"
        private const val PREFS_NAME = "auralis_sync"

        fun getDefaultDeviceName(): String = "Android"
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private var eventSource: EventSource? = null
    private var deviceId: String? = null

    // Device info
    private val _deviceName = MutableStateFlow(getDefaultDeviceName())
    val deviceName: StateFlow<String> = _deviceName

    // Connected devices list
    private val _devices = MutableStateFlow<List<SyncDevice>>(emptyList())
    val devices: StateFlow<List<SyncDevice>> = _devices

    // Now playing snapshots from other devices
    private val _nowPlaying = MutableStateFlow<Map<String, RemoteNowPlaying>>(emptyMap())
    val nowPlaying: StateFlow<Map<String, RemoteNowPlaying>> = _nowPlaying

    // Whether we're controlling another device
    private val _controllingId = MutableStateFlow<String?>(null)
    val controllingId: StateFlow<String?> = _controllingId

    // Connection state
    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected

    // Remote commands we receive (play, pause, next, prev, seek)
    private val _remoteCommand = MutableStateFlow<RemoteCommand?>(null)
    val remoteCommand: StateFlow<RemoteCommand?> = _remoteCommand

    // Incoming commands flow for PlayerHolder to collect
    private val _incomingCommands = MutableStateFlow<RemoteCommand?>(null)
    val incomingCommands: StateFlow<RemoteCommand?> = _incomingCommands

    /**
     * Initialize or get the device ID from persistent storage.
     */
    fun getOrCreateDeviceId(): String {
        deviceId?.let { return it }
        val id = prefs.getString(KEY_DEVICE_ID, null)
        if (id != null) {
            deviceId = id
            return id
        }
        val newId = DeviceIdUtil.getDeviceId(context)
        prefs.edit().putString(KEY_DEVICE_ID, newId).apply()
        deviceId = newId
        return newId
    }

    /**
     * Set a custom device name (shown to other users).
     */
    fun setDeviceName(name: String) {
        prefs.edit().putString(KEY_DEVICE_NAME, name).apply()
        _deviceName.value = name
        // Reconnect to update the server
        if (_connected.value) {
            disconnect()
            connect()
        }
    }

    /**
     * Connect to the sync hub and start listening for events.
     * Call this when the user logs in or when the app foregrounds.
     */
    fun connect() {
        if (_connected.value) return

        val id = getOrCreateDeviceId()
        val name = prefs.getString(KEY_DEVICE_NAME, getDefaultDeviceName())
        val baseUrl = api.base

        // Build SSE URL with query params (EventSource can't set headers, so we use ?token=)
        val token = api.token
        val url = Uri.parse("$baseUrl/api/sync/stream")
            .buildUpon()
            .appendQueryParameter("device", id)
            .appendQueryParameter("name", name)
            .appendQueryParameter("kind", "mobile")
            .appendQueryParameter("token", token) // Auth via query for SSE
            .build()
            .toString()

        logInfo("SyncManager connecting to: $url")

        val request = Request.Builder()
            .url(url)
            .get()
            .build()

        eventSource = EventSourceFactory.createEventSource(request, object : EventSourceListener {
            override fun onOpen(eventSource: EventSource, response: Response) {
                logInfo("SyncManager SSE connection opened")
                _connected.value = true
            }

            override fun onClosed(eventSource: EventSource) {
                logInfo("SyncManager SSE connection closed")
                _connected.value = false
                // Clear state
                _devices.value = emptyList()
                _nowPlaying.value = emptyMap()
                _controllingId.value = null
            }

            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String
            ) {
                logDebug("SyncManager event: $type | data: $data")
                when (type) {
                    "ready" -> handleReady(data)
                    "devices" -> handleDevices(data)
                    "nowPlaying" -> handleNowPlaying(data)
                    "command" -> handleCommand(data)
                    "heartbeat" -> { /* keep-alive */ }
                }
            }

            override fun onMessage(
                eventSource: EventSource,
                message: String?
            ) {
                // Raw SSE message (should be handled in onEvent)
                logDebug("SyncManager raw message: $message")
            }

            override fun onFailure(
                eventSource: EventSource,
                e: IOException?,
                response: Response?
            ) {
                logDebug("SyncManager connection failed: $e")
                _connected.value = false
            }

            override fun onRetry(
                eventSource: EventSource,
                originalRequest: Request
            ): Request {
                // Retry with backoff
                return originalRequest
            }
        })

        // Start the SSE connection (blocks in a separate thread)
        eventSource?.start()
    }

    /**
     * Disconnect from the sync hub.
     * Call this when the user logs out or when the app backgrounds.
     */
    fun disconnect() {
        eventSource?.close()
        eventSource = null
        _connected.value = false
        _devices.value = emptyList()
        _nowPlaying.value = emptyMap()
        _controllingId.value = null
    }

    /**
     * Publish the current playback state to the sync hub.
     * Call this whenever the track changes or play/pause toggles.
     */
    suspend fun publishState(
        trackhash: String?,
        title: String?,
        artist: String?,
        image: String?,
        position: Long,
        duration: Long,
        isPlaying: Boolean
    ) {
        publishNowPlaying(trackhash, title, artist, image, position, duration, isPlaying)
    }

    /**
     * Internal method to publish the current playback state to the sync hub.
     */
    private suspend fun publishNowPlaying(
        trackhash: String?,
        title: String?,
        artist: String?,
        image: String?,
        position: Long,
        duration: Long,
        isPlaying: Boolean
    ) {
        if (!_connected.value) return

        val deviceId = getOrCreateDeviceId()
        try {
            val payload = JSONObject().apply {
                put("action", "state")
                put("deviceId", deviceId)
                put("trackhash", trackhash)
                put("title", title)
                put("artist", artist)
                put("image", image)
                put("position", position)
                put("duration", duration)
                put("isPlaying", isPlaying)
            }

            withContext(Dispatchers.IO) {
                val url = Uri.parse("${api.base}/api/sync").build().toString()
                val mediaType = MediaType.parse("application/json; charset=utf-8")
                val body = payload.toString().toRequestBody(mediaType)
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer ${api.token}")
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        logDebug("Failed to publish now-playing: ${response.code}")
                    }
                }
            }
        } catch (e: Exception) {
            logDebug("Error publishing now-playing: ${e.message}")
        }
    }

    /**
     * Send a transport command to a remote device.
     */
    suspend fun sendCommand(
        targetDeviceId: String,
        command: String,
        position: Long? = null
    ): Boolean {
        if (!_connected.value) return false

        try {
            val deviceId = getOrCreateDeviceId()
            val payload = JSONObject().apply {
                put("action", "command")
                put("target", targetDeviceId)
                put("from", deviceId)
                put("type", command)
                position?.let { put("position", it) }
            }

            withContext(Dispatchers.IO) {
                val url = Uri.parse("${api.base}/api/sync").build().toString()
                val mediaType = MediaType.parse("application/json; charset=utf-8")
                val body = payload.toString().toRequestBody(mediaType)
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer ${api.token}")
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    response.isSuccessful
                }
            }
        } catch (e: Exception) {
            logDebug("Error sending command: ${e.message}")
            return false
        }
        return true
    }

    /**
     * Stop controlling the remote device and return to local control.
     */
    fun stopControlling() {
        _controllingId.value = null
    }

    // --- Event handlers ---

    private fun handleReady(data: String) {
        try {
            val json = JSONObject(data)
            logInfo("SyncManager ready: ${json.optString("id")}")
        } catch (e: Exception) {
            logDebug("Error parsing ready event: ${e.message}")
        }
    }

    private fun handleDevices(data: String) {
        try {
            val jsonArray = JSONArray(data)
            val devices = mutableListOf<SyncDevice>()
            for (i in 0 until jsonArray.length()) {
                val json = jsonArray.getJSONObject(i)
                devices.add(SyncDevice(
                    id = json.getString("id"),
                    name = json.getString("name"),
                    kind = json.getString("kind"),
                    lastSeen = json.getLong("lastSeen"),
                    playing = json.getBoolean("playing")
                ))
            }
            _devices.value = devices
            logInfo("SyncManager devices updated: ${devices.size} devices")
        } catch (e: Exception) {
            logDebug("Error parsing devices event: ${e.message}")
        }
    }

    private fun handleNowPlaying(data: String) {
        try {
            val json = JSONObject(data)
            val deviceId = json.getString("deviceId")
            val np = RemoteNowPlaying(
                deviceId = deviceId,
                trackhash = json.optString("trackhash").takeIf { it != "null" },
                title = json.optString("title").takeIf { it != "null" },
                artist = json.optString("artist").takeIf { it != "null" },
                image = json.optString("image").takeIf { it != "null" },
                position = json.getLong("position"),
                duration = json.getLong("duration"),
                isPlaying = json.getBoolean("isPlaying"),
                updatedAt = json.getLong("updatedAt"),
                receivedAt = System.currentTimeMillis()
            )

            val current = _nowPlaying.value.toMutableMap()
            current[deviceId] = np
            _nowPlaying.value = current
            logDebug("SyncManager nowPlaying updated for $deviceId: ${np.title}")
        } catch (e: Exception) {
            logDebug("Error parsing nowPlaying event: ${e.message}")
        }
    }

    private fun handleCommand(data: String) {
        try {
            val json = JSONObject(data)
            val target = json.getString("target")
            val from = json.getString("from")
            val type = json.getString("type")
            val position = if (json.has("position")) json.getLong("position") else null

            // Only process commands meant for us (target matches our device ID)
            val myId = getOrCreateDeviceId()
            if (target != myId) return

            val command = RemoteCommand(
                from = from,
                type = type,
                position = position
            )

            logInfo("SyncManager received command from $from: $type")
            _remoteCommand.value = command
            _incomingCommands.value = command
        } catch (e: Exception) {
            logDebug("Error parsing command event: ${e.message}")
        }
    }
}

/**
 * Sync device representation (other devices on the network).
 */
data class SyncDevice(
    val id: String,
    val name: String,
    val kind: String,
    val lastSeen: Long,
    val playing: Boolean
)

/**
 * Remote now-playing snapshot (from another device).
 */
data class RemoteNowPlaying(
    val deviceId: String,
    val trackhash: String?,
    val title: String?,
    val artist: String?,
    val image: String?,
    val position: Long,
    val duration: Long,
    val isPlaying: Boolean,
    val updatedAt: Long,
    val receivedAt: Long
)

/**
 * Remote command received from another device.
 */
data class RemoteCommand(
    val from: String,
    val type: String,
    val position: Long?
)
