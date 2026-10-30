package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the smart-playlist port in [SmartList.kt]: the web rule
 * semantics (src/lib/auralis/smartlist.ts), the 7 presets evaluated against a
 * fixture library, sorting/limit behaviour and the `rules` wire JSON round-trip.
 */
class SmartListTest {

    private val now = 1_700_000_000_000L
    private val dayMs = 86_400_000L

    private fun track(
        hash: String,
        title: String,
        artist: String? = "Artiste",
        genre: String? = null,
        mood: String? = null,
        energy: Double? = null,
        bpm: Double? = null,
        year: Int? = null,
        addedAt: Long? = null,
        lossless: Boolean = false,
        artists: List<ArtistRef> = emptyList(),
    ) = Track(
        trackhash = hash, title = title, artist = artist, album = null, albumhash = null,
        duration = null, filepath = null, folder = null, image = null,
        isFavorite = false, playcount = 0, disc = null, track = null, year = year,
        genre = genre, mood = mood, energy = energy, bpm = bpm, gain = null,
        bitrate = null, samplerate = null, codec = null, lossless = lossless,
        size = null, hasLyrics = false, addedAt = addedAt, color = null, artists = artists,
    )

    // Four fixture tracks covering every rule field.
    private val t1 = track("h1", "Zeta", genre = "Synthwave", mood = "chill", energy = 0.9, bpm = 128.0, year = 1984, addedAt = now - 5 * dayMs, lossless = true)
    private val t2 = track("h2", "Alpha10", genre = "Jazz", mood = "focus", energy = 0.3, bpm = 120.0, year = 2001, addedAt = now - 40 * dayMs)
    private val t3 = track("h3", "Alpha 2", genre = "synthwave", mood = "melancholy", energy = 0.7, bpm = 170.0, year = 2020, addedAt = now - 2 * dayMs, lossless = true)
    private val t4 = track("h4", "Beta", genre = "Pop", mood = "happy", energy = 0.5, bpm = 90.0, year = 2010, addedAt = now - 10 * dayMs)
    private val lib = listOf(t1, t2, t3, t4)
    private val ctx = SmartContext(favorites = setOf("h3"), playCounts = mapOf("h1" to 5, "h3" to 2))

    private fun eval(config: SmartConfig, ctx: SmartContext = this.ctx): List<String> =
        evaluateSmartList(lib, config, ctx, now).map { it.trackhash }

    // ---- accent folding ----------------------------------------------------

    @Test
    fun `foldAccents strips diacritics and lowercases like the web`() {
        assertEquals("neon", foldAccents("Néon"))
        assertEquals("ete", foldAccents("Été"))
        assertEquals("aeroport", foldAccents("Aéroport"))
        assertEquals("plain", foldAccents("Plain"))
    }

    // ---- rule semantics ----------------------------------------------------

    @Test
    fun `mood rules compare equality and negation`() {
        assertEquals(listOf("h1"), eval(SmartConfig(rules = listOf(SmartRule("mood", "is", "chill")))))
        assertEquals(
            listOf("h2", "h3", "h4"),
            eval(SmartConfig(rules = listOf(SmartRule("mood", "not", "chill")))),
        )
    }

    @Test
    fun `genre rules support is not and accent-insensitive contains`() {
        assertEquals(listOf("h2"), eval(SmartConfig(rules = listOf(SmartRule("genre", "is", "Jazz")))))
        assertEquals(
            listOf("h1", "h3", "h4"),
            eval(SmartConfig(rules = listOf(SmartRule("genre", "not", "Jazz")))),
        )
        // contains folds accents + case ("synthwave" finds both "Synthwave" entries).
        assertEquals(
            listOf("h1", "h3"),
            eval(SmartConfig(rules = listOf(SmartRule("genre", "contains", "SYNTHWÀVE")))),
        )
    }

    @Test
    fun `title rule is an accent-insensitive contains`() {
        assertEquals(listOf("h2", "h3"), eval(SmartConfig(rules = listOf(SmartRule("title", "contains", "alpha")))))
        assertEquals(listOf("h3"), eval(SmartConfig(rules = listOf(SmartRule("title", "is", "Alpha 2")))))
    }

