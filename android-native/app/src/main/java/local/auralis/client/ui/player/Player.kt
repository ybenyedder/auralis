package local.auralis.client.ui.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.Track
import local.auralis.client.playback.PlaybackSnapshot
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.formatDuration
import local.auralis.client.ui.theme.LocalAuralis

@Composable
fun MiniPlayer(track: Track, playback: PlaybackSnapshot, positionMs: Long, vm: AppViewModel, onOpen: () -> Unit) {
    val colors = LocalAuralis.current
    val dur = (track.duration ?: 0.0) * 1000.0
    val progress = if (dur > 0) (positionMs / dur).toFloat().coerceIn(0f, 1f) else 0f
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(colors.panel)) {
        Row(
            Modifier.fillMaxWidth().clickable { onOpen() }.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(44.dp), cornerRadius = 8)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(track.title, color = colors.foreground, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(track.displayArtist, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(
                if (vm.isFavorite(track.trackhash)) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                "Favori", tint = if (vm.isFavorite(track.trackhash)) colors.accent else colors.textFaint,
                modifier = Modifier.size(22.dp).clickable { vm.toggleFavorite(track.trackhash) },
            )
            Spacer(Modifier.width(12.dp))
            Icon(
                if (playback.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                "Lecture", tint = colors.foreground,
                modifier = Modifier.size(30.dp).clickable { vm.togglePlay() },
            )
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Filled.SkipNext, "Suivant", tint = colors.foreground, modifier = Modifier.size(28.dp).clickable { vm.next() })
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(colors.line)) {
            Box(Modifier.fillMaxWidth(progress).height(2.dp).background(colors.accent))
        }
    }
}

