package local.auralis.client.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope
import local.auralis.client.i18n.Locale
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.playback.EqCurve
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.components.rememberSleepCountdown
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type
import local.auralis.client.ui.theme.tonalCard
import org.json.JSONArray

@Composable
fun SettingsScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var showPassword by remember { mutableStateOf(false) }
    var showFolder by remember { mutableStateOf(false) }
    var showImport by remember { mutableStateOf(false) }
    var showUsers by remember { mutableStateOf(false) }
    var showResetConfirm by remember { mutableStateOf(false) }
    var backupBusy by remember { mutableStateOf(false) }

    if (showPassword) PasswordDialog(vm) { showPassword = false }
    if (showFolder) FolderDialog(vm, ui.root ?: "") { showFolder = false }
    if (showImport) ImportDialog(vm) { showImport = false }
    if (showUsers) UsersDialog(vm) { showUsers = false }

    // Admin backup: SAF create-document destination, then the streamed POST
    // /api/backup snapshot is written there (web downloadBackup).
    val saveBackup = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) {
            backupBusy = true
            vm.downloadBackup { bytes, _ ->
                scope.launch(Dispatchers.IO) {
                    val ok = runCatching {
                        ctx.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } != null
                    }.getOrDefault(false)
                    withContext(Dispatchers.Main) {
                        backupBusy = false
                        vm.notify(if (ok) Messages.t("toast.backupDownloaded") else Messages.t("toast.backupFailed"))
                    }
                }
            }
        }
    }

    if (showResetConfirm) {
        AlertDialog(
            onDismissRequest = { showResetConfirm = false },
            containerColor = colors.panel,
            title = { Text(tr("settings.confirmResetTitle"), color = colors.foreground) },
            text = { Text(tr("settings.confirmResetStats"), color = colors.textMuted) },
            confirmButton = { TextButton(onClick = { vm.resetStats(); showResetConfirm = false }) { Text(tr("settings.reset"), color = colors.destructive) } },
            dismissButton = { TextButton(onClick = { showResetConfirm = false }) { Text(tr("common.cancel"), color = colors.textMuted) } },
        )
    }

    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 170.dp)) {
        item {
            Eyebrow(tr("settings.title"))
            Text(tr("settings.screenTitle"), style = AMType.Title1, color = colors.foreground)
            Spacer(Modifier.height(Spacing.xl))
        }

        item {
            Card(tr("settings.section.account")) {
                Field(tr("settings.username"), ui.username ?: "—")
                Field(tr("settings.server"), ui.serverBase)
                ActionRow(tr("settings.changePassword")) { showPassword = true }
                if (ui.isAdmin) ActionRow(tr("settings.manageAccounts")) { showUsers = true }
                ActionRow(tr("settings.changeSource")) { vm.changeServer() }
                ActionRow(tr("settings.signOut"), tone = colors.destructive) { vm.logout() }
                if (ui.isAdmin) {
                    Spacer(Modifier.height(6.dp))
                    Text(tr("settings.backup"), color = colors.foreground, style = Type.Label, fontWeight = FontWeight.SemiBold)
                    Text(tr("settings.backupHelp"), color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(top = 2.dp, bottom = 4.dp))
                    ActionRow(if (backupBusy) tr("settings.preparing") else tr("settings.downloadBackup")) {
                        if (!backupBusy) {
                            // auralis-backup-YYYY-MM-DD.db — the server's snapshot name.
                            val stamp = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                                .format(java.util.Date())
                            saveBackup.launch("auralis-backup-$stamp.db")
                        }
                    }
                }
            }
        }

        item {
            Card(tr("settings.playback")) {
                Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(tr("settings.autoplay"), color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold)
                        Text(tr("settings.autoplayHint"), color = colors.textMuted, style = AMType.Caption2)
                    }
                    androidx.compose.material3.Switch(
                        checked = ui.autoplay,
                        onCheckedChange = { vm.toggleAutoplay() },
                        colors = androidx.compose.material3.SwitchDefaults.colors(
                            checkedThumbColor = colors.ink, checkedTrackColor = colors.accent, checkedBorderColor = colors.accent,
                            uncheckedThumbColor = colors.textMuted, uncheckedTrackColor = colors.panel2, uncheckedBorderColor = colors.lineStrong,
                        ),
                    )
                }
                Text(tr("settings.volume"), color = colors.textMuted, style = Type.Caption)
                Slider(
                    value = ui.volume, onValueChange = { vm.setVolume(it) },
                    colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.line),
                )
                Text(tr("settings.normalization"), color = colors.textMuted, style = Type.Caption, modifier = Modifier.padding(top = 6.dp))
                ChipRow(
                    options = listOf(
                        tr("settings.normalization.off") to "off",
                        tr("settings.normalization.track") to "track",
                        tr("settings.normalization.album") to "album",
                    ),
                    selected = ui.normalization,
                ) { vm.setNormalization(it) }
                Text(tr("settings.crossfade"), color = colors.textMuted, style = Type.Caption, modifier = Modifier.padding(top = 6.dp))
                ChipRow(
                    options = listOf("0", "3", "6", "12").map { tr("settings.secondsShort", params = mapOf("n" to it)) to it },
                    selected = ui.crossfade.toString(),
                ) { vm.setCrossfade(it.toInt()) }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("player.sleep"), color = colors.textMuted, style = Type.Caption)
                    Spacer(Modifier.weight(1f))
                    // Live "m:ss" countdown while a timed sleep is armed (web badge).
                    val remaining = rememberSleepCountdown(ui.sleepEndsAt)
                    if (ui.sleepActive && remaining.isNotEmpty()) {
                        Text(remaining, color = colors.accent, style = Type.Caption, fontWeight = FontWeight.SemiBold)
                    }
                }
                androidx.compose.foundation.layout.FlowRow(
                    Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(5, 10, 15, 30, 45, 60).forEach { m ->
                        Box(
                            Modifier.clip(CircleShape).background(colors.panel2).clickable { vm.startSleepTimer(m) }.padding(horizontal = 12.dp, vertical = 7.dp),
                        ) { Text("${m}m", color = colors.foreground, style = Type.Caption) }
                    }
                    if (ui.sleepActive) Box(
                        Modifier.clip(CircleShape).background(colors.accent).clickable { vm.cancelSleepTimer() }.padding(horizontal = 12.dp, vertical = 7.dp),
                    ) { Text(tr("common.cancel"), color = colors.ink, style = Type.Caption, fontWeight = FontWeight.SemiBold) }
                }
            }
        }

        item {
            val eqAvailable by vm.eqAvailable.collectAsState()
            Card(tr("eq.title")) {
                if (!eqAvailable) {
                    Text(tr("eq.notSupported"), color = colors.textMuted, style = Type.Caption)
                } else {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(tr("eq.enabled"), color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold)
                            Text(tr("eq.subtitle"), color = colors.textMuted, style = AMType.Caption2)
                        }
                        androidx.compose.material3.Switch(
                            checked = ui.eqEnabled,
                            onCheckedChange = { vm.toggleEqEnabled() },
                            colors = androidx.compose.material3.SwitchDefaults.colors(
                                checkedThumbColor = colors.ink, checkedTrackColor = colors.accent, checkedBorderColor = colors.accent,
                                uncheckedThumbColor = colors.textMuted, uncheckedTrackColor = colors.panel2, uncheckedBorderColor = colors.lineStrong,
                            ),
                        )
                    }
                    // Preset chips (the web's 8 EQ_PRESETS) + a custom marker when the
                    // curve left preset-land.
                    androidx.compose.foundation.layout.FlowRow(
                        Modifier.padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        EqCurve.PRESETS.keys.forEach { id ->
                            val active = ui.eqPreset == id
                            Box(
                                Modifier.clip(CircleShape)
                                    .background(if (active) colors.accent else colors.panel2)
                                    .clickable { vm.applyEqPreset(id) }
                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                            ) {
                                Text(
                                    EqCurve.presetLabel(id),
                                    color = if (active) colors.ink else colors.foreground,
                                    style = Type.Caption,
                                )
                            }
                        }
                        if (ui.eqPreset == "custom") Box(
                            Modifier.clip(CircleShape).background(colors.panel2).padding(horizontal = 12.dp, vertical = 7.dp),
                        ) { Text(tr("eq.custom"), color = colors.textMuted, style = Type.Caption) }
                    }
                    // Band sliders — ±12 dB around 0 (web slider range), greyed out
                    // while the EQ is off but still showing the stored curve.
                    EqCurve.BAND_LABELS.forEachIndexed { i, label ->
                        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                label,
                                color = colors.textMuted,
                                style = AMType.Caption2,
                                modifier = Modifier.width(38.dp),
                            )
                            Slider(
                                value = ui.eqGains.getOrElse(i) { 0f },
                                onValueChange = { vm.setEqBand(i, it) },
                                valueRange = -12f..12f,
                                enabled = ui.eqEnabled,
                                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                                colors = SliderDefaults.colors(
                                    thumbColor = colors.accent, activeTrackColor = colors.accent,
                                    inactiveTrackColor = colors.line, disabledThumbColor = colors.textMuted,
                                    disabledActiveTrackColor = colors.textMuted, disabledInactiveTrackColor = colors.line,
                                ),
                            )
                            Text(
                                formatDb(ui.eqGains.getOrElse(i) { 0f }),
                                color = colors.textMuted,
                                style = AMType.Caption2,
                                modifier = Modifier.width(52.dp),
                                textAlign = androidx.compose.ui.text.style.TextAlign.End,
                            )
                        }
                    }
                    ActionRow(tr("settings.reset")) { vm.resetEq() }
                }
            }
        }

        item {
            val dur = ui.tracks.sumOf { it.duration ?: 0.0 }
            Card(tr("settings.library")) {
                // Live scan status + progress (the /api/library `scan` object).
                val scan = ui.scan
                Field(tr("settings.scanStatus"), when (scan.status) {
                    "scanning" -> tr("settings.scanStatus.scanning")
                    "ready" -> tr("settings.scanStatus.ready")
                    "error" -> tr("settings.scanStatus.error")
                    else -> tr("settings.scanStatus.idle")
                })
                Field(tr("settings.sourceDir"), ui.root ?: "—")
                Field(tr("settings.indexedTracks"), "${ui.tracks.size}")
                Field(tr("settings.albumsCount"), "${ui.albums.size}")
                Field(tr("settings.artistsCount"), "${ui.artists.size}")
                Field(tr("settings.totalDuration"), formatLongDuration(dur))
                Field(tr("settings.lastScan"), ui.scannedAt ?: tr("settings.never"))
                ActionRow(
                    if (scan.status == "scanning") {
                        tr("settings.scanProgress", params = mapOf("done" to scan.processed, "total" to (scan.total.takeIf { it > 0 } ?: "?")))
                    } else tr("settings.rescan"),
                ) { vm.rescan() }
                ActionRow(
                    if (scan.analyzing) {
                        tr("settings.analyzing", params = mapOf("done" to scan.analyzed, "total" to (scan.analyzeTotal.takeIf { it > 0 } ?: "?")))
                    } else tr("settings.analyze"),
                ) { vm.analyzeMood() }
                if (ui.isAdmin) ActionRow(tr("settings.changeDir")) { showFolder = true }
                ActionRow(tr("settings.reloadLibrary")) { vm.loadAll() }

                // Lyrics coverage (web settings lyricsRows): real state of the .lrc files.
                Spacer(Modifier.height(8.dp))
                val withLyrics = ui.tracks.count { it.hasLyrics }
                Field(tr("settings.tracksWithLyrics"), "$withLyrics / ${ui.tracks.size}")
                Field(tr("settings.supportedSource"), tr("settings.lrcSidecar"))
                Field(tr("settings.display"), if (withLyrics > 0) tr("settings.lyricsPerTrack") else tr("settings.lyricsHiddenIfEmpty"))
                Field(tr("settings.convention"), "song.mp3 + song.lrc")
                Text(tr("settings.lrcHint"), color = colors.textMuted, style = AMType.Caption2)
            }
        }

        item {
            Card(tr("settings.melody")) {
                LaunchedEffect(Unit) { vm.refreshMelodyStatus() }
                val melody = ui.melody
                Field(tr("settings.melodyIndexed"), "${melody?.indexed ?: 0} / ${melody?.total ?: 0}")
                if (melody?.running == true) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        tr("settings.melodyIndexing", params = mapOf("done" to melody.indexed, "total" to melody.total)),
                        color = colors.accent, style = Type.Caption, fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(8.dp))
                    androidx.compose.material3.LinearProgressIndicator(
                        progress = { if (melody.total > 0) melody.indexed.toFloat() / melody.total else 0f },
                        modifier = Modifier.fillMaxWidth(),
                        color = colors.accent,
                        trackColor = colors.panel2,
                    )
                } else if (melody?.ffmpeg == false) {
                    // The melody engine needs ffmpeg server-side — explain instead
                    // of offering a button that would 503.
                    Spacer(Modifier.height(6.dp))
                    Text(tr("settings.melodyNoFfmpeg"), color = colors.textMuted, style = AMType.Caption2)
                } else if (ui.isAdmin) {
                    ActionRow(tr("settings.melodyIndexBtn")) { vm.startIndexingMelody() }
                }
                Text(
                    tr("settings.melodyHelp"),
                    color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }

        item {
            Card(tr("settings.appearance")) {
                Text(tr("settings.appearanceText"), color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(bottom = 6.dp))
                ChipRow(
                    options = listOf(
                        tr("settings.mode.dark") to "dark",
                        tr("settings.mode.light") to "light",
                        tr("settings.mode.auto") to "auto",
                    ),
                    selected = ui.themeMode,
                ) { vm.setThemeMode(it) }
                Text(
                    when (ui.themeMode) {
                        "dark" -> tr("settings.mode.dark.hint")
                        "light" -> tr("settings.mode.light.hint")
                        else -> tr("settings.mode.auto.hint")
                    },
                    color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }

        item {
            Card(tr("settings.language")) {
                Text(tr("settings.languageHint"), color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(bottom = 6.dp))
                ChipRow(
                    // Language autonyms shown literally, like the web's LOCALES.
                    options = Locale.entries.map { it.autonym to it.id },
                    selected = ui.locale.id,
                ) { vm.setLocale(Locale.from(it)) }
                Text(
                    if (ui.locale == Locale.EN) tr("settings.language.en.hint") else tr("settings.language.fr.hint"),
                    color = colors.textMuted, style = AMType.Caption2, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }

        item {
            Card(tr("settings.section.data")) {
                ActionRow(tr("settings.export")) {
                    vm.exportState { json ->
                        runCatching {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "application/json"
                                putExtra(Intent.EXTRA_TEXT, json)
                            }
                            ctx.startActivity(Intent.createChooser(send, "Auralis"))
                        }
                    }
                }
                ActionRow(tr("settings.import")) { showImport = true }
                ActionRow(tr("settings.resetListening"), tone = colors.destructive) { showResetConfirm = true }
            }
        }

        item {
            Card(tr("settings.section.about")) {
                Field(tr("settings.app"), tr("settings.appName"))
                Field(tr("settings.version"), local.auralis.client.BuildConfig.VERSION_NAME)
            }
        }
    }
}

@Composable
private fun PasswordDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text(tr("settings.changePassword"), color = colors.foreground) },
        text = {
            Column {
                Pwd(current, { current = it }, tr("settings.currentPassword"))
                Spacer(Modifier.height(8.dp))
                Pwd(next, { next = it }, tr("settings.newPassword"))
                error?.let { Text(it, color = colors.destructive, style = Type.Caption, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                vm.changePassword(current, next) { ok, err -> if (ok) onDismiss() else error = err }
            }) { Text(tr("common.validate"), color = colors.accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = colors.textMuted) } },
    )
}

