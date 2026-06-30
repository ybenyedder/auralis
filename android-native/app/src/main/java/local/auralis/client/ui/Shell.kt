package local.auralis.client.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.LocalSelection
import local.auralis.client.ui.components.SelectionController
import local.auralis.client.ui.player.MiniPlayer
import local.auralis.client.ui.screens.AlbumDetail
import local.auralis.client.ui.screens.ArtistDetail
import local.auralis.client.ui.screens.FavoritesScreen
import local.auralis.client.ui.screens.FoldersScreen
import local.auralis.client.ui.screens.HomeScreen
import local.auralis.client.ui.screens.InsightsScreen
import local.auralis.client.ui.screens.LibraryScreen
import local.auralis.client.ui.screens.PlaylistDetail
import local.auralis.client.ui.screens.RecentsScreen
import local.auralis.client.ui.screens.SearchScreen
import local.auralis.client.ui.screens.SettingsScreen
import local.auralis.client.ui.theme.LocalAuralis

// Spotify's mobile nav is 3 tabs (Home / Search / Your Library). Favourites lives
// inside the library now (reached via the "Titres aimés" tile), so it's a secondary
// destination, not a root tab.
private val rootViews = setOf(ViewId.HOME, ViewId.EXPLORE, ViewId.LIBRARY)

private fun tabOf(view: ViewId): Int = when (view) {
    ViewId.HOME -> 0
    ViewId.EXPLORE -> 1
    else -> 2 // library + favourites + all secondary/detail destinations
}

private fun titleOf(view: ViewId): String = when (view) {
    ViewId.HOME -> "Accueil"
    ViewId.EXPLORE -> "Recherche"
    ViewId.LIBRARY -> "Bibliothèque"
    ViewId.FAVORITES -> "Favoris"
    ViewId.RECENTS -> "Récents"
    ViewId.FOLDERS -> "Dossiers"
    ViewId.INSIGHTS -> "Analyse"
    ViewId.SETTINGS -> "Réglages"
    ViewId.ALBUM -> "Album"
    ViewId.ARTIST -> "Artiste"
    ViewId.PLAYLIST -> "Playlist"
}

@Composable
fun Shell(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val playback by vm.playback.collectAsState()
    val position by vm.position.collectAsState()
    val current = ui.trackByHash[playback.currentId]
    val fullscreen = remember { mutableStateOf(false) }

    CompositionLocalProvider(
        LocalSelection provides SelectionController(
            active = ui.selectionMode,
            isSelected = { it in ui.selected },
            toggle = { vm.toggleSelected(it) },
            begin = { vm.enterSelection(it) },
        ),
    ) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // Header
            Header(vm, ui)
            // Content
            Box(Modifier.weight(1f).fillMaxWidth()) {
                MainContent(vm, ui)
            }
            // Mini player + dock
            if (current != null) {
                Box(Modifier.fillMaxWidth().padding(horizontal = 10.dp)) {
                    MiniPlayer(current, playback, position, vm) { fullscreen.value = true }
                }
            }
            // Multi-select action bar (above the dock) → "Mix IA".
            if (ui.selectionMode) SelectionBar(ui, vm)
            Dock(ui.nav.view) { target -> vm.navigate(target) }
        }

        // Fullscreen overlay
        if (fullscreen.value && current != null) {
            Box(Modifier.fillMaxSize()) {
                local.auralis.client.ui.player.FullscreenPlayer(current, playback, position, ui, vm) {
                    fullscreen.value = false
                }
            }
        }

        // Donation reminder (first launch, then every 3rd launch).
        if (ui.donateDue) {
            local.auralis.client.ui.components.DonateDialog(onDismiss = { vm.dismissDonate() })
        }

        // Self-update prompt (a newer GitHub release exists).
        ui.update?.let { info ->
            local.auralis.client.ui.components.UpdateDialog(
                info = info,
                downloading = ui.updateDownloading,
                progress = ui.updateProgress,
                onInstall = { vm.installUpdate() },
                onDismiss = { vm.dismissUpdate() },
            )
        }

        // Track context menu (play next / queue / add-to-playlist / go-to album·artist).
        ui.contextTrack?.let { t ->
            local.auralis.client.ui.components.TrackMenu(t, ui, vm, onDismiss = { vm.closeTrackMenu() })
        }

        // Transient toast.
        ui.toast?.let { msg ->
            Box(Modifier.fillMaxSize().padding(bottom = 150.dp), contentAlignment = Alignment.BottomCenter) {
                Box(
                    Modifier.padding(horizontal = 24.dp)
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(999.dp))
                        .background(colors.panel3)
                        .padding(horizontal = 18.dp, vertical = 11.dp),
                ) {
                    Text(msg, color = colors.foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        // Quick-jump command palette.
        if (ui.commandOpen) {
            local.auralis.client.ui.components.CommandPalette(vm, ui) { vm.closeCommand() }
        }

        // Audio visualizer.
        if (ui.visualizerOpen) {
            local.auralis.client.ui.components.VisualizerOverlay(current?.title, playback.isPlaying) { vm.toggleVisualizer() }
        }
    }
    }
}

