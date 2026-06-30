package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.paletteFor
import local.auralis.client.ui.theme.LocalAuralis

/** Green circular play FAB pinned bottom-right of a card cover — Spotify's
 * signature card control. Always shown (no hover on touch), bottom layer tap target. */
@Composable
private fun CardPlayFab(onPlay: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(colors.accent)
            .clickable { onPlay() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.PlayArrow, "Lire", tint = colors.ink, modifier = Modifier.size(18.dp))
    }
}

@Composable
fun AlbumCard(album: Album, modifier: Modifier = Modifier.width(150.dp), onPlay: (() -> Unit)? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(modifier.clickable { onClick() }) {
        Box {
            CoverArt(album.image, album.albumhash, Modifier.fillMaxWidth().aspectRatio(1f), cornerRadius = 8)
            if (onPlay != null) {
                CardPlayFab(onPlay, Modifier.align(Alignment.BottomEnd).padding(8.dp))
            }
        }
        Text(
            album.title,
            color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            album.artistName,
            color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun ArtistCard(artist: Artist, modifier: Modifier = Modifier.width(130.dp), onPlay: (() -> Unit)? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    val (bg, _, _) = paletteFor(artist.artisthash)
    Column(
        modifier.clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f)) {
            Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape).background(bg)) {
                CoverArt(artist.image, artist.artisthash, Modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape))
            }
            if (onPlay != null) {
                CardPlayFab(onPlay, Modifier.align(Alignment.BottomEnd).padding(4.dp))
            }
        }
        Text(
            artist.name,
            color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.Bold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp).fillMaxWidth(),
        )
    }
}

@Composable
fun PlaylistTile(name: String, count: Int, seed: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    androidx.compose.foundation.layout.Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverArt(null, seed, Modifier.size(52.dp), cornerRadius = 10, sizeDp = 52)
        androidx.compose.foundation.layout.Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$count titres", color = colors.textMuted, fontSize = 12.sp)
        }
    }
}
