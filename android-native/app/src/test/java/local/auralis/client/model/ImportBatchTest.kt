package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the import-download batch mapping (model/ImportBatch.kt):
 *  row labels, the job→row status mapping and the terminal-state rules the live
 *  sheet relies on. */
class ImportBatchTest {

    private fun entry(title: String, artist: String? = null) = ExternalTrackEntry(title = title, artist = artist)

    private fun job(
        id: String = "dl_1",
        status: String = "queued",
        progress: Int = 0,
        trackhash: String? = null,
        error: String? = null,
    ) = DownloadJobDto(id = id, status = status, progress = progress, trackhash = trackhash, error = error, title = null)

    // ---- labels ------------------------------------------------------------

    @Test
    fun `row label is Artiste — Titre`() {
        assertEquals("Daft Punk — One More Times", importRowLabel(entry("One More Times", "Daft Punk")))
    }

    @Test
    fun `row label falls back to whichever half exists`() {
        assertEquals("Solo Title", importRowLabel(entry("Solo Title", null)))
        assertEquals("Solo Artist", importRowLabel(entry("  ", "Solo Artist")))
    }

    // ---- rows --------------------------------------------------------------

    @Test
    fun `rows dedupe by query and cap at the batch limit`() {
        val entries = listOf(
            entry("One More Time", "Daft Punk"),
            entry("One More Time", "Daft Punk "), // same query → deduped
            entry("Other", "Someone"),
        )
        val rows = importRows(entries)
        assertEquals(2, rows.size)
        assertEquals("Daft Punk — One More Time", rows[0].label)
        assertEquals("Someone — Other", rows[1].label)
        assertTrue(rows.all { it.state == ImportRowState.QUEUED && it.jobId == "" })

        val many = (1..300).map { entry("Title $it", "Artist $it") }
        assertEquals(200, importRows(many).size)
    }

    @Test
    fun `batch items keep row order so jobs zip back onto rows`() {
        val rows = importRows(listOf(entry("A", "X"), entry("B", "Y"), entry("C", "Z")))
        val items = importBatchItems(rows)
        assertEquals(listOf("X A", "Y B", "Z C"), items.map { it.query })
        assertEquals(listOf("A", "B", "C"), items.map { it.title })
    }

    // ---- job status → row state -------------------------------------------

    @Test
    fun `job status maps to row state`() {
        assertEquals(ImportRowState.QUEUED, importRowStateFor("queued"))
        assertEquals(ImportRowState.DOWNLOADING, importRowStateFor("resolving"))
        assertEquals(ImportRowState.DOWNLOADING, importRowStateFor("downloading"))
        assertEquals(ImportRowState.DOWNLOADING, importRowStateFor("scanning"))
        assertEquals(ImportRowState.ADDED, importRowStateFor("done"))
        assertEquals(ImportRowState.FAILED, importRowStateFor("error"))
    }

    @Test
    fun `applyImportJob updates progress while downloading`() {
        val rows = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1"))
        val updated = applyImportJob(rows, job(id = "dl_1", status = "downloading", progress = 45))
        assertEquals(ImportRowState.DOWNLOADING, updated[0].state)
        assertEquals(45, updated[0].progress)
    }

    @Test
    fun `applyImportJob settles done rows with a full progress`() {
        val rows = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1", state = ImportRowState.DOWNLOADING, progress = 90))
        val updated = applyImportJob(rows, job(id = "dl_1", status = "done", trackhash = "hash"))
        assertEquals(ImportRowState.ADDED, updated[0].state)
        assertEquals(100, updated[0].progress)
    }

    @Test
    fun `applyImportJob shows the failure reason on error rows`() {
        val rows = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1"))
        val updated = applyImportJob(rows, job(id = "dl_1", status = "error", error = "Aucun résultat"))
        assertEquals(ImportRowState.FAILED, updated[0].state)
        assertEquals("Aucun résultat", updated[0].detail)
    }

    @Test
    fun `terminal rows are never reopened`() {
        val added = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1", state = ImportRowState.ADDED))
        val late = applyImportJob(added, job(id = "dl_1", status = "downloading", progress = 10))
        assertEquals(ImportRowState.ADDED, late[0].state)

        val cancelled = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1", state = ImportRowState.CANCELLED))
        val ignored = applyImportJob(cancelled, job(id = "dl_1", status = "done"))
        assertEquals(ImportRowState.CANCELLED, ignored[0].state)
    }

    @Test
    fun `unknown or unassigned jobs leave the rows untouched`() {
        val rows = listOf(ImportRow(query = "q", title = "t", label = "t", jobId = "dl_1"))
        assertEquals(rows, applyImportJob(rows, job(id = "dl_other", status = "done")))
        assertEquals(rows, applyImportJob(rows, job(id = "", status = "done")))
    }

    // ---- batch progress ----------------------------------------------------

    @Test
    fun `active rows and finished fraction track the batch`() {
        val rows = listOf(
            ImportRow(query = "a", title = null, label = "a", jobId = "1", state = ImportRowState.ADDED),
            ImportRow(query = "b", title = null, label = "b", jobId = "2", state = ImportRowState.DOWNLOADING),
            ImportRow(query = "c", title = null, label = "c", jobId = "3", state = ImportRowState.FAILED),
            ImportRow(query = "d", title = null, label = "d", jobId = "4", state = ImportRowState.CANCELLED),
        )
        assertTrue(importRowsActive(rows))
        assertEquals(0.75f, importFinishedFraction(rows))
        assertEquals(0f, importFinishedFraction(emptyList()))
        assertFalse(importRowsActive(rows.map { it.copy(state = ImportRowState.ADDED) }))
    }
}
