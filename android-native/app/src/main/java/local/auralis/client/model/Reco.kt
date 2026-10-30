package local.auralis.client.model

import local.auralis.client.i18n.Messages
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil
import kotlin.random.Random

// ============================================================================
// RECOMMENDATION SHELF MODELS (pure)
// ----------------------------------------------------------------------------
// The client-side derivations the web shelves run over the server taste-engine
// data (src/components/auralis/DailyMixes.tsx, HomeView.tsx). Kept pure and
// dependency-free so the JVM unit tests pin the exact web semantics (thresholds,
// ranking, the ISO-week freeze key).
// ============================================================================

/** ISO-8601 year+week key ("2026-W44") so the weekly discover mix is frozen for
 *  the whole week. Thursday trick (web DailyMixes.weekKey): a week's ISO year and
 *  number are defined by its Thursday, so snap to it and read year/week there. */
fun isoWeekKey(nowMs: Long = System.currentTimeMillis(), tz: TimeZone = TimeZone.getDefault()): String {
    val local = Calendar.getInstance(tz).apply { timeInMillis = nowMs }
    val utc = TimeZone.getTimeZone("UTC")
    val snap = Calendar.getInstance(utc).apply {
        clear()
        set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH))
    }
    // Mon=1 … Sun=7 (Calendar's DAY_OF_WEEK is Sun=1 … Sat=7).
    val day = if (snap.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) 7 else snap.get(Calendar.DAY_OF_WEEK) - 1
    snap.add(Calendar.DAY_OF_MONTH, 4 - day) // this week's Thursday
    val year = snap.get(Calendar.YEAR)
    val yearStart = Calendar.getInstance(utc).apply { clear(); set(year, 0, 1) }
    val week = ceil(((snap.timeInMillis - yearStart.timeInMillis) / 86_400_000.0 + 1) / 7).toInt()
    return String.format(Locale.US, "%d-W%02d", year, week)
}

/** One taste-ranked mood mix card (web DailyMixes MixModel). */
data class MoodMix(val moodId: String, val label: String, val tracks: List<Track>)

/** The web's DailyMixes shelf model: one mix per mood with enough material,
 *  taste-ranked by the engine scores (loved tracks rise), dislikes excluded. */
fun dailyMoodMixes(tracks: List<Track>, dislikes: Set<String>, scores: Map<String, Double>): List<MoodMix> {
    val byMood = Moods.groupByMood(tracks.filter { it.trackhash !in dislikes })
    return Moods.ALL.mapNotNull { m ->
        val pool = byMood[m.id] ?: return@mapNotNull null
        if (pool.size < 8) return@mapNotNull null
        val ranked = pool.sortedByDescending { scores[it.trackhash] ?: 0.0 }
        MoodMix(m.id, Messages.t("home.mixOf", params = mapOf("mood" to m.label)), ranked.take(60))
    }.take(6)
}

/** "Pour votre humeur" (web HomeView.moodRecs): the mood the user listens to most
 *  (engine mood affinity first — it folds in skips/likes/recency — then real play
 *  tallies, then the biggest bucket for a fresh library), surfaced as tracks from
 *  that mood they've played least / the engine loves most. */
data class MoodRecs(val moodId: String, val recs: List<Track>)

fun moodRecs(
    tracks: List<Track>,
    playCounts: Map<String, Int>,
    dislikes: Set<String>,
    affinities: List<MoodAffinity>,
    scores: Map<String, Double>,
    random: Random = Random.Default,
): MoodRecs? {
    if (tracks.isEmpty()) return null
    val byMood = LinkedHashMap<String, MutableList<Track>>()
    val plays = LinkedHashMap<String, Int>()
    for (t in tracks) {
        if (t.trackhash in dislikes) continue // never resurface rejected tracks
        val id = Moods.forTrack(t) ?: continue
        byMood.getOrPut(id) { mutableListOf() }.add(t)
        val c = playCounts[t.trackhash] ?: 0
        if (c > 0) plays[id] = (plays[id] ?: 0) + c
    }
    if (byMood.isEmpty()) return null

    var topId: String? = affinities.firstOrNull { it.weight > 0 && byMood.containsKey(it.mood) }?.mood
    if (topId == null) {
        val ranking = if (plays.isNotEmpty()) plays else byMood.mapValues { it.value.size }
        topId = ranking.maxByOrNull { it.value }?.key
    }
    if (topId == null) return null

    val pool = byMood[topId] ?: return null
    if (pool.size < 4) return null
    // Rank by taste score when we have one (loved tracks rise, low-affinity sink);
    // else least-played-first for discovery. A light shuffle of the top slice keeps
    // the shelf fresh between visits.
    val hasScores = scores.isNotEmpty()
    val ranked = if (hasScores) {
        pool.sortedByDescending { scores[it.trackhash] ?: 0.0 }
    } else {
        pool.sortedBy { playCounts[it.trackhash] ?: 0 }
    }
    val recs = ranked.take(if (hasScores) 16 else 40).shuffled(random).take(8)
    return MoodRecs(topId, recs)
}
