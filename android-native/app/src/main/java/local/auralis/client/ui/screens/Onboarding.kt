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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import local.auralis.client.i18n.tr
import local.auralis.client.ui.components.AuralisGlyph
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
    var showPassword by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label, color = colors.textMuted, style = Type.Caption) },
        singleLine = true,
        shape = AMShapes.tile,
        visualTransformation = if (password && !showPassword) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = if (password) {
            {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        imageVector = if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = null,
                        tint = colors.textMuted,
                    )
                }
            }
        } else null,
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
    var url by remember(initial) { mutableStateOf(initial.ifBlank { "https://auralis.webtvmedia.net" }) }
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

/** Liner-style authentication card supporting standard sign-in and account
 *  creation (mirrors web's AuthGate LoginScreen). */
@Composable
fun LoginScreen(
    server: String,
    connecting: Boolean,
    message: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String) -> Unit,
    onChangeServer: () -> Unit,
) {
    val colors = LocalAuralis.current
    var mode by remember(server) { mutableStateOf("login") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    val errUsernameInvalid = tr("auth.usernameInvalid")
    val errPasswordTooShort = tr("auth.passwordTooShort")
    val errPasswordMismatch = tr("auth.passwordMismatch")

    val submit = {
        val clean = username.trim()
        when {
            clean.length < 2 -> localError = errUsernameInvalid
            mode == "register" && password.length < 6 -> localError = errPasswordTooShort
            mode == "register" && password != confirmPassword -> localError = errPasswordMismatch
            mode == "register" -> {
                localError = null
                onRegister(clean, password)
            }
            else -> {
                localError = null
                onLogin(clean, password)
            }
        }
    }

    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().imePadding()) {
        Column(
            Modifier.fillMaxSize().padding(Spacing.xl),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                Modifier.fillMaxWidth().tonalCard(AMShapes.hero, colors.panel).padding(Spacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                SplashMark()
                Spacer(Modifier.height(Spacing.md))
                Text(tr("auth.welcomeTitle"), style = AMType.Title2, color = colors.foreground)
                Spacer(Modifier.height(Spacing.xs))
                Text(
                    if (mode == "register") tr("auth.registerSubtitle") else tr("auth.welcomeSubtitle"),
                    style = Type.Label,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(Spacing.lg))

                // Liner segmented pill switcher
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(AMShapes.pill)
                        .background(colors.panel2)
                        .padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    listOf("login" to tr("auth.signIn"), "register" to tr("auth.signUp")).forEach { (id, label) ->
                        val active = mode == id
                        Box(
                            Modifier
                                .weight(1f)
                                .clip(AMShapes.pill)
                                .background(if (active) colors.accent else androidx.compose.ui.graphics.Color.Transparent)
                                .clickable {
                                    mode = id
                                    localError = null
                                    confirmPassword = ""
                                }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                label,
                                color = if (active) colors.ink else colors.textMuted,
                                style = Type.Caption,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(Spacing.lg))
                field(
                    value = username,
                    onChange = { username = it; localError = null },
                    label = tr("auth.username"),
                    keyboard = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                )
                Spacer(Modifier.height(Spacing.sm))
                field(
                    value = password,
                    onChange = { password = it; localError = null },
                    label = tr("auth.enterPassword"),
                    password = true,
                    keyboard = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = if (mode == "register") ImeAction.Next else ImeAction.Go,
                    ),
                    onImeDone = { if (mode == "login") submit() },
                )
                if (mode == "register") {
                    Spacer(Modifier.height(Spacing.sm))
                    field(
                        value = confirmPassword,
                        onChange = { confirmPassword = it; localError = null },
                        label = tr("auth.confirmPassword"),
                        password = true,
                        keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                        onImeDone = submit,
                    )
                }

                val displayError = localError ?: message
                if (!displayError.isNullOrBlank()) {
                    Spacer(Modifier.height(Spacing.md))
                    Text(displayError, color = colors.destructive, style = Type.Caption, textAlign = TextAlign.Center)
                }

                Spacer(Modifier.height(Spacing.lg))
                PrimaryButton(
                    label = if (mode == "register") tr("auth.signUp") else tr("auth.signIn"),
                    loading = connecting,
                    onClick = submit,
                )

                Spacer(Modifier.height(Spacing.md))
                Text(
                    if (mode == "login") "${tr("auth.noAccountYet")} ${tr("auth.signUp")}"
                    else "${tr("auth.alreadyHaveAccount")} ${tr("auth.signIn")}",
                    style = Type.Caption,
                    color = colors.accent,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .clip(AMShapes.pill)
                        .clickable {
                            mode = if (mode == "login") "register" else "login"
                            localError = null
                            confirmPassword = ""
                        }
                        .padding(horizontal = Spacing.md, vertical = Spacing.xs),
                )
            }

            Spacer(Modifier.height(Spacing.lg))
            Text(
                tr("connect.changeServer"),
                style = Type.Label,
                color = colors.textFaint,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(AMShapes.pill)
                    .clickable { onChangeServer() }
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            )
        }
    }
}
