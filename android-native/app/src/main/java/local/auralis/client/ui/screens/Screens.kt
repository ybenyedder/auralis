package local.auralis.client.ui.screens

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.model.Album
import local.auralis.client.model.Artist
import local.auralis.client.model.DownloadJobDto
import local.auralis.client.model.MoodMix
import local.auralis.client.model.MoodRecs
import local.auralis.client.model.Moods
import local.auralis.client.model.OnlineTrack
import local.auralis.client.model.PlaylistDto
import local.auralis.client.model.Track
import local.auralis.client.model.dailyMoodMixes
import local.auralis.client.model.moodRecs
import local.auralis.client.playback.QueueSource
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.components.Eyebrow
import local.auralis.client.ui.components.GhostPill
import local.auralis.client.ui.components.IconAction
import local.auralis.client.ui.components.LargeTitle
import local.auralis.client.ui.components.MenuDivider
import local.auralis.client.ui.components.MenuRow
import local.auralis.client.ui.components.MenuSheetScaffold
import local.auralis.client.ui.components.NetworkImage
import local.auralis.client.ui.components.PlayPill
import local.auralis.client.ui.components.SectionHeader
import local.auralis.client.ui.components.TrackRow
import local.auralis.client.ui.components.formatLongDuration
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

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

/**
 * Heavy derivation off the UI thread. Same recomputation semantics as
 * `remember(keys) { compute() }` — it reruns whenever any key changes — but the
 * computation runs on Dispatchers.Default and the PREVIOUS value keeps rendering
 * while a recomputation is in flight, so sorting or grouping a 10k library never
 * blocks composition (the synchronous remembers used to do the full pass on the
 * main thread at every library update / sort toggle).
 */
@Composable
internal fun <T> derivedAsync(vararg keys: Any?, initial: T, compute: suspend () -> T): T =
    produceState(initial, *keys) { value = withContext(Dispatchers.Default) { compute() } }.value

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
    // Every full-library pass of the home screen (favourite/recent pool, "added"
    // sort, most-played sort, rediscover, discoveries, mood shelves) derived off
    // the main thread.
    val home = derivedAsync(ui.tracks, ui.favorites, ui.playCounts, ui.recents, ui.dislikes, ui.recoScores, ui.moodAffinities, daySeed, initial = HomeDerived.EMPTY) {
        val neverPlayed = ui.tracks.filter { (ui.playCounts[it.trackhash] ?: 0) == 0 }
        val recentSet = ui.recents.take(30).toSet()
        val recs = moodRecs(ui.tracks, ui.playCounts, ui.dislikes, ui.moodAffinities, ui.recoScores)
        HomeDerived(
            topTracks = ui.tracks.sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }
                .filter { (ui.playCounts[it.trackhash] ?: 0) > 0 }.take(5),
            rediscover = ui.tracks.filter { ui.favorites.contains(it.trackhash) && it.trackhash !in recentSet }.take(12),
            discoveries = if (neverPlayed.size >= 4) seededShuffle(neverPlayed, daySeed + 7).take(12) else emptyList(),
            favTracks = ui.tracks.filter { ui.favorites.contains(it.trackhash) },
            moodMixes = dailyMoodMixes(ui.tracks, ui.dislikes, ui.recoScores),
            moodRecs = recs,
        )
    }
    val current = currentTrackOf(vm)
    val quickTiles = buildList {
        if (home.favTracks.isNotEmpty()) {
            add(
                QuickTileItem(
                    "liked", tr("home.likedTracks"), null, null, null, liked = true,
                    onOpen = { vm.navigate(ViewId.FAVORITES) },
                    // "Titres likés" plays a shuffled queue of the liked tracks
                    // ONLY — the continuation stays inside the liked set.
                    onPlay = { vm.playShuffled(home.favTracks, QueueSource.Favorites(ui.favorites)) },
                ),
            )
        }
        recentsTracks.take((8 - size).coerceAtLeast(0)).forEach { t ->
            add(
                QuickTileItem(
                    t.trackhash, t.title, t.displayArtist, t.image, t.albumhash ?: t.title, liked = false,
                    // Tile body → the album page; only the round play button plays.
                    onOpen = {
                        val hash = t.albumhash
                        if (hash != null) vm.navigate(ViewId.ALBUM, hash)
                        else vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t))
                    },
                    onPlay = { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) },
                ),
            )
        }
    }

    LazyColumn(contentPadding = bottomPad) {
        // Large title (Apple Music opens each tab with a 34pt title).
        item {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp)) {
                LargeTitle(tr("nav.home"))
            }
        }

        if (ui.tracks.isEmpty()) {
            item {
                EmptyHint(
                    tr("library.emptyNoTracks"),
                    tr("empty.setupLibraryHint"),
                )
            }
            return@LazyColumn
        }

        // "Pour vous" — Apple Music's top hero shelf: large editorial cards.
        if (ui.forYou.isNotEmpty()) {
            item {
                SectionHeader(tr("home.forYou"), tr("common.playAll")) { vm.playList(ui.forYou) }
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

        // "Jamais écoutés" hero — the discovery entry point on the ACCUEIL tab,
        // where users look for it.
        if (ui.tracks.any { (ui.playCounts[it.trackhash] ?: 0) == 0 && it.trackhash !in ui.dislikes }) {
            item {
                Spacer(Modifier.height(16.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                        .clip(AMShapes.card)
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF1E3A8A), Color(0xFF4F46E5)),
                            ),
                        )
                        .clickable { vm.playUnheardMix() }
                        .padding(20.dp),
                ) {
                    Column(Modifier.align(Alignment.BottomStart)) {
                        Text(tr("home.unheardTitle"), color = Color.White, style = AMType.Title1)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tr("home.unheardSub"),
                            color = Color.White.copy(alpha = 0.85f), style = AMType.Subhead,
                        )
                    }
                    Icon(
                        Icons.Filled.PlayArrow, tr("home.playUnheardMix"),
                        tint = Color.White, modifier = Modifier.align(Alignment.BottomEnd).size(44.dp),
                    )
                }
            }
        }

        // "Vos mix du jour" (web DailyMixes): the weekly "À découvrir cette semaine"
        // mix (server ?mode=discovery, frozen per ISO week) + one taste-ranked mix
        // per mood (engine scores re-rank each bucket; dislikes excluded).
        if (home.moodMixes.isNotEmpty() || ui.discoverTracks.size >= 4) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("home.dailyMixes"))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (ui.discoverTracks.size >= 4) {
                        item {
                            MixCard(
                                label = tr("home.discoverWeek"),
                                sublabel = tr("home.unheardTracks", params = mapOf("count" to ui.discoverTracks.size)),
                                c0 = Color(0xFF1E3A8A), c1 = Color(0xFF4F46E5),
                                covers = ui.discoverTracks, icon = true,
                            ) { vm.playList(ui.discoverTracks) }
                        }
                    }
                    items(home.moodMixes, key = { it.moodId }) { m ->
                        val mood = Moods.byId(m.moodId)
                        MixCard(
                            label = m.label,
                            sublabel = tr("common.tracksCount", params = mapOf("count" to m.tracks.size)),
                            c0 = hexColor(mood?.c0 ?: "#888888"), c1 = hexColor(mood?.c1 ?: "#555555"),
                            covers = m.tracks,
                        ) { vm.playList(m.tracks) }
                    }
                }
            }
        }

        // "Blend du foyer" (web BlendShelf): one card per other account, each a
        // mix that averages both tastes (engine-side) + its match score.
        if (ui.blendMembers.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("home.blend"))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(ui.blendMembers, key = { it.username }) { m ->
                        val (c0, c1, _) = local.auralis.client.ui.components.paletteFor(m.username)
                        Box(
                            Modifier.width(160.dp).height(120.dp)
                                .clip(AMShapes.card)
                                .background(Brush.linearGradient(listOf(c0, c1)))
                                .clickable { vm.startBlend(m.username, m.username) }
                                .padding(14.dp),
                        ) {
                            Column(Modifier.align(Alignment.BottomStart)) {
                                Text(
                                    tr("home.blendWith", params = mapOf("user" to m.username)), color = Color.White,
                                    style = AMType.Subhead, fontWeight = FontWeight.Bold,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    tr("home.blendMatch", params = mapOf("match" to m.match)),
                                    color = Color.White.copy(alpha = 0.8f), style = AMType.Caption1,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }

        // "Pour votre humeur" (web HomeView moodRecs): discovery within the vibe the
        // user already loves — the mood they listen to most (engine affinity first),
        // surfaced as tracks from it the engine scores highest / they played least.
        home.moodRecs?.let { mr ->
            val mood = Moods.byId(mr.moodId)
            item {
                Spacer(Modifier.height(24.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(44.dp).clip(AMShapes.tile)
                            .background(hexColor(mood?.c0 ?: "#888888")),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Eyebrow(tr("home.forMood"))
                        Text(mood?.label ?: mr.moodId, style = AMType.Title3, color = colors.foreground)
                    }
                    Text(
                        tr("common.playAll"), color = colors.accent, style = AMType.Subhead,
                        modifier = Modifier.clickable { vm.playList(mr.recs) },
                    )
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(mr.recs, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, mr.recs, mr.recs.indexOf(t)) }
                    }
                }
            }
        }

        if (recentsTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("nav.recents"), tr("common.showAll")) { vm.navigate(ViewId.RECENTS) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(recentsTracks.take(10), key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, recentsTracks, recentsTracks.indexOf(t)) }
                    }
                }
            }
        }

        if (home.rediscover.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("home.rediscover"), tr("common.playAll")) { vm.playList(home.rediscover) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(home.rediscover, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, home.rediscover, home.rediscover.indexOf(t)) }
                    }
                }
            }
        }

        // "Découvertes" — the SERVER's ?mode=discovery mix (taste-ranked never-played
        // tracks, frozen per ISO week) replaces the purely-local sample; the local
        // fallback keeps the shelf alive before the first fetch / offline.
        val discover = if (ui.discoverTracks.isNotEmpty()) ui.discoverTracks else home.discoveries
        if (discover.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("home.discoveries"), tr("common.playAll")) {
                    if (ui.discoverTracks.isNotEmpty()) vm.playList(ui.discoverTracks) else vm.playUnheardMix()
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(discover, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, discover, discover.indexOf(t)) }
                    }
                }
            }
        }

        if (home.topTracks.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("home.topTracks"))
            }
            items(home.topTracks, key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, home.topTracks, home.topTracks.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }
    }
}

