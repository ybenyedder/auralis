package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Moods
import local.auralis.client.model.Track
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.GhostPill
import local.auralis.client.ui.components.LargeTitle
import local.auralis.client.ui.components.PlayPill
import local.auralis.client.ui.components.SectionHeader
import local.auralis.client.ui.components.TrackRow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis

private val bottomPad = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 170.dp)

private fun seededShuffle(list: List<Track>, seed: Long): List<Track> {
    val arr = list.toMutableList()
    var s = seed
    for (i in arr.indices.reversed()) {
        s = (s * 1103515245 + 12345) and 0x7fffffff
        val j = (s % (i + 1)).toInt()
        val t = arr[i]; arr[i] = arr[j]; arr[j] = t
    }
    return arr
}

@Composable
private fun currentTrackOf(vm: AppViewModel): String? {
    // Reactive: .value would snapshot once at composition and never update while
    // the user sits on this screen (this was the bug — play/pause + the active-row
    // highlight never updated live, only the Shell-level mini player did).
    val playback by vm.playback.collectAsState()
    return playback.currentId
}

// ============================ HOME =========================================

@Composable
fun HomeScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current

    val recentsTracks = remember(ui.recents, ui.trackByHash) { ui.recents.mapNotNull { ui.trackByHash[it] } }
    val daySeed = System.currentTimeMillis() / 86_400_000L
    val pool = remember(ui.tracks, ui.favorites, ui.playCounts) {
        ui.tracks.filter { it.isFavorite || (ui.playCounts[it.trackhash] ?: 0) > 0 }.ifEmpty { ui.tracks }
    }
    val mix = remember(pool, daySeed) { seededShuffle(pool, daySeed).take(30) }
    val recentlyAdded = remember(ui.tracks) {
        ui.tracks.filter { it.addedAt != null }.sortedByDescending { it.addedAt }.take(12)
    }
    val topTracks = remember(ui.tracks, ui.playCounts) {
        ui.tracks.sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }.filter { (ui.playCounts[it.trackhash] ?: 0) > 0 }.take(5)
    }
    val recentSet = remember(ui.recents) { ui.recents.take(30).toSet() }
    val rediscover = remember(ui.tracks, ui.favorites, recentSet) {
        ui.tracks.filter { ui.favorites.contains(it.trackhash) && it.trackhash !in recentSet }.take(12)
    }
    val neverPlayed = remember(ui.tracks, ui.playCounts) {
        ui.tracks.filter { (ui.playCounts[it.trackhash] ?: 0) == 0 }
    }
    val discoveries = remember(neverPlayed, daySeed) {
        if (neverPlayed.size >= 4) seededShuffle(neverPlayed, daySeed + 7).take(12) else emptyList()
    }
    val current = currentTrackOf(vm)
    val favTracks = remember(ui.tracks, ui.favorites) { ui.tracks.filter { ui.favorites.contains(it.trackhash) } }
    val quickTiles = buildList {
        if (favTracks.isNotEmpty()) {
            add(
                QuickTileItem(
                    "liked", "Titres likés", null, null, null, liked = true,
                    onOpen = { vm.navigate(ViewId.FAVORITES) },
                    onPlay = { vm.playList(favTracks) },
                ),
            )
        }
        recentsTracks.take((8 - size).coerceAtLeast(0)).forEach { t ->
            add(
                QuickTileItem(
                    t.trackhash, t.title, t.displayArtist, t.image, t.albumhash ?: t.title, liked = false,
                    onOpen = { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) },
                    onPlay = { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) },
                ),
            )
        }
    }

    LazyColumn(contentPadding = bottomPad) {
        // Large title + streak chips (Apple Music opens each tab with a 34pt title).
        item {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp)) {
                LargeTitle("Accueil")
                if (ui.stats.streak > 0) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Chip("🔥 ${ui.stats.streak} jours d'affilée")
                        Spacer(Modifier.width(8.dp))
                        Chip("${ui.stats.weekPlays} écoutes cette semaine")
                    }
                }
            }
        }

        if (ui.tracks.isEmpty()) {
            item {
                EmptyHint(
                    "Aucun titre indexé",
                    "Configure le dossier de musique sur ton serveur puis relance le scan.",
                )
            }
            return@LazyColumn
        }

        // "Pour vous" — Apple Music's top hero shelf: large editorial cards.
        if (ui.forYou.isNotEmpty()) {
            item {
                SectionHeader("Pour vous", "Tout lire") { vm.playList(ui.forYou) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.forYou.take(10), key = { it.trackhash }) { t ->
                        HeroTrackCard(t, t.trackhash == current) { vm.playTrack(t, ui.forYou, ui.forYou.indexOf(t)) }
                    }
                }
            }
        }

        // Quick-access grid: Liked songs (red) + recently played, 2 columns.
        if (quickTiles.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    quickTiles.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { tile -> QuickTile(tile, Modifier.weight(1f)) }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // Mix du jour — a daily 5-track starter list.
        if (mix.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Mix du jour", "Tout lire") { vm.playList(mix) }
            }
            items(mix.take(5), key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, mix, mix.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }

        if (recentsTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Écoutés récemment", "Tout afficher") { vm.navigate(ViewId.RECENTS) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentsTracks.take(10), key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) }
                    }
                }
            }
        }

        if (recentlyAdded.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Ajouts récents", "Tout afficher") { vm.navigate(ViewId.NEW) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentlyAdded, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, recentlyAdded, recentlyAdded.indexOf(t)) }
                    }
                }
            }
        }

        if (rediscover.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("À redécouvrir", "Tout lire") { vm.playList(rediscover) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(rediscover, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, rediscover, rediscover.indexOf(t)) }
                    }
                }
            }
        }

        if (discoveries.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Découvertes", "Tout afficher") { vm.navigate(ViewId.RADIO) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(discoveries, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, discoveries, discoveries.indexOf(t)) }
                    }
                }
            }
        }

        if (topTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Titres forts")
            }
            items(topTracks, key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, topTracks, topTracks.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }

        if (ui.artists.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Artistes", "Tout afficher") { vm.navigate(ViewId.LIBRARY) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.artists.take(12), key = { it.artisthash }) { a ->
                        ArtistCard(
                            a,
                            onPlay = { vm.playList(ui.tracks.filter { t -> t.primaryArtistHash == a.artisthash }) },
                        ) { vm.navigate(ViewId.ARTIST, a.artisthash) }
                    }
                }
            }
        }
    }
}

