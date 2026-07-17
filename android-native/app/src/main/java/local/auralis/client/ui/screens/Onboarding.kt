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
import local.auralis.client.ui.components.AuralisGlyph
import local.auralis.client.ui.components.paletteFor
import local.auralis.client.ui.theme.LocalAuralis

@Composable
private fun SplashMark() {
    val colors = LocalAuralis.current
    Box(
        Modifier.size(60.dp).clip(RoundedCornerShape(16.dp)).background(colors.paper),
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
        label = { Text(label, color = colors.textMuted) },
        singleLine = true,
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
            .clip(CircleShape)
            .background(colors.accent)
            .clickable(enabled = !loading) { onClick() }
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = colors.ink, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            Text(label, color = colors.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
    }
}

@Composable
fun ConnectScreen(connecting: Boolean, message: String?, initial: String, onConnect: (String) -> Unit) {
    val colors = LocalAuralis.current
    var url by remember { mutableStateOf(initial) }
    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().imePadding()) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SplashMark()
            Spacer(Modifier.height(20.dp))
            Text("Connexion à Auralis", fontSize = 22.sp, fontWeight = FontWeight.Black, color = colors.foreground)
            Spacer(Modifier.height(8.dp))
            Text(
                "Saisis l'adresse de ton serveur Auralis auto-hébergé.",
                fontSize = 13.sp, color = colors.textMuted, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))
            field(
                value = url, onChange = { url = it }, label = "Adresse du serveur",
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                onImeDone = { onConnect(url) },
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Se connecter", connecting) { onConnect(url) }
            if (message != null) {
                Spacer(Modifier.height(14.dp))
                Text(message, color = colors.destructive, fontSize = 12.5.sp, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(18.dp))
            Text(
                "Lance Auralis sur ton ordinateur, puis entre son adresse LAN ici.",
                fontSize = 12.sp, color = colors.textFaint, textAlign = TextAlign.Center,
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
        Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            local.auralis.client.ui.components.BrandMark(28)
            Spacer(Modifier.width(8.dp))
            Text("Auralis", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = colors.foreground)
        }
        Column(
            Modifier.fillMaxSize().padding(horizontal = 28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (selected == null) {
                Text("Qui écoute ?", fontSize = 26.sp, fontWeight = FontWeight.Medium, color = colors.foreground, textAlign = TextAlign.Center)
                Spacer(Modifier.height(28.dp))
                val profiles = accounts
                if (profiles == null) {
                    Box(Modifier.size(96.dp).clip(RoundedCornerShape(10.dp)).background(colors.panel2))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        profiles.chunked(3).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                                row.forEach { name -> ProfileTile(name) { selected = name; password = "" } }
                            }
                        }
                    }
                }
            } else {
                ProfileAvatar(selected!!, 88)
                Spacer(Modifier.height(14.dp))
                Text(selected!!, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = colors.foreground)
                Spacer(Modifier.height(4.dp))
                Text("Saisis ton mot de passe", fontSize = 13.sp, color = colors.textMuted)
                Spacer(Modifier.height(22.dp))
                field(
                    value = password, onChange = { password = it }, label = "Mot de passe", password = true,
                    keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                    onImeDone = { onLogin(selected!!, password) },
                )
                Spacer(Modifier.height(16.dp))
                PrimaryButton("Se connecter", connecting) { onLogin(selected!!, password) }
                if (message != null) {
                    Spacer(Modifier.height(14.dp))
                    Text(message, color = colors.destructive, fontSize = 12.5.sp, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    "← Changer de profil",
                    fontSize = 12.sp, color = colors.textMuted, fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.6.sp,
                    modifier = Modifier.clickable { selected = null; password = "" },
                )
            }
            Spacer(Modifier.height(24.dp))
            Text(
                "Changer de serveur",
                fontSize = 12.sp, color = colors.textFaint, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { onChangeServer() },
            )
        }
    }
}

@Composable
private fun ProfileTile(name: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onClick() }) {
        ProfileAvatar(name, 96)
        Spacer(Modifier.height(10.dp))
        Text(name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = colors.textMuted)
    }
}

@Composable
private fun ProfileAvatar(name: String, size: Int) {
    val (c0, c1, _) = paletteFor(name)
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(listOf(c0, c1))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            (name.ifBlank { "?" }).take(1).uppercase(),
            color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.95f),
            fontSize = (size * 0.42f).sp, fontWeight = FontWeight.Black,
        )
    }
}
