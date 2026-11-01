package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.shape.CircleShape
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.ui.components.NetworkImage
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.model.Track
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.PlaylistMosaic
import local.auralis.client.ui.components.paletteFor
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.LocalApiUrl
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

/** Apple Music's card play affordance: a translucent frosted-dark circle pinned
 *  bottom-right of the cover (never a solid accent — the art stays the hero).
 *  Always shown on touch, bottom layer of the tap stack. Flips to a pause glyph
 *  when the card's own action is the one currently sounding. */
@Composable
private fun CardPlayFab(onPlay: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.32f))
            .border(0.75.dp, Color.White.copy(alpha = 0.28f), CircleShape)
            .clickable { onPlay() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.PlayArrow, tr("common.play"), tint = Color.White, modifier = Modifier.size(15.dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LazyItemScope.AlbumCard(
    album: Album,
    modifier: Modifier = Modifier.width(150.dp),
    onPlay: (() -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    val colors = LocalAuralis.current
    Column(modifier.animateItem(placementSpec = Motion.placement).combinedClickable(onClick = onClick, onLongClick = onLongPress)) {
        Box {
            Box(Modifier.shadow(10.dp, AMShapes.tile, clip = false)) {
                CoverArt(album.image, album.albumhash, Modifier.fillMaxWidth().aspectRatio(1f), cornerRadius = Radius.sm.value.toInt())
            }
            if (onPlay != null) {
                CardPlayFab(onPlay, Modifier.align(Alignment.BottomEnd).padding(Spacing.sm))
            }
        }
        Text(
            album.title,
            color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = Spacing.sm),
        )
        Text(
            album.artistName,
            color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LazyItemScope.ArtistCard(
    artist: Artist,
    modifier: Modifier = Modifier.width(130.dp),
    onPlay: (() -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    val colors = LocalAuralis.current
    val (bg, _, _) = paletteFor(artist.artisthash)
    Column(
        modifier.animateItem(placementSpec = Motion.placement).combinedClickable(onClick = onClick, onLongClick = onLongPress),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f)) {
            Box(Modifier.fillMaxWidth().aspectRatio(1f).shadow(10.dp, CircleShape, clip = false).clip(CircleShape).background(bg)) {
                CoverArt(artist.image, artist.artisthash, Modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape))
            }
            if (onPlay != null) {
                CardPlayFab(onPlay, Modifier.align(Alignment.BottomEnd).padding(Spacing.xs))
            }
        }
        Text(
            artist.name,
            color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.sm).fillMaxWidth(),
        )
    }
}

@Composable
fun LazyItemScope.PlaylistTile(
    name: String,
    count: Int,
    seed: String,
    imageHash: String? = null,
    tracks: List<Track> = emptyList(),
    onClick: () -> Unit,
) {
    val colors = LocalAuralis.current
    androidx.compose.foundation.layout.Row(
        Modifier
            .fillMaxWidth()
            .animateItem(placementSpec = Motion.placement)
            .clip(RoundedCornerShape(Radius.sm))
            .clickable { onClick() }
            .padding(vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Custom cover if the user set one; otherwise the Spotify-style 2×2
        // mosaic of the playlist's first album covers (never a gradient wash).
        if (imageHash != null) {
            val resolveUrl = LocalApiUrl.current
            NetworkImage(
                resolveUrl("/api/art/$imageHash"), Modifier.size(52.dp),
                fallback = { PlaylistMosaic(tracks, seed, Modifier.size(52.dp), cornerRadius = 8, sizeDp = 52) },
            )
        } else {
            PlaylistMosaic(tracks, seed, Modifier.size(52.dp), cornerRadius = 8, sizeDp = 52)
        }
        androidx.compose.foundation.layout.Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(name, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(tr("common.tracksCount", params = mapOf("count" to count)), color = colors.textMuted, style = Type.Caption)
        }
    }
}
