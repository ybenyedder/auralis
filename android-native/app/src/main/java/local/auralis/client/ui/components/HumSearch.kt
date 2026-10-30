package local.auralis.client.ui.components

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import local.auralis.client.i18n.tr
import local.auralis.client.model.DownloadJobDto
import local.auralis.client.model.RecognizeLocalMatch
import local.auralis.client.model.RecognizeRemoteMatch
import local.auralis.client.model.RecognizeResult
import local.auralis.client.model.scorePercent
import local.auralis.client.playback.BubbleOutcome
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Type
import java.io.File

// "Identifier la musique" (Shazam-style music recognition): a bottom sheet that
// records ~12 s of AMBIENT audio (music playing around you) or humming/singing
// with MediaRecorder and posts the raw bytes to POST /api/recognize. The server
// answers with REAL Shazam matches first (`remote`, any song in the world) plus
// the local melody-index matches (`local`). The recording loop is Android-only;
// the score/query maths lives in model/Recognize.kt (JVM-tested).

/** Recognition listens to at most this much audio (seconds). */
private const val HUM_MAX_SECONDS = 12

/** MediaRecorder capture of a short hum/sing snippet — mono AAC in an .m4a
 *  container (the server decodes anything via ffmpeg). */
private class HumRecorder {
    private var rec: MediaRecorder? = null
    private var file: File? = null

    @Suppress("DEPRECATION")
    fun start(context: Context): Boolean {
        stop()?.delete()
        return runCatching {
            val out = File(context.cacheDir, "hum-${System.currentTimeMillis()}.m4a")
            val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                MediaRecorder()
            }
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(16000)
            r.setAudioEncodingBitRate(64_000)
            r.setOutputFile(out.absolutePath)
            r.prepare()
            r.start()
            rec = r
            file = out
            true
        }.getOrDefault(false)
    }

    /** Stop + release; returns the recording file (null when nothing captured). */
    fun stop(): File? {
        val r = rec ?: return null
        rec = null
        // stop() throws when no audio frames landed (instant dismissal) — the
        // partial file is worthless anyway and gets deleted by the caller.
        runCatching { r.stop() }
        runCatching { r.release() }
        return file
    }
}

