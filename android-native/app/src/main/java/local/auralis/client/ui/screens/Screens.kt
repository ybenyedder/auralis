package local.auralis.client.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
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
import local.auralis.client.model.Moods
import local.auralis.client.model.Track
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.GhostPill
import local.auralis.client.ui.components.PlayPill
import local.auralis.client.ui.components.SectionHeader
import local.auralis.client.ui.components.TrackRow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.LocalAuralis
import java.util.Calendar

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

private fun currentTrackOf(vm: AppViewModel): String? = vm.playback.value.currentId

// ============================ HOME =========================================

@Composable
fun HomeScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val greeting = if (hour in 5..17) "Bonjour" else "Bonsoir"

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

    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(top = 8.dp, bottom = 8.dp)) {
                Eyebrow(greeting)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Ta bibliothèque",
                    fontSize = 28.sp, fontWeight = FontWeight.Black, color = colors.foreground,
                )
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

        if (mix.isNotEmpty()) {
            item {
                Spacer(Modifier.height(16.dp))
                SectionHeader("Mix du jour")
                PlayPill("Lire le mix") { vm.playList(mix) }
                Spacer(Modifier.height(10.dp))
            }
            items(mix.take(5), key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, mix, mix.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }

        if (ui.forYou.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Fait pour vous")
                PlayPill("Lire le mix") { vm.playList(ui.forYou) }
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.forYou, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, ui.forYou, ui.forYou.indexOf(t)) }
                    }
                }
            }
        }

        if (recentsTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Reprendre l'écoute", "Tout voir") { vm.navigate(ViewId.RECENTS) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentsTracks.take(10), key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) }
                    }
                }
            }
        }

        if (recentlyAdded.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Récemment ajoutés")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentlyAdded, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, recentlyAdded, recentlyAdded.indexOf(t)) }
                    }
                }
            }
        }

        if (rediscover.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("À redécouvrir")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(rediscover, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, rediscover, rediscover.indexOf(t)) }
                    }
                }
            }
        }

        if (discoveries.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Découvertes")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(discoveries, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, discoveries, discoveries.indexOf(t)) }
                    }
                }
            }
        }

        if (ui.albums.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
                SectionHeader("Albums", "Tout voir") { vm.navigate(ViewId.LIBRARY) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.albums.take(12), key = { it.albumhash }) { a ->
                        AlbumCard(a) { vm.navigate(ViewId.ALBUM, a.albumhash) }
                    }
                }
            }
        }

        if (topTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(20.dp))
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
                Spacer(Modifier.height(20.dp))
                SectionHeader("Artistes")
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.artists.take(12), key = { it.artisthash }) { a ->
                        ArtistCard(a) { vm.navigate(ViewId.ARTIST, a.artisthash) }
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

@Composable
private fun MiniTrackCard(t: Track, isCurrent: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.width(130.dp).clickable { onClick() }) {
        local.auralis.client.ui.components.CoverArt(
            t.image, t.albumhash ?: t.title,
            Modifier.size(130.dp), cornerRadius = 12,
        )
        Text(
            t.title, color = if (isCurrent) colors.accent else colors.foreground,
            fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(t.displayArtist, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
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

@Composable
private fun GenreCard(genre: String, count: Int, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    val (bg, c1, _) = local.auralis.client.ui.components.paletteFor(genre)
    Column(
        Modifier.width(150.dp).height(90.dp).clip(RoundedCornerShape(14.dp))
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(bg, c1.copy(alpha = 0.6f))))
            .clickable { onClick() }
            .padding(12.dp),
        verticalArrangement = Arrangement.Bottom,
    ) {
        Text(genre, color = colors.foreground, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text("$count titres", color = colors.foreground.copy(alpha = 0.8f), fontSize = 11.sp)
    }
}

// ============================ SEARCH (Explore) =============================

@Composable
fun SearchScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val current = currentTrackOf(vm)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = ui.searchQuery,
            onValueChange = { vm.setSearch(it) },
            placeholder = { Text("Rechercher titres, albums, artistes", color = colors.textFaint) },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = colors.textMuted) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = colors.accent,
                unfocusedBorderColor = colors.lineStrong,
                focusedTextColor = colors.foreground,
                unfocusedTextColor = colors.foreground,
                cursorColor = colors.accent,
            ),
        )
        Spacer(Modifier.height(8.dp))
        val res = ui.searchResult
        if (ui.searchQuery.isBlank()) {
            val catalogue = remember(ui.tracks) { ui.tracks.take(40) }
            val genres = remember(ui.tracks) {
                ui.tracks.filter { !it.genre.isNullOrBlank() }
                    .groupBy { it.genre!! }.filter { it.value.size >= 5 }
                    .entries.sortedByDescending { it.value.size }.take(12)
            }
            val history = remember(ui.recents, ui.trackByHash) { ui.recents.mapNotNull { ui.trackByHash[it] }.take(12) }
            LazyColumn(contentPadding = PaddingValues(bottom = 170.dp)) {
                if (genres.isNotEmpty()) {
                    item { SectionHeader("Tes mix par genre") }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(genres) { e -> GenreCard(e.key, e.value.size) { vm.playShuffled(e.value) } }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                if (history.isNotEmpty()) {
                    item { SectionHeader("Historique") }
                    items(history) { t ->
                        TrackRow(
                            t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                            onClick = { vm.playTrack(t, history, history.indexOf(t)) },
                            onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                        )
                    }
                }
                item { SectionHeader("Catalogue") }
                items(catalogue) { t ->
                    TrackRow(
                        t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, catalogue, catalogue.indexOf(t)) },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
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
                    items(res.tracks) { t ->
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
    val tabs = listOf("Albums", "Artistes", "Titres", "Playlists")
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
    val sortedArtists = remember(ui.artists, sort) {
        when (sort) {
            1 -> ui.artists.sortedByDescending { it.name.lowercase() }
            2 -> ui.artists.sortedByDescending { it.playcount ?: 0 }
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
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            tabs.forEachIndexed { i, label ->
                val active = i == tab
                val count = when (i) { 0 -> ui.albums.size; 1 -> ui.artists.size; 2 -> ui.tracks.size; else -> ui.playlists.size }
                Box(
                    Modifier.clip(CircleShape)
                        .background(if (active) colors.accent else colors.panel2)
                        .clickable { tab = i }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text("$label · $count", color = if (active) colors.ink else colors.textMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        // Secondary destinations (also reachable here, mirroring the web's "Plus" hub).
        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PlusChip("Récents") { vm.navigate(ViewId.RECENTS) }
            PlusChip("Dossiers") { vm.navigate(ViewId.FOLDERS) }
            PlusChip("Analyse") { vm.navigate(ViewId.INSIGHTS) }
        }
        if (tab != 3) {
            Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val sortLabel = when (sort) { 1 -> "Z→A"; 2 -> if (tab == 0) "Année" else "Écoutes"; else -> "A→Z" }
                PlusChip("Tri : $sortLabel") { sort = (sort + 1) % 3 }
                if (tab == 0 || tab == 1) PlusChip(if (grid) "Vue liste" else "Vue grille") { grid = !grid }
            }
        }
        // Chunk grid cards into rows so they can be WINDOWED by the LazyColumn (only
        // on-screen rows compose). The old single `item { GridOf… }` composed every
        // album/artist card at once — thousands of nodes + art fetches in one frame on
        // a large catalogue, the exact "crash at 10k" the windowing is meant to avoid.
        val albumRows = remember(sortedAlbums) { sortedAlbums.chunked(2) }
        val artistRows = remember(sortedArtists) { sortedArtists.chunked(3) }
        when (tab) {
            0 -> LazyColumn(contentPadding = bottomPad) {
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
                itemsIndexed(sortedTracks, key = { _, t -> t.trackhash }) { idx, t ->
                    TrackRow(
                        t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, sortedTracks, idx) },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
                }
            }
            3 -> {
                val ordered = remember(ui.playlists) { ui.playlists.sortedWith(compareByDescending { it.pinned }) }
                LazyColumn(contentPadding = bottomPad) {
                    item {
                        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Playlists", fontSize = 18.sp, fontWeight = FontWeight.Black, color = colors.foreground, modifier = Modifier.weight(1f))
                            Box(
                                Modifier.clip(CircleShape).background(colors.accent).clickable { showCreate = true }
                                    .padding(horizontal = 14.dp, vertical = 8.dp),
                            ) { Text("+ Nouvelle", color = colors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                        }
                    }
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
                Text("Tes titres aimés", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
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
                Text("Récents", fontSize = 26.sp, fontWeight = FontWeight.Black, color = colors.foreground)
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
        val topArtists = ui.artists.sortedByDescending { it.playcount ?: 0 }.take(8).filter { (it.playcount ?: 0) > 0 }
        items(topArtists) { a ->
            Row(Modifier.fillMaxWidth().clickable { vm.navigate(ViewId.ARTIST, a.artisthash) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(a.name, color = colors.foreground, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${a.playcount} écoutes", color = colors.textMuted, fontSize = 12.sp)
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
