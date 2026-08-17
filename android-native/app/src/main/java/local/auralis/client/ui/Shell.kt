package local.auralis.client.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeSource
import local.auralis.client.ui.components.LocalHazeState
import local.auralis.client.ui.components.LocalHazeStyle
import local.auralis.client.ui.components.LocalSelection
import local.auralis.client.ui.components.RadioWavesIcon
import local.auralis.client.ui.components.SelectionController
import local.auralis.client.ui.components.amFrosted
import local.auralis.client.ui.player.MiniPlayer
import local.auralis.client.ui.screens.AlbumDetail
import local.auralis.client.ui.screens.ArtistDetail
import local.auralis.client.ui.screens.FavoritesScreen
import local.auralis.client.ui.screens.FoldersScreen
import local.auralis.client.ui.screens.HomeScreen
import local.auralis.client.ui.screens.InsightsScreen
import local.auralis.client.ui.screens.LibraryScreen
import local.auralis.client.ui.screens.NewScreen
import local.auralis.client.ui.screens.PlaylistDetail
import local.auralis.client.ui.screens.RadioScreen
import local.auralis.client.ui.screens.RecentsScreen
import local.auralis.client.ui.screens.SearchScreen
import local.auralis.client.ui.screens.SettingsScreen
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis

// Apple Music's mobile navigation is five tabs: Home (Accueil), New (Nouveau),
// Radio, Library (Bibliothèque) and Search (Recherche). Secondary destinations
// (favourites, recents, folders, insights, settings, details) live under these
// roots; the Library tab owns them.
private val rootViews = setOf(ViewId.HOME, ViewId.NEW, ViewId.RADIO, ViewId.EXPLORE, ViewId.LIBRARY)

private fun tabOf(view: ViewId): Int = when (view) {
    ViewId.HOME -> 0
    ViewId.NEW -> 1
    ViewId.RADIO -> 2
    ViewId.EXPLORE -> 3
    else -> 4 // library + favourites + all secondary/detail destinations
}

private fun titleOf(view: ViewId): String = when (view) {
    ViewId.HOME -> "Accueil"
    ViewId.NEW -> "Nouveau"
    ViewId.RADIO -> "Radio"
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

    // Frosted-glass plumbing: the scrolling content is the blur SOURCE; the
    // floating chrome (mini player + tab bar) renders through it with a tinted
    // material, like Apple Music's translucent bars.
    val hazeState = remember { HazeState() }
    val darkSurface = colors.background.luminance() < 0.5f
    val hazeStyle = HazeStyle(
        backgroundColor = colors.background,
        tint = HazeTint(colors.background.copy(alpha = if (darkSurface) 0.68f else 0.74f)),
        blurRadius = 24.dp,
        fallbackTint = HazeTint(colors.panel.copy(alpha = 0.92f)),
    )

    // Accumulated scroll of the current view (reset on navigation) — drives the
    // large-title → inline-title collapse. Attached to an ANCESTOR of the content
    // so every screen's LazyColumn reports through it (the connection must wrap
    // the scrollables, not sit beside them).
    var scrollAcc by remember(ui.nav.view, ui.nav.id) { mutableFloatStateOf(0f) }
    val connection = remember(ui.nav.view, ui.nav.id) {
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                scrollAcc = (scrollAcc + consumed.y).coerceIn(0f, 600f)
                return Offset.Zero
            }
        }
    }
    // Inline (collapsed) title fades in after ~48dp of downward scroll.
    val titleAlpha by animateFloatAsState(
        targetValue = if (scrollAcc > 90f) 1f else 0f,
        animationSpec = tween(160),
        label = "headerTitle",
    )

    CompositionLocalProvider(
        LocalSelection provides SelectionController(
            active = ui.selectionMode,
            isSelected = { it in ui.selected },
            toggle = { vm.toggleSelected(it) },
            begin = { vm.enterSelection(it) },
        ),
        LocalHazeState provides hazeState,
        LocalHazeStyle provides hazeStyle,
    ) {
    Box(Modifier.fillMaxSize()) {
        // Content occupies the full stage; the mini player + dock float above it
        // so scrolled content passes underneath, Apple Music-style.
        Column(
            Modifier
                .fillMaxSize()
                .hazeSource(hazeState)
                .nestedScroll(connection),
        ) {
            Header(vm, ui, titleAlpha)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                MainContent(vm, ui)
            }
        }

        // Bottom chrome: mini player (when a track is loaded), selection bar, dock.
        Column(Modifier.fillMaxWidth().align(Alignment.BottomCenter)) {
            AnimatedVisibility(
                visible = current != null,
                enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut(),
            ) {
                if (current != null) {
                    Box(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 4.dp)) {
                        MiniPlayer(current, playback, position, vm) { fullscreen.value = true }
                    }
                }
            }
            // Multi-select action bar (above the dock) → "Mon mix".
            if (ui.selectionMode) SelectionBar(ui, vm)
            Dock(ui.nav.view) { target -> vm.navigate(target) }
        }

        // Fullscreen now-playing overlay — slides up from the bottom edge like
        // Apple Music, rendered in a forced-dark palette (the AM now-playing stage
        // is always dark because it is dominated by the cover art).
        AnimatedVisibility(
            visible = fullscreen.value && current != null,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(tween(220)),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(tween(200)),
        ) {
            if (current != null) {
                CompositionLocalProvider(
                    local.auralis.client.ui.theme.LocalAuralis provides local.auralis.client.ui.theme.auralisDarkColors(),
                ) {
                    Box(Modifier.fillMaxSize()) {
                        local.auralis.client.ui.player.FullscreenPlayer(current, playback, position, ui, vm) {
                            fullscreen.value = false
                        }
                    }
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
                    Text(msg, color = colors.foreground, fontSize = 13.sp, style = AMType.Footnote)
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
            color = colors.foreground, style = AMType.Footnote,
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
            Text("Mon mix", color = colors.ink, style = AMType.Footnote)
        }
    }
}

