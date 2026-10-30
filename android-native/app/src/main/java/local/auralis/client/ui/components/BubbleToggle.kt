package local.auralis.client.ui.components

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.playback.BubbleBus
import local.auralis.client.playback.ShazamBubbleService
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

// "Bulle Shazam" — the shared master toggle + setup flow for the system-wide
// recognition bubble (playback/ShazamBubbleService). Used by the Settings card
// and by the recognition (hum) sheet so the bubble can be launched/stopped from
// both. The first-run flow is: overlay permission → screen-capture consent →
// ready (API 24-28 goes straight to the mic path — no playback capture there).

/**
 * Master toggle + status rows for the Shazam bubble:
 *  - toggle (bubble on/off)
 *  - explanation ("Identifie la musique dans tes vidéos…")
 *  - active capture mode (audio interne / micro)
 *  - "Réinitialiser l'autorisation d'écran" hint/action
 */
@Composable
fun BubbleToggleRow(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val ctx = LocalContext.current

    val consentLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { ar ->
        if (ar.resultCode == Activity.RESULT_OK && ar.data != null) {
            ShazamBubbleService.startWithProjection(ctx, ar.resultCode, ar.data!!)
            vm.setBubbleEnabled(true)
            vm.notify(Messages.t("bubble.ready"))
        } else {
            vm.setBubbleEnabled(false)
            vm.notify(Messages.t("bubble.perm.screenDenied"))
        }
    }

    val micLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            ShazamBubbleService.startMic(ctx)
            vm.setBubbleEnabled(true)
            vm.notify(Messages.t("bubble.ready"))
        } else {
            vm.setBubbleEnabled(false)
            vm.notify(Messages.t("bubble.perm.micDenied"))
        }
    }

    // Second step of the setup: the capture consent (API 29+) or the mic path.
    fun beginSetup() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val mpm = ctx.getSystemService(MediaProjectionManager::class.java)
            consentLauncher.launch(mpm.createScreenCaptureIntent())
        } else {
            val granted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            if (granted) {
                ShazamBubbleService.startMic(ctx)
                vm.setBubbleEnabled(true)
                vm.notify(Messages.t("bubble.ready"))
            } else {
                micLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    val overlayLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        if (Settings.canDrawOverlays(ctx)) {
            beginSetup()
        } else {
            vm.setBubbleEnabled(false)
            vm.notify(Messages.t("bubble.perm.overlayDenied"))
        }
    }

    fun setEnabled(on: Boolean) {
        if (!on) {
            vm.setBubbleEnabled(false)
            ShazamBubbleService.stop(ctx)
            return
        }
        // First-run setup: overlay permission → screen-capture consent → ready.
        if (!Settings.canDrawOverlays(ctx)) {
            overlayLauncher.launch(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${ctx.packageName}"),
                ),
            )
            return
        }
        beginSetup()
    }

    // ---- toggle -------------------------------------------------------------

    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(tr("settings.bubble"), color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold)
            Text(tr("settings.bubble.explain"), color = colors.textMuted, style = AMType.Caption2)
        }
        Switch(
            checked = ui.bubbleEnabled,
            onCheckedChange = { setEnabled(it) },
            colors = SwitchDefaults.colors(
                checkedThumbColor = colors.ink, checkedTrackColor = colors.accent, checkedBorderColor = colors.accent,
                uncheckedThumbColor = colors.textMuted, uncheckedTrackColor = colors.panel2, uncheckedBorderColor = colors.lineStrong,
            ),
        )
    }

    // ---- capture mode + authorization hint -----------------------------------

    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(tr("settings.bubble.captureMode"), color = colors.textMuted, style = Type.Body)
        Text(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && ui.bubbleCaptureMode != BubbleBus.MODE_MIC) {
                tr("settings.bubble.capture.internal")
            } else {
                tr("settings.bubble.capture.mic")
            },
            color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold,
        )
    }
    Spacer(Modifier.height(2.dp))
    Text(tr("settings.bubble.projectionHint"), color = colors.textFaint, style = AMType.Caption2)
    Box(Modifier.fillMaxWidth().clickable {
        ShazamBubbleService.resetProjection(ctx)
        vm.notify(Messages.t("settings.bubble.projectionReset"))
    }.padding(vertical = Spacing.md)) {
        Text(tr("settings.bubble.resetProjection"), color = colors.accent, style = Type.Body, fontWeight = FontWeight.SemiBold)
    }
}
