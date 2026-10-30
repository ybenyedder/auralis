package local.auralis.client.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.i18n.tr
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.theme.LocalAuralis

// Playlist import → "Télécharger les N titres manquants": the offer dialog (once
// an import left entries without a library counterpart) and the live progress
// dialog for the download batch. Rendered globally in Shell so the prompt
// survives the navigation to the just-created playlist.

@Composable
fun ImportDownloadDialogs(ui: UiState, vm: AppViewModel) {
    val colors = LocalAuralis.current

    ui.importOffer?.let { offer ->
        val count = offer.entries.size
        AlertDialog(
            onDismissRequest = { vm.dismissImportOffer() },
            containerColor = colors.panel,
            title = { Text(tr("import.downloadMissingTitle"), color = colors.foreground) },
            text = {
                Text(
                    tr("import.downloadMissingHint", params = mapOf("count" to count)),
                    color = colors.textMuted, fontSize = 13.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = { vm.startImportDownload() }) {
                    Text(tr("import.downloadMissing", params = mapOf("count" to count)), color = colors.accent)
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.dismissImportOffer() }) {
                    Text(tr("common.cancel"), color = colors.textMuted)
                }
            },
        )
    }

    val dl = ui.importDownload
    if (dl != null && dl.running) {
        AlertDialog(
            onDismissRequest = { vm.dismissImportDownload() },
            containerColor = colors.panel,
            title = { Text(tr("import.downloadsRunning"), color = colors.foreground) },
            text = {
                Column {
                    Text(
                        tr("import.downloading", params = mapOf("done" to dl.done, "total" to dl.total)),
                        color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { if (dl.total > 0) (dl.done + dl.failed).toFloat() / dl.total else 0f },
                        modifier = Modifier.fillMaxWidth(),
                        color = colors.accent,
                        trackColor = colors.panel2,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.dismissImportDownload() }) {
                    Text(tr("common.close"), color = colors.textMuted)
                }
            },
        )
    }
}