    @Test
    fun `numeric rules compare energy bpm and year`() {
        assertEquals(listOf("h1", "h3"), eval(SmartConfig(rules = listOf(SmartRule("energy", "gt", 0.6)))))
        assertEquals(listOf("h2", "h4"), eval(SmartConfig(rules = listOf(SmartRule("energy", "lt", 0.6)))))
        assertEquals(listOf("h3"), eval(SmartConfig(rules = listOf(SmartRule("bpm", "gt", 150)))))
        assertEquals(listOf("h3", "h4"), eval(SmartConfig(rules = listOf(SmartRule("year", "gt", 2005)))))
        assertEquals(listOf("h2"), eval(SmartConfig(rules = listOf(SmartRule("year", "is", 2001)))))
        assertEquals(
            listOf("h1", "h3", "h4"),
            eval(SmartConfig(rules = listOf(SmartRule("year", "not", 2001)))),
        )
        // A non-numeric target is NaN-like and never matches.
        assertEquals(emptyList<String>(), eval(SmartConfig(rules = listOf(SmartRule("bpm", "gt", "loud")))))
    }

    @Test
    fun `addedDays rules match recency`() {
        val within30 = SmartConfig(rules = listOf(SmartRule("addedDays", "lt", 30)))
        assertEquals(listOf("h1", "h3", "h4"), eval(within30))
        val olderThan30 = SmartConfig(rules = listOf(SmartRule("addedDays", "gt", 30)))
        assertEquals(listOf("h2"), eval(olderThan30))
        // No addedAt (or epoch 0) never matches — the web's falsy check.
        val bare = track("h5", "Old", addedAt = null)
        assertFalse(evaluateSmartList(listOf(bare), within30, ctx, now).isNotEmpty())
    }

    @Test
    fun `playcount favorite and lossless rules use the context`() {
        assertEquals(listOf("h2", "h4"), eval(SmartConfig(rules = listOf(SmartRule("playcount", "is", 0)))))
        assertEquals(listOf("h1", "h3"), eval(SmartConfig(rules = listOf(SmartRule("playcount", "gt", 1)))))
        assertEquals(listOf("h3"), eval(SmartConfig(rules = listOf(SmartRule("favorite", "true")))))
        assertEquals(listOf("h1", "h2", "h4"), eval(SmartConfig(rules = listOf(SmartRule("favorite", "false")))))
        assertEquals(listOf("h1", "h3"), eval(SmartConfig(rules = listOf(SmartRule("lossless", "true")))))
        assertEquals(listOf("h2", "h4"), eval(SmartConfig(rules = listOf(SmartRule("lossless", "false")))))
    }

    @Test
    fun `match all versus any and empty rules`() {
        // Empty rule list → everything.
        assertEquals(listOf("h1", "h2", "h3", "h4"), eval(SmartConfig(rules = emptyList())))
        val chillOrFocus = listOf(SmartRule("mood", "is", "chill"), SmartRule("mood", "is", "focus"))
        assertEquals(listOf("h1", "h2"), eval(SmartConfig(rules = chillOrFocus, match = "any")))
        assertEquals(emptyList<String>(), eval(SmartConfig(rules = chillOrFocus, match = "all")))
    }

    // ---- sorting + limit ---------------------------------------------------

    @Test
    fun `sort by added plays and az mirrors the web comparators`() {
        assertEquals(
            listOf("h3", "h1", "h4", "h2"),
            eval(SmartConfig(rules = emptyList(), sort = "added")),
        )
        assertEquals(
            listOf("h1", "h3", "h2", "h4"),
            eval(SmartConfig(rules = emptyList(), sort = "plays")),
        )
        // Numeric-aware natural order: "Alpha 2" before "Alpha10".
        assertEquals(
            listOf("h3", "h2", "h4", "h1"),
            eval(SmartConfig(rules = emptyList(), sort = "az")),
        )
    }

    @Test
    fun `random sort is a permutation and limit truncates`() {
        val random = evaluateSmartList(lib, SmartConfig(rules = emptyList(), sort = "random"), ctx, now)
        assertEquals(lib.map { it.trackhash }.toSet(), random.map { it.trackhash }.toSet())
        assertEquals(
            2,
            evaluateSmartList(lib, SmartConfig(rules = emptyList(), sort = "random", limit = 2), ctx, now).size,
        )
        // JS slice(0, n) with a negative n keeps all but the last |n|.
        assertEquals(3, evaluateSmartList(lib, SmartConfig(rules = emptyList(), limit = -1), ctx, now).size)
    }

