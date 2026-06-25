package local.auralis.client.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auralis")

// Local device prefs: the chosen server + session token (so the connect/login
// screens are skipped on relaunch) and playback preferences. Library content and
// per-user state (favorites/playlists/recents) stay server-authoritative.
class Prefs(context: Context) {
    private val store = context.applicationContext.dataStore

    data class Snapshot(
        val serverBase: String,
        val token: String?,
        val username: String?,
        val volume: Float,
        val shuffle: Boolean,
        val repeat: String,
        val autoplay: Boolean,
        val karaoke: Boolean,
        val lyricsOffset: Float,
        val theme: String,
    )

    suspend fun load(): Snapshot {
        val p = store.data.first()
        return Snapshot(
            serverBase = p[SERVER_BASE].orEmpty(),
            token = p[TOKEN],
            username = p[USERNAME],
            volume = p[VOLUME] ?: 0.85f,
            shuffle = p[SHUFFLE] ?: false,
            repeat = p[REPEAT] ?: "off",
            autoplay = p[AUTOPLAY] ?: true,
            karaoke = p[KARAOKE] ?: true,
            lyricsOffset = p[LYRICS_OFFSET] ?: 0.15f,
            theme = p[THEME] ?: "oxide",
        )
    }

    suspend fun setServer(base: String, token: String?, username: String?) {
        store.edit {
            it[SERVER_BASE] = base
            if (token != null) it[TOKEN] = token else it.remove(TOKEN)
            if (username != null) it[USERNAME] = username else it.remove(USERNAME)
        }
    }

    suspend fun clearSession() {
        store.edit { it.remove(TOKEN); it.remove(USERNAME) }
    }

    suspend fun setPlayback(
        volume: Float? = null,
        shuffle: Boolean? = null,
        repeat: String? = null,
        autoplay: Boolean? = null,
        karaoke: Boolean? = null,
        lyricsOffset: Float? = null,
        theme: String? = null,
    ) {
        store.edit {
            volume?.let { v -> it[VOLUME] = v }
            shuffle?.let { v -> it[SHUFFLE] = v }
            repeat?.let { v -> it[REPEAT] = v }
            autoplay?.let { v -> it[AUTOPLAY] = v }
            karaoke?.let { v -> it[KARAOKE] = v }
            lyricsOffset?.let { v -> it[LYRICS_OFFSET] = v }
            theme?.let { v -> it[THEME] = v }
        }
    }

    /** Increment the cold-start launch counter and return the new total. */
    suspend fun bumpLaunchCount(): Int {
        var n = 0
        store.edit {
            val c = (it[LAUNCH_COUNT] ?: 0) + 1
            it[LAUNCH_COUNT] = c
            n = c
        }
        return n
    }

    suspend fun saveLastSession(json: String) { store.edit { it[LAST_SESSION] = json } }
    suspend fun loadLastSession(): String? = store.data.first()[LAST_SESSION]
    suspend fun clearLastSession() { store.edit { it.remove(LAST_SESSION) } }

    suspend fun lastMilestone(): Int = store.data.first()[MILESTONE] ?: 0
    suspend fun setMilestone(v: Int) { store.edit { it[MILESTONE] = v } }

    val themeFlow = store.data.map { it[THEME] ?: "oxide" }

    companion object {
        private val SERVER_BASE = stringPreferencesKey("server_base")
        private val TOKEN = stringPreferencesKey("token")
        private val USERNAME = stringPreferencesKey("username")
        private val VOLUME = floatPreferencesKey("volume")
        private val SHUFFLE = booleanPreferencesKey("shuffle")
        private val REPEAT = stringPreferencesKey("repeat")
        private val AUTOPLAY = booleanPreferencesKey("autoplay")
        private val KARAOKE = booleanPreferencesKey("karaoke")
        private val LYRICS_OFFSET = floatPreferencesKey("lyrics_offset")
        private val THEME = stringPreferencesKey("theme")
        private val LAUNCH_COUNT = intPreferencesKey("launch_count")
        private val LAST_SESSION = stringPreferencesKey("last_session")
        private val MILESTONE = intPreferencesKey("streak_milestone")
    }
}
