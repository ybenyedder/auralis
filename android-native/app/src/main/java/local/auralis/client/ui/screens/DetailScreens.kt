package local.auralis.client.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import local.auralis.client.model.Album
import local.auralis.client.model.Track
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.DetailHero
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.GhostPill
import local.auralis.client.ui.components.HeroPlayButton
import local.auralis.client.ui.components.HeroShuffleButton
import local.auralis.client.ui.components.PlayPill
import local.auralis.client.ui.components.TrackRow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.LocalAuralis

@Composable
fun AlbumDetail(vm: AppViewModel, ui: UiState, albumhash: String) {
    val colors = LocalAuralis.current
    val album = remember(ui.albums, albumhash) { ui.albums.find { it.albumhash == albumhash } }
    // Filtering the whole library down to this album runs off the main thread.
    val tracks = derivedAsync(ui.tracks, albumhash, initial = emptyList<Track>()) {
        ui.tracks.filter { it.albumhash == albumhash }
            .sortedWith(compareBy({ it.disc ?: 1 }, { it.track ?: 0 }))
    }
    val playback by vm.playback.collectAsState()
    val current = playback.currentId
    val isPlayingThis = playback.isPlaying && tracks.any { it.trackhash == current }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 170.dp)) {
        item {
            DetailHero(seed = albumhash) {
                CoverArt(album?.image, albumhash, Modifier.size(180.dp), cornerRadius = 12)
                Spacer(Modifier.height(14.dp))
                Eyebrow("Album")
                Spacer(Modifier.height(2.dp))
                Text(album?.title ?: "Album", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
                Text(album?.artistName ?: "", color = colors.textMuted, fontSize = 14.sp,
                    modifier = Modifier.clickable {
                        album?.albumartists?.firstOrNull()?.let { vm.navigate(ViewId.ARTIST, it.artisthash) }
                    })
                Spacer(Modifier.height(4.dp))
                val dur = tracks.sumOf { it.duration ?: 0.0 }
                Text("${tracks.size} titres · ${formatLongDuration(dur)}", color = colors.textFaint, fontSize = 12.sp)
                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    HeroPlayButton(enabled = tracks.isNotEmpty(), playing = isPlayingThis) {
                        if (isPlayingThis) vm.togglePlay() else vm.playList(tracks)
                    }
                    HeroShuffleButton(enabled = tracks.isNotEmpty()) { vm.playShuffled(tracks) }
                }
            }
        }
        items(tracks, key = { it.trackhash }) { t ->
            val idx = tracks.indexOf(t)
            TrackRow(
                t, index = idx, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                onClick = { vm.playTrack(t, tracks, idx) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
    }
}

@Composable
fun ArtistDetail(vm: AppViewModel, ui: UiState, artisthash: String) {
    val colors = LocalAuralis.current
    val artist = remember(ui.artists, artisthash) { ui.artists.find { it.artisthash == artisthash } }
    // Matching every track's artist list + every album's artist list walks the whole
    // library twice — derive off the main thread (see derivedAsync in Screens.kt).
    val derived = derivedAsync(ui.tracks, ui.albums, ui.playCounts, artisthash, initial = ArtistDetailDerived.EMPTY) {
        val artistTracks = ui.tracks.filter {
            it.primaryArtistHash == artisthash || it.artists.any { a -> a.artisthash == artisthash }
        }
        ArtistDetailDerived(
            tracks = artistTracks,
            albums = ui.albums.filter { it.albumartists.any { a -> a.artisthash == artisthash } },
            top = artistTracks.sortedByDescending { ui.playCounts[it.trackhash] ?: it.playcount }.take(8),
        )
    }
    val tracks = derived.tracks
    val albums = derived.albums
    val top = derived.top
    val playback by vm.playback.collectAsState()
    val current = playback.currentId
    val isPlayingThis = playback.isPlaying && tracks.any { it.trackhash == current }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 170.dp)) {
        item {
            DetailHero(seed = artisthash, centered = true) {
                CoverArt(artist?.image, artisthash, Modifier.size(150.dp).clip(CircleShape))
                Spacer(Modifier.height(14.dp))
                Text(artist?.name ?: "Artiste", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
                Text("${tracks.size} titres · ${albums.size} albums", color = colors.textMuted, fontSize = 13.sp)
                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    HeroPlayButton(enabled = tracks.isNotEmpty(), playing = isPlayingThis) {
                        if (isPlayingThis) vm.togglePlay() else vm.playList(top.ifEmpty { tracks })
                    }
                    HeroShuffleButton(enabled = tracks.isNotEmpty()) { vm.playShuffled(tracks) }
                }
            }
        }
        if (top.isNotEmpty()) {
            item { local.auralis.client.ui.components.SectionHeader("Populaire") }
            items(top, key = { it.trackhash }) { t ->
                val idx = top.indexOf(t)
                TrackRow(
                    t, index = idx, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, top, idx) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }
        if (albums.isNotEmpty()) {
            item {
                Spacer(Modifier.height(16.dp))
                local.auralis.client.ui.components.SectionHeader("Discographie")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(albums, key = { it.albumhash }) { a -> AlbumCard(a) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
                }
            }
        }
    }
}

@Composable
fun PlaylistDetail(vm: AppViewModel, ui: UiState, playlistId: String) {
    val colors = LocalAuralis.current
    val pl = remember(ui.playlists, playlistId) { ui.playlists.find { it.id == playlistId } }
    val tracks = remember(pl, ui.trackByHash) { pl?.trackhashes?.mapNotNull { ui.trackByHash[it] } ?: emptyList() }
    val playback by vm.playback.collectAsState()
    val current = playback.currentId
    val isPlayingThis = playback.isPlaying && tracks.any { it.trackhash == current }
    var renaming by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf(pl?.name ?: "") }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val pickCover = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            // Downscale before base64: raw picks routinely decode to 8-11 MB and the
            // whole image rides in the JSON body of the cover upload. Cap at 1024px
            // JPEG-85 (covers render at ~180dp) — a few dozen KB.
            val dataUrl = runCatching {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: return@runCatching null
                if (bytes.isEmpty()) return@runCatching null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
                val maxDim = maxOf(bounds.outWidth, bounds.outHeight)
                var sample = 1
                while (maxDim / (sample * 2) >= 1024) sample *= 2
                val opts = BitmapFactory.Options().apply { inSampleSize = sample }
                val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                    ?: return@runCatching null
                val scale = 1024f / maxOf(decoded.width, decoded.height)
                val scaled = if (scale < 1f) {
                    Bitmap.createScaledBitmap(
                        decoded,
                        (decoded.width * scale).toInt().coerceAtLeast(1),
                        (decoded.height * scale).toInt().coerceAtLeast(1),
                        true,
                    )
                } else decoded
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
                if (scaled !== decoded) scaled.recycle()
                decoded.recycle()
                "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            }.getOrNull()
            if (dataUrl == null) {
                withContext(Dispatchers.Main) { vm.notify("Image invalide ou illisible") }
            } else {
                withContext(Dispatchers.Main) { vm.setPlaylistCover(playlistId, dataUrl) }
            }
        }
    }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 170.dp)) {
        item {
            DetailHero(seed = playlistId) {
                Box {
                    CoverArt(pl?.imageHash?.let { "/api/art/$it" }, playlistId, Modifier.size(180.dp), cornerRadius = 12)
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(6.dp)
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.6f))
                            .clickable { pickCover.launch("image/*") },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.PhotoCamera, "Changer la pochette", tint = Color.White, modifier = Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.height(14.dp))
                if (renaming) {
                    OutlinedTextField(value = newName, onValueChange = { newName = it }, singleLine = true,
                        modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PlayPill("Enregistrer") { vm.renamePlaylist(playlistId, newName); renaming = false }
                        GhostPill("Annuler") { renaming = false }
                    }
                } else {
                    Eyebrow("Playlist")
                    Spacer(Modifier.height(2.dp))
                    Text(pl?.name ?: "Playlist", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
                    Text("${tracks.size} titres", color = colors.textMuted, fontSize = 13.sp)
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        HeroPlayButton(enabled = tracks.isNotEmpty(), playing = isPlayingThis) {
                            if (isPlayingThis) vm.togglePlay() else vm.playList(tracks)
                        }
                        HeroShuffleButton(enabled = tracks.isNotEmpty()) { vm.playShuffled(tracks) }
                        Spacer(Modifier.weight(1f))
                        // Glyph-only pin button: TalkBack announces the action, not the emoji.
                        Text(if (pl?.pinned == true) "📌" else "📍", fontSize = 18.sp,
                            modifier = Modifier.clickable { vm.togglePin(playlistId) }
                                .semantics { contentDescription = if (pl?.pinned == true) "Désépingler" else "Épingler" })
                        Icon(Icons.Filled.Edit, "Renommer", tint = colors.textMuted,
                            modifier = Modifier.size(22.dp).clickable { newName = pl?.name ?: ""; renaming = true })
                        Icon(Icons.Filled.Delete, "Supprimer", tint = colors.destructive,
                            modifier = Modifier.size(22.dp).clickable { vm.deletePlaylist(playlistId); vm.navigate(ViewId.LIBRARY) })
                    }
                }
            }
        }
        items(tracks, key = { it.trackhash }) { t ->
            val idx = tracks.indexOf(t)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    TrackRow(
                        t, index = idx, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, tracks, idx) },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
                }
                Text("Retirer", color = colors.textFaint, fontSize = 12.sp,
                    modifier = Modifier.clickable { vm.removeFromPlaylist(playlistId, t.trackhash) }.padding(8.dp))
            }
        }
        if (tracks.isEmpty()) item { EmptyHint("Playlist vide", "Ajoute des titres via le menu ⋮ d'un morceau.") }
    }
}

// Full-library derivations of ArtistDetail, computed by derivedAsync.
private class ArtistDetailDerived(
    val tracks: List<Track>,
    val albums: List<Album>,
    val top: List<Track>,
) {
    companion object {
        val EMPTY = ArtistDetailDerived(emptyList(), emptyList(), emptyList())
    }
}