    // ---- presets -----------------------------------------------------------

    private fun preset(id: String): SmartConfig = SMART_PRESETS.first { it.id == id }.config

    @Test
    fun `the seven web presets are present with exact names`() {
        assertEquals(7, SMART_PRESETS.size)
        assertEquals(
            listOf("high-energy", "calm-evening", "running", "focus", "never-played", "recent", "lossless"),
            SMART_PRESETS.map { it.id },
        )
        assertEquals(
            listOf("Énergie haute", "Calme du soir", "Running 160+ BPM", "Concentration", "Jamais écouté", "Récemment ajoutés", "Tout en lossless"),
            SMART_PRESETS.map { it.name },
        )
    }

    @Test
    fun `high-energy preset picks the energetic tracks sorted by plays`() {
        assertEquals(listOf("h1", "h3"), eval(preset("high-energy")))
    }

    @Test
    fun `calm-evening preset matches chill or melancholy moods`() {
        assertEquals(setOf("h1", "h3"), eval(preset("calm-evening")).toSet())
    }

    @Test
    fun `running preset keeps the exact web rule of bpm gt 150`() {
        assertEquals(listOf("h3"), eval(preset("running")))
        assertEquals(150, (preset("running").rules[0].value as Number).toInt())
    }

    @Test
    fun `focus preset matches the focus mood`() {
        assertEquals(listOf("h2"), eval(preset("focus")))
    }

    @Test
    fun `never-played preset matches zero play counts`() {
        assertEquals(setOf("h2", "h4"), eval(preset("never-played")).toSet())
    }

    @Test
    fun `recent preset adds within 30 days newest first and limits to 100`() {
        assertEquals(listOf("h3", "h1", "h4"), eval(preset("recent")))
        assertEquals(100, preset("recent").limit)
    }

    @Test
    fun `lossless preset picks lossless tracks a to z`() {
        assertEquals(listOf("h3", "h1"), eval(preset("lossless")))
    }

    // ---- wire JSON (the playlist.upsert `rules` field) ---------------------

    @Test
    fun `smart config json round-trips through the wire format`() {
        val config = SmartConfig(
            label = "Énergie haute",
            rules = listOf(SmartRule("energy", "gt", 0.6), SmartRule("mood", "is", "chill")),
            match = "all",
            sort = "plays",
            limit = 50,
        )
        val parsed = SmartConfig.fromJson(SmartConfig.toJson(config))
        assertEquals(config, parsed)
    }

    @Test
    fun `fromJson parses web-style rules JSON and rejects non-configs`() {
        val parsed = SmartConfig.fromJson(
            """{"label":"X","match":"any","sort":"az","rules":[{"field":"bpm","op":"gt","value":150}]}""",
        )
        assertEquals("X", parsed?.label)
        assertEquals("any", parsed?.match)
        assertEquals("az", parsed?.sort)
        assertEquals(listOf(SmartRule("bpm", "gt", 150)), parsed?.rules)
        // parseRules() semantics: no `rules` array → not a smart config.
        assertNull(SmartConfig.fromJson(null))
        assertNull(SmartConfig.fromJson(""))
        assertNull(SmartConfig.fromJson("not json"))
        assertNull(SmartConfig.fromJson("""{"label":"X"}"""))
    }

    @Test
    fun `unknown fields and ops degrade to always-true like the web`() {
        val weird = SmartConfig(
            rules = listOf(SmartRule("constellation", "align", "orion")),
            match = "all",
        )
        assertEquals(listOf("h1", "h2", "h3", "h4"), eval(weird))
    }

    @Test
    fun `string values on numeric rules behave like JS Number coercion`() {
        // Number("0.7") parses — only "Zeta" (0.9) is strictly above.
        assertEquals(listOf("h1"), eval(SmartConfig(rules = listOf(SmartRule("energy", "gt", "0.7")))))
        // Number("loud") is NaN → never matches; Number("") is 0 → matches > 0.
        assertEquals(emptyList<String>(), eval(SmartConfig(rules = listOf(SmartRule("energy", "gt", "loud")))))
        assertEquals(listOf("h1", "h2", "h3", "h4"), eval(SmartConfig(rules = listOf(SmartRule("energy", "gt", "")))))
    }
}
