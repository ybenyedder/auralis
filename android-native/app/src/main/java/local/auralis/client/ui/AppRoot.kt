package local.auralis.client.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.ui.screens.ConnectScreen
import local.auralis.client.ui.screens.LoginScreen
import local.auralis.client.ui.theme.AuralisTheme
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.ThemeBackdrop

@Composable
fun AppRoot(vm: AppViewModel) {
    val ui by vm.ui.collectAsState()
    AuralisTheme(themeId = ui.theme) {
        Box(Modifier.fillMaxSize().background(LocalAuralis.current.background)) {
            ThemeBackdrop()
            when (ui.phase) {
                Phase.BOOT, Phase.LOADING -> LoadingScreen()
                Phase.CONNECT -> ConnectScreen(ui.connecting, ui.message, ui.serverBase, vm::connect)
                Phase.LOGIN -> LoginScreen(ui.serverBase, ui.connecting, ui.message, vm::login, vm::changeServer)
                Phase.READY -> Shell(vm, ui)
                Phase.ERROR -> ErrorScreen(ui.message, onRetry = { vm.loadAll() }, onChangeServer = { vm.changeServer() })
            }
        }
    }
}

@Composable
private fun LoadingScreen() {
    val colors = LocalAuralis.current
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = colors.accent, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
        Spacer(Modifier.height(16.dp))
        Text("Auralis", color = colors.foreground, fontSize = 18.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun ErrorScreen(message: String?, onRetry: () -> Unit, onChangeServer: () -> Unit) {
    val colors = LocalAuralis.current
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Connexion impossible", color = colors.foreground, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(message ?: "Le serveur est injoignable.", color = colors.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        Box(Modifier.clip(CircleShape).background(colors.accent).clickable { onRetry() }.padding(horizontal = 22.dp, vertical = 12.dp)) {
            Text("Réessayer", color = colors.ink, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(14.dp))
        Text("Changer de serveur", color = colors.textMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clickable { onChangeServer() })
    }
}