// Full-library derivations of HomeScreen, computed by derivedAsync.
private class HomeDerived(
    val topTracks: List<Track>,
    val rediscover: List<Track>,
    val discoveries: List<Track>,
    val favTracks: List<Track>,
    val moodMixes: List<MoodMix>,
    val moodRecs: MoodRecs?,
) {
    companion object {
        val EMPTY = HomeDerived(emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), null)
    }
}

/** Apple Music "top picks" hero card: near-full-width editorial art with the
 *  red play control overlaid, title + artist beneath. */
@Composable
private fun LazyItemScope.HeroTrackCard(t: Track, isCurrent: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.animateItem(placementSpec = Motion.placement).width(290.dp).clickable { onClick() }) {
        Box {
            local.auralis.client.ui.components.CoverArt(
                t.image, t.albumhash ?: t.title,
                Modifier.fillMaxWidth().aspectRatio(1.6f), cornerRadius = Radius.md.value.toInt(),
            )
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(10.dp)
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(colors.accent)
                    .clickable { onClick() }
                    // The card itself is the accessible play control; this overlay
                    // would otherwise be announced as a second, identical "Lire"
                    // target for the exact same action.
                    .clearAndSetSemantics {},
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.PlayArrow, null, tint = colors.ink, modifier = Modifier.size(20.dp))
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
    val daySeed = System.currentTimeMillis() / 86_400_000L
    // recentAlbums is O(tracks x albums) (a firstOrNull scan per newest track) and
    // the genre grouping walks the whole library — derive off the main thread.
    val derived = derivedAsync(ui.tracks, ui.albums, ui.playCounts, daySeed, initial = NewDerived.EMPTY) {
        val newestPerAlbum = ui.tracks.filter { it.addedAt != null }
            .sortedByDescending { it.addedAt }
            .distinctBy { it.albumhash }
            .mapNotNull { t -> ui.albums.firstOrNull { it.albumhash == t.albumhash } }
        val neverPlayed = ui.tracks.filter { (ui.playCounts[it.trackhash] ?: 0) == 0 }
        NewDerived(
            recentAlbums = newestPerAlbum.ifEmpty { ui.albums.sortedByDescending { it.year ?: 0 } },
            recentTracks = ui.tracks.filter { it.addedAt != null }.sortedByDescending { it.addedAt }.take(15),
            genres = ui.tracks.filter { !it.genre.isNullOrBlank() }
                .groupBy { it.genre!! }
                .entries.sortedByDescending { it.value.size },
            discoveries = if (neverPlayed.size >= 4) seededShuffle(neverPlayed, daySeed + 7).take(12) else emptyList(),
        )
    }

    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(top = 6.dp, bottom = 12.dp)) { LargeTitle(tr("nav.new")) }
        }
        // Guard on the raw library, not the async list: while the first derivation is
        // still running we must not flash the "nothing new" hint.
        if (ui.tracks.isEmpty() && ui.albums.isEmpty()) {
            item { EmptyHint(tr("new.nothingNew"), tr("new.nothingNewHint")) }
            return@LazyColumn
        }
        if (derived.recentAlbums.isNotEmpty()) {
            item {
                SectionHeader(tr("new.newAlbums"), tr("common.showAll")) { vm.navigate(ViewId.LIBRARY) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(derived.recentAlbums.take(12), key = { it.albumhash }) { a ->
                        AlbumCard(a, onPlay = { vm.playList(ui.tracks.filter { t -> t.albumhash == a.albumhash }) }, onLongPress = { vm.openAlbumMenu(a) }) { vm.navigate(ViewId.ALBUM, a.albumhash) }
                    }
                }
            }
        }
        if (derived.recentTracks.isNotEmpty()) {
            item { Spacer(Modifier.height(24.dp)); SectionHeader(tr("home.recentlyAdded")) }
            items(derived.recentTracks, key = { it.trackhash }) { t ->
                TrackRow(
                    t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                    onClick = { vm.playTrack(t, derived.recentTracks, derived.recentTracks.indexOf(t)) },
                    onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                )
            }
        }
        if (derived.discoveries.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("new.freshDiscovered"), tr("common.playAll")) { vm.playList(derived.discoveries) }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(derived.discoveries, key = { it.trackhash }) { t ->
                        MiniTrackCard(t, t.trackhash == current) { vm.playTrack(t, derived.discoveries, derived.discoveries.indexOf(t)) }
                    }
                }
            }
        }
        if (derived.genres.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                SectionHeader(tr("new.byGenre"))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(derived.genres.take(10), key = { it.key }) { e -> GenreCard(e.key, e.value.size) { vm.playShuffled(e.value) } }
                }
            }
        }
    }
}

