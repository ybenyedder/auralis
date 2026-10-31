package local.auralis.client.model

// Pure state mapping for the playlist-import download batch (the live
// per-track download sheet): row states, job→row updates and the queue
// helpers. No Android or Compose imports here so the mapping stays
// JVM-testable (see ImportBatchTest).

/** Live state of one missing import track in the download batch. */
enum class ImportRowState { QUEUED, DOWNLOADING, ADDED, FAILED, CANCELLED }

/** One row of the import download sheet: its "Artiste — Titre" label plus the
 *  live job state. [query]/[title] are what the row's download job is sent as. */
data class ImportRow(
    val query: String,
    val title: String?,
    val label: String,
    /** Server job id — blank until the batch is enqueued. */
    val jobId: String = "",
    val state: ImportRowState = ImportRowState.QUEUED,
    /** DownloadJobDto.progress (0-100) while downloading. */
    val progress: Int = 0,
    /** Failure reason (server error text) shown briefly on failed rows. */
    val detail: String? = null,
)

/** The sheet's row label: "Artiste — Titre", falling back to whichever half exists. */
fun importRowLabel(entry: ExternalTrackEntry): String {
    val artist = entry.artist?.trim().orEmpty()
    val title = entry.title.trim()
    return when {
        artist.isNotEmpty() && title.isNotEmpty() -> "$artist — $title"
        artist.isNotEmpty() -> artist
        title.isNotEmpty() -> title
        else -> downloadQuery(entry)
    }
}

/** Rows for every entry a playlist import couldn't match: deduped by query and
 *  capped at the server's 200-item batch limit, one row per download job. */
fun importRows(entries: List<ExternalTrackEntry>, max: Int = 200): List<ImportRow> =
    entries.mapNotNull { e ->
        val q = downloadQuery(e)
        if (q.isEmpty()) null
        else ImportRow(
            query = q,
            title = e.title.trim().takeIf { it.isNotEmpty() },
            label = importRowLabel(e),
        )
    }.distinctBy { it.query.lowercase() }.take(max)

/** Download items for the rows the batch must enqueue. Order-preserving so the
 *  returned jobs zip back onto their rows (the server creates one job per
 *  item, in item order — query-only items are never deduped). */
fun importBatchItems(rows: List<ImportRow>): List<DownloadItem> =
    rows.map { DownloadItem(it.query, it.title) }

/** Server job status → row state: "done"/"error" settle, "queued" waits,
 *  anything in flight (resolving / downloading / scanning) shows progress. */
fun importRowStateFor(status: String): ImportRowState = when (status) {
    "done" -> ImportRowState.ADDED
    "error" -> ImportRowState.FAILED
    "queued" -> ImportRowState.QUEUED
    else -> ImportRowState.DOWNLOADING
}

/** Fold one polled [DownloadJobDto] into its row (matched by job id). Terminal
 *  rows are never re-opened and cancelled rows stay cancelled even if a late
 *  job update lands. */
fun applyImportJob(rows: List<ImportRow>, job: DownloadJobDto): List<ImportRow> {
    if (job.id.isBlank()) return rows
    val i = rows.indexOfFirst { it.jobId == job.id }
    if (i < 0) return rows
    val row = rows[i]
    if (row.state == ImportRowState.ADDED || row.state == ImportRowState.CANCELLED) return rows
    val state = importRowStateFor(job.status)
    val updated = row.copy(
        state = state,
        progress = when (state) {
            ImportRowState.DOWNLOADING -> job.progress.coerceIn(0, 100)
            ImportRowState.ADDED -> 100
            else -> row.progress
        },
        detail = if (state == ImportRowState.FAILED) job.error?.takeIf { it.isNotBlank() } else null,
    )
    return rows.toMutableList().also { it[i] = updated }
}

/** Rows still waiting or downloading (the batch runs while any remain). */
fun importRowsActive(rows: List<ImportRow>): Boolean =
    rows.any { it.state == ImportRowState.QUEUED || it.state == ImportRowState.DOWNLOADING }

/** Finished fraction of the batch (added + failed + cancelled) for the header
 *  progress bar. */
fun importFinishedFraction(rows: List<ImportRow>): Float {
    if (rows.isEmpty()) return 0f
    val settled = rows.count {
        it.state == ImportRowState.ADDED || it.state == ImportRowState.FAILED || it.state == ImportRowState.CANCELLED
    }
    return settled.toFloat() / rows.size
}