/** Apple Music "top picks" hero card: near-full-width editorial art with the
 *  red play control overlaid, title + artist beneath. */
@Composable
private fun HeroTrackCard(t: Track, isCurrent: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.width(290.dp).clickable { onClick() }) {
        Box {
            local.auralis.client.ui.components.CoverArt(
                t.image, t.albumhash ?: t.title,
                Modifier.fillMaxWidth().aspectRatio(1.6f), cornerRadius = 12,
            )
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(10.dp)
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(colors.accent)
                    .clickable { onClick() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, "Lire", tint = colors.ink, modifier = Modifier.size(20.dp))
            }
        }
        Text(
            t.title, color = if (isCurrent) colors.accent else colors.foreground,
            style = AMType.Headline, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(t.displayArtist, color = colors.textMuted, style = AMType.Subhead, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ============================ NOUVEAU ======================================

/** The "Nouveau" tab — Apple Music's New section: fresh albums, recent tracks,
 *  and genre highlights derived from what the scanner picked up lately. */
@Composable
fun NewScreen(vm: AppViewModel, ui: UiState) {
    val current = currentTrackOf(vm)
    val recentAlbums = remember(ui.tracks, ui.albums) {
        val newestPerAlbum = ui.tracks.filter { it.addedAt != null }
            .sortedByDescending { it.addedAt }
            .distinctBy { it.albumhash }
            .mapNotNull { t -> ui.albums.firstOrNull { it.albumhash == t.albumhash } }
        newestPerAlbum.ifEmpty { ui.albums.sortedByDescending { it.year ?: 0 } }
    }
    val recentTracks = remember(ui.tracks) {
        ui.tracks.filter { it.addedAt != null }.sortedByDescending { it.addedAt }.take(15)
    }
    val genres = remember(ui.tracks) {
        ui.tracks.filter { !it.genre.isNullOrBlank() }
            .groupBy { it.genre!! }
            .entries.sortedByDescending { it.value.size }
    }
    val daySeed = System.currentTimeMillis() / 86_400_000L
    val neverPlayed = remember(ui.tracks, ui.playCounts) { ui.tracks.filter { (ui.playCounts[it.trackhash] ?: 0) == 0 } }
    val discoveries = remember(neverPlayed, daySeed) {
        if (neverPlayed.size >= 4) seededShuffle(neverPlayed, daySeed + 7).take(12) else emptyList()
    }

    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp)) { LargeTitle("Nouveau") }
        }
        if (recentAlbums.isEmpty()) {
            item { EmptyHint("Rien de neuf", "Lance un scan serveur pour indexer de nouveaux fichiers.") }
            return@LazyColumn
        }
        if (recentAlbums.isNotEmpty()) {
            item {
                SectionHeader("Nouveaux albums", "Tout afficher") { vm.navigate(ViewId.LIBRARY) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentAlbums.take(12), key = { it.albumhash }) { a ->
                        AlbumCard(a, onPlay = { vm.playList(ui.tracks.filter { t -> t.albumhash == a.albumhash }) }) { vm.navigate(ViewId.ALBUM, a.albumhash) }
                    }
                }
            }
        }
        if (recentTracks.isNotEmpty()) {
            item { Spacer(Modifier.height(24.dp)); SectionHeader("Ajouts récents") }
            items(recentTracks, key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, recentTracks, recentTracks.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }
        if (discoveries.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Fraîchement découverts", "Tout lire") { vm.playList(discoveries) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(discoveries, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, discoveries, discoveries.indexOf(t)) }
                    }
                }
            }
        }
        if (genres.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Nouveautés par genre")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(genres.take(10), key = { it.key }) { e -> GenreCard(e.key, e.value.size) { vm.playShuffled(e.value) } }
                }
            }
        }
    }
}

