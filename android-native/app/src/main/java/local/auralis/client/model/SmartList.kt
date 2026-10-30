package local.auralis.client.model

import local.auralis.client.i18n.Messages
import org.json.JSONArray
import org.json.JSONObject
import java.text.Normalizer

// Smart (dynamic) playlists driven by the per-track audio DSP + library metadata
// (faithful port of src/lib/auralis/smartlist.ts). A SmartConfig is a tiny rule set
// evaluated LIVE against the library + the user's favourites/play counts, so the
// playlist always reflects the current collection — "Énergie haute", "Calme du
// soir", "Running 160+ BPM", "Jamais écouté". Pure Kotlin: the evaluator has no
// Android dependencies and is JVM-unit-testable.

/** Strip diacritics + lowercase for accent-insensitive matching ("neon" finds
 *  "Néon"), mirroring the web foldAccents() in src/lib/utils.ts. */
fun foldAccents(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "").lowercase()

/** One rule: a field, an op and an optional string/number value. `field`/`op` stay
 *  raw wire strings on purpose — unknown values degrade to "always true", exactly
 *  like the web evaluator's default branch. */
data class SmartRule(val field: String, val op: String, val value: Any? = null)

data class SmartConfig(
    /** Human label shown on the playlist (the preset name, or "Règles personnalisées"). */
    val label: String? = null,
    val rules: List<SmartRule>,
    /** "all" | "any". */
    val match: String = "all",
    /** "added" | "plays" | "az" | "random", or null for library order. */
    val sort: String? = null,
    val limit: Int? = null,
) {
    companion object {
        /** The `rules` wire field: JSON-encoded SmartConfig (web playlist.upsert). */
        fun toJson(config: SmartConfig): String {
            val o = JSONObject()
            config.label?.let { o.put("label", it) }
            val rules = JSONArray()
            for (r in config.rules) {
                val ro = JSONObject().put("field", r.field).put("op", r.op)
                // A missing value stays missing — like the web's `value?:` optional.
                r.value?.let { v -> ro.put("value", v) }
                rules.put(ro)
            }
            o.put("rules", rules)
            o.put("match", config.match)
            config.sort?.let { o.put("sort", it) }
            config.limit?.let { o.put("limit", it) }
            return o.toString()
        }

        /** Mirror of the web parseRules(): a JSON object with a `rules` array, else null. */
        fun fromJson(s: String?): SmartConfig? {
            if (s.isNullOrBlank()) return null
            val o = runCatching { JSONObject(s) }.getOrNull() ?: return null
            val arr = o.optJSONArray("rules") ?: return null
            val rules = ArrayList<SmartRule>(arr.length())
            for (i in 0 until arr.length()) {
                val ro = arr.optJSONObject(i) ?: continue
                rules.add(
                    SmartRule(
                        field = ro.strOr("field", ""),
                        op = ro.strOr("op", ""),
                        value = normalizeRuleValue(ro.opt("value")),
                    ),
                )
            }
            return SmartConfig(
                label = o.str("label"),
                rules = rules,
                match = o.strOr("match", "all"),
                sort = o.str("sort"),
                limit = o.intOrNull("limit"),
            )
        }
    }
}

data class SmartContext(val favorites: Set<String>, val playCounts: Map<String, Int>)

/** Canonical rule-value types: org.json hands back different number classes per
 *  implementation (Integer/Long/Double/BigDecimal), so fold them to Int/Long/Double
 *  and JSON null to null — keeps SmartRule equality stable across a JSON round-trip. */
private fun normalizeRuleValue(raw: Any?): Any? = when (raw) {
    null, JSONObject.NULL -> null
    is Number -> {
        val d = raw.toDouble()
        if (d.isFinite() && d == Math.floor(d) && d >= Int.MIN_VALUE.toDouble() && d <= Int.MAX_VALUE.toDouble()) {
            d.toInt()
        } else d
    }
    else -> raw
}

/** JS Number() semantics for rule values: numbers pass through, numeric strings
 *  parse (blank → 0), anything else is NaN-like (null). */
private fun num(v: Any?): Double? = when (v) {
    is Number -> v.toDouble()
    is String -> if (v.trim().isEmpty()) 0.0 else v.trim().toDoubleOrNull()
    else -> null
}

private fun cmpNum(v: Double?, r: SmartRule): Boolean {
    if (v == null || !v.isFinite()) return false
    val target = num(r.value) ?: return false
    return when (r.op) {
        "gt" -> v > target
        "lt" -> v < target
        "is" -> v == target
        "not" -> v != target
        else -> false
    }
}

