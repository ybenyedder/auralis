package local.auralis.client.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import local.auralis.client.ui.theme.LocalAuralis

private const val DONATE_URL = "https://paypal.me/AdamMezerai"

/** Dismissible donation reminder. Shown on the first launch and then every 3rd
 *  launch after it; the trigger is decided by the ViewModel (UiState.donateDue). */
@Composable
fun DonateDialog(onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val colors = LocalAuralis.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        titleContentColor = colors.foreground,
        textContentColor = colors.textMuted,
        icon = { Icon(Icons.Filled.Favorite, contentDescription = null, tint = colors.accent) },
        title = { Text("Soutenir Auralis") },
        text = {
            Text(
                "Auralis est gratuit, sans publicité et sans pistage. Si l'app te plaît, " +
                    "un petit don aide à couvrir les coûts et à faire avancer le projet.",
            )
        },
        confirmButton = {
            TextButton(onClick = {
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(DONATE_URL))) }
                onDismiss()
            }) { Text("Faire un don", color = colors.accent) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Plus tard", color = colors.textMuted) }
        },
    )
}
