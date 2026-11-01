package local.auralis.client.ui.screens

import android.content.Intent
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
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
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
import androidx.compose.ui.draw.shadow
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
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.model.Album
import local.auralis.client.model.SmartConfig
import local.auralis.client.model.SmartContext
import local.auralis.client.model.Track
import local.auralis.client.model.evaluateSmartList
import local.auralis.client.model.exportPlaylistJSON
import local.auralis.client.model.exportPlaylistM3U
import local.auralis.client.model.isoNow
import local.auralis.client.model.playlistSlug
import local.auralis.client.playback.QueueSource
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.DetailHero
import local.auralis.client.ui.components.EllipsisCircleIcon
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.GhostPill
import local.auralis.client.ui.components.HeroPlayButton
import local.auralis.client.ui.components.HeroShuffleButton
import local.auralis.client.ui.components.IconAction
import local.auralis.client.ui.components.PlayPill
import local.auralis.client.ui.components.TrackRow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Type
import local.auralis.client.ui.theme.Spacing

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
    // Only THIS album lights the hero: `playingFrom` is the tag of what seeded
    // the queue, so a track shared with another playlist doesn't light that one
    // too. `playingThis` (Pause glyph) additionally requires sound to be coming
    // out — a paused album shows Play and resumes in place.
    val playingFrom by vm.playingFrom.collectAsState()
    val activeThis = playingFrom == "album:$albumhash" && playback.hasItems
    val playingThis = activeThis && playback.isPlaying
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 170.dp)) {
        item {
            DetailHero(seed = albumhash) {
                // Shadow under the cover gives the hero real depth (the flat pasted
                // rectangle read as "cheap" next to the web's layered cards).
                Box(Modifier.shadow(18.dp, AMShapes.card, clip = false)) {
                    CoverArt(album?.image, albumhash, Modifier.size(180.dp), cornerRadius = 12)
                }
                Spacer(Modifier.height(14.dp))
                Eyebrow(tr("mobile.album"))
                Spacer(Modifier.height(2.dp))
                Text(album?.title ?: tr("mobile.album"), style = AMType.Title1, color = colors.foreground)
                Text(album?.artistName ?: "", color = colors.textMuted, style = Type.Body,
                    modifier = Modifier.clickable {
                        album?.albumartists?.firstOrNull()?.let { vm.navigate(ViewId.ARTIST, it.artisthash) }
                    })
                Spacer(Modifier.height(4.dp))
                val dur = tracks.sumOf { it.duration ?: 0.0 }
                Text(tr("detail.tracksAndDuration", params = mapOf("count" to tracks.size, "duration" to formatLongDuration(dur))), color = colors.textFaint, style = Type.Caption)
                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    HeroPlayButton(enabled = tracks.isNotEmpty(), playing = playingThis) {
                        // Active source: pause/resume IN PLACE (never restart the queue).
                        if (activeThis) vm.togglePlay()
                        else vm.playList(tracks, from = "album:$albumhash")
                    }
                    HeroShuffleButton(enabled = tracks.isNotEmpty()) { vm.playShuffled(tracks, from = "album:$albumhash") }
                    // "Démarrer une radio" from the album's first track (web AlbumMenu).
                    GhostPill(tr("common.radio")) { tracks.firstOrNull()?.let { vm.startRadio(it) } }
                }
            }
        }
        itemsIndexed(tracks, key = { i, t -> "${t.trackhash}#$i" }) { idx, t ->
            TrackRow(
                t, index = idx, isCurrent = t.trackhash == current, isPlaying = playback.isPlaying,
                isFavorite = ui.favorites.contains(t.trackhash),
                onClick = { vm.playTrack(t, tracks, idx, from = "album:$albumhash") },
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
    val playingFrom by vm.playingFrom.collectAsState()
    val activeThis = playingFrom == "artist:$artisthash" && playback.hasItems
    val playingThis = activeThis && playback.isPlaying
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 170.dp)) {
        item {
            DetailHero(seed = artisthash, centered = true) {
                Box(Modifier.shadow(18.dp, CircleShape, clip = false)) {
                    CoverArt(artist?.image, artisthash, Modifier.size(150.dp).clip(CircleShape))
                }
                Spacer(Modifier.height(14.dp))
                Text(artist?.name ?: tr("mobile.artist"), style = AMType.Title1, color = colors.foreground)
                Text(tr("ctx.albumsAndTracks", params = mapOf("albums" to albums.size, "tracks" to tracks.size)), color = colors.textMuted, style = Type.Label)
                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    HeroPlayButton(enabled = tracks.isNotEmpty(), playing = playingThis) {
                        if (activeThis) vm.togglePlay()
                        else vm.playList(top.ifEmpty { tracks }, from = "artist:$artisthash")
                    }
                    HeroShuffleButton(enabled = tracks.isNotEmpty()) { vm.playShuffled(tracks, from = "artist:$artisthash") }
                    // "Démarrer une radio de l'artiste" from a popular track (web ArtistMenu).
                    GhostPill(tr("common.radio")) {
                        (top.firstOrNull() ?: tracks.firstOrNull())?.let { vm.startRadio(it) }
                    }
                }
            }
        }
        if (top.isNotEmpty()) {
            item { local.auralis.client.ui.components.SectionHeader(tr("detail.popular")) }
            itemsIndexed(top, key = { i, t -> "${t.trackhash}#$i" }) { idx, t ->
                TrackRow(
                    t, index = idx, isCurrent = t.trackhash == current, isPlaying = playback.isPlaying,
                    isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, top, idx, from = "artist:$artisthash") },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }
        if (albums.isNotEmpty()) {
            item {
                Spacer(Modifier.height(16.dp))
                local.auralis.client.ui.components.SectionHeader(tr("detail.discography"))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(albums, key = { it.albumhash }) { a -> AlbumCard(a, onLongPress = { vm.openAlbumMenu(a) }) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
                }
            }
        }
    }
}