@Composable
private fun FolderDialog(vm: AppViewModel, initial: String, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var path by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text(tr("settings.musicDir"), color = colors.foreground) },
        text = { Field2(path, { path = it }, tr("settings.folderPathHint")) },
        confirmButton = { TextButton(onClick = { vm.changeMusicDir(path.trim()); onDismiss() }) { Text(tr("common.validate"), color = colors.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = colors.textMuted) } },
    )
}

@Composable
private fun ImportDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text(tr("settings.import"), color = colors.foreground) },
        text = {
            Column {
                Text(tr("settings.importHint"), color = colors.textMuted, style = Type.Caption)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
                    colors = fieldColors(colors),
                )
            }
        },
        confirmButton = { TextButton(onClick = { vm.importState(text) { onDismiss() } }) { Text(tr("library.import"), color = colors.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("common.cancel"), color = colors.textMuted) } },
    )
}

@Composable
private fun UsersDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var users by remember { mutableStateOf(JSONArray()) }
    var me by remember { mutableStateOf(-1) }
    var newUser by remember { mutableStateOf("") }
    var newPass by remember { mutableStateOf("") }
    var newAdmin by remember { mutableStateOf(false) }
    var reload by remember { mutableStateOf(0) }

    androidx.compose.runtime.LaunchedEffect(reload) {
        vm.loadUsers { arr, m -> users = arr; me = m }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text(tr("settings.accounts"), color = colors.foreground) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                for (i in 0 until users.length()) {
                    val u = users.optJSONObject(i) ?: continue
                    val id = u.optInt("id")
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                u.optString("username") +
                                    (if (u.optBoolean("isAdmin")) " · admin" else "") +
                                    (if (id == me) " " + tr("settings.you") else ""),
                                color = colors.foreground, style = Type.Body,
                            )
                        }
                        Text(tr("settings.password"), color = colors.textMuted, style = Type.Caption, modifier = Modifier.clickable {
                            vm.resetUserPassword(id, "changeme123") { reload++ }
                        }.padding(6.dp))
                        if (id != me) Text(tr("detail.delete"), color = colors.destructive, style = Type.Caption, modifier = Modifier.clickable {
                            vm.deleteUser(id) { reload++ }
                        }.padding(6.dp))
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(tr("settings.newAccount"), color = colors.textMuted, style = Type.Caption)
                Field2(newUser, { newUser = it }, tr("settings.username"))
                Spacer(Modifier.height(6.dp))
                Pwd(newPass, { newPass = it }, tr("settings.password"))
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(20.dp).clip(RoundedCornerShape(5.dp)).background(if (newAdmin) colors.accent else colors.panel2).clickable { newAdmin = !newAdmin },
                        contentAlignment = Alignment.Center,
                    ) { if (newAdmin) Text("✓", color = colors.ink, style = Type.Label) }
                    Spacer(Modifier.width(8.dp))
                    Text(tr("settings.admin"), color = colors.foreground, style = Type.Label)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = {
                        if (newUser.isNotBlank() && newPass.length >= 6) vm.createUser(newUser.trim(), newPass, newAdmin) { ok, _ -> if (ok) { newUser = ""; newPass = ""; newAdmin = false; reload++ } }
                    }) { Text(tr("common.create"), color = colors.accent) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(tr("common.close"), color = colors.accent) } },
    )
}

