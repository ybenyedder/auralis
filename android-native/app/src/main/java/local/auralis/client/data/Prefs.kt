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
        val normalization: String,
        val crossfade: Int,
        val eqEnabled: Boolean,
        val eqPreset: String,
        val eqBands: List<Float>,
        /** UI language: "fr" (default) | "en". */
        val locale: String = "fr",
        /** Appearance mode: "dark" | "light" | "auto" (system). */
        val theme: String = "auto",
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
            normalization = p[NORMALIZATION] ?: "track",
            crossfade = p[CROSSFADE] ?: 0,
            eqEnabled = p[EQ_ENABLED] ?: true,
            eqPreset = p[EQ_PRESET] ?: "flat",
            eqBands = parseEqBands(p[EQ_BANDS]),
            locale = p[LOCALE] ?: "fr",
            theme = p[THEME] ?: "auto",
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
        // Wipe the saved queue too: restoring the PREVIOUS account's last session
        // into a newly-logged-in profile would play (and scrobble) someone else's
        // queue against this account.
        store.edit { it.remove(TOKEN); it.remove(USERNAME); it.remove(LAST_SESSION) }
    }

    suspend fun setPlayback(
        volume: Float? = null,
        shuffle: Boolean? = null,
        repeat: String? = null,
        autoplay: Boolean? = null,
        karaoke: Boolean? = null,
        lyricsOffset: Float? = null,
        normalization: String? = null,
        crossfade: Int? = null,
        eqEnabled: Boolean? = null,
        eqPreset: String? = null,
        eqBands: List<Float>? = null,
    ) {
        store.edit {
            volume?.let { v -> it[VOLUME] = v }
            shuffle?.let { v -> it[SHUFFLE] = v }
            repeat?.let { v -> it[REPEAT] = v }
            autoplay?.let { v -> it[AUTOPLAY] = v }
            karaoke?.let { v -> it[KARAOKE] = v }
            lyricsOffset?.let { v -> it[LYRICS_OFFSET] = v }
            normalization?.let { v -> it[NORMALIZATION] = v }
            crossfade?.let { v -> it[CROSSFADE] = v }
            eqEnabled?.let { v -> it[EQ_ENABLED] = v }
            eqPreset?.let { v -> it[EQ_PRESET] = v }
            eqBands?.let { v -> it[EQ_BANDS] = v.joinToString(",") }
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

    /** The last fully-elapsed month whose mood recap was already announced. */
    suspend fun lastRecapSeen(): String = store.data.first()[RECAP_SEEN] ?: ""
    suspend fun setRecapSeen(month: String) { store.edit { it[RECAP_SEEN] = month } }

    /** The weekly "À découvrir" freeze (web DailyMixes localStorage): the ISO week
     *  key the mix belongs to + its trackhashes. Null when never stored. */
    suspend fun discoverMix(): Pair<String, List<String>>? {
        val p = store.data.first()
        val week = p[DISCOVER_WEEK] ?: return null
        val hashes = p[DISCOVER_HASHES].orEmpty().split(",").filter { it.isNotBlank() }
        return week to hashes
    }

    suspend fun setDiscoverMix(week: String, hashes: List<String>) {
        store.edit {
            it[DISCOVER_WEEK] = week
            it[DISCOVER_HASHES] = hashes.joinToString(",")
        }
    }

    /** Persist the UI language ("fr" | "en") and appearance mode ("dark" | "light" | "auto"). */
    suspend fun setLocale(locale: String) { store.edit { it[LOCALE] = locale } }
    suspend fun setTheme(mode: String) { store.edit { it[THEME] = mode } }

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
        private val NORMALIZATION = stringPreferencesKey("normalization")
        private val CROSSFADE = intPreferencesKey("crossfade")
        private val EQ_ENABLED = booleanPreferencesKey("eq_enabled")
        private val EQ_PRESET = stringPreferencesKey("eq_preset")
        private val EQ_BANDS = stringPreferencesKey("eq_bands")
        private val THEME = stringPreferencesKey("theme")
        private val LOCALE = stringPreferencesKey("locale")
        private val LAUNCH_COUNT = intPreferencesKey("launch_count")
        private val LAST_SESSION = stringPreferencesKey("last_session")
        private val MILESTONE = intPreferencesKey("streak_milestone")
        private val RECAP_SEEN = stringPreferencesKey("recap_seen")
        private val DISCOVER_WEEK = stringPreferencesKey("discover_week")
        private val DISCOVER_HASHES = stringPreferencesKey("discover_hashes")

        /** The 6 EQ band gains stored as a comma-separated list; anything that
         *  isn't exactly six parseable values falls back to a flat curve. */
        private fun parseEqBands(raw: String?): List<Float> {
            val parsed = raw?.split(",")?.mapNotNull { it.trim().toFloatOrNull() } ?: emptyList()
            return if (parsed.size == 6) parsed else listOf(0f, 0f, 0f, 0f, 0f, 0f)
        }
    }
}