@Composable
fun PlaylistDetail(vm: AppViewModel, ui: UiState, playlistId: String) {
    val colors = LocalAuralis.current
    val pl = remember(ui.playlists, playlistId) { ui.playlists.find { it.id == playlistId } }
    // Smart playlists are computed LIVE from their rules against the whole library
    // (so they always reflect the current collection); static ones resolve hashes.
    val smartConfig = remember(pl?.rules) { pl?.rules?.let { SmartConfig.fromJson(it) } }
    val isSmart = smartConfig != null
    val isCollaborator = pl?.collaborator == true
    // null = the async evaluation hasn't landed yet (distinguishes "loading" from
    // a genuinely empty playlist — see `evaluating` below).
    val smartTracks = if (isSmart) {
        derivedAsync<List<Track>?>(ui.tracks, ui.favorites, ui.playCounts, pl?.rules, initial = null) {
            smartConfig?.let { evaluateSmartList(ui.tracks, it, SmartContext(ui.favorites, ui.playCounts)) } ?: emptyList()
        }
    } else null
    val tracks = if (isSmart) smartTracks ?: emptyList()
    else remember(pl, ui.trackByHash) { pl?.trackhashes?.mapNotNull { ui.trackByHash[it] } ?: emptyList() }
    val playback by vm.playback.collectAsState()
    val current = playback.currentId
    // Only THIS playlist lights the hero (never every list sharing a track), and
    // a paused session resumes IN PLACE instead of restarting from track 0.
    val playingFrom by vm.playingFrom.collectAsState()
    val activeThis = playingFrom == "playlist:$playlistId" && playback.hasItems
    val playingThis = activeThis && playback.isPlaying
    // Queue source: playback seeded from THIS playlist never drifts outside it —
    // "quand je mets lire sur ma playlist, ça lit ma playlist" (the endless
    // continuation draws from the playlist only, or stops when it is exhausted).
    val queueSource = remember(tracks) { QueueSource.Playlist(playlistId, tracks.map { it.trackhash }.toSet()) }
    // `tracks` is empty both while a smart playlist is still evaluating AND when
    // it is genuinely empty — `evaluating` separates the two so the screen shows
    // skeletons first and the "playlist vide" hint only for real.
    val evaluating = isSmart && smartTracks == null
    // The hero ⋯ menu is rendered by Shell's overlay layer (ScreenOverlays) so
    // it draws ABOVE the floating mini player + dock; its open/close and the
    // rename/export/invite flows it opens are UiState-driven (see AppViewModel's
    // "screen sheets" block). The export/invite dialogs keep living here —
    // windowed dialogs layer above the chrome by construction — and simply open
    // from the hoisted menu. `newName` re-seeds from the playlist name whenever
    // rename mode opens, like the old menu row did.
    val renaming = ui.playlistRenaming
    var newName by remember(ui.playlistRenaming) { mutableStateOf(pl?.name ?: "") }
    var inviteName by remember { mutableStateOf("") }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Badges mirroring the web PlaylistDetail eyebrow (collab > smart > shared > local).
    val badge = when {
        isCollaborator -> tr("detail.collabBadge", params = mapOf("owner" to (pl?.owner ?: tr("detail.someone"))))
        isSmart -> tr("detail.smartBadge")
        pl?.shared == true -> tr("detail.sharedBadge")
        else -> tr("detail.localBadge")
    }
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
                withContext(Dispatchers.Main) { vm.notify(Messages.t("detail.imageUnreadable")) }
            } else {
                withContext(Dispatchers.Main) { vm.setPlaylistCover(playlistId, dataUrl) }
            }
        }
    }

    // "Exporter" → M3U or JSON → share sheet. The content builders are the web's
    // byte-compatible formats (web exportPlaylistM3U / exportPlaylistJSON), so a
    // file shared to VLC (M3U) or re-imported (JSON) works identically.
    fun shareExport(m3u: Boolean) {
        val name = pl?.name ?: "playlist"
        val content = if (m3u) exportPlaylistM3U(name, tracks, vm.api.base) else exportPlaylistJSON(name, tracks, isoNow())
        val send = Intent(Intent.ACTION_SEND).apply {
            type = if (m3u) "audio/x-mpegurl" else "application/json"
            putExtra(Intent.EXTRA_SUBJECT, playlistSlug(name) + if (m3u) ".m3u8" else ".json")
            putExtra(Intent.EXTRA_TEXT, content)
        }
        runCatching { context.startActivity(Intent.createChooser(send, Messages.t("detail.exportPlaylist"))) }
        vm.closePlaylistExport()
    }

    if (ui.playlistExportOpen) {
        AlertDialog(
            onDismissRequest = { vm.closePlaylistExport() },
            containerColor = colors.panel,
            title = { Text(tr("detail.exportPlaylist"), color = colors.foreground) },
            text = {
                Column {
                    ExportOption("M3U", tr("detail.exportM3uHint")) { shareExport(m3u = true) }
                    ExportOption("JSON", tr("detail.exportJsonHint")) { shareExport(m3u = false) }
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.closePlaylistExport() }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }

    if (ui.playlistInviteOpen) {
        AlertDialog(
            onDismissRequest = { vm.closePlaylistInvite() },
            containerColor = colors.panel,
            title = { Text(tr("detail.inviteTitle"), color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = inviteName, onValueChange = { inviteName = it }, singleLine = true,
                    placeholder = { Text(tr("common.username"), color = colors.textFaint) },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    enabled = inviteName.isNotBlank(),
                    onClick = {
                        vm.addPlaylistCollaborator(playlistId, inviteName.trim())
                        inviteName = ""
                        vm.closePlaylistInvite()
                    },
                ) { Text(tr("detail.invite"), color = colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = { vm.closePlaylistInvite() }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }

    Box(Modifier.fillMaxSize()) {
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 170.dp)) {
        // While THIS playlist's import batch runs, keep a small inline banner up
        // so the downloaded tracks are seen arriving even after the live sheet
        // was closed (tap reopens it).
        item {
            local.auralis.client.ui.components.ImportDownloadBanner(ui, vm, playlistId)
        }
        item {
            DetailHero(seed = playlistId) {
                Box {
                    Box(Modifier.shadow(18.dp, AMShapes.card, clip = false)) {
                        CoverArt(pl?.imageHash?.let { "/api/art/$it" }, playlistId, Modifier.size(180.dp), cornerRadius = 12)
                    }
                    if (!isCollaborator) {
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
                            Icon(Icons.Filled.PhotoCamera, tr("detail.changeCover"), tint = Color.White, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                if (renaming) {
                    OutlinedTextField(value = newName, onValueChange = { newName = it }, singleLine = true,
                        modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PlayPill(tr("common.save"), icon = null) { vm.renamePlaylist(playlistId, newName); vm.setPlaylistRenaming(false) }
                        GhostPill(tr("common.cancel")) { vm.setPlaylistRenaming(false) }
                    }
                } else {
                    Eyebrow(badge)
                    Spacer(Modifier.height(2.dp))
                    Text(pl?.name ?: tr("mobile.playlist"), style = AMType.Title1, color = colors.foreground)
                    val dur = tracks.sumOf { it.duration ?: 0.0 }
                    Text(tr("detail.tracksAndDuration", params = mapOf("count" to tracks.size, "duration" to formatLongDuration(dur))), color = colors.textMuted, style = Type.Label)
                    Spacer(Modifier.height(16.dp))
                    // ONE primary action (play), ONE secondary (shuffle); pin, rename,
                    // export, share, invite and delete all live behind the ⋯ menu.
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                        HeroPlayButton(enabled = tracks.isNotEmpty(), playing = playingThis) {
                            // Active playlist: pause/resume IN PLACE — never rebuild
                            // the queue from track 0 on a paused session.
                            if (activeThis) vm.togglePlay()
                            else vm.playList(tracks, source = queueSource, from = "playlist:$playlistId")
                        }
                        HeroShuffleButton(enabled = tracks.isNotEmpty()) {
                            vm.playShuffled(tracks, queueSource, from = "playlist:$playlistId")
                        }
                        Spacer(Modifier.weight(1f))
                        IconAction(EllipsisCircleIcon, tr("common.moreOptions"), tint = colors.textMuted, iconSize = 24) { vm.openPlaylistMenu() }
                    }
                }
            }
        }
        itemsIndexed(tracks, key = { i, t -> "${t.trackhash}#$i" }) { idx, t ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    TrackRow(
                        t, index = idx, isCurrent = t.trackhash == current, isPlaying = playback.isPlaying,
                        isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, tracks, idx, queueSource, from = "playlist:$playlistId") },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
                }
                // A real button, not the old 12sp "Retirer" caption: users scanning
                // for a trash affordance never found it. 40dp touch target,
                // destructive tint, announced by TalkBack. Smart playlists compute
                // their rows from rules — there's nothing to remove (web hides it).
                if (!isSmart) {
                    Box(
                        Modifier
                            .padding(start = 4.dp)
                            .size(40.dp)
                            .clip(AMShapes.pill)
                            .clickable { vm.removeFromPlaylist(playlistId, t.trackhash) }
                            .semantics { contentDescription = Messages.t("detail.removeTrackAria") },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = colors.destructive, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
        if (tracks.isEmpty() && !evaluating) item {
            EmptyHint(
                tr("detail.emptyPlaylist"),
                if (isSmart) tr("detail.smartEmpty") else tr("detail.addFromMenu"),
            )
        }
        if (evaluating) item { local.auralis.client.ui.components.SkeletonRows(3) }
    }
    }
}

@Composable
private fun ExportOption(label: String, hint: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().clip(AMShapes.tile).clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Download, contentDescription = null, tint = colors.foreground, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Column {
            Text(label, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold)
            Text(hint, color = colors.textMuted, style = Type.Caption)
        }
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
