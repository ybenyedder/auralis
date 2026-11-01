package local.auralis.client.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
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
import androidx.compose.runtime.produceState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import local.auralis.client.i18n.tr
import local.auralis.client.ui.components.IconAction
import local.auralis.client.ui.components.LocalHazeState
import local.auralis.client.ui.components.LocalHazeStyle
import local.auralis.client.ui.components.LocalPlayingToggle
import local.auralis.client.ui.components.LocalSelection
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
import local.auralis.client.ui.screens.RecentsScreen
import local.auralis.client.ui.screens.SearchScreen
import local.auralis.client.ui.screens.SettingsScreen
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.AmbientBackdrop
import local.auralis.client.ui.theme.LocalAmbient
import local.auralis.client.ui.theme.LocalApiUrl
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.extractAmbient

// Apple Music's mobile navigation is four tabs: Home (Accueil), New (Nouveau),
// Search (Recherche) and Library (Bibliothèque). Secondary destinations
// (favourites, recents, folders, insights, settings, details) live under these
// roots; the Library tab owns them. The set is defined ONCE, in AppViewModel
// (rootViewIds) — the old private copy here silently drifted from it.

internal fun tabOf(view: ViewId): Int = when (view) {
    ViewId.HOME -> 0
    ViewId.NEW -> 1
    ViewId.EXPLORE -> 2
    else -> 3 // Bibliothèque + favoris, récents, dossiers, réglages, détails…
}

private fun titleKeyOf(view: ViewId): String = when (view) {
    ViewId.HOME -> "nav.home"
    ViewId.NEW -> "nav.new"
    ViewId.EXPLORE -> "search.title"
    ViewId.LIBRARY -> "nav.library"
    ViewId.FAVORITES -> "favorites.title"
    ViewId.RECENTS -> "recents.title"
    ViewId.FOLDERS -> "folders.title"
    ViewId.INSIGHTS -> "insights.eyebrow"
    ViewId.SETTINGS -> "nav.settings"
    ViewId.ALBUM -> "mobile.album"
    ViewId.ARTIST -> "mobile.artist"
    ViewId.PLAYLIST -> "mobile.playlist"
}