@Composable
fun HumSheet(vm: AppViewModel, ui: UiState, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { HumRecorder() }
    var recording by remember { mutableStateOf(false) }
    var startedAt by remember { mutableStateOf(0L) }
    var elapsed by remember { mutableStateOf(0) }
    var permissionDenied by remember { mutableStateOf(false) }

    fun upload(file: File?) {
        recording = false
        if (file == null) {
            vm.failHumRecording()
            return
        }
        scope.launch(Dispatchers.IO) {
            val bytes = runCatching { file.readBytes() }.getOrNull()
            file.delete()
            withContext(Dispatchers.Main) {
                if (bytes == null || bytes.isEmpty()) vm.failHumRecording()
                else vm.submitHumRecording(bytes, "audio/mp4")
            }
        }
    }

    fun startRecording() {
        if (recorder.start(context)) {
            startedAt = System.currentTimeMillis()
            elapsed = 0
            recording = true
        } else {
            vm.failHumRecording()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionDenied = !granted
        if (granted) startRecording()
    }

    fun requestOrStart() {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) startRecording() else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
    }

    // Auto-record as soon as the sheet opens (when the mic is allowed).
    LaunchedEffect(Unit) { requestOrStart() }
    // Elapsed timer + 12 s auto-stop (the recording uploads itself).
    LaunchedEffect(recording) {
        while (recording) {
            val e = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
            elapsed = e
            if (e >= HUM_MAX_SECONDS) {
                upload(recorder.stop())
                break
            }
            delay(200)
        }
    }
    // Closing mid-recording discards the take.
    DisposableEffect(Unit) {
        onDispose {
            recorder.stop()?.delete()
        }
    }

    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0xAA000000)).clickable { onDismiss() })
        SheetColumn(Modifier.align(Alignment.BottomCenter)) {
            Text(tr("hum.sheetTitle"), color = colors.foreground, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Icon(
                Icons.Filled.Close, contentDescription = tr("common.close"),
                tint = colors.textMuted,
                modifier = Modifier.size(22.dp).clickable { onDismiss() },
            )

            Spacer(Modifier.height(10.dp))

            val result = ui.humResult
            val errorKey = ui.humError

            // "Dernière identification" — the last system-bubble verdict (if
            // any): tap to expand the full results in this sheet.
            val lastOutcome = ui.bubbleLastOutcome
            if (lastOutcome != null && result == null && !ui.humUploading && errorKey == null && !recording) {
                Text(tr("hum.lastBubble"), color = colors.foreground, style = Type.Label, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                BubbleLastRow(lastOutcome) { vm.showBubbleResult() }
                Spacer(Modifier.height(12.dp))
            }

            when {
                errorKey != null || permissionDenied -> {
                    Text(
                        tr(errorKey ?: "hum.permissionDenied"),
                        color = colors.textMuted, style = Type.Label,
                    )
                    // Surface the server's own failure text (413/415/400…) so a
                    // failure never looks like a silent empty sheet.
                    if (errorKey != null && ui.humErrorDetail != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(ui.humErrorDetail!!, color = colors.textFaint, style = Type.Caption)
                    }
                    Spacer(Modifier.height(10.dp))
                    Row {
                        TextButton(onClick = {
                            permissionDenied = false
                            vm.clearHumError()
                            requestOrStart()
                        }) { Text(tr("hum.retry"), color = colors.accent) }
                        TextButton(onClick = onDismiss) { Text(tr("common.close"), color = colors.textMuted) }
                    }
                }
                ui.humUploading -> {
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 26.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(
                            color = colors.accent, strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(tr("hum.analyzing"), color = colors.textMuted, style = Type.Label)
                    }
                }
                result != null -> HumResults(result, ui, vm, onRetry = {
                    vm.clearHumResult()
                    requestOrStart()
                })
                recording -> {
                    Text(tr("hum.hint"), color = colors.textMuted, style = Type.Caption)
                    Spacer(Modifier.height(18.dp))
                    Text(
                        tr("hum.recording", params = mapOf("sec" to elapsed)),
                        color = colors.accent, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier.align(Alignment.CenterHorizontally)
                            .size(72.dp).clip(CircleShape).background(colors.accent)
                            .clickable { upload(recorder.stop()) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Stop, contentDescription = tr("hum.stop"), tint = colors.ink, modifier = Modifier.size(32.dp))
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        tr("hum.stop"),
                        color = colors.textMuted, style = Type.Caption,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    )
                }
                else -> {
                    Text(tr("hum.hint"), color = colors.textMuted, style = Type.Caption)
                    Spacer(Modifier.height(18.dp))
                    Box(
                        Modifier.align(Alignment.CenterHorizontally)
                            .size(72.dp).clip(CircleShape).background(colors.accent)
                            .clickable { requestOrStart() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Mic, contentDescription = tr("hum.record"), tint = colors.ink, modifier = Modifier.size(32.dp))
                    }
                }
            }

            // "Bulle Shazam" — launch/stop the system-wide bubble from the
            // recognition sheet too (same setup flow as the Settings card).
            Spacer(Modifier.height(6.dp))
            BubbleToggleRow(vm, ui)

            Spacer(Modifier.height(10.dp))
        }
    }
}

/** The recognition sheet's "Dernière identification" row: the last system
 *  bubble verdict — tap to expand the full results in this sheet. */