// Full-library derivations of NewScreen, computed by derivedAsync.
private class NewDerived(
    val recentAlbums: List<Album>,
    val recentTracks: List<Track>,
    val genres: List<Map.Entry<String, List<Track>>>,
    val discoveries: List<Track>,
) {
    companion object {
        val EMPTY = NewDerived(emptyList(), emptyList(), emptyList(), emptyList())
    }
}

private class QuickTileItem(
    val key: String, val title: String, val subtitle: String?, val image: String?, val seed: String?,
    val liked: Boolean, val onOpen: () -> Unit, val onPlay: () -> Unit,
)

/** Apple Music–style "quick access" tile: a squat horizontal card (art flush-left,
 * bold title) with a red circular play button — the home screen's quick-jump row. */
@Composable
private fun LazyItemScope.QuickTile(tile: QuickTileItem, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Row(
        modifier
            .animateItem(placementSpec = Motion.placement)
            .height(56.dp)
            .clip(AMShapes.tile)
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
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(tile.title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (tile.subtitle != null) {
                Text(tile.subtitle, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            Icon(Icons.Filled.PlayArrow, tr("common.play"), tint = colors.ink, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
private fun LazyItemScope.MiniTrackCard(t: Track, isCurrent: Boolean, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Column(Modifier.animateItem(placementSpec = Motion.placement).width(160.dp).clickable { onClick() }) {
        Box {
            local.auralis.client.ui.components.CoverArt(
                t.image, t.albumhash ?: t.title,
                Modifier.size(160.dp), cornerRadius = Radius.md.value.toInt(),
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
                Icon(Icons.Filled.PlayArrow, tr("common.play"), tint = Color.White, modifier = Modifier.size(15.dp))
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
        Text(title, color = colors.foreground, style = AMType.Headline)
        Spacer(Modifier.height(Spacing.sm))
        Text(body, color = colors.textMuted, style = Type.Caption, textAlign = TextAlign.Center)
    }
}

/** Apple Music genre tile: a squat colourful gradient card, bold white label. */
@Composable
private fun LazyItemScope.GenreCard(genre: String, count: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val (bg, c1, _) = local.auralis.client.ui.components.paletteFor(genre)
    Box(
        modifier
            .animateItem(placementSpec = Motion.placement)
            .height(88.dp)
            .clip(AMShapes.card)
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(bg, c1)))
            .clickable { onClick() }
            .padding(Spacing.md),
    ) {
        Column(Modifier.align(Alignment.BottomStart)) {
            Text(genre, color = Color.White, style = AMType.Headline, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(tr("common.tracksCount", params = mapOf("count" to count)), color = Color.White.copy(alpha = 0.8f), style = AMType.Caption1)
        }
    }
}

/** Web DailyMixes MixCard: panel card with a 4-cover mosaic (or an icon wash),
 *  bold label + muted sublabel — one tap plays the mix. */
@Composable
private fun LazyItemScope.MixCard(
    label: String,
    sublabel: String,
    c0: Color,
    c1: Color,
    covers: List<Track>,
    icon: Boolean = false,
    onPlay: () -> Unit,
) {
    val colors = LocalAuralis.current
    Column(
        Modifier
            .animateItem(placementSpec = Motion.placement)
            .width(160.dp)
            .clip(AMShapes.card)
            .background(colors.panel2)
            .clickable { onPlay() }
            .padding(Spacing.md),
    ) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(1f)
                .clip(AMShapes.tile)
                .background(Brush.linearGradient(listOf(c0, c1))),
        ) {
            if (covers.size >= 4) {
                Column(Modifier.fillMaxSize()) {
                    Row(Modifier.weight(1f).fillMaxWidth()) {
                        local.auralis.client.ui.components.CoverArt(covers[0].image, covers[0].albumhash ?: covers[0].title, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = 80)
                        local.auralis.client.ui.components.CoverArt(covers[1].image, covers[1].albumhash ?: covers[1].title, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = 80)
                    }
                    Row(Modifier.weight(1f).fillMaxWidth()) {
                        local.auralis.client.ui.components.CoverArt(covers[2].image, covers[2].albumhash ?: covers[2].title, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = 80)
                        local.auralis.client.ui.components.CoverArt(covers[3].image, covers[3].albumhash ?: covers[3].title, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = 80)
                    }
                }
            } else if (icon) {
                Icon(
                    Icons.Filled.Explore, null, tint = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.align(Alignment.Center).size(40.dp),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(label, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(sublabel, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

// ============================ SEARCH (Explore) =============================

@Composable
fun SearchScreen(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    val current = currentTrackOf(vm)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Spacer(Modifier.height(6.dp))
        LargeTitle(tr("search.title"))
        Spacer(Modifier.height(10.dp))
        // Apple Music's rounded grey search field (10pt radius, no border).
        OutlinedTextField(
            value = ui.searchQuery,
            onValueChange = { vm.setSearch(it) },
            placeholder = { Text(tr("search.placeholderMobile"), color = colors.textFaint) },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = colors.textMuted) },
            singleLine = true,
            shape = AMShapes.tile,
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
        // "Chercher en chantant" — hum/sing recognition (opens the recording sheet).
        Box(
            Modifier.clip(CircleShape).background(colors.panel2).clickable { vm.openHumSheet() }
                .padding(horizontal = 14.dp, vertical = 7.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Mic, null, tint = colors.textMuted, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(tr("search.hum"), color = colors.textMuted, style = Type.Caption, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(8.dp))
        val res = ui.searchResult
        if (ui.searchQuery.isBlank()) {
            val genres = derivedAsync(ui.tracks, initial = emptyList<Map.Entry<String, List<Track>>>()) {
                ui.tracks.filter { !it.genre.isNullOrBlank() }
                    .groupBy { it.genre!! }.filter { it.value.size >= 3 }
                    .entries.sortedByDescending { it.value.size }.take(12)
            }
            val history = remember(ui.recents, ui.trackByHash) { ui.recents.mapNotNull { ui.trackByHash[it] }.take(12) }
            LazyColumn(contentPadding = PaddingValues(bottom = 170.dp)) {
                if (history.isNotEmpty()) {
                    item { SectionHeader(tr("nav.recents")) }
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
                        SectionHeader(tr("search.browseAll"))
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
                    item { SectionHeader(tr("search.artists")) }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(res.artists) { a -> ArtistCard(a, onLongPress = { vm.openArtistMenu(a) }) { vm.navigate(ViewId.ARTIST, a.artisthash) } }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                if (res.albums.isNotEmpty()) {
                    item { SectionHeader(tr("search.albums")) }
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(res.albums) { a -> AlbumCard(a, onLongPress = { vm.openAlbumMenu(a) }) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                if (res.tracks.isNotEmpty()) {
                    item { SectionHeader(tr("search.songs")) }
                    items(res.tracks, key = { it.trackhash }) { t ->
                        TrackRow(
                            t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                            onClick = { vm.playTrack(t, res.tracks, res.tracks.indexOf(t)) },
                            onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                        )
                    }
                }
                // Downloadable online hits — shown when the library answers poorly
                // (fewer than 5 local tracks) so anything missing can be fetched.
                val showOnline = ui.onlineLoading || (ui.onlineEnabled && ui.onlineResults.isNotEmpty())
                if (showOnline && res.tracks.size < 5) {
                    item { SectionHeader(tr("search.online")) }
                    if (ui.onlineLoading) {
                        item {
                            Text(
                                tr("search.onlineSearching"),
                                color = colors.textMuted, style = Type.Label, fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(vertical = Spacing.md),
                            )
                        }
                        // Skeleton rows instead of a blank gap while the web search runs.
                        item { local.auralis.client.ui.components.SkeletonRows(3) }
                    }
                    items(ui.onlineResults, key = { "online-${it.videoId}" }) { hit ->
                        OnlineRow(hit = hit, job = ui.downloadJobs[hit.videoId]) { vm.downloadOnline(it) }
                    }
                }
                if (res.tracks.isEmpty() && res.albums.isEmpty() && res.artists.isEmpty() && !showOnline) {
                    item { EmptyHint(tr("empty.noResults"), tr("empty.noResultsHint")) }
                }
            }
        }
    }
}

/** One downloadable YouTube hit: thumbnail, title, uploader, and a button whose
 *  label follows the server-side download job (queued → % → ajouté). */
@Composable
private fun OnlineRow(hit: OnlineTrack, job: DownloadJobDto?, onDownload: (OnlineTrack) -> Unit) {
    val colors = LocalAuralis.current
    val busy = job?.busy == true
    val done = job?.status == "done"
    val failed = job?.status == "error"
    val label = when {
        done -> tr("search.downloaded")
        failed -> tr("search.downloadRetry")
        job?.status == "downloading" -> tr("search.downloadRunning", params = mapOf("progress" to job.progress.coerceIn(0, 100)))
        job?.status == "scanning" -> tr("search.downloadScanning")
        busy -> tr("search.downloadQueued")
        else -> tr("search.download")
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(AMShapes.card)
            .background(colors.panel2)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NetworkImage(
            url = hit.thumbnail,
            modifier = Modifier.size(52.dp).clip(AMShapes.thumb),
            fallback = { Box(Modifier.size(52.dp).clip(AMShapes.thumb).background(colors.panel3)) },
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(hit.title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${hit.uploader} · ${formatLongDuration(hit.duration)}",
                color = colors.textMuted, style = Type.Caption, fontWeight = FontWeight.Medium,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Row(
            Modifier
                .clip(CircleShape)
                .background(
                    when {
                        done -> colors.panel3
                        failed -> Color(0x26FF5252)
                        else -> colors.accent
                    },
                )
                .clickable(enabled = !busy && !done) { onDownload(hit) }
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (busy) {
                CircularProgressIndicator(
                    color = colors.foreground, strokeWidth = 2.dp,
                    modifier = Modifier.size(14.dp),
                )
                Spacer(Modifier.width(6.dp))
            } else {
                Icon(
                    when {
                        done -> Icons.Filled.Check
                        failed -> Icons.Filled.Close
                        else -> Icons.Filled.Download
                    },
                    contentDescription = label,
                    tint = if (failed) Color(0xFFFF6B6B) else colors.foreground,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(label, color = if (failed) Color(0xFFFF6B6B) else colors.foreground, style = Type.Caption, fontWeight = FontWeight.Bold)
        }
    }
    Spacer(Modifier.height(8.dp))
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
    // The single "+" menu holds every creation affordance: new playlist, the
    // SAF file picker (.m3u/.m3u8/.json) and the streaming-service link importer
    // (web LibraryView) — the screen itself stays focused on the content.
    var showAddMenu by remember { mutableStateOf(false) }
    var showLink by remember { mutableStateOf(false) }
    var menuPlaylist by remember { mutableStateOf<PlaylistDto?>(null) }
    var linkUrl by remember { mutableStateOf("") }
    var linkBusy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Providers label .m3u/.json with half a dozen MIME types (or none at all), so
    // accept any file and let the parser validate the content — the web importer's
    // extension check is content-sniffed there too.
    val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch(Dispatchers.IO) {
            val text = runCatching {
                context.contentResolver.openInputStream(uri)?.use { String(it.readBytes(), Charsets.UTF_8) }
            }.getOrNull()
            val name = runCatching {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                }
            }.getOrNull()
            withContext(Dispatchers.Main) {
                if (text == null) vm.notify(Messages.t("library.invalidFile"))
                else vm.importPlaylistFromText(name ?: "playlist", text)
            }
        }
    }
    // Apple Music's library order: Playlists first, then Artists, Albums, Songs.
    data class LTab(val label: String, val icon: ImageVector)
    val tabs = listOf(
        LTab(tr("library.tabPlaylists"), Icons.Filled.QueueMusic),
        LTab(tr("library.tabArtists"), Icons.Filled.Person),
        LTab(tr("library.tabAlbums"), Icons.Filled.Album),
        LTab(tr("library.tabTracks"), Icons.Filled.MusicNote),
    )
    val current = currentTrackOf(vm)

    if (showCreate) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { showCreate = false },
            containerColor = colors.panel,
            title = { Text(tr("ctx.newPlaylist"), color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = newName, onValueChange = { newName = it }, singleLine = true,
                    placeholder = { Text(tr("library.newPlaylistName"), color = colors.textFaint) },
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
                ) { Text(tr("common.create"), color = colors.accent) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showCreate = false }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }

    // Streaming-service link import: the server resolves the URL to a tracklist
    // (rate-limited 10/min per account), then it's matched against THIS library.
    if (showLink) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!linkBusy) showLink = false },
            containerColor = colors.panel,
            title = { Text(tr("library.importLink"), color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = linkUrl, onValueChange = { linkUrl = it }, singleLine = true,
                    placeholder = { Text(tr("library.linkPlaceholder"), color = colors.textFaint) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
                        focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
                    ),
                )
            },
            confirmButton = {
                androidx.compose.material3.TextButton(
                    enabled = linkUrl.isNotBlank() && !linkBusy,
                    onClick = {
                        linkBusy = true
                        vm.importPlaylistFromUrl(linkUrl.trim()) { ok ->
                            linkBusy = false
                            if (ok) { showLink = false; linkUrl = "" }
                        }
                    },
                ) { Text(if (linkBusy) tr("library.importing") else tr("library.import"), color = colors.accent) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showLink = false }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }

    // The single "+" menu: every creation affordance behind one clean button
    // (rendered in the overlay layer below, above the content).

    // Sorting the whole catalogue (and totalling artist plays — a pass over every
    // track's artist list) on each sort toggle / library update — off the main thread.
    val lib = derivedAsync(ui.albums, ui.artists, ui.tracks, ui.playCounts, sort, initial = LibraryDerived.EMPTY) {
        val artistPlays = artistPlayTotals(ui.tracks, ui.playCounts)
        val sortedAlbums = when (sort) {
            1 -> ui.albums.sortedByDescending { it.title.lowercase() }
            2 -> ui.albums.sortedByDescending { it.year ?: 0 }
            else -> ui.albums.sortedBy { it.title.lowercase() }
        }
        val sortedArtists = when (sort) {
            1 -> ui.artists.sortedByDescending { it.name.lowercase() }
            2 -> ui.artists.sortedByDescending { artistPlays[it.artisthash] ?: 0 }
            else -> ui.artists.sortedBy { it.name.lowercase() }
        }
        val sortedTracks = when (sort) {
            1 -> ui.tracks.sortedByDescending { it.title.lowercase() }
            2 -> ui.tracks.sortedByDescending { ui.playCounts[it.trackhash] ?: 0 }
            else -> ui.tracks.sortedBy { it.title.lowercase() }
        }
        LibraryDerived(
            albums = sortedAlbums,
            // Grid cards are chunked into rows here too so the LazyColumn below can
            // window them without re-chunking the catalogue on the main thread.
            albumRows = sortedAlbums.chunked(2),
            artists = sortedArtists,
            artistRows = sortedArtists.chunked(3),
            tracks = sortedTracks,
        )
    }

    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxWidth()) {
        // Large title + the single "+" action beside it (Apple Music header).
        Row(
            Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LargeTitle(tr("nav.library"), Modifier.weight(1f))
            Box(
                Modifier
                    .size(48.dp)
                    .clickable { showAddMenu = true },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(colors.accent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = tr("library.addMenu"), tint = colors.ink, modifier = Modifier.size(22.dp))
                }
            }
        }
        // The pinned Liked-Songs entry — the library's one content shortcut. (The
        // recents/folders/insights shortcuts were removed as clutter; those views
        // stay reachable from the search screen's quick-jump palette.)
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PlusChip("❤ " + tr("nav.favorites")) { vm.navigate(ViewId.FAVORITES) }
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
                val sortLabel = when (sort) {
                    1 -> tr("library.sortZA")
                    2 -> if (tab == 2) tr("library.sortYear") else tr("library.sortPlays")
                    else -> tr("library.sortAZ")
                }
                PlusChip(tr("library.sortLabel", params = mapOf("sort" to sortLabel))) { sort = (sort + 1) % 3 }
                if (tab == 1 || tab == 2) PlusChip(if (grid) tr("library.listView") else tr("library.gridView")) { grid = !grid }
            }
        }
        // Chunk grid cards into rows so they can be WINDOWED by the LazyColumn (only
        // on-screen rows compose). The old single `item { GridOf… }` composed every
        // album/artist card at once — thousands of nodes + art fetches in one frame on
        // a large catalogue, the exact "crash at 10k" the windowing is meant to avoid.
        // The chunking itself lives inside the async derivation (`lib` above).
        val albumRows = lib.albumRows
        val artistRows = lib.artistRows
        when (tab) {
            0 -> {
                val ordered = remember(ui.playlists) { ui.playlists.sortedWith(compareByDescending { it.pinned }) }
                LazyColumn(contentPadding = bottomPad) {
                    items(ordered, key = { it.id }) { pl ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.weight(1f)) {
                                PlaylistTile(if (pl.pinned) "📌 ${pl.name}" else pl.name, pl.trackhashes.size, pl.id, pl.imageHash) { vm.navigate(ViewId.PLAYLIST, pl.id) }
                            }
                            // Pin / reorder live behind ONE ⋯ button (labelled for
                            // TalkBack) — no more emoji piles scattered in the row.
                            IconAction(Icons.Filled.MoreVert, tr("common.moreOptions"), tint = colors.textFaint, iconSize = 20) {
                                menuPlaylist = pl
                            }
                        }
                    }
                    if (ui.playlists.isEmpty()) item { EmptyHint(tr("library.emptyNoPlaylists"), tr("library.emptyNoPlaylistsHint")) }
                }
            }
            1 -> LazyColumn(contentPadding = bottomPad) {
                if (grid) itemsIndexed(artistRows, key = { _, row -> row.first().artisthash }) { i, rowItems ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = if (i == 0) 0.dp else 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        rowItems.forEach { a -> Box(Modifier.weight(1f)) { ArtistCard(a, Modifier.fillMaxWidth(), onLongPress = { vm.openArtistMenu(a) }) { vm.navigate(ViewId.ARTIST, a.artisthash) } } }
                        repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                else items(lib.artists, key = { it.artisthash }) { a -> ArtistRow(a, onLongPress = { vm.openArtistMenu(a) }) { vm.navigate(ViewId.ARTIST, a.artisthash) } }
            }
            2 -> LazyColumn(contentPadding = bottomPad) {
                if (grid) itemsIndexed(albumRows, key = { _, row -> row.first().albumhash }) { i, rowItems ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = if (i == 0) 0.dp else 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        rowItems.forEach { a -> Box(Modifier.weight(1f)) { AlbumCard(a, Modifier.fillMaxWidth(), onLongPress = { vm.openAlbumMenu(a) }) { vm.navigate(ViewId.ALBUM, a.albumhash) } } }
                        if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                else items(lib.albums, key = { it.albumhash }) { a -> AlbumRow(a, onLongPress = { vm.openAlbumMenu(a) }) { vm.navigate(ViewId.ALBUM, a.albumhash) } }
            }
            3 -> LazyColumn(contentPadding = bottomPad) {
                itemsIndexed(lib.tracks, key = { _, t -> t.trackhash }) { idx, t ->
                    TrackRow(
                        t, index = idx, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                        onClick = { vm.playTrack(t, lib.tracks, idx) },
                        onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
                    )
                }
            }
        }
    }

    // The single "+" menu: every creation affordance behind one clean button.
    if (showAddMenu) {
        MenuSheetScaffold(onDismiss = { showAddMenu = false }) {
            Text(
                tr("library.addMenu"), color = colors.textMuted, style = Type.Caption,
                modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
            )
            MenuRow(Icons.Filled.QueueMusic, tr("ctx.newPlaylist")) {
                showAddMenu = false; showCreate = true
            }
            MenuRow(Icons.Filled.Download, tr("library.importFile")) {
                showAddMenu = false; importFile.launch(arrayOf("*/*"))
            }
            MenuRow(Icons.Filled.Link, tr("library.importLink")) {
                showAddMenu = false; showLink = true
            }
        }
    }

    // The playlist row ⋯ menu — pin / reorder live behind one calm button.
    menuPlaylist?.let { pl ->
        MenuSheetScaffold(onDismiss = { menuPlaylist = null }) {
            MenuRow(Icons.Filled.PushPin, tr(if (pl.pinned) "common.unpin" else "common.pin")) {
                vm.togglePin(pl.id); menuPlaylist = null
            }
            MenuRow(Icons.Filled.ArrowUpward, tr("common.moveUp")) {
                vm.movePlaylist(pl.id, -1); menuPlaylist = null
            }
            MenuRow(Icons.Filled.ArrowDownward, tr("common.moveDown")) {
                vm.movePlaylist(pl.id, 1); menuPlaylist = null
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
        Text(label, color = colors.textMuted, style = Type.Caption, fontWeight = FontWeight.SemiBold)
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

// Sorted library state of LibraryScreen, computed by derivedAsync.
private class LibraryDerived(
    val albums: List<Album>,
    val albumRows: List<List<Album>>,
    val artists: List<Artist>,
    val artistRows: List<List<Artist>>,
    val tracks: List<Track>,
) {
    companion object {
        val EMPTY = LibraryDerived(emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AlbumRow(album: local.auralis.client.model.Album, onLongPress: (() -> Unit)? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = onLongPress)
            .padding(vertical = 7.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        local.auralis.client.ui.components.CoverArt(album.image, album.albumhash, Modifier.size(46.dp), cornerRadius = 8, sizeDp = 46)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(album.title, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(album.artistName, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        album.year?.let { Text("$it", color = colors.textFaint, style = Type.Caption) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ArtistRow(artist: local.auralis.client.model.Artist, onLongPress: (() -> Unit)? = null, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        Modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = onLongPress)
            .padding(vertical = 7.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(46.dp).clip(CircleShape)) {
            local.auralis.client.ui.components.CoverArt(artist.image, artist.artisthash, Modifier.size(46.dp).clip(CircleShape), sizeDp = 46)
        }
        Spacer(Modifier.width(12.dp))
        Text(artist.name, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        artist.trackcount?.let { Text(tr("common.tracksCount", params = mapOf("count" to it)), color = colors.textFaint, style = Type.Caption) }
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
    val sortLabel = when (sort) {
        1 -> tr("library.sortAZ")
        2 -> tr("library.sortZA")
        3 -> tr("library.sortArtist")
        4 -> tr("library.sortPlays")
        else -> tr("library.sortRecent")
    }
    val current = currentTrackOf(vm)
    val totalDur = favTracks.sumOf { it.duration ?: 0.0 }
    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow(tr("favorites.title"))
                Text(tr("favorites.headline"), style = AMType.Title1, color = colors.foreground)
                Spacer(Modifier.height(4.dp))
                Text(tr("detail.tracksAndDuration", params = mapOf("count" to favTracks.size, "duration" to formatLongDuration(totalDur))), color = colors.textMuted, style = Type.Label)
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    // "Lire" starts a SHUFFLED queue of the liked tracks only —
                    // random order, and the endless continuation never leaves the
                    // liked set (no surprise unliked tracks, ever).
                    PlayPill(tr("common.play")) {
                        vm.playShuffled(favTracks, QueueSource.Favorites(ui.favorites))
                    }
                    PlusChip(tr("library.sortLabel", params = mapOf("sort" to sortLabel))) { sort = (sort + 1) % 5 }
                }
            }
        }
        itemsIndexed(favTracks, key = { _, t -> t.trackhash }) { idx, t ->
            TrackRow(
                t, isCurrent = t.trackhash == current, isFavorite = true,
                onClick = { vm.playTrack(t, favTracks, idx, QueueSource.Favorites(ui.favorites)) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
        if (favTracks.isEmpty()) item { EmptyHint(tr("favorites.emptyTitle"), tr("favorites.emptyHint")) }
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
                Eyebrow(tr("recents.eyebrow"))
                Text(tr("recents.title"), style = AMType.Title1, color = colors.foreground)
                Text(tr("recents.countRead", params = mapOf("count" to recents.size)), color = colors.textMuted, style = Type.Label)
            }
        }
        itemsIndexed(recents, key = { _, t -> t.trackhash }) { idx, t ->
            TrackRow(
                t, isCurrent = t.trackhash == current, isFavorite = ui.favorites.contains(t.trackhash),
                onClick = { vm.playTrack(t, recents, idx) },
                onToggleFavorite = { vm.toggleFavorite(t.trackhash) }, onMore = { vm.openTrackMenu(t) },
            )
        }
        if (recents.isEmpty()) item { EmptyHint(tr("recents.emptyTitle"), tr("recents.emptyHint")) }
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
                Eyebrow(tr("folders.title"))
                Text(activeNode?.name ?: tr("nav.library"), style = AMType.Title1, color = colors.foreground)
                if (activePath != rootPath && activePath != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(tr("folders.goBack"), color = colors.textMuted, style = Type.Label, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable {
                            path = nodes.find { n -> n.children.any { it.path == activePath } }?.path ?: rootPath
                        })
                }
                if (tracksHere.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PlayPill(tr("folders.playFolder")) { vm.playList(tracksHere) }
                        GhostPill(tr("common.shuffle")) { vm.playShuffled(tracksHere) }
                    }
                }
            }
        }
        items(subfolders) { f ->
            Row(
                Modifier.fillMaxWidth().clip(AMShapes.tile).clickable { path = f.path }
                    .padding(vertical = 10.dp, horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(AMShapes.thumb).background(colors.panel2), contentAlignment = Alignment.Center) {
                    Text("📁", fontSize = 18.sp)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.name, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(tr("common.tracksCount", params = mapOf("count" to f.trackcount)), color = colors.textMuted, style = Type.Caption)
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
    // Previously recomputed the full O(tracks x artists) total on EVERY
    // recomposition of the LazyColumn block (it wasn't even remembered).
    val artistPlays = remember(ui.tracks, ui.playCounts) { artistPlayTotals(ui.tracks, ui.playCounts) }
    val topArtists = remember(ui.artists, artistPlays) {
        ui.artists
            .filter { (artistPlays[it.artisthash] ?: 0) > 0 }
            .sortedByDescending { artistPlays[it.artisthash] ?: 0 }
            .take(8)
    }
    // Web InsightsView panels: tracks-per-artist, genre histogram, biggest albums.
    val artistTrackData = remember(ui.artists) {
        ui.artists.map { it.name to (it.trackcount ?: 0) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(8)
    }
    val genreData = remember(ui.tracks) {
        ui.tracks.groupingBy { it.genre?.trim().orEmpty() }.eachCount()
            .map { (genre, count) -> (genre.ifEmpty { Messages.t("insights.untagged") }) to count }
            .sortedByDescending { it.second }
            .take(8)
    }
    val albumData = remember(ui.albums) {
        ui.albums.map {
            "${it.title}${it.albumartists.firstOrNull()?.name?.let { n -> " · $n" } ?: ""}" to (it.trackcount ?: 0)
        }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(8)
    }
    LazyColumn(contentPadding = bottomPad) {
        item {
            Column(Modifier.padding(vertical = 10.dp)) {
                Eyebrow(tr("insights.eyebrow"))
                Text(tr("insights.screenTitle"), style = AMType.Title1, color = colors.foreground)
            }
        }
        item { MoodRecapSection(vm, ui) }
        item {
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Kpi(tr("insights.kpiStreak"), tr("insights.daysShort", params = mapOf("count" to stats.streak)), Modifier.weight(1f))
                Kpi(tr("insights.kpiWeek"), "${stats.weekPlays}", Modifier.weight(1f))
                Kpi(tr("insights.kpiTotal"), "${stats.totalPlays}", Modifier.weight(1f))
            }
        }
        // Week / total listening time (web WeeklyRecap, fields from /api/stats).
        if (stats.weekListeningSeconds > 0 || stats.totalListeningSeconds > 0) {
            item {
                Text(
                    listOfNotNull(
                        if (stats.weekListeningSeconds > 0) {
                            "${formatLongDuration(stats.weekListeningSeconds.toDouble())} ${tr("insights.listeningWeek")}"
                        } else null,
                        if (stats.totalListeningSeconds > 0) {
                            "${formatLongDuration(stats.totalListeningSeconds.toDouble())} ${tr("insights.listeningTotal")}"
                        } else null,
                    ).joinToString(" · "),
                    color = colors.textMuted, style = Type.Caption, modifier = Modifier.padding(bottom = 4.dp),
                )
            }
        }
        item {
            Spacer(Modifier.height(12.dp))
            SectionHeader(tr("insights.last7days"))
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
            SectionHeader(tr("insights.topArtistsTitle"))
        }
        items(topArtists) { a ->
            Row(Modifier.fillMaxWidth().clickable { vm.navigate(ViewId.ARTIST, a.artisthash) }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(a.name, color = colors.foreground, style = Type.Body, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(tr("insights.playsAttribute", params = mapOf("count" to (artistPlays[a.artisthash] ?: 0))), color = colors.textMuted, style = Type.Caption)
            }
        }
        item {
            Spacer(Modifier.height(16.dp))
            BarPanel(tr("insights.tracksByArtistTitle"), tr("insights.tracksByArtistEyebrow"), artistTrackData)
        }
        item {
            Spacer(Modifier.height(16.dp))
            BarPanel(tr("insights.genresTitle"), tr("insights.genresEyebrow"), genreData)
        }
        item {
            Spacer(Modifier.height(16.dp))
            BarPanel(tr("insights.albumsBySizeTitle"), tr("insights.albumsBySizeEyebrow"), albumData)
        }
    }
}

/** Web InsightsView BarList: ranked rows with a value bar (genres, artists, albums). */
@Composable
private fun BarPanel(title: String, eyebrow: String, rows: List<Pair<String, Int>>) {
    val colors = LocalAuralis.current
    Column(Modifier.fillMaxWidth().clip(AMShapes.card).background(colors.panel).padding(Spacing.lg)) {
        Eyebrow(eyebrow)
        Text(title, style = AMType.Title3, color = colors.foreground, modifier = Modifier.padding(top = 2.dp, bottom = 10.dp))
        if (rows.isEmpty()) {
            Text(tr("insights.noData"), color = colors.textMuted, style = Type.Caption)
        } else {
            val max = (rows.maxOfOrNull { it.second } ?: 1).coerceAtLeast(1)
            rows.forEachIndexed { i, (label, value) ->
                Column(Modifier.padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${i + 1}", color = colors.textFaint, style = AMType.Caption2, modifier = Modifier.width(18.dp))
                        Text(
                            label, color = colors.foreground, style = Type.Label,
                            modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Text("$value", color = colors.textMuted, style = Type.Caption, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(3.dp))
                    Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(colors.panel2)) {
                        Box(
                            Modifier.fillMaxWidth((value.toFloat() / max).coerceIn(0.04f, 1f))
                                .height(5.dp).clip(RoundedCornerShape(3.dp)).background(colors.accent),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Kpi(label: String, value: String, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Column(modifier.clip(AMShapes.card).background(colors.panel).padding(Spacing.lg)) {
        Text(value, color = colors.foreground, style = AMType.Title2)
        Text(label, color = colors.textMuted, style = Type.Caption)
    }
}

// ============================ MONTHLY MOOD RECAP ==========================

@Composable
private fun MoodRecapSection(vm: AppViewModel, ui: UiState) {
    val colors = LocalAuralis.current
    if (ui.recapMonths.isEmpty()) return
    val recap = ui.recap
    Column(Modifier.fillMaxWidth().padding(top = 6.dp)) {
        SectionHeader(tr("recap.title"))

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
                        style = Type.Caption, fontWeight = FontWeight.SemiBold,
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
                Modifier.fillMaxWidth().clip(AMShapes.hero)
                    .background(Brush.linearGradient(listOf(c0, c1)))
                    .padding(18.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(mood?.emoji ?: "🎧", fontSize = 34.sp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            ("${recap.label}" + if (recap.inProgress) tr("recap.inProgress") else "").uppercase(),
                            color = Color.White.copy(alpha = 0.8f), style = AMType.Caption2, fontWeight = FontWeight.Bold,
                        )
                        Text(
                            (recap.moodWord ?: mood?.label ?: "—").replaceFirstChar { it.uppercase() },
                            color = Color.White, style = AMType.Title2,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(recap.narrative, color = Color.White.copy(alpha = 0.92f), style = Type.Label)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    RecapStat("${recap.totalPlays}", tr("recap.playsLabel"))
                    RecapStat(Messages.formatCompactDuration(recap.listeningSeconds), tr("recap.listeningLabel"))
                    RecapStat("${recap.distinctTracks}", tr("recap.uniqueTracksLabel"))
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
                            color = colors.foreground, style = Type.Label,
                            modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                        Text("${(ms.share * 100).toInt()}%", color = colors.textMuted, style = Type.Caption)
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
                Text(tr("recap.monthlyTracks"), color = colors.textMuted, style = Type.Caption, fontWeight = FontWeight.SemiBold)
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
                            Text(t.title, color = colors.foreground, style = Type.Label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(t.displayArtist, color = colors.textMuted, style = AMType.Caption2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text("${pair.second}×", color = colors.textMuted, style = Type.Caption)
                    }
                }
            }
        } else {
            Text(
                recap?.narrative ?: tr("recap.startListeningHint"),
                color = colors.textMuted, style = Type.Label, modifier = Modifier.padding(vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun RecapStat(value: String, label: String) {
    Column {
        Text(value, color = Color.White, style = AMType.Headline)
        Text(label, color = Color.White.copy(alpha = 0.75f), fontSize = 10.sp)
    }
}

private fun hexColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color(0xFF888888))

private fun recapMonthChip(key: String): String = Messages.monthShortLabel(key)
