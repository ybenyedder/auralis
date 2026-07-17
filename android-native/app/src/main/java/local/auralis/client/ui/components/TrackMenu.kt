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
import androidx.compose.material.icons.filled.QueueMusic
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Track
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.theme.LocalAuralis

// Bottom-sheet track context menu: the entry point for "play next", "add to queue",
// "add to a playlist" (incl. create), favourite, and jump-to-album/artist — wiring
// the player/playlist actions that otherwise had no UI.
@Composable
fun TrackMenu(track: Track, ui: UiState, vm: AppViewModel, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var pickingPlaylist by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }

    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color(0xAA000000)).clickable { onDismiss() })
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp))
                .background(colors.panel)
                .navigationBarsPadding()
                .padding(horizontal = 8.dp, vertical = 10.dp),
        ) {
            // Drag handle (web's bottom-sheet affordance)
            Box(
                Modifier.padding(top = 2.dp, bottom = 8.dp).align(Alignment.CenterHorizontally)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(colors.line),
            )
            // header
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(44.dp), cornerRadius = 8, sizeDp = 44)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(track.title, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(track.displayArtist, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            MenuDivider()

            if (!pickingPlaylist) {
                MenuRow(Icons.Filled.PlayArrow, "Lire ensuite") { vm.addNext(track); onDismiss() }
                MenuRow(Icons.Filled.QueueMusic, "Ajouter à la file") { vm.addToEnd(track); onDismiss() }
                MenuRow(Icons.Filled.PlaylistAdd, "Ajouter à une playlist") { pickingPlaylist = true }
                MenuDivider()
                MenuRow(Icons.Filled.AutoAwesome, "Sélectionner (Mix IA)") { vm.enterSelection(track.trackhash); onDismiss() }
                val fav = ui.favorites.contains(track.trackhash)
                MenuRow(if (fav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (fav) "Retirer des favoris" else "Ajouter aux favoris") {
                    vm.toggleFavorite(track.trackhash); onDismiss()
                }
                val disliked = ui.dislikes.contains(track.trackhash)
                MenuRow(Icons.Filled.ThumbDown, if (disliked) "Ne plus masquer" else "Je n'aime pas") {
                    vm.toggleDislike(track.trackhash); onDismiss()
                }
                MenuDivider()
                if (track.albumhash != null) {
                    MenuRow(Icons.Filled.Album, "Aller à l'album") { vm.navigate(ViewId.ALBUM, track.albumhash); onDismiss() }
                }
                track.primaryArtistHash?.let { ah ->
                    MenuRow(Icons.Filled.Person, "Aller à l'artiste") { vm.navigate(ViewId.ARTIST, ah); onDismiss() }
                }
            } else {
                Text("Ajouter à une playlist", color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
                LazyColumn(Modifier.heightIn(max = 240.dp)) {
                    items(ui.playlists) { pl ->
                        MenuRow(Icons.Filled.PlaylistAdd, pl.name) { vm.addToPlaylist(pl.id, track.trackhash); onDismiss() }
                    }
                }
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = newName, onValueChange = { newName = it }, singleLine = true,
                        placeholder = { Text("Nouvelle playlist…", color = colors.textFaint) },
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier.clip(RoundedCornerShape(10.dp)).background(colors.accent)
                            .clickable(enabled = newName.isNotBlank()) {
                                vm.createPlaylistWithTrack(newName.trim(), track.trackhash); onDismiss()
                            }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                    ) { Icon(Icons.Filled.Add, "Créer", tint = colors.ink, modifier = Modifier.size(20.dp)) }
                }
            }
        }
    }
}

@Composable
private fun MenuDivider() {
    val colors = LocalAuralis.current
    Box(Modifier.fillMaxWidth().padding(vertical = 6.dp).height(1.dp).background(colors.line))
}

@Composable
private fun MenuRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = colors.foreground, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = colors.foreground, fontSize = 14.sp)
    }
}