@Composable
fun Shell(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val playback by vm.playback.collectAsState()
    val position by vm.position.collectAsState()
    val current = ui.trackByHash[playback.currentId]
    val fullscreen = remember { mutableStateOf(false) }

    // Frosted-glass plumbing ("glass, not boxes", Liner): the scrolling content
    // is the blur SOURCE; the floating chrome (mini player + tab bar) renders
    // through it with a translucent tinted material so the cover wash and rows
    // blur through — never an opaque grey panel.
    val hazeState = remember { HazeState() }
    val darkSurface = colors.background.luminance() < 0.5f
    val hazeStyle = HazeStyle(
        backgroundColor = colors.background,
        tint = HazeTint(colors.background.copy(alpha = if (darkSurface) 0.55f else 0.72f)),
        blurRadius = 28.dp,
        fallbackTint = HazeTint(colors.panel.copy(alpha = 0.85f)),
    )

    // Ambient stage ("content is the colour"): sample the CURRENT cover for two
    // tones and wash the near-black background with them, so the app's mood
    // follows whatever is playing. Falls back to the accent-neutral before art
    // loads. Kept behind the scrolling content so panels float over it.
    val context = LocalContext.current
    val resolveUrl = LocalApiUrl.current
    val fallbackAmbient = LocalAmbient.current
    val coverUrl = remember(current?.image) { resolveUrl(current?.image) }
    val ambient = produceState(
        initialValue = fallbackAmbient,
        key1 = coverUrl,
    ) {
        value = withContext(Dispatchers.IO) {
            val bmp = if (coverUrl != null) {
                local.auralis.client.ui.components.decodeCoverForAmbient(coverUrl, context.cacheDir)
            } else null
            extractAmbient(bmp) ?: fallbackAmbient
        }
    }.value

    // Accumulated scroll of the current view (reset on navigation) — drives the
    // large-title → inline-title collapse. Attached to an ANCESTOR of the content
    // so every screen's LazyColumn reports through it (the connection must wrap
    // the scrollables, not sit beside them). Compose reports DOWNWARD scroll as
    // NEGATIVE consumed.y, so it must be subtracted: the old `+ consumed.y`
    // clamped at 0 while descending (no inline title) and accumulated while
    // scrolling BACK up — the collapsed title flashed near the top, exactly
    // where the large title is already visible.
    var scrollAcc by remember(ui.nav.view, ui.nav.id) { mutableFloatStateOf(0f) }
    val connection = remember(ui.nav.view, ui.nav.id) {
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                scrollAcc = (scrollAcc - consumed.y).coerceIn(0f, 600f)
                return Offset.Zero
            }
        }
    }
    // Inline (collapsed) title fades in after ~90dp of downward scroll.
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
        // Tapping the CURRENT track anywhere pauses/resumes it in place (never
        // rebuilds the queue from zero) — see LocalPlayingToggle in Common.kt.
        LocalPlayingToggle provides { vm.togglePlay() },
        LocalHazeState provides hazeState,
        LocalHazeStyle provides hazeStyle,
    ) {
    Box(Modifier.fillMaxSize()) {
        // Ambient stage: a soft cover-driven wash over the deep-black canvas,
        // behind everything (Liner's "content is the colour").
        AmbientBackdrop(ambient, Modifier.fillMaxSize())

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
                    Box(Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.xs)) {
                        MiniPlayer(current, playback, position, vm) { fullscreen.value = true }
                    }
                }
            }
            // Multi-select action bar (above the dock) → "Mon mix".
            if (ui.selectionMode) SelectionBar(ui, vm)
            Dock(ui.nav.view) { target -> vm.navigate(target) }
        }

        // Fullscreen now-playing overlay — slides + scales up from the mini player
        // like Apple Music, rendered in a forced-dark palette (the AM now-playing
        // stage is always dark because it is dominated by the cover art).
        AnimatedVisibility(
            visible = fullscreen.value && current != null,
            enter = slideInVertically(Motion.slide, initialOffsetY = { it / 2 }) + fadeIn(Motion.fade) +
                scaleIn(initialScale = 0.92f, animationSpec = Motion.snappy),
            exit = slideOutVertically(Motion.slide, targetOffsetY = { it / 2 }) + fadeOut(tween(200)) +
                scaleOut(targetScale = 0.94f, animationSpec = Motion.quick),
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

        // Album / artist context menus (web ContextMenu AlbumMenu / ArtistMenu).
        ui.contextAlbum?.let { a ->
            local.auralis.client.ui.components.AlbumMenu(a, ui, vm, onDismiss = { vm.closeMenus() })
        }
        ui.contextArtist?.let { a ->
            local.auralis.client.ui.components.ArtistMenu(a, ui, vm, onDismiss = { vm.closeMenus() })
        }

        // Screen-level sheets hoisted above the floating chrome (the "+" add
        // menu, the playlist-row ⋯ menu, the playlist hero ⋯ menu and the
        // create-playlist / import-link dialogs). Rendered here — after the
        // mini player + dock — so nothing interactive hides behind the music.
        local.auralis.client.ui.components.ScreenOverlays(ui, vm)

        // "Chercher en chantant" recording + results sheet (hum-to-search).
        if (ui.humSheetOpen) {
            local.auralis.client.ui.components.HumSheet(vm, ui, onDismiss = { vm.closeHumSheet() })
        }

        // Playlist import → the live per-track download sheet (auto-started batch).
        local.auralis.client.ui.components.ImportDownloadSheet(ui, vm)

        // Transient toast (optionally with one action — e.g. the queue "Annuler").
        ui.toast?.let { msg ->
            Box(Modifier.fillMaxSize().padding(bottom = 150.dp), contentAlignment = Alignment.BottomCenter) {
                Row(
                    Modifier.padding(horizontal = Spacing.xl)
                        .clip(AMShapes.pill)
                        .background(colors.panel3)
                        .padding(horizontal = 18.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(msg, color = colors.foreground, style = AMType.Footnote)
                    ui.toastActionLabel?.let { label ->
                        Spacer(Modifier.width(Spacing.md))
                        Text(
                            label, color = colors.accent, style = AMType.Footnote,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.clickable { vm.runToastAction() },
                        )
                    }
                }
            }
        }

        // Quick-jump command palette.
        if (ui.commandOpen) {
            local.auralis.client.ui.components.CommandPalette(vm, ui) { vm.closeCommand() }
        }

        // Audio visualizer (real waveform amplitudes when the tap is live).
        if (ui.visualizerOpen) {
            val amps by vm.visualizerAmps.collectAsState()
            local.auralis.client.ui.components.VisualizerOverlay(current?.title, playback.isPlaying, amps) { vm.toggleVisualizer() }
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
            .padding(horizontal = Spacing.md, vertical = Spacing.sm)
            .clip(AMShapes.pill)
            .background(colors.panel3)
            .padding(horizontal = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Close, tr("sel.exit"), tint = colors.textMuted,
            modifier = Modifier.size(22.dp).clickable { vm.exitSelection() },
        )
        Spacer(Modifier.width(Spacing.md))
        Text(
            if (count > 0) tr(if (count > 1) "sel.selectedMany" else "sel.selectedOne", params = mapOf("count" to count)) else tr("sel.pickTracks"),
            color = colors.foreground, style = AMType.Footnote,
            modifier = Modifier.weight(1f),
        )
        if (count > 0) {
            Icon(
                Icons.Filled.PlayArrow, tr("sel.playSelection"), tint = colors.foreground,
                modifier = Modifier.size(24.dp).clickable { vm.playSelection() },
            )
            Spacer(Modifier.width(Spacing.md))
        }
        Row(
            Modifier
                .clip(AMShapes.pill)
                .background(if (count > 0) colors.accent else colors.panel2)
                .clickable(enabled = count > 0 && !ui.generating) { vm.generateAiPlaylist() }
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, null, tint = colors.ink, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(Spacing.sm))
            Text(tr("sel.createMix"), color = colors.ink, style = AMType.Footnote, fontWeight = FontWeight.SemiBold)
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
    val isRoot = ui.nav.view in rootViewIds

    Row(
        Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = Spacing.lg, vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!isRoot) {
            IconAction(Icons.Filled.ArrowBack, tr("common.back"), tint = colors.accent, iconSize = 24) { vm.back() }
            Text(
                tr(titleKeyOf(ui.nav.view)),
                color = colors.foreground,
                style = AMType.Headline,
            )
            Spacer(Modifier.weight(1f))
        } else {
            // Collapsed large title, centered — visible only once scrolled.
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(
                    tr(titleKeyOf(ui.nav.view)),
                    color = colors.foreground,
                    style = AMType.Headline,
                    modifier = Modifier.graphicsLayer { alpha = titleAlpha },
                )
            }
        }
        // Profile avatar (Apple Music's tab-root affordance) → Réglages.
        // Long-press opens the quick-jump command palette. 48dp touch target.
        Box(
            Modifier
                .size(48.dp)
                .combinedClickable(
                    onClick = { vm.navigate(ViewId.SETTINGS) },
                    onLongClick = { vm.openCommand() },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(colors.panel2),
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
}

@Composable
private fun MainContent(vm: AppViewModel, ui: UiState) {
    // Apple Music motion: pushing a detail screen slides it in from the right
    // (the previous one parallax-slides out); switching tabs crossfades in place.
    // Both share the app's motion vocabulary: a soft spring slide + fade.
    AnimatedContent(
        targetState = ui.nav,
        transitionSpec = {
            if (targetState.view !in rootViewIds && initialState.view != targetState.view) {
                (slideInHorizontally(Motion.slide) { it / 3 } + fadeIn(Motion.fade)) togetherWith
                    (slideOutHorizontally(Motion.slide) { -it / 4 } + fadeOut(Motion.fade))
            } else {
                fadeIn(Motion.fade) togetherWith fadeOut(Motion.fade)
            }
        },
        label = "nav",
    ) { nav ->
        when (nav.view) {
            ViewId.HOME -> HomeScreen(vm, ui)
            ViewId.NEW -> NewScreen(vm, ui)
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

/** Apple Music tab bar: four roots, active tinted with the red accent and an
 *  animated pill indicator, floating over the scrolling content with a hairline
 *  top edge. Every tab is a 48dp touch target. */
@Composable
private fun Dock(activeView: ViewId, onTab: (ViewId) -> Unit) {
    val colors = LocalAuralis.current
    val active = tabOf(activeView)
    data class Tab(val view: ViewId, val label: String, val icon: ImageVector)
    val tabs = listOf(
        Tab(ViewId.HOME, tr("nav.home"), Icons.Filled.Home),
        Tab(ViewId.NEW, tr("nav.new"), Icons.Filled.Star),
        Tab(ViewId.EXPLORE, tr("search.title"), Icons.Filled.Search),
        Tab(ViewId.LIBRARY, tr("nav.library"), Icons.Filled.LibraryMusic),
    )
    // Frosted translucent bar — content scrolled underneath blurs through.
    Column(Modifier.fillMaxWidth().amFrosted(null, colors.panel)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.line))
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = Spacing.sm),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            tabs.forEachIndexed { i, t ->
                val on = i == active
                // The active tab wears a soft accent pill that fades in/out.
                val pillAlpha by animateFloatAsState(
                    targetValue = if (on) 1f else 0f,
                    animationSpec = Motion.quick,
                    label = "dockPill",
                )
                Box(
                    Modifier
                        .clip(AMShapes.pill)
                        .clickable { onTab(t.view) },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .matchParentSize()
                            .graphicsLayer { alpha = pillAlpha }
                            .background(colors.accent.copy(alpha = 0.14f)),
                    )
                    Column(
                        Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.xs),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(t.icon, t.label, tint = if (on) colors.accent else colors.textMuted, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.size(3.dp))
                        Text(
                            t.label,
                            color = if (on) colors.accent else colors.textMuted,
                            style = AMType.Caption2,
                            fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    }
                }
            }
        }
    }
}
