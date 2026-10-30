package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone
import kotlin.random.Random

/**
 * JVM unit tests for the pure shelf derivations in Reco.kt — the web semantics
 * (DailyMixes.tsx weekKey + mixes, HomeView.tsx moodRecs, RadioView.tsx random
 * seed) that the home/radio screens build on.
 */
class RecoLogicTest {

    private fun track(hash: String, genre: String? = null, mood: String? = null) = Track(
        trackhash = hash, title = hash, artist = null, album = null, albumhash = null,
        duration = null, filepath = null, folder = null, image = null, isFavorite = false,
        playcount = 0, disc = null, track = null, year = null, genre = genre, mood = mood,
        energy = null, bpm = null, gain = null, bitrate = null, samplerate = null,
        codec = null, lossless = false, size = null, hasLyrics = false, addedAt = null,
        color = null, artists = emptyList(),
    )

    private fun utc(y: Int, m: Int, d: Int): Long =
        Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
            clear()
            set(y, m - 1, d, 12, 0, 0)
        }.timeInMillis

    // ---- ISO week key (weekly discover freeze) ------------------------------

    @Test
    fun `isoWeekKey follows the ISO Thursday rule`() {
        val tz = TimeZone.getTimeZone("UTC")
        assertEquals("2026-W44", isoWeekKey(utc(2026, 10, 29), tz)) // Thursday
        assertEquals("2026-W44", isoWeekKey(utc(2026, 11, 1), tz))  // Sunday still W44
        assertEquals("2026-W45", isoWeekKey(utc(2026, 11, 2), tz))  // Monday starts W45
    }

    @Test
    fun `isoWeekKey keeps the ISO year at boundaries`() {
        val tz = TimeZone.getTimeZone("UTC")
        // 2021-01-01 (Friday) belongs to ISO week 53 of 2020, not week 1 of 2021.
        assertEquals("2020-W53", isoWeekKey(utc(2021, 1, 1), tz))
        // 2026-01-01 is a Thursday — week 1 of 2026.
        assertEquals("2026-W01", isoWeekKey(utc(2026, 1, 1), tz))
    }

    // ---- random radio seed (RadioView.startRandomRadio) ---------------------

    @Test
    fun `randomRadioSeed returns null on an empty library`() {
        assertNull(randomRadioSeed(emptyList(), Random(1)))
    }

    @Test
    fun `randomRadioSeed always picks a library track`() {
        val tracks = listOf(track("a"), track("b"), track("c"))
        repeat(50) { seed ->
            val pick = randomRadioSeed(tracks, Random(seed.toLong()))
            assertTrue("pick must be one of the library", pick in tracks)
        }
        assertEquals(track("solo"), randomRadioSeed(listOf(track("solo")), Random(7)))
    }

    // ---- daily mood mixes (DailyMixes.tsx) ----------------------------------

    @Test
    fun `dailyMoodMixes needs at least 8 tracks per mood and labels the mix`() {
        val few = (1..7).map { track("f$it", genre = "pop") }
        assertTrue(dailyMoodMixes(few, emptySet(), emptyMap()).isEmpty())
        val enough = (1..8).map { track("p$it", genre = "pop") }
        val mixes = dailyMoodMixes(enough, emptySet(), emptyMap())
        assertEquals(1, mixes.size)
        assertEquals("happy", mixes[0].moodId)
        assertEquals("Mix Bonne humeur", mixes[0].label)
        assertEquals(8, mixes[0].tracks.size)
    }

    @Test
    fun `dailyMoodMixes ranks by taste score and excludes dislikes`() {
        val tracks = (1..8).map { track("t$it", genre = "pop") } +
            listOf(track("loved", genre = "pop"), track("bad", genre = "pop"))
        val mixes = dailyMoodMixes(tracks, setOf("bad"), mapOf("loved" to 9.0, "t1" to 5.0))
        val ranked = mixes.single().tracks
        assertEquals("loved", ranked.first().trackhash)
        assertEquals("t1", ranked[1].trackhash)
        assertTrue("bad" !in ranked.map { it.trackhash })
    }

    @Test
    fun `dailyMoodMixes keeps at most 6 mixes`() {
        val tracks = Moods.ALL.flatMap { m ->
            (1..9).map { track("${m.id}-$it", genre = m.keywords.first()) }
        }
        assertEquals(6, dailyMoodMixes(tracks, emptySet(), emptyMap()).size)
    }

    // ---- "Pour votre humeur" (HomeView.moodRecs) ----------------------------

    @Test
    fun `moodRecs prefers the engine mood affinity`() {
        val happy = (1..10).map { track("c$it", genre = "pop") }        // played most
        val focus = (1..6).map { track("f$it", genre = "classical") }
        val plays = happy.associate { it.trackhash to 50 }
        val recs = moodRecs(
            happy + focus, plays, emptySet(),
            listOf(MoodAffinity("focus", 0.8), MoodAffinity("happy", -0.2)),
            emptyMap(), Random(1),
        )
        assertEquals("focus", recs?.moodId)
    }

    @Test
    fun `moodRecs falls back to play tallies then biggest bucket`() {
        val happy = (1..6).map { track("h$it", genre = "pop") }
        val melancholy = (1..6).map { track("m$it", genre = "blues") }
        val plays = melancholy.associate { it.trackhash to 5 }
        val byPlays = moodRecs(happy + melancholy, plays, emptySet(), emptyList(), emptyMap(), Random(1))
        assertEquals("melancholy", byPlays?.moodId)
        // Fresh library (no plays, no affinity): the biggest bucket wins.
        val bySize = moodRecs(
            happy + melancholy + listOf(track("extra", genre = "pop")),
            emptyMap(), emptySet(), emptyList(), emptyMap(), Random(1),
        )
        assertEquals("happy", bySize?.moodId)
    }

    @Test
    fun `moodRecs never resurfaces dislikes and needs a 4-track pool`() {
        val happy = (1..4).map { track("h$it", genre = "pop") }
        val recs = moodRecs(happy, emptyMap(), setOf("h1"), emptyList(), emptyMap(), Random(1))
        assertNull(recs)
        val all = (1..8).map { track("a$it", genre = "pop") }
        val kept = moodRecs(all, emptyMap(), setOf("a1"), emptyList(), emptyMap(), Random(1))
        assertTrue("a1" !in (kept?.recs ?: emptyList()).map { it.trackhash })
    }

    @Test
    fun `moodRecs slices the top-slice by taste score`() {
        val pool = (1..20).map { track("x$it", genre = "pop") }
        val scores = (1..16).associate { "x$it" to it / 16.0 }
        val recs = moodRecs(pool, emptyMap(), emptySet(), emptyList(), scores, Random(2))!!
        // The zero-scored tail never surfaces: only the 16 top-scored tracks are
        // sliced (and shuffled) into the shelf.
        assertTrue(recs.recs.all { it.trackhash in scores })
    }

    // ---- mood bucketing (mood.ts) -------------------------------------------

    @Test
    fun `mood verdict wins over the genre heuristic`() {
        assertEquals("party", Moods.forTrack(track("t", genre = "pop", mood = "party")))
        assertEquals("happy", Moods.forTrack(track("t", genre = "pop", mood = null)))
        assertNull(Moods.forTrack(track("t", genre = "spoken word", mood = null)))
    }
}