@Composable
fun FullscreenPlayer(
    track: Track,
    playback: PlaybackSnapshot,
    positionMs: Long,
    ui: UiState,
    vm: AppViewModel,
    onClose: () -> Unit,
) {
    val colors = LocalAuralis.current
    var showLyrics by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    val (bg, c1, _) = local.auralis.client.ui.components.paletteFor(track.albumhash ?: track.title)

    Column(
        Modifier.fillMaxSize().background(colors.background).systemBarsPadding().padding(horizontal = 20.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.KeyboardArrowDown, "Réduire", tint = colors.foreground,
                modifier = Modifier.size(30.dp).clickable { onClose() })
            Spacer(Modifier.weight(1f))
            Text(if (showLyrics) "Paroles" else "Lecture", color = colors.textMuted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Filled.GraphicEq, "Visualiseur", tint = colors.foreground,
                modifier = Modifier.size(24.dp).clickable { vm.toggleVisualizer() })
            Spacer(Modifier.width(14.dp))
            Icon(Icons.Filled.QueueMusic, "File", tint = if (showQueue) colors.accent else colors.foreground,
                modifier = Modifier.size(26.dp).clickable { showQueue = !showQueue; showLyrics = false })
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                showQueue -> QueuePane(playback, ui, vm)
                showLyrics -> LyricsPane(ui, vm, positionMs, track)
                else -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    CoverArt(track.image, track.albumhash ?: track.title, Modifier.fillMaxWidth().aspectRatio(1f), cornerRadius = 20)
                }
            }
        }

        // Title + favorite
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(track.title, color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(track.displayArtist, color = colors.textMuted, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(
                if (vm.isFavorite(track.trackhash)) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                "Favori", tint = if (vm.isFavorite(track.trackhash)) colors.accent else colors.textFaint,
                modifier = Modifier.size(28.dp).clickable { vm.toggleFavorite(track.trackhash) },
            )
            Spacer(Modifier.width(14.dp))
            Icon(Icons.Filled.Lyrics, "Paroles", tint = if (showLyrics) colors.accent else colors.foreground,
                modifier = Modifier.size(26.dp).clickable { showLyrics = !showLyrics; showQueue = false })
        }

        // Seek bar
        val durMs = (track.duration ?: 0.0) * 1000.0
        var dragging by remember { mutableStateOf(false) }
        var dragValue by remember { mutableStateOf(0f) }
        val progress = if (dragging) dragValue else if (durMs > 0) (positionMs / durMs).toFloat().coerceIn(0f, 1f) else 0f
        Slider(
            value = progress,
            onValueChange = { dragging = true; dragValue = it },
            onValueChangeFinished = { vm.seekTo((dragValue * durMs).toLong()); dragging = false },
            colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.line),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatDuration((if (dragging) dragValue * durMs else positionMs.toDouble()) / 1000.0), color = colors.textFaint, fontSize = 11.sp)
            Text(formatDuration(track.duration), color = colors.textFaint, fontSize = 11.sp)
        }

        // Transport
        Row(
            Modifier.fillMaxWidth().padding(vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Shuffle, "Aléatoire", tint = if (playback.shuffle) colors.accent else colors.textMuted,
                modifier = Modifier.size(24.dp).clickable { vm.toggleShuffle() })
            Icon(Icons.Filled.SkipPrevious, "Précédent", tint = colors.foreground,
                modifier = Modifier.size(40.dp).clickable { vm.prev() })
            Box(
                Modifier.size(68.dp).clip(CircleShape).background(colors.accent).clickable { vm.togglePlay() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (playback.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Lecture", tint = colors.ink, modifier = Modifier.size(36.dp))
            }
            Icon(Icons.Filled.SkipNext, "Suivant", tint = colors.foreground,
                modifier = Modifier.size(40.dp).clickable { vm.next() })
            Icon(
                if (playback.repeat == "one") Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                "Répéter", tint = if (playback.repeat != "off") colors.accent else colors.textMuted,
                modifier = Modifier.size(24.dp).clickable { vm.cycleRepeat() },
            )
        }

        // Volume
        Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Vol", color = colors.textFaint, fontSize = 11.sp)
            Spacer(Modifier.width(8.dp))
            Slider(
                value = ui.volume,
                onValueChange = { vm.setVolume(it) },
                colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.line),
                modifier = Modifier.weight(1f),
            )
        }

        // Sleep timer
        Column(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
            val label = when {
                ui.sleepEndOfTrack -> "Veille : fin du titre"
                ui.sleepActive && ui.sleepEndsAt != null -> "Veille : ${(((ui.sleepEndsAt!! - System.currentTimeMillis()) / 60000) + 1).coerceAtLeast(0)} min"
                else -> "Minuteur de veille"
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.clip(CircleShape).background(if (ui.sleepActive) colors.accent else colors.panel2)
                        .clickable { if (ui.sleepActive) vm.cancelSleepTimer() else showSleep = !showSleep }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(if (ui.sleepActive) "$label · Annuler" else label,
                        color = if (ui.sleepActive) colors.ink else colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            if (showSleep && !ui.sleepActive) {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(15, 30, 45, 60).forEach { m ->
                        Box(
                            Modifier.clip(CircleShape).background(colors.panel2)
                                .clickable { vm.startSleepTimer(m); showSleep = false }
                                .padding(horizontal = 12.dp, vertical = 7.dp),
                        ) { Text("${m}m", color = colors.foreground, fontSize = 12.sp) }
                    }
                    Box(
                        Modifier.clip(CircleShape).background(colors.panel2)
                            .clickable { vm.sleepAfterTrack(); showSleep = false }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    ) { Text("Fin du titre", color = colors.foreground, fontSize = 12.sp) }
                }
            }
        }
    }
}