private fun testRule(t: Track, r: SmartRule, ctx: SmartContext, now: Long): Boolean = when (r.field) {
    "mood" -> if (r.op == "not") t.mood != r.value else t.mood == r.value
    "genre" ->
        if (r.op == "contains") foldAccents(t.genre ?: "").contains(foldAccents(r.value?.toString() ?: ""))
        else if (r.op == "not") t.genre != r.value else t.genre == r.value
    "energy" -> cmpNum(t.energy, r)
    "bpm" -> cmpNum(t.bpm, r)
    "year" -> cmpNum(t.year?.toDouble(), r)
    "addedDays" -> {
        // value = N days; match tracks added within the last N days. `!t.addedAt`
        // is falsy for 0 in the web evaluator — mirrored.
        val added = t.addedAt
        val days = num(r.value)
        if (added == null || added == 0L || days == null) false
        else {
            val d = (now - added) / 86_400_000.0
            if (r.op == "gt") d > days else d <= days
        }
    }
    "playcount" -> cmpNum((ctx.playCounts[t.trackhash] ?: 0).toDouble(), r)
    "favorite" -> ctx.favorites.contains(t.trackhash) == (r.op != "false")
    "lossless" -> t.lossless == (r.op != "false")
    "title" -> foldAccents(t.title).contains(foldAccents(r.value?.toString() ?: ""))
    else -> true
}

/** Numeric-aware natural title order ("Track 2" before "Track 10"), approximating
 *  the web's `a.title.localeCompare(b.title, undefined, { numeric: true })`: base
 *  (accent/case-folded) comparison first, the raw title as tie-break. */
private fun compareTitles(a: String, b: String): Int {
    val primary = naturalCompare(foldAccents(a), foldAccents(b))
    return if (primary != 0) primary else naturalCompare(a, b)
}

private fun naturalCompare(a: String, b: String): Int {
    var i = 0
    var j = 0
    while (i < a.length && j < b.length) {
        val ca = a[i]
        val cb = b[j]
        if (ca.isDigit() && cb.isDigit()) {
            val si = i
            val sj = j
            while (i < a.length && a[i].isDigit()) i++
            while (j < b.length && b[j].isDigit()) j++
            val na = a.substring(si, i).trimStart('0')
            val nb = b.substring(sj, j).trimStart('0')
            val cmp = if (na.length != nb.length) na.length - nb.length else na.compareTo(nb)
            if (cmp != 0) return cmp
        } else {
            if (ca != cb) return ca.code - cb.code
            i++
            j++
        }
    }
    return (a.length - i) - (b.length - j)
}

/** Resolve a smart config against the library + the user's favourites/play counts. */
fun evaluateSmartList(
    tracks: List<Track>,
    config: SmartConfig,
    ctx: SmartContext,
    now: Long = System.currentTimeMillis(),
): List<Track> {
    val matched = tracks.filter { t ->
        if (config.rules.isEmpty()) true
        else {
            val results = config.rules.map { testRule(t, it, ctx, now) }
            if (config.match == "any") results.any { it } else results.all { it }
        }
    }
    val sorted = when (config.sort) {
        "added" -> matched.sortedByDescending { it.addedAt ?: 0L }
        "plays" -> matched.sortedByDescending { ctx.playCounts[it.trackhash] ?: 0 }
        "az" -> matched.sortedWith { x, y -> compareTitles(x.title, y.title) }
        "random" -> matched.shuffled()
        else -> matched
    }
    return when {
        config.limit == null -> sorted
        config.limit >= 0 -> sorted.take(config.limit)
        // JS slice(0, n) with a negative n drops the last |n| entries.
        else -> sorted.dropLast((-config.limit).coerceAtMost(sorted.size))
    }
}

/** One-tap smart-playlist presets exposed in the UI (web SMART_PRESETS). The
 *  stored `config.label` keeps the web's canonical French name (it is server
 *  data shared with the web client); the UI-facing `name` resolves through the
 *  i18n catalogue. */
data class SmartPreset(val id: String, val nameKey: String, val config: SmartConfig) {
    val name: String get() = Messages.t(nameKey)
}

val SMART_PRESETS: List<SmartPreset> = listOf(
    SmartPreset(
        "high-energy", "smart.highEnergy",
        SmartConfig("Énergie haute", listOf(SmartRule("energy", "gt", 0.6)), match = "all", sort = "plays"),
    ),
    SmartPreset(
        "calm-evening", "smart.calmEvening",
        SmartConfig(
            "Calme du soir",
            listOf(SmartRule("mood", "is", "chill"), SmartRule("mood", "is", "melancholy")),
            match = "any", sort = "random",
        ),
    ),
    SmartPreset(
        "running", "smart.running",
        SmartConfig("Running 160+ BPM", listOf(SmartRule("bpm", "gt", 150)), match = "all", sort = "random"),
    ),
    SmartPreset(
        "focus", "mood.focus",
        SmartConfig("Concentration", listOf(SmartRule("mood", "is", "focus")), match = "all", sort = "random"),
    ),
    SmartPreset(
        "never-played", "smart.neverPlayed",
        SmartConfig("Jamais écouté", listOf(SmartRule("playcount", "is", 0)), match = "all", sort = "random"),
    ),
    SmartPreset(
        "recent", "smart.recent",
        SmartConfig(
            "Récemment ajoutés", listOf(SmartRule("addedDays", "lt", 30)),
            match = "all", sort = "added", limit = 100,
        ),
    ),
    SmartPreset(
        "lossless", "smart.lossless",
        SmartConfig("Tout en lossless", listOf(SmartRule("lossless", "true")), match = "all", sort = "az"),
    ),
)
