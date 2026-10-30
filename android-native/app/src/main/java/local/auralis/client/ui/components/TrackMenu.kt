package local.auralis.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PlaylistAdd
import androidx.compose.material.icons.filled.PlaylistRemove
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Track
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

// Bottom-sheet track context menu: the entry point for "play next", "add to queue",
// "add to a playlist" (incl. create), favourite, and jump-to-album/artist — wiring
// the player/playlist actions that otherwise had no UI.
@Composable
fun TrackMenu(track: Track, ui: UiState, vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var pickingPlaylist by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }

    MenuSheetScaffold(onDismiss) {
            // header
            MenuHeaderRow(
                image = track.image, seed = track.albumhash ?: track.title, round = false,
                title = track.title, subtitle = track.displayArtist,
            )
            MenuDivider()

            if (!pickingPlaylist) {
                MenuRow(Icons.Filled.Radio, tr("ctx.startRadio")) { vm.startRadio(track); onDismiss() }
                MenuRow(Icons.Filled.PlayArrow, tr("ctx.playNext")) { vm.addNext(track); onDismiss() }
                MenuRow(Icons.Filled.QueueMusic, tr("ctx.addToQueue")) { vm.addToEnd(track); onDismiss() }
                MenuRow(Icons.Filled.PlaylistAdd, tr("ctx.addToPlaylist")) { pickingPlaylist = true }
                // Context-aware removal: when this sheet opens from inside a
                // playlist that contains the track, offer to pull it out — the
                // row-level trash is the other path, but users look here first.
                val openPlaylistId = ui.nav.takeIf { it.view == ViewId.PLAYLIST }?.id
                val openPlaylist = openPlaylistId?.let { pid -> ui.playlists.find { it.id == pid } }
                if (openPlaylist != null && openPlaylist.trackhashes.contains(track.trackhash)) {
                    MenuRow(Icons.Filled.PlaylistRemove, tr("ctx.removeFrom", params = mapOf("name" to openPlaylist.name))) {
                        vm.removeFromPlaylist(openPlaylist.id, track.trackhash); onDismiss()
                    }
                }
                MenuDivider()
                MenuRow(Icons.Filled.AutoAwesome, tr("ctx.selectForMix")) { vm.enterSelection(track.trackhash); onDismiss() }
                val fav = ui.favorites.contains(track.trackhash)
                MenuRow(if (fav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (fav) tr("common.removeFavorite") else tr("common.addFavorite")) {
                    vm.toggleFavorite(track.trackhash); onDismiss()
                }
                val disliked = ui.dislikes.contains(track.trackhash)
                MenuRow(Icons.Filled.ThumbDown, if (disliked) tr("ctx.stopDisliking") else tr("ctx.dislike")) {
                    vm.toggleDislike(track.trackhash); onDismiss()
                }
                MenuRow(Icons.Filled.Share, tr("ctx.share")) { vm.shareTrack(track); onDismiss() }
                MenuDivider()
                if (track.albumhash != null) {
                    MenuRow(Icons.Filled.Album, tr("ctx.goToAlbum")) { vm.navigate(ViewId.ALBUM, track.albumhash); onDismiss() }
                }
                track.primaryArtistHash?.let { ah ->
                    MenuRow(Icons.Filled.Person, tr("ctx.goToArtist")) { vm.navigate(ViewId.ARTIST, ah); onDismiss() }
                }
            } else {
                Text(tr("ctx.addToPlaylist"), color = colors.textMuted, style = Type.Caption, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                LazyColumn(Modifier.heightIn(max = 240.dp)) {
                    items(ui.playlists) { pl ->
                        MenuRow(Icons.Filled.PlaylistAdd, pl.name) { vm.addToPlaylist(pl.id, track.trackhash); onDismiss() }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newName, onValueChange = { newName = it }, singleLine = true,
                        placeholder = { Text(tr("ctx.newPlaylist"), color = colors.textFaint) },
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.clip(AMShapes.tile).background(colors.accent)
                            .clickable(enabled = newName.isNotBlank()) {
                                vm.createPlaylistWithTrack(newName.trim(), track.trackhash); onDismiss()
                            }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                    ) { Icon(Icons.Filled.Add, tr("common.create"), tint = colors.ink, modifier = Modifier.size(20.dp)) }
                }
            }
    }
}

@Composable
internal fun MenuDivider() {
    val colors = LocalAuralis.current
    Box(Modifier.fillMaxWidth().padding(vertical = Spacing.sm).height(1.dp).background(colors.line))
}

/** One menu action row: 22dp glyph + label, 48dp-tall touch target, rounded press area. */
@Composable
internal fun MenuRow(icon: ImageVector, label: String, tone: Color? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().clip(AMShapes.tile).clickable { onClick() }
            .padding(horizontal = Spacing.md, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tone ?: colors.foreground, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Spacing.lg))
        Text(label, color = tone ?: colors.foreground, style = Type.Body)
    }
}
