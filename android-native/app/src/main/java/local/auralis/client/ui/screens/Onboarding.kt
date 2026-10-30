package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.Brush
import local.auralis.client.i18n.tr
import local.auralis.client.ui.components.AuralisGlyph
import local.auralis.client.ui.components.paletteFor
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type
import local.auralis.client.ui.theme.tonalCard

@Composable
private fun SplashMark() {
    val colors = LocalAuralis.current
    Box(
        Modifier.size(60.dp).clip(AMShapes.card).background(colors.accent),
        contentAlignment = Alignment.Center,
    ) {
        AuralisGlyph(Modifier.size(32.dp), tint = colors.ink)
    }
}

@Composable
private fun field(value: String, onChange: (String) -> Unit, label: String, keyboard: KeyboardOptions,
                  password: Boolean = false, onImeDone: () -> Unit = {}) {
    val colors = LocalAuralis.current
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label, color = colors.textMuted, style = Type.Caption) },
        singleLine = true,
        shape = RoundedCornerShape(Radius.sm),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = keyboard,
        keyboardActions = KeyboardActions(onDone = { onImeDone() }, onGo = { onImeDone() }),
        modifier = Modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = colors.accent,
            unfocusedBorderColor = colors.lineStrong,
            focusedTextColor = colors.foreground,
            unfocusedTextColor = colors.foreground,
            cursorColor = colors.accent,
        ),
    )
}

@Composable
private fun PrimaryButton(label: String, loading: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        Modifier
            .fillMaxWidth()
            .clip(AMShapes.pill)
            .background(colors.accent.copy(alpha = if (loading) 0.7f else 1f))
            .clickable(enabled = !loading) { onClick() }
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = colors.ink, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            Text(label, color = colors.ink, style = Type.Body, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ConnectScreen(connecting: Boolean, message: String?, initial: String, onConnect: (String) -> Unit) {
    val colors = LocalAuralis.current
    var url by remember { mutableStateOf(initial) }
    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().imePadding()) {
        Column(
            Modifier.fillMaxSize().padding(Spacing.xl),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Centered form card — the same tonal surface as the rest of the app.
            Column(
                Modifier.fillMaxWidth().tonalCard(AMShapes.hero, colors.panel).padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                SplashMark()
                Spacer(Modifier.height(Spacing.lg))
                Text(tr("connect.title"), style = AMType.Title2, color = colors.foreground)
                Spacer(Modifier.height(Spacing.sm))
                Text(
                    tr("connect.subtitle"),
                    style = Type.Label, color = colors.textMuted, textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(Spacing.xl))
                field(
                    value = url, onChange = { url = it }, label = tr("connect.serverField"),
                    keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                    onImeDone = { onConnect(url) },
                )
                Spacer(Modifier.height(Spacing.lg))
                PrimaryButton(tr("auth.signIn"), connecting) { onConnect(url) }
                if (message != null) {
                    Spacer(Modifier.height(Spacing.md))
                    Text(message, color = colors.destructive, style = Type.Caption, textAlign = TextAlign.Center)
                }
            }
            Spacer(Modifier.height(Spacing.lg))
            Text(
                tr("connect.hint"),
                style = Type.Caption, color = colors.textFaint, textAlign = TextAlign.Center,
            )
        }
    }
}

/** Netflix-style "Qui écoute ?" flow: pick a profile, then enter its password.
 * Mirrors web's AuthGate LoginScreen (src/components/auralis/AuthGate.tsx). */
@Composable
fun LoginScreen(
    server: String,
    connecting: Boolean,
    message: String?,
    onLogin: (String, String) -> Unit,
    onChangeServer: () -> Unit,
    loadAccounts: suspend () -> List<String> = { listOf("admin") },
) {
    val colors = LocalAuralis.current
    var accounts by remember { mutableStateOf<List<String>?>(null) }
    var selected by remember { mutableStateOf<String?>(null) }
    var password by remember { mutableStateOf("") }
    LaunchedEffect(server) { accounts = runCatching { loadAccounts() }.getOrDefault(listOf("admin")) }

    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(Spacing.lg), verticalAlignment = Alignment.CenterVertically) {
            local.auralis.client.ui.components.BrandMark(28)
            Spacer(Modifier.width(Spacing.sm))
            Text("Auralis", style = AMType.Headline, color = colors.foreground)
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = Spacing.xl),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (selected == null) {
                Text(tr("auth.whoIsListening"), style = AMType.Title1, color = colors.foreground, textAlign = TextAlign.Center)
                Spacer(Modifier.height(Spacing.xl))
                val profiles = accounts
                if (profiles == null) {
                    Box(Modifier.size(96.dp).clip(AMShapes.card).background(colors.panel2))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(Spacing.xl)) {
                        profiles.chunked(3).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.xl)) {
                                row.forEach { name -> ProfileTile(name) { selected = name; password = "" } }
                            }
                        }
                    }
                }
            } else {
                ProfileAvatar(selected!!, 88)
                Spacer(Modifier.height(Spacing.md))
                Text(selected!!, style = AMType.Title2, color = colors.foreground)
                Spacer(Modifier.height(Spacing.xs))
                Text(tr("auth.enterPassword"), style = Type.Label, color = colors.textMuted)
                Spacer(Modifier.height(Spacing.xl))
                field(
                    value = password, onChange = { password = it }, label = tr("settings.password"), password = true,
                    keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    onImeDone = { onLogin(selected!!, password) },
                )
                Spacer(Modifier.height(Spacing.lg))
                PrimaryButton(tr("auth.signIn"), connecting) { onLogin(selected!!, password) }
                if (message != null) {
                    Spacer(Modifier.height(Spacing.md))
                    Text(message, color = colors.destructive, style = Type.Caption, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(Spacing.lg))
                Text(
                    "← " + tr("auth.switchProfile"),
                    style = Type.Label, color = colors.textMuted, fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.6.sp,
                    modifier = Modifier.clip(AMShapes.pill).clickable { selected = null; password = "" }
                        .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
                )
            }
            Spacer(Modifier.height(Spacing.xl))
            Text(
                tr("connect.changeServer"),
                style = Type.Label, color = colors.textFaint, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(AMShapes.pill).clickable { onChangeServer() }
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            )
        }
    }
}

@Composable
private fun ProfileTile(name: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onClick() }) {
        ProfileAvatar(name, 96)
        Spacer(Modifier.height(Spacing.sm))
        Text(name, style = Type.Body, color = colors.textMuted)
    }
}

@Composable
private fun ProfileAvatar(name: String, size: Int) {
    val (c0, c1, _) = paletteFor(name)
    Box(
        Modifier.size(size.dp).clip(AMShapes.card).background(Brush.linearGradient(listOf(c0, c1))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            (name.ifBlank { "?" }).take(1).uppercase(),
            color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.95f),
            fontSize = (size * 0.42f).sp, fontWeight = FontWeight.Bold,
        )
    }
}