// ---- small reusable bits ---------------------------------------------------

@Composable
private fun fieldColors(colors: local.auralis.client.ui.theme.AuralisColors) = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
    focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
)

@Composable
private fun Pwd(value: String, onChange: (String) -> Unit, label: String) {
    val colors = LocalAuralis.current
    OutlinedTextField(
        value = value, onValueChange = onChange, singleLine = true,
        placeholder = { Text(label, color = colors.textFaint) },
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(), colors = fieldColors(colors),
    )
}

@Composable
private fun Field2(value: String, onChange: (String) -> Unit, label: String) {
    val colors = LocalAuralis.current
    OutlinedTextField(
        value = value, onValueChange = onChange, singleLine = true,
        placeholder = { Text(label, color = colors.textFaint) },
        modifier = Modifier.fillMaxWidth(), colors = fieldColors(colors),
    )
}

/** A grouped settings section: tonal card + hairline border + section title. */
@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
    val colors = LocalAuralis.current
    Column(
        Modifier.fillMaxWidth().padding(bottom = Spacing.lg)
            .tonalCard(AMShapes.card, colors.panel)
            .padding(Spacing.lg),
    ) {
        Text(title, color = colors.foreground, style = AMType.Headline, modifier = Modifier.padding(bottom = Spacing.md))
        content()
    }
}