/**
 * Apple Music navigation bar. On a tab root the bar stays minimal (profile avatar
 * on the right); the tab's large title lives at the top of the content and the
 * inline title only fades in once the content has scrolled past it — the classic
 * iOS large-title collapse, implemented with a nested-scroll accumulator so every
 * screen gets it for free.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun Header(vm: AppViewModel, ui: UiState, titleAlpha: Float) {
    val colors = LocalAuralis.current
    val isRoot = ui.nav.view in rootViews

    Row(
        Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!isRoot) {
            Icon(Icons.Filled.ArrowBack, "Retour", tint = colors.accent,
                modifier = Modifier.size(26.dp).clickable { vm.back() })
            Spacer(Modifier.width(8.dp))
            Text(
                titleOf(ui.nav.view),
                color = colors.foreground,
                style = AMType.Headline,
            )
            Spacer(Modifier.weight(1f))
        } else {
            // Collapsed large title, centered — visible only once scrolled.
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(
                    titleOf(ui.nav.view),
                    color = colors.foreground,
                    style = AMType.Headline,
                    modifier = Modifier.graphicsLayer { alpha = titleAlpha },
                )
            }
        }
        // Profile avatar (Apple Music's tab-root affordance) → Réglages.
        // Long-press opens the quick-jump command palette.
        Box(
            Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(colors.panel2)
                .combinedClickable(
                    onClick = { vm.navigate(ViewId.SETTINGS) },
                    onLongClick = { vm.openCommand() },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                (ui.username ?: "A").trim().take(1).uppercase(),
                color = colors.foreground,
                style = AMType.Headline,
            )
        }
    }
}

@Composable
private fun MainContent(vm: AppViewModel, ui: UiState) {
    // Apple Music motion: pushing a detail screen slides it in from the right
    // (the previous one parallax-slides out); switching tabs crossfades in place.
    AnimatedContent(
        targetState = ui.nav,
        transitionSpec = {
            if (targetState.view !in rootViewIds && initialState.view != targetState.view) {
                (slideInHorizontally(tween(260)) { it / 3 } + fadeIn(tween(260))) togetherWith
                    (slideOutHorizontally(tween(260)) { -it / 4 } + fadeOut(tween(260)))
            } else {
                fadeIn(tween(140)) togetherWith fadeOut(tween(140))
            }
        },
        label = "nav",
    ) { nav ->
        when (nav.view) {
            ViewId.HOME -> HomeScreen(vm, ui)
            ViewId.NEW -> NewScreen(vm, ui)
            ViewId.RADIO -> RadioScreen(vm, ui)
            ViewId.EXPLORE -> SearchScreen(vm, ui)
            ViewId.LIBRARY -> LibraryScreen(vm, ui)
            ViewId.FAVORITES -> FavoritesScreen(vm, ui)
            ViewId.RECENTS -> RecentsScreen(vm, ui)
            ViewId.FOLDERS -> FoldersScreen(vm, ui)
            ViewId.INSIGHTS -> InsightsScreen(vm, ui)
            ViewId.SETTINGS -> SettingsScreen(vm, ui)
            ViewId.ALBUM -> AlbumDetail(vm, ui, nav.id ?: "")
            ViewId.ARTIST -> ArtistDetail(vm, ui, nav.id ?: "")
            ViewId.PLAYLIST -> PlaylistDetail(vm, ui, nav.id ?: "")
        }
    }
}

/** Apple Music tab bar: five roots, active tinted with the red accent, floating
 *  over the scrolling content with a hairline top edge. */
@Composable
private fun Dock(activeView: ViewId, onTab: (ViewId) -> Unit) {
    val colors = LocalAuralis.current
    val active = tabOf(activeView)
    data class Tab(val view: ViewId, val label: String, val icon: ImageVector)
    val tabs = listOf(
        Tab(ViewId.HOME, "Accueil", Icons.Filled.Home),
        Tab(ViewId.NEW, "Nouveau", Icons.Filled.Star),
        Tab(ViewId.RADIO, "Radio", RadioWavesIcon),
        Tab(ViewId.LIBRARY, "Bibliothèque", Icons.Filled.LibraryMusic),
        Tab(ViewId.EXPLORE, "Recherche", Icons.Filled.Search),
    )
    // Frosted translucent bar — content scrolled underneath blurs through.
    Column(Modifier.fillMaxWidth().amFrosted(null, colors.panel)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.line))
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            tabs.forEachIndexed { i, t ->
                val on = i == active
                Column(
                    Modifier.clickable { onTab(t.view) }.padding(horizontal = 10.dp, vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(t.icon, t.label, tint = if (on) colors.accent else colors.textMuted, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.size(3.dp))
                    Text(
                        t.label,
                        color = if (on) colors.accent else colors.textMuted,
                        style = AMType.Caption2,
                    )
                }
            }
        }
    }
}