// ============================ RADIO ========================================

/** The "Radio" tab — Apple Music's station hub: a daily mix hero, personalised
 *  station cards and genre stations that shuffle-play their pool. */
@Composable
fun RadioScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val current = currentTrackOf(vm)
    val daySeed = System.currentTimeMillis() / 86_400_000L
    val pool = remember(ui.tracks, ui.favorites, ui.playCounts) {
        ui.tracks.filter { it.isFavorite || (ui.playCounts[it.trackhash] ?: 0) > 0 }.ifEmpty { ui.tracks }
    }
    val mix = remember(pool, daySeed) { seededShuffle(pool, daySeed).take(30) }
    val genres = remember(ui.tracks) {
        ui.tracks.filter { !it.genre.isNullOrBlank() }
            .groupBy { it.genre!! }
            .entries.filter { it.value.size >= 3 }
            .sortedByDescending { it.value.size }
    }

    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp)) { LargeTitle("Radio") }
        }
        if (ui.tracks.isEmpty()) {
            item { EmptyHint("Aucun titre indexé", "Configure le dossier de musique sur ton serveur puis relance le scan.") }
            return@LazyColumn
        }

        // Station hero — the daily mix as a big red editorial card.
        if (mix.isNotEmpty()) {
            item {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFFFA233B), Color(0xFFFC5C7A), Color(0xFFFFAEBE)),
                            ),
                        )
                        .clickable { vm.playList(mix) }
                        .padding(20.dp),
                ) {
                    Column(Modifier.align(Alignment.BottomStart)) {
                        Text("Mix du jour", color = Color.White, style = AMType.Title1)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "30 titres piochés dans tes goûts · change chaque jour",
                            color = Color.White.copy(alpha = 0.85f), style = AMType.Subhead,
                        )
                    }
                    Icon(
                        Icons.Filled.PlayArrow, "Lire le mix du jour",
                        tint = Color.White, modifier = Modifier.align(Alignment.BottomEnd).size(44.dp),
                    )
                }
            }
        }

        // Personalised station shelf.
        if (ui.forYou.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Fait pour vous", "Tout lire") { vm.playList(ui.forYou) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.forYou.take(10), key = { it.trackhash }) { t ->
                        HeroTrackCard(t, t.trackhash == current) { vm.playTrack(t, ui.forYou, ui.forYou.indexOf(t)) }
                    }
                }
            }
        }

        // Genre stations — Apple Music's colourful browse tiles.
        if (genres.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader("Stations par genre")
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    genres.take(12).chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { e ->
                                GenreCard(e.key, e.value.size, Modifier.weight(1f)) { vm.playShuffled(e.value) }
                            }
                            if (row.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Chip(text: String) {
    val colors = LocalAuralis.current
    Box(Modifier.clip(CircleShape).background(colors.panel2).padding(horizontal = 12.dp, vertical = 6.dp)) {
        Text(text, color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

private class QuickTileItem(
    val key: String, val title: String, val subtitle: String?, val image: String?, val seed: String?,
    val liked: Boolean, val onOpen: () -> Unit, val onPlay: () -> Unit,
)

/** Apple Music–style "quick access" tile: a squat horizontal card (art flush-left,
 * bold title) with a red circular play button — the home screen's quick-jump row. */
@Composable
private fun QuickTile(tile: QuickTileItem, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Row(
        modifier
            .height(56.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.panel2)
            .clickable { tile.onOpen() },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (tile.liked) {
            Box(
                Modifier.size(56.dp).background(Brush.linearGradient(listOf(Color(0xFFFA233B), Color(0xFFFC5C7A), Color(0xFFFFAEBE)))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Favorite, null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        } else {
            local.auralis.client.ui.components.CoverArt(tile.image, tile.seed, Modifier.size(56.dp), cornerRadius = 0, sizeDp = 56)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(tile.title, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (tile.subtitle != null) {
                Text(tile.subtitle, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Box(
            Modifier
                .padding(end = 10.dp)
                .size(34.dp)
                .clip(CircleShape)
                .background(colors.accent)
                .clickable { tile.onPlay() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.PlayArrow, "Lire", tint = colors.ink, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun MiniTrackCard(t: Track, isCurrent: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.width(160.dp).clickable { onClick() }) {
        Box {
            local.auralis.client.ui.components.CoverArt(
                t.image, t.albumhash ?: t.title,
                Modifier.size(160.dp), cornerRadius = 12,
            )
            // Frosted play affordance, like the AM shelves.
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(8.dp)
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.32f))
                    .border(0.75.dp, Color.White.copy(alpha = 0.28f), CircleShape)
                    .clickable { onClick() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, "Lire", tint = Color.White, modifier = Modifier.size(15.dp))
            }
        }
        Text(
            t.title, color = if (isCurrent) colors.accent else colors.foreground,
            style = AMType.Subhead, fontWeight = FontWeight.SemiBold,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(t.displayArtist, color = colors.textMuted, style = AMType.Footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun EmptyHint(title: String, body: String) {
    val colors = LocalAuralis.current
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, color = colors.foreground, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(body, color = colors.textMuted, fontSize = 13.sp)
    }
}

/** Apple Music genre tile: a squat colourful gradient card, bold white label. */
@Composable
private fun GenreCard(genre: String, count: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val (bg, c1, _) = local.auralis.client.ui.components.paletteFor(genre)
    Box(
        modifier
            .height(88.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(bg, c1)))
            .clickable { onClick() }
            .padding(12.dp),
    ) {
        Column(Modifier.align(Alignment.BottomStart)) {
            Text(genre, color = Color.White, style = AMType.Headline, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$count titres", color = Color.White.copy(alpha = 0.8f), style = AMType.Caption1)
        }
    }
}

// ============================ SEARCH (Explore) =============================

@Composable
fun SearchScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val current = currentTrackOf(vm)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(6.dp))
        LargeTitle("Recherche")
        Spacer(Modifier.height(10.dp))
        // Apple Music's rounded grey search field (10pt radius, no border).
        OutlinedTextField(
            value = ui.searchQuery,
            onValueChange = { vm.setSearch(it) },
            placeholder = { Text("Artistes, titres, albums", color = colors.textFaint) },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = colors.textMuted) },
            singleLine = true,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color.Transparent,
                unfocusedBorderColor = Color.Transparent,
                focusedContainerColor = colors.panel2,
                unfocusedContainerColor = colors.panel2,
                focusedTextColor = colors.foreground,
                unfocusedTextColor = colors.foreground,
                cursorColor = colors.accent,
            ),
        )
        Spacer(Modifier.height(8.dp))
        val res = ui.searchResult
        if (ui.searchQuery.isBlank()) {
            val genres = remember(ui.tracks) {
                ui.tracks.filter { !it.genre.isNullOrBlank() }
                    .groupBy { it.genre!! }.filter { it.value.size >= 3 }
                    .entries.sortedByDescending { it.value.size }.take(12)
            }
            val history = remember(ui.recents, ui.trackByHash) { ui.recents.mapNotNull { ui.trackByHash[it] }.take(12) }
            LazyColumn(contentPadding = PaddingValues(bottom = 170.dp)) {
                if (history.isNotEmpty()) {
                    item { SectionHeader("Écoutés récemment") }
                    items(history, key = { it.trackhash }) { t ->
                        TrackRow(
                            t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                            onClick = { vm.playTrack(t, history, history.indexOf(t)) },
                            onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                        )
                    }
                }
                if (genres.isNotEmpty()) {
                    item {
                        if (history.isNotEmpty()) Spacer(Modifier.height(24.dp))
                        SectionHeader("Parcourir tout")
                        // Apple Music's colourful genre grid, two columns.
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            genres.chunked(2).forEach { row ->
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    row.forEach { e -> GenreCard(e.key, e.value.size, Modifier.weight(1f)) { vm.playShuffled(e.value) } }
                                    if (row.size == 1) Spacer(Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(bottom = 170.dp)) {
                if (res.artists.isNotEmpty()) {
                    item { SectionHeader("Artistes") }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(res.artists) { a -> ArtistCard(a) { vm.navigate(ViewId.ARTIST, a.artisthash) } }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                if (res.albums.isNotEmpty()) {
                    item { SectionHeader("Albums") }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(res.albums) { a -> AlbumCard(a) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                if (res.tracks.isNotEmpty()) {
                    item { SectionHeader("Titres") }
                    items(res.tracks, key = { it.trackhash }) { t ->
                        TrackRow(
                            t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                            onClick = { vm.playTrack(t, res.tracks, res.tracks.indexOf(t)) },
                            onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                        )
                    }
                }
                if (res.tracks.isEmpty() && res.albums.isEmpty() && res.artists.isEmpty()) {
                    item { EmptyHint("Aucun résultat", "Essaie d'autres mots-clés.") }
                }
            }
        }
    }
}

// ============================ LIBRARY =====================================

@Composable
fun LibraryScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    var tab by remember { mutableStateOf(0) }
    var showCreate by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(0) }
    var grid by remember { mutableStateOf(true) }
    // Apple Music's library order: Playlists first, then Artists, Albums, Songs.
    data class LTab(val label: String, val icon: ImageVector)
    val tabs = listOf(
        LTab("Playlists", Icons.Filled.QueueMusic),
        LTab("Artistes", Icons.Filled.Person),
        LTab("Albums", Icons.Filled.Album),
        LTab("Titres", Icons.Filled.MusicNote),
    )
    val current = currentTrackOf(vm)

    if (showCreate) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showCreate = false },
            containerColor = colors.panel,
            title = { Text("Nouvelle playlist", color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = newName, onValueChange = { newName = it }, singleLine = true,
                    placeholder = { Text("Nom de la playlist", color = colors.textFaint) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
                        focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
                    ),
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    onClick = {
                        val name = newName.trim()
                        if (name.isNotEmpty()) vm.createPlaylist(name) { id -> vm.navigate(ViewId.PLAYLIST, id) }
                        newName = ""; showCreate = false
                    },
                ) { Text("Créer", color = colors.accent) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showCreate = false }) { Text("Annuler", color = colors.textMuted) }
            },
        )
    }

    val sortedAlbums = remember(ui.albums, sort) {
        when (sort) {
            1 -> ui.albums.sortedByDescending { it.title.lowercase() }
            2 -> ui.albums.sortedByDescending { it.year ?: 0 }
            else -> ui.albums.sortedBy { it.title.lowercase() }
        }
    }
    val artistPlays = remember(ui.tracks, ui.playCounts) { artistPlayTotals(ui.tracks, ui.playCounts) }
    val sortedArtists = remember(ui.artists, sort, artistPlays) {
        when (sort) {
            1 -> ui.artists.sortedByDescending { it.name.lowercase() }
            2 -> ui.artists.sortedByDescending { artistPlays[it.artisthash] ?: 0 }
            else -> ui.artists.sortedBy { it.name.lowercase() }
        }
    }
    val sortedTracks = remember(ui.tracks, sort, ui.playCounts) {
        when (sort) {
            1 -> ui.tracks.sortedByDescending { it.title.lowercase() }
            2 -> ui.tracks.sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }
            else -> ui.tracks.sortedBy { it.title.lowercase() }
        }
    }

    Column(Modifier.fillMaxWidth()) {
        // Large title + the red "new playlist" action beside it (Apple Music header).
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LargeTitle("Bibliothèque", Modifier.weight(1f))
            Box(
                Modifier
                    .clip(CircleShape)
                    .background(colors.accent)
                    .clickable { showCreate = true }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) { Text("+ Nouvelle", color = colors.ink, style = AMType.Footnote, fontWeight = FontWeight.Bold) }
        }
        // Secondary destinations (also reachable here, mirroring the web's "Plus" hub).
        // "Titres aimés" leads the list — the library's pinned Liked-Songs entry.
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PlusChip("❤ Titres aimés") { vm.navigate(ViewId.FAVORITES) }
            PlusChip("Récents") { vm.navigate(ViewId.RECENTS) }
            PlusChip("Dossiers") { vm.navigate(ViewId.FOLDERS) }
            PlusChip("Analyse") { vm.navigate(ViewId.INSIGHTS) }
        }
        // Apple Music's library tabs: icon + label, active one in the red accent.
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEachIndexed { i, t ->
                val active = i == tab
                Row(
                    Modifier
                        .clip(CircleShape)
                        .background(if (active) colors.accent.copy(alpha = 0.14f) else Color.Transparent)
                        .clickable { tab = i }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(t.icon, null, tint = if (active) colors.accent else colors.textMuted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(
                        t.label,
                        color = if (active) colors.accent else colors.textMuted,
                        style = AMType.Subhead,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
                if (i != tabs.lastIndex) Spacer(Modifier.width(4.dp))
            }
        }
        if (tab != 0) {
            Row(
                Modifier
                    .horizontalScroll(rememberScrollState())
                    .padding(start = 16.dp, end = 16.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val sortLabel = when (sort) { 1 -> "Z→A"; 2 -> if (tab == 2) "Année" else "Écoutes"; else -> "A→Z" }
                PlusChip("Tri : $sortLabel") { sort = (sort + 1) % 3 }
                if (tab == 1 || tab == 2) PlusChip(if (grid) "Vue liste" else "Vue grille") { grid = !grid }
            }
        }
        // Chunk grid cards into rows so they can be WINDOWED by the LazyColumn (only
        // on-screen rows compose). The old single `item { GridOf… }` composed every
        // album/artist card at once — thousands of nodes + art fetches in one frame on
        // a large catalogue, the exact "crash at 10k" the windowing is meant to avoid.
        val albumRows = remember(sortedAlbums) { sortedAlbums.chunked(2) }
        val artistRows = remember(sortedArtists) { sortedArtists.chunked(3) }
        when (tab) {
            0 -> {
                val ordered = remember(ui.playlists) { ui.playlists.sortedWith(compareByDescending { it.pinned }) }
                LazyColumn(contentPadding = bottomPad) {
                    items(ordered, key = { it.id }) { pl ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f)) {
                                PlaylistTile(if (pl.pinned) "📌 ${pl.name}" else pl.name, pl.trackhashes.size, pl.id) { vm.navigate(ViewId.PLAYLIST, pl.id) }
                            }
                            Text(if (pl.pinned) "📌" else "📍", fontSize = 14.sp, modifier = Modifier.clickable { vm.togglePin(pl.id) }.padding(6.dp))
                            Text("▲", color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.clickable { vm.movePlaylist(pl.id, -1) }.padding(6.dp))
                            Text("▼", color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.clickable { vm.movePlaylist(pl.id, 1) }.padding(6.dp))
                        }
                    }
                    if (ui.playlists.isEmpty()) item { EmptyHint("Aucune playlist", "Touche « + Nouvelle », ou ⋮ sur un titre pour l'ajouter à une playlist.") }
                }
            }
            1 -> LazyColumn(contentPadding = bottomPad) {
                if (grid) itemsIndexed(artistRows, key = { _, row -> row.first().artisthash }) { i, rowItems ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = if (i == 0) 0.dp else 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        rowItems.forEach { a -> Box(Modifier.weight(1f)) { ArtistCard(a, Modifier.fillMaxWidth()) { vm.navigate(ViewId.ARTIST, a.artisthash) } } }
                        repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                else items(sortedArtists, key = { it.artisthash }) { a -> ArtistRow(a) { vm.navigate(ViewId.ARTIST, a.artisthash) } }
            }
            2 -> LazyColumn(contentPadding = bottomPad) {
                if (grid) itemsIndexed(albumRows, key = { _, row -> row.first().albumhash }) { i, rowItems ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = if (i == 0) 0.dp else 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        rowItems.forEach { a -> Box(Modifier.weight(1f)) { AlbumCard(a, Modifier.fillMaxWidth()) { vm.navigate(ViewId.ALBUM, a.albumhash) } } }
                        if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                else items(sortedAlbums, key = { it.albumhash }) { a -> AlbumRow(a) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
            }
            3 -> LazyColumn(contentPadding = bottomPad) {
                itemsIndexed(sortedTracks, key = { _, t -> t.trackhash }) { idx, t ->
                    TrackRow(
                        t, index = idx, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, sortedTracks, idx) },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
                }
            }
        }
    }
}

@Composable
private fun PlusChip(label: String, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        Modifier.clip(CircleShape).background(colors.panel2).clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Text(label, color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Per-artist play totals from the user's OWN play counts. The shared catalogue is
// user-independent (server now sends artist.playcount = 0), so any "most played"
// artist ranking/label is derived here — mirrors the web client's artistPlayTotals.
private fun artistPlayTotals(tracks: List<Track>, playCounts: Map<String, Int>): Map<String, Int> {
    val totals = HashMap<String, Int>()
    for (t in tracks) {
        val c = playCounts[t.trackhash] ?: 0
        if (c == 0) continue
        for (a in t.artists) {
            if (a.artisthash.isNotBlank()) totals[a.artisthash] = (totals[a.artisthash] ?: 0) + c
        }
    }
    return totals
}

@Composable
private fun AlbumRow(album: local.auralis.client.model.Album, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 7.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        local.auralis.client.ui.components.CoverArt(album.image, album.albumhash, Modifier.size(46.dp), cornerRadius = 8, sizeDp = 46)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(album.title, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(album.artistName, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        album.year?.let { Text("$it", color = colors.textFaint, fontSize = 12.sp) }
    }
}

@Composable
private fun ArtistRow(artist: local.auralis.client.model.Artist, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(Modifier.fillMaxWidth().clickable { onClick() }.padding(vertical = 7.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(46.dp).clip(CircleShape)) {
            local.auralis.client.ui.components.CoverArt(artist.image, artist.artisthash, Modifier.size(46.dp).clip(CircleShape), sizeDp = 46)
        }
        Spacer(Modifier.width(12.dp))
        Text(artist.name, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        artist.trackcount?.let { Text("$it titres", color = colors.textFaint, fontSize = 12.sp) }
    }
}

// ============================ FAVORITES ===================================

@Composable
fun FavoritesScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    var sort by remember { mutableStateOf(0) }
    val base = remember(ui.tracks, ui.favorites) { ui.tracks.filter { ui.favorites.contains(it.trackhash) } }
    val orderIndex = remember(ui.favoritesOrder) { ui.favoritesOrder.withIndex().associate { (i, h) -> h to i } }
    val favTracks = remember(base, sort, orderIndex, ui.playCounts) {
        when (sort) {
            1 -> base.sortedBy { it.title.lowercase() }
            2 -> base.sortedByDescending { it.title.lowercase() }
            3 -> base.sortedBy { it.displayArtist.lowercase() }
            4 -> base.sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }
            else -> base.sortedBy { orderIndex[it.trackhash] ?: Int.MAX_VALUE }
        }
    }
    val sortLabel = when (sort) { 1 -> "A→Z"; 2 -> "Z→A"; 3 -> "Artiste"; 4 -> "Écoutes"; else -> "Récents" }
    val current = currentTrackOf(vm)
    val totalDur = favTracks.sumOf { it.duration ?: 0.0 }
    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow("Favoris")
                Text("Tes titres aimés", style = AMType.Title1, color = colors.foreground)
                Spacer(Modifier.height(4.dp))
                Text("${favTracks.size} titres · ${formatLongDuration(totalDur)}", color = colors.textMuted, fontSize = 13.sp)
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PlayPill("Lire") { vm.playList(favTracks) }
                    GhostPill("Aléatoire") { vm.playShuffled(favTracks) }
                    PlusChip("Tri : $sortLabel") { sort = (sort + 1) % 5 }
                }
            }
        }
        itemsIndexed(favTracks, key = { _, t -> t.trackhash }) { idx, t ->
            TrackRow(
                t, isCurrent = t.trackhash == current, isFavorite = true,
                onClick = { vm.playTrack(t, favTracks, idx) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
        if (favTracks.isEmpty()) item { EmptyHint("Aucun favori", "Touche le ♥ sur un titre pour l'ajouter.") }
    }
}

// ============================ RECENTS =====================================

@Composable
fun RecentsScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val recents = remember(ui.recents, ui.trackByHash) { ui.recents.mapNotNull { ui.trackByHash[it] } }
    val current = currentTrackOf(vm)
    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow("Historique")
                Text("Récents", style = AMType.Title1, color = colors.foreground)
                Text("${recents.size} lus", color = colors.textMuted, fontSize = 13.sp)
            }
        }
        itemsIndexed(recents, key = { _, t -> t.trackhash }) { idx, t ->
            TrackRow(
                t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                onClick = { vm.playTrack(t, recents, idx) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
        if (recents.isEmpty()) item { EmptyHint("Rien encore", "Tes lectures récentes apparaîtront ici.") }
    }
}

// ============================ FOLDERS =====================================

@Composable
fun FoldersScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    var path by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    val current = currentTrackOf(vm)

    // flatten folder tree to find children of `path`
    fun allNodes(): List<local.auralis.client.model.FolderNode> {
        val out = ArrayList<local.auralis.client.model.FolderNode>()
        fun walk(n: local.auralis.client.model.FolderNode) { out.add(n); n.children.forEach { walk(it) } }
        ui.folders.forEach { walk(it) }
        return out
    }
    val nodes = remember(ui.folders) { allNodes() }
    val rootPath = ui.folders.firstOrNull()?.path
    val activePath = path ?: rootPath
    val activeNode = nodes.find { it.path == activePath }
    val subfolders = activeNode?.children ?: ui.folders
    val tracksHere = remember(ui.tracks, activePath) {
        if (activePath != null) ui.tracks.filter { it.folder != null && it.folder.startsWith(activePath) } else emptyList()
    }

    val directTracks = remember(ui.tracks, activePath) { ui.tracks.filter { it.folder == activePath } }

    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow("Dossiers")
                Text(activeNode?.name ?: "Bibliothèque", fontSize = 24.sp, fontWeight = FontWeight.Black, color = colors.foreground)
                if (activePath != rootPath && activePath != null) {
                    Spacer(Modifier.height(6.dp))
                    Text("← Remonter", color = colors.textMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable {
                            path = nodes.find { n -> n.children.any { it.path == activePath } }?.path ?: rootPath
                        })
                }
                if (tracksHere.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PlayPill("Lire le dossier") { vm.playList(tracksHere) }
                        GhostPill("Aléatoire") { vm.playShuffled(tracksHere) }
                    }
                }
            }
        }
        items(subfolders) { f ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { path = f.path }
                    .padding(vertical = 10.dp, horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)).background(colors.panel2), contentAlignment = Alignment.Center) {
                    Text("📁", fontSize = 18.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.name, color = colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${f.trackcount} titres", color = colors.textMuted, fontSize = 12.sp)
                }
            }
        }
        itemsIndexed(directTracks, key = { _, t -> t.trackhash }) { idx, t ->
            TrackRow(
                t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                onClick = { vm.playTrack(t, directTracks, idx) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
    }
}

// ============================ INSIGHTS ====================================

@Composable
fun InsightsScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val stats = ui.stats
    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow("Analyse")
                Text("Tes statistiques", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
            }
        }
        item { MoodRecapSection(vm, ui) }
        item {
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Kpi("Série", "${stats.streak} j", Modifier.weight(1f))
                Kpi("Cette semaine", "${stats.weekPlays}", Modifier.weight(1f))
                Kpi("Total", "${stats.totalPlays}", Modifier.weight(1f))
            }
        }
        item {
            Spacer(Modifier.height(12.dp))
            SectionHeader("7 derniers jours")
            val maxC = (stats.playsByDay.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1)
            Row(Modifier.fillMaxWidth().height(120.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                stats.playsByDay.forEach { d ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                        Box(
                            Modifier.fillMaxWidth(0.7f)
                                .height((8 + (d.count.toFloat() / maxC) * 100).dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(colors.accent),
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(d.day.takeLast(2), color = colors.textFaint, fontSize = 10.sp)
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(20.dp))
            SectionHeader("Artistes les plus écoutés")
        }
        val artistPlays = artistPlayTotals(ui.tracks, ui.playCounts)
        val topArtists = ui.artists
            .filter { (artistPlays[it.artisthash] ?: 0) > 0 }
            .sortedByDescending { artistPlays[it.artisthash] ?: 0 }
            .take(8)
        items(topArtists) { a ->
            Row(Modifier.fillMaxWidth().clickable { vm.navigate(ViewId.ARTIST, a.artisthash) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(a.name, color = colors.foreground, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${artistPlays[a.artisthash] ?: 0} écoutes", color = colors.textMuted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun Kpi(label: String, value: String, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Column(modifier.clip(RoundedCornerShape(14.dp)).background(colors.panel).padding(14.dp)) {
        Text(value, color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Text(label, color = colors.textMuted, fontSize = 12.sp)
    }
}

// ============================ MONTHLY MOOD RECAP ==========================

@Composable
private fun MoodRecapSection(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    if (ui.recapMonths.isEmpty()) return
    val recap = ui.recap
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        SectionHeader("Ton mois en émotions")

        // Period selector.
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            items(ui.recapMonths.take(12)) { m ->
                val selected = m == recap?.month
                Box(
                    Modifier.clip(CircleShape)
                        .background(if (selected) colors.accent else colors.panel)
                        .clickable { vm.selectRecapMonth(m) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(
                        recapMonthChip(m),
                        color = if (selected) colors.ink else colors.textMuted,
                        fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        if (recap != null && recap.totalPlays > 0) {
            val mood = Moods.byId(recap.dominantMood)
            val c0 = hexColor(mood?.c0 ?: "#3b3b54")
            val c1 = hexColor(mood?.c1 ?: "#23233a")

            // Dominant-mood hero.
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(Brush.linearGradient(listOf(c0, c1)))
                    .padding(18.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(mood?.emoji ?: "🎧", fontSize = 34.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            "${recap.label}${if (recap.inProgress) " · en cours" else ""}".uppercase(),
                            color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        )
                        Text(
                            (recap.moodWord ?: mood?.label ?: "—").replaceFirstChar { it.uppercase() },
                            color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(recap.narrative, color = Color.White.copy(alpha = 0.92f), fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    RecapStat("${recap.totalPlays}", "écoutes")
                    RecapStat(formatRecapTime(recap.listeningSeconds), "d'écoute")
                    RecapStat("${recap.distinctTracks}", "titres")
                }
            }

            // Mood palette.
            Spacer(Modifier.height(14.dp))
            recap.moods.take(6).forEach { ms ->
                val mi = Moods.byId(ms.mood)
                Column(Modifier.padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${mi?.emoji ?: "•"}  ${mi?.label ?: ms.mood}",
                            color = colors.foreground, fontSize = 13.sp,
                            modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Text("${(ms.share * 100).toInt()}%", color = colors.textMuted, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(4.dp))
                    Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(colors.panel2)) {
                        Box(
                            Modifier.fillMaxWidth(ms.share.toFloat().coerceIn(0.03f, 1f)).height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(Brush.linearGradient(listOf(hexColor(mi?.c0 ?: "#888888"), hexColor(mi?.c1 ?: "#555555")))),
                        )
                    }
                }
            }

            // Standout tracks of the month.
            val topTracks = recap.topTracks.mapNotNull { ref -> ui.trackByHash[ref.trackhash]?.let { it to ref.plays } }
            if (topTracks.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Text("Titres du mois", color = colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                topTracks.forEachIndexed { i, pair ->
                    val t = pair.first
                    Row(
                        Modifier.fillMaxWidth().clickable { vm.playList(topTracks.map { it.first }, i) }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        local.auralis.client.ui.components.CoverArt(t.image, t.albumhash ?: t.title, Modifier.size(36.dp), cornerRadius = 8, sizeDp = 36)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.title, color = colors.foreground, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(t.displayArtist, color = colors.textMuted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text("${pair.second}×", color = colors.textMuted, fontSize = 12.sp)
                    }
                }
            }
        } else {
            Text(
                recap?.narrative ?: "Lance quelques titres ce mois-ci pour révéler ton humeur.",
                color = colors.textMuted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun RecapStat(value: String, label: String) {
    Column {
        Text(value, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Black)
        Text(label, color = Color.White.copy(alpha = 0.75f), fontSize = 10.sp)
    }
}

private fun hexColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color(0xFF888888))

private fun formatRecapTime(seconds: Long): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h${if (m > 0) " ${m}m" else ""}" else "$m min"
}

private fun recapMonthChip(key: String): String {
    val months = listOf("Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.")
    val parts = key.split("-")
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 1
    return "${months.getOrElse(m - 1) { key }} ${parts.getOrNull(0)?.takeLast(2) ?: ""}"
}
