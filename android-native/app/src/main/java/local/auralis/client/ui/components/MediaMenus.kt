package local.auralis.client.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

// Bottom-sheet album / artist context menus — the native mirrors of the web's
// ContextMenu.tsx AlbumMenu / ArtistMenu. Same sheet scaffold as TrackMenu.kt.

@Composable
fun AlbumMenu(album: Album, ui: UiState, vm: AppViewModel, onDismiss: () -> Unit) {
    var pickingPlaylist by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    val tracks = remember(ui.tracks, album.albumhash) {
        ui.tracks.filter { it.albumhash == album.albumhash }
            .sortedWith(compareBy({ it.disc ?: 1 }, { it.track ?: 0 }))
    }
    val hashes = remember(tracks) { tracks.map { it.trackhash } }

    MenuSheetScaffold(onDismiss) {
        MenuHeaderRow(
            image = album.image, seed = album.albumhash, round = false,
            title = album.title,
            subtitle = "${album.artistName}${album.year?.let { " · $it" } ?: ""}",
        )
        MenuDivider()
        if (!pickingPlaylist) {
            MenuRow(Icons.Filled.PlayArrow, tr("ctx.playAlbum")) { vm.playList(tracks); onDismiss() }
            tracks.firstOrNull()?.let { seed ->
                MenuRow(Icons.Filled.Radio, tr("ctx.startRadio")) { vm.startRadio(seed); onDismiss() }
            }
            MenuRow(Icons.Filled.QueueMusic, tr("ctx.addAlbumToQueue")) { vm.addTracksToEnd(tracks); onDismiss() }
            MenuRow(Icons.Filled.PlaylistAdd, tr("ctx.addAlbumToPlaylist")) { pickingPlaylist = true }
            MenuDivider()
            MenuRow(Icons.Filled.Share, tr("ctx.share")) { vm.shareAlbum(album); onDismiss() }
            album.albumartists.firstOrNull()?.let { a ->
                MenuRow(Icons.Filled.Person, tr("ctx.goToArtist")) { vm.navigate(ViewId.ARTIST, a.artisthash); onDismiss() }
            }
        } else {
            PlaylistPicker(ui, label = tr("ctx.addAlbumToPlaylist"), newName = newName, onNameChange = { newName = it },
                onPick = { id -> vm.addTracksToPlaylist(id, hashes); onDismiss() },
                onCreate = { name -> vm.createPlaylist(name) { id -> vm.addTracksToPlaylist(id, hashes) }; onDismiss() })
        }
    }
}

@Composable
fun ArtistMenu(artist: Artist, ui: UiState, vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    // Web ArtistMenu: the 5 most-played tracks of the artist drive every action.
    val top = remember(ui.tracks, ui.playCounts, artist.artisthash) {
        ui.tracks.filter { t -> t.artists.any { it.artisthash == artist.artisthash } || t.primaryArtistHash == artist.artisthash }
            .sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }
            .take(5)
    }
    val albumCount = remember(ui.albums, artist.artisthash) {
        ui.albums.count { a -> a.albumartists.any { it.artisthash == artist.artisthash } }
    }

    MenuSheetScaffold(onDismiss) {
        MenuHeaderRow(
            image = artist.image, seed = artist.artisthash, round = true,
            title = artist.name,
            subtitle = artist.genres.joinToString(", ").ifBlank { tr("common.artistLabel") },
        )
        MenuDivider()
        MenuRow(Icons.Filled.PlayArrow, tr("ctx.playTopTracks")) { vm.playList(top); onDismiss() }
        top.firstOrNull()?.let { seed ->
            MenuRow(Icons.Filled.Radio, tr("ctx.startArtistRadio")) { vm.startRadio(seed); onDismiss() }
        }
        MenuRow(Icons.Filled.QueueMusic, tr("ctx.addTracksToQueue")) { vm.addTracksToEnd(top); onDismiss() }
        MenuDivider()
        MenuRow(Icons.Filled.Share, tr("ctx.share")) { vm.shareArtist(artist); onDismiss() }
        MenuRow(Icons.Filled.Person, tr("ctx.goToArtist")) { vm.navigate(ViewId.ARTIST, artist.artisthash); onDismiss() }
        if (albumCount > 0) {
            Text(
                tr("ctx.albumsAndTracks", params = mapOf("albums" to albumCount, "tracks" to (artist.trackcount ?: 0))),
                color = colors.textMuted, style = AMType.Caption2,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

// ---- shared sheet scaffold -------------------------------------------------

/**
 * The one bottom-sheet scaffold every menu shares: fading scrim + sheet that
 * slides up gently on open, rounded top corners on the token scale, drag
 * handle, and safe-area padding. Dismiss by tapping the scrim.
 */
@Composable
internal fun MenuSheetScaffold(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val colors = LocalAuralis.current
    // Entrance: scrim fades in, sheet slides up (0 → 1 on first composition).
    val enter = remember { Animatable(0f) }
    LaunchedEffect(Unit) { enter.animateTo(1f, Motion.gentle) }
    val e = enter.value
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { alpha = e }
                .background(Color(0xAA000000))
                .clickable { onDismiss() },
        )
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .graphicsLayer {
                    alpha = e
                    translationY = (1f - e) * 160f
                }
                .clip(AMShapes.sheet)
                .background(colors.panel)
                .navigationBarsPadding()
                .padding(horizontal = Spacing.sm, vertical = Spacing.md),
        ) {
            // Drag handle (web's bottom-sheet affordance)
            Box(
                Modifier.padding(top = Spacing.xs, bottom = Spacing.sm).align(Alignment.CenterHorizontally)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(colors.lineStrong),
            )
            content()
        }
    }
}

@Composable
internal fun MenuHeaderRow(image: String?, seed: String?, round: Boolean, title: String, subtitle: String) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.sm, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
        CoverArt(image, seed, Modifier.size(44.dp), cornerRadius = if (round) 22 else Radius.sm.value.toInt(), sizeDp = 44)
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** The "Ajouter à une playlist" level: pick an existing playlist or create one. */
@Composable
private fun PlaylistPicker(
    ui: UiState,
    label: String,
    newName: String,
    onNameChange: (String) -> Unit,
    onPick: (String) -> Unit,
    onCreate: (String) -> Unit,
) {
    val colors = LocalAuralis.current
    Text(label, color = colors.textMuted, style = Type.Caption, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
    LazyColumn(Modifier.heightIn(max = 240.dp)) {
        items(ui.playlists) { pl ->
            MenuRow(Icons.Filled.PlaylistAdd, pl.name) { onPick(pl.id) }
        }
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = newName, onValueChange = onNameChange, singleLine = true,
            placeholder = { Text(tr("ctx.newPlaylist"), color = colors.textFaint) },
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier.clip(AMShapes.tile).background(colors.accent)
                .clickable(enabled = newName.isNotBlank()) { onCreate(newName.trim()) }
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) { Icon(Icons.Filled.Add, tr("common.create"), tint = colors.ink, modifier = Modifier.size(20.dp)) }
    }
}