@Composable
private fun SelectionBar(ui: UiState, vm: AppViewModel) {
    val colors = LocalAuralis.current
    val count = ui.selected.size
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(colors.panel3)
            .padding(start = 10.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Close, "Quitter la sélection", tint = colors.textMuted,
            modifier = Modifier.size(22.dp).clickable { vm.exitSelection() },
        )
        Spacer(Modifier.width(12.dp))
        Text(
            if (count > 0) "$count sélectionné${if (count > 1) "s" else ""}" else "Choisissez des titres",
            color = colors.foreground, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        if (count > 0) {
            Icon(
                Icons.Filled.PlayArrow, "Lire la sélection", tint = colors.foreground,
                modifier = Modifier.size(24.dp).clickable { vm.playSelection() },
            )
            Spacer(Modifier.width(12.dp))
        }
        Row(
            Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(if (count > 0) colors.accent else colors.panel2)
                .clickable(enabled = count > 0 && !ui.generating) { vm.generateAiPlaylist() }
                .padding(horizontal = 16.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, null, tint = colors.ink, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("Mix IA", color = colors.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

@Composable
private fun Header(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val isRoot = ui.nav.view in rootViews
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!isRoot) {
            Icon(Icons.Filled.ArrowBack, "Retour", tint = colors.foreground,
                modifier = Modifier.size(24.dp).clickable { vm.back() })
            Spacer(Modifier.width(12.dp))
            Text(titleOf(ui.nav.view), color = colors.foreground, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        } else {
            local.auralis.client.ui.components.BrandMark(26)
            Spacer(Modifier.width(8.dp))
            Text("Auralis", color = colors.foreground, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
        }
        if (ui.stats.streak > 0) {
            Row(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(colors.accent.copy(alpha = 0.15f))
                    .clickable { vm.navigate(ViewId.INSIGHTS) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("🔥", fontSize = 12.sp)
                Spacer(Modifier.width(4.dp))
                Text("${ui.stats.streak}", color = colors.accentSoft, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.width(8.dp))
        }
        if (ui.nav.view != ViewId.EXPLORE) {
            Icon(Icons.Filled.Search, "Aller à", tint = colors.textMuted,
                modifier = Modifier.size(22.dp).clickable { vm.openCommand() })
            Spacer(Modifier.width(16.dp))
        }
        Icon(Icons.Filled.Settings, "Réglages", tint = colors.textMuted,
            modifier = Modifier.size(22.dp).clickable { vm.navigate(ViewId.SETTINGS) })
    }
}

@Composable
private fun MainContent(vm: AppViewModel, ui: UiState) {
    when (ui.nav.view) {
        ViewId.HOME -> HomeScreen(vm, ui)
        ViewId.EXPLORE -> SearchScreen(vm, ui)
        ViewId.LIBRARY -> LibraryScreen(vm, ui)
        ViewId.FAVORITES -> FavoritesScreen(vm, ui)
        ViewId.RECENTS -> RecentsScreen(vm, ui)
        ViewId.FOLDERS -> FoldersScreen(vm, ui)
        ViewId.INSIGHTS -> InsightsScreen(vm, ui)
        ViewId.SETTINGS -> SettingsScreen(vm, ui)
        ViewId.ALBUM -> AlbumDetail(vm, ui, ui.nav.id ?: "")
        ViewId.ARTIST -> ArtistDetail(vm, ui, ui.nav.id ?: "")
        ViewId.PLAYLIST -> PlaylistDetail(vm, ui, ui.nav.id ?: "")
    }
}

@Composable
private fun Dock(activeView: ViewId, onTab: (ViewId) -> Unit) {
    val colors = LocalAuralis.current
    val active = tabOf(activeView)
    data class Tab(val view: ViewId, val label: String, val icon: ImageVector)
    val tabs = listOf(
        Tab(ViewId.HOME, "Accueil", Icons.Filled.Home),
        Tab(ViewId.EXPLORE, "Recherche", Icons.Filled.Search),
        Tab(ViewId.LIBRARY, "Bibliothèque", Icons.Filled.LibraryMusic),
    )
    Row(
        Modifier.fillMaxWidth().background(colors.panel).navigationBarsPadding().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        tabs.forEachIndexed { i, t ->
            val on = i == active
            Column(
                Modifier.clickable { onTab(t.view) }.padding(horizontal = 10.dp, vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(t.icon, t.label, tint = if (on) colors.foreground else colors.textMuted, modifier = Modifier.size(24.dp))
                Spacer(Modifier.size(3.dp))
                Text(t.label, color = if (on) colors.foreground else colors.textMuted, fontSize = 10.sp,
                    fontWeight = FontWeight.Medium)
            }
        }
    }
}