@Composable
private fun BubbleLastRow(outcome: BubbleOutcome, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    val title = when (outcome) {
        is BubbleOutcome.RemoteFound -> outcome.title
        is BubbleOutcome.LocalFound -> outcome.title
        is BubbleOutcome.NotFound -> tr("bubble.notif.notFound")
        is BubbleOutcome.Failed -> tr("bubble.failed")
    }
    val sub = when (outcome) {
        is BubbleOutcome.RemoteFound -> outcome.artists.joinToString(", ")
        is BubbleOutcome.LocalFound -> outcome.artist
        else -> ""
    }
    Row(
        Modifier.fillMaxWidth().clip(AMShapes.tile).clickable { onClick() }
            .padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(46.dp).clip(RoundedCornerShape(8.dp)).background(colors.panel2),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (outcome is BubbleOutcome.RemoteFound || outcome is BubbleOutcome.LocalFound) {
                    Icons.Filled.Check
                } else {
                    Icons.Filled.Close
                },
                contentDescription = tr("hum.lastBubble"),
                tint = colors.accent,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sub.isNotBlank()) {
                Text(sub, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** The sheet's bottom-anchored column (mirrors MediaMenus' MenuSheetScaffold). */
@Composable
private fun SheetColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val colors = LocalAuralis.current
    Column(
        modifier
            .fillMaxWidth()
            .padding(top = 60.dp)
            .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
            .background(colors.panel)
            .navigationBarsPadding()
            .heightIn(max = 560.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        content = content,
    )
}

@Composable
private fun HumResults(
    result: RecognizeResult,
    ui: UiState,
    vm: AppViewModel,
    onRetry: () -> Unit,
) {
    val colors = LocalAuralis.current
    val remote = result.remote.orEmpty()
    // REAL Shazam identifications first ("Identifié"), the library's melody
    // matches second ("Dans ta bibliothèque") — the world-catalog hit is the
    // star of this sheet.
    if (remote.isNotEmpty()) {
        Text(tr("hum.remoteTitle"), color = colors.foreground, style = Type.Label, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        remote.forEach { m ->
            HumRemoteRow(m, ui.humRemoteJobs[m.query]) { vm.downloadHumMatch(m) }
        }
        Spacer(Modifier.height(12.dp))
    }
    if (result.local.isNotEmpty()) {
        Text(tr("hum.localTitle"), color = colors.foreground, style = Type.Label, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        result.local.forEach { m ->
            HumLocalRow(m) { vm.playHumMatch(m) }
        }
        Spacer(Modifier.height(12.dp))
    }
    if (remote.isEmpty() && result.local.isEmpty()) {
        // Informative empty state — never a silent empty sheet.
        Text(tr("hum.noMatch"), color = colors.textMuted, style = Type.Label)
        if (result.indexSize == 0) {
            Spacer(Modifier.height(4.dp))
            Text(tr("hum.indexEmpty"), color = colors.textFaint, style = Type.Caption)
        }
        Spacer(Modifier.height(12.dp))
    }
    Row {
        TextButton(onClick = onRetry) { Text(tr("hum.retry"), color = colors.accent) }
        TextButton(onClick = { vm.closeHumSheet() }) { Text(tr("common.close"), color = colors.textMuted) }
    }
}

/** One local (library) match: cover, title, artist, score — tap plays it. */
@Composable
private fun HumLocalRow(match: RecognizeLocalMatch, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().clip(AMShapes.tile).clickable { onClick() }
            .padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverArt(match.image, match.trackhash, Modifier.size(46.dp), cornerRadius = 8, sizeDp = 46)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(match.title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(match.artist, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(8.dp))
        Text(
            tr("hum.score", params = mapOf("pct" to scorePercent(match.score))),
            color = colors.textMuted, style = AMType.Caption2,
        )
    }
}

/** One global-catalog match with its "Ajouter à la bibliothèque" download button
 *  (label follows the server-side download job, like SearchScreen's OnlineRow). */
@Composable
private fun HumRemoteRow(match: RecognizeRemoteMatch, job: DownloadJobDto?, onDownload: () -> Unit) {
    val colors = LocalAuralis.current
    val busy = job?.busy == true
    val done = job?.status == "done"
    val failed = job?.status == "error"
    val label = when {
        done -> tr("hum.addedToLibrary")
        failed -> tr("search.downloadRetry")
        job?.status == "downloading" -> tr("search.downloadRunning", params = mapOf("progress" to job.progress.coerceIn(0, 100)))
        job?.status == "scanning" -> tr("search.downloadScanning")
        busy -> tr("search.downloadQueued")
        else -> tr("hum.addToLibrary")
    }
    Row(
        Modifier.fillMaxWidth().clip(AMShapes.tile).padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(match.title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                match.artists.joinToString(", ").ifBlank { match.source },
                color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            tr("hum.score", params = mapOf("pct" to scorePercent(match.score))),
            color = colors.textMuted, style = AMType.Caption2,
        )
        Spacer(Modifier.width(8.dp))
        Row(
            Modifier
                .clip(CircleShape)
                .background(
                    when {
                        done -> colors.panel3
                        failed -> Color(0x26FF5252)
                        else -> colors.accent
                    },
                )
                .clickable(enabled = !busy && !done) { onDownload() }
                .padding(horizontal = 12.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    color = colors.foreground, strokeWidth = 2.dp,
                    modifier = Modifier.size(14.dp),
                )
            } else {
                Icon(
                    when {
                        done -> Icons.Filled.Check
                        failed -> Icons.Filled.Close
                        else -> Icons.Filled.Download
                    },
                    contentDescription = label,
                    tint = if (failed) Color(0xFFFF6B6B) else colors.foreground,
                    modifier = Modifier.size(15.dp),
                )
            }
            Spacer(Modifier.width(6.dp))
            Text(label, color = if (failed) Color(0xFFFF6B6B) else colors.foreground, style = AMType.Caption2, fontWeight = FontWeight.Bold)
        }
    }
}
