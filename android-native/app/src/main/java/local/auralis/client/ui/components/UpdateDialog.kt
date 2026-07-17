package local.auralis.client.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.update.UpdateInfo

/**
 * "A new version is available" prompt. Tapping Install streams the APK (progress
 * shown inline) and then opens the system installer. Decided by the ViewModel
 * (UiState.update); dismissible — it reappears on the next launch if ignored.
 */
@Composable
fun UpdateDialog(
    info: UpdateInfo,
    downloading: Boolean,
    progress: Float,
    onInstall: () -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = LocalAuralis.current
    val notes = info.notes.lineSequence().take(6).joinToString("\n").trim()
    AlertDialog(
        // Don't let an outside tap cancel an in-flight download.
        onDismissRequest = { if (!downloading) onDismiss() },
        containerColor = colors.panel,
        titleContentColor = colors.foreground,
        textContentColor = colors.textMuted,
        icon = { Icon(Icons.Filled.Download, contentDescription = null, tint = colors.accent) },
        title = { Text("Mise à jour disponible") },
        text = {
            Column {
                Text("Auralis ${info.version} est disponible.")
                if (notes.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text(notes, color = colors.textMuted, fontSize = 13.sp)
                }
                if (downloading) {
                    Spacer(Modifier.height(16.dp))
                    LinearProgressIndicator(
                        progress = { progress.coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth(),
                        color = colors.accent,
                        trackColor = colors.background,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("Téléchargement… ${(progress * 100).toInt()} %", color = colors.textMuted, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onInstall, enabled = !downloading) {
                Text(if (downloading) "Téléchargement…" else "Installer", color = colors.accent)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !downloading) {
                Text("Plus tard", color = colors.textMuted)
            }
        },
    )
}