@Composable
private fun LyricsPane(ui: UiState, vm: AppViewModel, positionMs: Long, track: Track) {
    val colors = LocalAuralis.current
    val lyrics = ui.lyrics
    val posSec = positionMs / 1000.0 + ui.lyricsOffset
    LaunchedEffect(track.trackhash) {
        if (ui.lyrics === LyricsResult.NONE && !ui.lyricsLoading) vm.fetchLyrics(false)
    }
    if (ui.lyricsLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("Chargement des paroles…", color = colors.textMuted, fontSize = 14.sp)
        }
        return
    }
    if (lyrics.lines.isEmpty()) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (lyrics.status == "instrumental") "Instrumental" else "Aucune parole", color = colors.textMuted, fontSize = 15.sp)
            Spacer(Modifier.height(10.dp))
            Box(Modifier.clip(CircleShape).background(colors.panel2).clickable { vm.fetchLyrics(true) }.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text("Chercher en ligne", color = colors.foreground, fontSize = 13.sp)
            }
        }
        return
    }
    val synced = lyrics.isSynced
    val activeIndex = if (synced) lyrics.lines.indexOfLast { it.time <= posSec }.coerceAtLeast(0) else -1
    val listState = rememberLazyListState()
    LaunchedEffect(activeIndex) {
        if (activeIndex >= 0) listState.animateScrollToItem(activeIndex.coerceAtLeast(0))
    }
    Column(Modifier.fillMaxSize()) {
        if (synced) {
            Row(
                Modifier.fillMaxWidth().padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val kOn = ui.karaoke
                Box(
                    Modifier.clip(CircleShape).background(if (kOn) colors.accent else colors.panel2)
                        .clickable { vm.toggleKaraoke() }.padding(horizontal = 12.dp, vertical = 6.dp),
                ) { Text("Karaoké", color = if (kOn) colors.ink else colors.textMuted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) }
                Spacer(Modifier.width(14.dp))
                Text("−", color = colors.foreground, fontSize = 20.sp,
                    modifier = Modifier.clickable { vm.adjustLyricsOffset(-0.1f) }.padding(horizontal = 8.dp))
                Text("%+.1fs".format(ui.lyricsOffset), color = colors.textMuted, fontSize = 12.sp)
                Text("+", color = colors.foreground, fontSize = 20.sp,
                    modifier = Modifier.clickable { vm.adjustLyricsOffset(0.1f) }.padding(horizontal = 8.dp))
            }
        }
        LazyColumn(state = listState, modifier = Modifier.weight(1f).fillMaxWidth()) {
        itemsIndexed(lyrics.lines) { i, line ->
            val isActive = i == activeIndex
            val color = when {
                !synced -> colors.foreground.copy(alpha = 0.85f)
                isActive -> colors.foreground
                i < activeIndex -> colors.textFaint
                else -> colors.textMuted.copy(alpha = 0.6f)
            }
            // Karaoke: reveal words progressively on the active line when enabled.
            if (synced && isActive && ui.karaoke && line.words.isNotEmpty()) {
                val revealedCount = line.words.count { it.time <= posSec }
                val builder = buildAnnotated(line.words.map { it.text }, revealedCount, colors.accent, colors.textMuted)
                Text(builder, fontSize = 19.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().clickable { vm.seekTo((line.time * 1000).toLong()) }.padding(vertical = 8.dp), textAlign = TextAlign.Center)
            } else {
                Text(
                    line.text.ifBlank { "♪" },
                    color = if (isActive) colors.accent else color,
                    fontSize = if (isActive) 20.sp else 17.sp,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                        .clickable(enabled = synced) { vm.seekTo((line.time * 1000).toLong()) }
                        .padding(vertical = 8.dp),
                )
            }
        }
        }
    }
}

private fun buildAnnotated(words: List<String>, revealed: Int, on: Color, off: Color): AnnotatedString =
    buildAnnotatedString {
        words.forEachIndexed { i, w ->
            withStyle(SpanStyle(color = if (i < revealed) on else off)) {
                append(w)
                append(" ")
            }
        }
    }

@Composable
private fun QueuePane(playback: PlaybackSnapshot, ui: UiState, vm: AppViewModel) {
    val colors = LocalAuralis.current
    val tracks = playback.queueIds.mapNotNull { ui.trackByHash[it] }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Text("File d'attente", color = colors.foreground, fontSize = 18.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
            Text("Vider", color = colors.textMuted, fontSize = 13.sp, modifier = Modifier.clickable { vm.clearQueue() })
        }
        LazyColumn(Modifier.fillMaxSize()) {
            itemsIndexed(tracks) { idx, t ->
                val isCurrent = idx == playback.currentIndex
                Row(
                    Modifier.fillMaxWidth().clickable { vm.jumpTo(idx) }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CoverArt(t.image, t.albumhash ?: t.title, Modifier.size(40.dp), cornerRadius = 8)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.title, color = if (isCurrent) colors.accent else colors.foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(t.displayArtist, color = colors.textMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (!isCurrent) {
                        Text("✕", color = colors.textFaint, fontSize = 16.sp, modifier = Modifier.clickable { vm.removeFromQueue(idx) }.padding(8.dp))
                    }
                }
            }
        }
    }
}
