package local.auralis.client.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.THEME_GROUPS
import local.auralis.client.ui.theme.THEME_LIST
import org.json.JSONArray

@Composable
fun SettingsScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val ctx = LocalContext.current
    var showPassword by remember { mutableStateOf(false) }
    var showFolder by remember { mutableStateOf(false) }
    var showImport by remember { mutableStateOf(false) }
    var showUsers by remember { mutableStateOf(false) }
    var showResetConfirm by remember { mutableStateOf(false) }

    if (showPassword) PasswordDialog(vm) { showPassword = false }
    if (showFolder) FolderDialog(vm, ui.root ?: "") { showFolder = false }
    if (showImport) ImportDialog(vm) { showImport = false }
    if (showUsers) UsersDialog(vm) { showUsers = false }
    if (showResetConfirm) {
        AlertDialog(
            onDismissRequest = { showResetConfirm = false },
            containerColor = colors.panel,
            title = { Text("Réinitialiser l'historique ?", color = colors.foreground) },
            text = { Text("Compteurs d'écoute, récents et série seront effacés. Favoris et playlists sont conservés.", color = colors.textMuted) },
            confirmButton = { TextButton(onClick = { vm.resetStats(); showResetConfirm = false }) { Text("Réinitialiser", color = colors.destructive) } },
            dismissButton = { TextButton(onClick = { showResetConfirm = false }) { Text("Annuler", color = colors.textMuted) } },
        )
    }

    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 170.dp)) {
        item {
            Eyebrow("Réglages")
            Text("Paramètres", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
            Spacer(Modifier.height(16.dp))
        }

        item {
            Card("Compte") {
                Field("Identifiant", ui.username ?: "—")
                Field("Serveur", ui.serverBase)
                ActionRow("Changer le mot de passe") { showPassword = true }
                if (ui.isAdmin) ActionRow("Gérer les comptes") { showUsers = true }
                ActionRow("Changer la source (URL serveur)") { vm.changeServer() }
                ActionRow("Se déconnecter", tone = colors.destructive) { vm.logout() }
            }
        }

        item {
            Card("Lecture") {
                Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Lecture continue", color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text("Enchaîner des titres similaires à la fin de la file", color = colors.textMuted, fontSize = 11.sp)
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
                Text("Volume", color = colors.textMuted, fontSize = 12.sp)
                Slider(
                    value = ui.volume, onValueChange = { vm.setVolume(it) },
                    colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.line),
                )
                Text("Minuteur de veille", color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(15, 30, 45, 60).forEach { m ->
                        Box(
                            Modifier.clip(CircleShape).background(colors.panel2).clickable { vm.startSleepTimer(m) }.padding(horizontal = 12.dp, vertical = 7.dp),
                        ) { Text("${m}m", color = colors.foreground, fontSize = 12.sp) }
                    }
                    if (ui.sleepActive) Box(
                        Modifier.clip(CircleShape).background(colors.accent).clickable { vm.cancelSleepTimer() }.padding(horizontal = 12.dp, vertical = 7.dp),
                    ) { Text("Annuler", color = colors.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                }
            }
        }

        item {
            Card("Apparence") {
                THEME_GROUPS.forEach { (groupId, groupLabel) ->
                    Text(groupLabel, color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp, bottom = 6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(THEME_LIST.filter { it.group == groupId }) { th ->
                            val active = ui.theme == th.id
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(
                                    Modifier.size(44.dp).clip(CircleShape).background(th.colors.accent)
                                        .then(if (active) Modifier.border(3.dp, colors.foreground, CircleShape) else Modifier)
                                        .clickable { vm.setTheme(th.id) },
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(th.label, color = if (active) colors.foreground else colors.textMuted, fontSize = 10.sp)
                            }
                        }
                    }
                }
            }
        }

        item {
            val dur = ui.tracks.sumOf { it.duration ?: 0.0 }
            Card("Bibliothèque") {
                Field("Dossier source", ui.root ?: "—")
                Field("Titres indexés", "${ui.tracks.size}")
                Field("Albums", "${ui.albums.size}")
                Field("Artistes", "${ui.artists.size}")
                Field("Durée totale", formatLongDuration(dur))
                ActionRow("Relancer le scan") { vm.rescan() }
                if (ui.isAdmin) ActionRow("Changer le dossier de musique") { showFolder = true }
                ActionRow("Recharger la bibliothèque") { vm.loadAll() }
            }
        }

        item {
            Card("Données") {
                ActionRow("Exporter mes données") {
                    vm.exportState { json ->
                        runCatching {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "application/json"
                                putExtra(Intent.EXTRA_TEXT, json)
                            }
                            ctx.startActivity(Intent.createChooser(send, "Exporter Auralis"))
                        }
                    }
                }
                ActionRow("Importer des données") { showImport = true }
                ActionRow("Réinitialiser l'historique", tone = colors.destructive) { showResetConfirm = true }
            }
        }

        item {
            Card("À propos") {
                Field("Application", "Auralis natif")
                Field("Version", "2.0 (Kotlin)")
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
        title = { Text("Changer le mot de passe", color = colors.foreground) },
        text = {
            Column {
                Pwd(current, { current = it }, "Mot de passe actuel")
                Spacer(Modifier.height(8.dp))
                Pwd(next, { next = it }, "Nouveau mot de passe (≥6)")
                error?.let { Text(it, color = colors.destructive, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                vm.changePassword(current, next) { ok, err -> if (ok) onDismiss() else error = err }
            }) { Text("Valider", color = colors.accent) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler", color = colors.textMuted) } },
    )
}

@Composable
private fun FolderDialog(vm: AppViewModel, initial: String, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var path by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text("Dossier de musique", color = colors.foreground) },
        text = { Field2(path, { path = it }, "Chemin du dossier (sur le serveur)") },
        confirmButton = { TextButton(onClick = { vm.changeMusicDir(path.trim()); onDismiss() }) { Text("Valider", color = colors.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler", color = colors.textMuted) } },
    )
}

@Composable
private fun ImportDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.panel,
        title = { Text("Importer des données", color = colors.foreground) },
        text = {
            Column {
                Text("Colle le JSON exporté précédemment.", color = colors.textMuted, fontSize = 12.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
                    colors = fieldColors(colors),
                )
            }
        },
        confirmButton = { TextButton(onClick = { vm.importState(text) { onDismiss() } }) { Text("Importer", color = colors.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler", color = colors.textMuted) } },
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
        title = { Text("Comptes", color = colors.foreground) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                for (i in 0 until users.length()) {
                    val u = users.optJSONObject(i) ?: continue
                    val id = u.optInt("id")
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(u.optString("username") + if (u.optBoolean("isAdmin")) " · admin" else "", color = colors.foreground, fontSize = 14.sp)
                        }
                        Text("MDP", color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.clickable {
                            vm.resetUserPassword(id, "changeme123") { reload++ }
                        }.padding(6.dp))
                        if (id != me) Text("Suppr.", color = colors.destructive, fontSize = 12.sp, modifier = Modifier.clickable {
                            vm.deleteUser(id) { reload++ }
                        }.padding(6.dp))
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text("Nouveau compte", color = colors.textMuted, fontSize = 12.sp)
                Field2(newUser, { newUser = it }, "Identifiant")
                Spacer(Modifier.height(6.dp))
                Pwd(newPass, { newPass = it }, "Mot de passe")
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(20.dp).clip(RoundedCornerShape(5.dp)).background(if (newAdmin) colors.accent else colors.panel2).clickable { newAdmin = !newAdmin },
                        contentAlignment = Alignment.Center,
                    ) { if (newAdmin) Text("✓", color = colors.ink, fontSize = 13.sp) }
                    Spacer(Modifier.width(8.dp))
                    Text("Administrateur", color = colors.foreground, fontSize = 13.sp)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = {
                        if (newUser.isNotBlank() && newPass.length >= 6) vm.createUser(newUser.trim(), newPass, newAdmin) { ok, _ -> if (ok) { newUser = ""; newPass = ""; newAdmin = false; reload++ } }
                    }) { Text("Créer", color = colors.accent) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Fermer", color = colors.accent) } },
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

@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
    val colors = LocalAuralis.current
    Column(
        Modifier.fillMaxWidth().padding(bottom = 16.dp)
            .clip(RoundedCornerShape(16.dp)).background(colors.panel).padding(16.dp),
    ) {
        Text(title, color = colors.foreground, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 10.dp))
        content()
    }
}

@Composable
private fun Field(label: String, value: String) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = colors.textMuted, fontSize = 13.sp)
        Text(value, color = colors.foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.padding(start = 16.dp))
    }
}

@Composable
private fun ActionRow(label: String, tone: Color? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 10.dp)) {
        Text(label, color = tone ?: colors.accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}