@Composable
private fun Field(label: String, value: String) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = colors.textMuted, style = Type.Body)
        Text(value, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.padding(start = Spacing.lg))
    }
}

@Composable
private fun ActionRow(label: String, tone: Color? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = Spacing.md)) {
        Text(label, color = tone ?: colors.accent, style = Type.Body, fontWeight = FontWeight.SemiBold)
    }
}

/** A row of round setting chips with one highlighted selection. */
@Composable
private fun ChipRow(options: List<Pair<String, String>>, selected: String?, onSelect: (String) -> Unit) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().padding(top = Spacing.sm), horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
        options.forEach { (label, value) ->
            val active = value == selected
            Box(
                Modifier.clip(AMShapes.pill)
                    .background(if (active) colors.accent else colors.panel2)
                    .clickable { onSelect(value) }
                    .padding(horizontal = Spacing.md, vertical = Spacing.sm),
            ) { Text(label, color = if (active) colors.ink else colors.foreground, style = Type.Caption) }
        }
    }
}

/** "+4.5 dB" / "−3 dB" / "0 dB" — signed, at most one decimal (web formatDb). */
private fun formatDb(db: Float): String {
    val v = Math.round(db * 10f) / 10f
    return when {
        v == 0f -> "0 dB"
        v > 0f -> "+%.1f dB".format(v)
        else -> "−%.1f dB".format(-v)
    }
}
