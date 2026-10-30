package local.auralis.client.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import local.auralis.client.i18n.LocalStrings
import local.auralis.client.i18n.Strings
import local.auralis.client.i18n.tr
import local.auralis.client.ui.screens.ConnectScreen
import local.auralis.client.ui.screens.LoginScreen
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.AuralisTheme
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

@Composable
fun AppRoot(vm: AppViewModel) {
    val ui by vm.ui.collectAsState()
    AuralisTheme(mode = ui.themeMode) {
        androidx.compose.runtime.CompositionLocalProvider(
            local.auralis.client.ui.theme.LocalApiUrl provides { url -> vm.api.assetUrl(url) },
            // The active locale: every tr(...) read below recomposes live on switch.
            LocalStrings provides Strings(ui.locale),
        ) {
            Box(Modifier.fillMaxSize().background(LocalAuralis.current.background)) {
                when (ui.phase) {
                    Phase.BOOT, Phase.LOADING -> LoadingScreen()
                    Phase.CONNECT -> ConnectScreen(ui.connecting, ui.message, ui.serverBase, vm::connect)
                    Phase.LOGIN -> LoginScreen(
                        ui.serverBase, ui.connecting, ui.message, vm::login, vm::changeServer,
                        loadAccounts = { vm.api.accounts(ui.serverBase) },
                    )
                    Phase.READY -> Shell(vm, ui)
                    Phase.ERROR -> ErrorScreen(ui.message, onRetry = { vm.loadAll() }, onChangeServer = { vm.changeServer() })
                }
            }
        }
    }
}

@Composable
private fun LoadingScreen() {
    val colors = LocalAuralis.current
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        local.auralis.client.ui.components.BrandMark(64)
        Spacer(Modifier.height(Spacing.lg))
        CircularProgressIndicator(color = colors.accent, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(Spacing.lg))
        Text("Auralis", style = AMType.Headline, color = colors.foreground)
    }
}

@Composable
private fun ErrorScreen(message: String?, onRetry: () -> Unit, onChangeServer: () -> Unit) {
    val colors = LocalAuralis.current
    Column(
        Modifier.fillMaxSize().padding(Spacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .clip(AMShapes.hero)
                .background(colors.panel)
                .padding(Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(tr("connect.failed"), style = AMType.Title2, color = colors.foreground)
            Spacer(Modifier.height(Spacing.sm))
            Text(message ?: tr("connect.failedBody"), style = Type.Label, color = colors.textMuted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(Spacing.xl))
            Box(
                Modifier.clip(AMShapes.pill).background(colors.accent).clickable { onRetry() }
                    .padding(horizontal = Spacing.xl, vertical = Spacing.md),
            ) {
                Text(tr("error.retry"), color = colors.ink, style = Type.Body, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(Spacing.lg))
        Text(
            tr("connect.changeServer"), style = Type.Label, color = colors.textMuted, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clip(AMShapes.pill).clickable { onChangeServer() }
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
        )
    }
}
