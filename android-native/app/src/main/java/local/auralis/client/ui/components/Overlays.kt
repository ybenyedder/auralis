package local.auralis.client.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.theme.LocalAuralis
import kotlin.math.sin

// Quick-jump command palette (the mobile equivalent of the web's Cmd+K): fuzzy
// navigation plus jump-to track/album/artist/playlist.
@Composable
fun CommandPalette(vm: AppViewModel, ui: UiState, onDismiss: () -> Unit) {
    val colors = LocalAuralis.current
    var q by remember { mutableStateOf("") }
    val ql = q.trim().lowercase()

    val navItems = listOf(
        "Accueil" to ViewId.HOME, "Recherche" to ViewId.EXPLORE, "Bibliothèque" to ViewId.LIBRARY,
        "Favoris" to ViewId.FAVORITES, "Récents" to ViewId.RECENTS, "Dossiers" to ViewId.FOLDERS,
        "Analyse" to ViewId.INSIGHTS, "Réglages" to ViewId.SETTINGS,
    ).filter { ql.isEmpty() || it.first.lowercase().contains(ql) }

    val tracks = if (ql.isEmpty()) emptyList() else ui.tracks.filter {
        it.title.lowercase().contains(ql) || it.displayArtist.lowercase().contains(ql)
    }.take(6)
    val albums = if (ql.isEmpty()) emptyList() else ui.albums.filter { it.title.lowercase().contains(ql) }.take(4)
    val artists = if (ql.isEmpty()) emptyList() else ui.artists.filter { it.name.lowercase().contains(ql) }.take(4)
    val playlists = if (ql.isEmpty()) emptyList() else ui.playlists.filter { it.name.lowercase().contains(ql) }.take(4)

    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Color(0xCC000000)).clickable { onDismiss() })
        Column(Modifier.fillMaxSize().statusBarsPadding().padding(12.dp)) {
            OutlinedTextField(
                value = q, onValueChange = { q = it }, singleLine = true,
                placeholder = { Text("Aller à…", color = colors.textFaint) },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = colors.panel, unfocusedContainerColor = colors.panel,
                    focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
                    focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
                ),
            )
            Spacer(Modifier.height(8.dp))
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(14.dp)).background(colors.panel),
            ) {
                items(navItems) { (label, view) ->
                    Cmd(label, "Navigation") { vm.navigate(view); onDismiss() }
                }
                items(tracks) { t -> Cmd(t.title, "Titre · ${t.displayArtist}") { vm.playTrack(t); onDismiss() } }
                items(albums) { a -> Cmd(a.title, "Album · ${a.artistName}") { vm.navigate(ViewId.ALBUM, a.albumhash); onDismiss() } }
                items(artists) { a -> Cmd(a.name, "Artiste") { vm.navigate(ViewId.ARTIST, a.artisthash); onDismiss() } }
                items(playlists) { p -> Cmd(p.name, "Playlist") { vm.navigate(ViewId.PLAYLIST, p.id); onDismiss() } }
            }
        }
    }
}

@Composable
private fun Cmd(title: String, subtitle: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 14.dp, vertical = 11.dp)) {
        Text(title, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(subtitle, color = colors.textMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// Fullscreen audio-reactive visualizer (procedural bar spectrum animated while
// playing; settles when paused). The current track title is shown beneath.
@Composable
fun VisualizerOverlay(title: String?, isPlaying: Boolean, onClose: () -> Unit) {
    val colors = LocalAuralis.current
    val transition = rememberInfiniteTransition(label = "viz")
    val t by transition.animateFloat(
        0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "vt",
    )
    val bars = 44
    Box(Modifier.fillMaxSize().background(colors.background).systemBarsPadding().clickable { onClose() }) {
        Row(
            Modifier.fillMaxWidth().fillMaxHeight(0.6f).align(Alignment.Center).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (i in 0 until bars) {
                val phase = i * 0.4f
                val amp = if (isPlaying) (0.5f + 0.5f * sin((t * 6.283f * 2f) + phase) * sin(phase * 1.7f + t * 3f)) else 0.08f
                val frac = (0.06f + 0.94f * amp.coerceIn(0f, 1f))
                Box(
                    Modifier.weight(1f).fillMaxHeight(frac)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Brush.verticalGradient(listOf(colors.accent, colors.accentDeep))),
                )
            }
        }
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title ?: "", color = colors.foreground, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text("Touchez pour fermer", color = colors.textFaint, fontSize = 11.sp)
        }
    }
}
