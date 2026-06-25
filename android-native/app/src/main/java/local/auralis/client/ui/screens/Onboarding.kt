package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import local.auralis.client.ui.theme.LocalAuralis

@Composable
private fun BrandMark() {
    val colors = LocalAuralis.current
    Box(
        Modifier.size(60.dp).clip(RoundedCornerShape(16.dp)).background(colors.paper),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.PlayArrow, null, tint = colors.ink, modifier = Modifier.size(32.dp))
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
            BrandMark()
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

@Composable
fun LoginScreen(
    server: String,
    connecting: Boolean,
    message: String?,
    onLogin: (String, String) -> Unit,
    onChangeServer: () -> Unit,
) {
    val colors = LocalAuralis.current
    var username by remember { mutableStateOf("admin") }
    var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().imePadding()) {
        Column(
            Modifier.fillMaxSize().padding(28.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            BrandMark()
            Spacer(Modifier.height(20.dp))
            Text("Identifie-toi", fontSize = 22.sp, fontWeight = FontWeight.Black, color = colors.foreground)
            Spacer(Modifier.height(8.dp))
            Text(server, fontSize = 12.5.sp, color = colors.textMuted)
            Spacer(Modifier.height(24.dp))
            field(
                value = username, onChange = { username = it }, label = "Identifiant",
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            field(
                value = password, onChange = { password = it }, label = "Mot de passe", password = true,
                keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
                onImeDone = { onLogin(username, password) },
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Se connecter", connecting) { onLogin(username, password) }
            if (message != null) {
                Spacer(Modifier.height(14.dp))
                Text(message, color = colors.destructive, fontSize = 12.5.sp, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(18.dp))
            Text(
                "Changer de serveur",
                fontSize = 13.sp, color = colors.textMuted, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable { onChangeServer() },
            )
        }
    }
}
