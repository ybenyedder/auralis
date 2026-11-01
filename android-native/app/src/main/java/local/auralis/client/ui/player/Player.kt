package local.auralis.client.ui.player

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Lyrics
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import local.auralis.client.i18n.tr
import local.auralis.client.model.LyricsResult
import local.auralis.client.model.Track
import local.auralis.client.playback.PlaybackProgress
import local.auralis.client.playback.PlaybackSnapshot
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.components.CoverArt
import local.auralis.client.ui.components.EllipsisCircleIcon
import local.auralis.client.ui.components.IconAction
import local.auralis.client.ui.components.NetworkImage
import local.auralis.client.ui.components.amFrosted
import local.auralis.client.ui.components.formatDuration
import local.auralis.client.ui.components.rememberSleepCountdown
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalApiUrl
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type
import kotlin.math.abs

// ---------------------------------------------------------------------------
// Mini player — Apple Music's compact card above the tab bar: frosted panel,
// cover + marquee texts, play/pause and forward glyph, hairline progress.
// ---------------------------------------------------------------------------

@Composable
fun MiniPlayer(track: Track, playback: PlaybackSnapshot, positionMs: Long, vm: AppViewModel, onOpen: () -> Unit) {
    val colors = LocalAuralis.current
    // Player-reported duration first: stream metadata can omit `duration`, which left
    // this hairline stuck at zero even though playback knows the length.
    val dur = if (playback.durationMs > 0) playback.durationMs.toDouble() else (track.duration ?: 0.0) * 1000.0
    val progress = if (dur > 0) (positionMs / dur).toFloat().coerceIn(0f, 1f) else 0f
    // The hairline progress glides to its new value instead of jumping on each tick.
    val shownProgress by animateFloatAsState(progress, animationSpec = Motion.snappy, label = "miniProgress")
    var miniDx by remember { mutableStateOf(0f) }
    Column(
        Modifier
            .fillMaxWidth()
            .amFrosted(AMShapes.card, colors.panel2)
            .shadow(6.dp, AMShapes.card, clip = false),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { onOpen() }
                // Horizontal swipe on the mini-player → previous / next, like a native player.
                .pointerInput(track.trackhash) {
                    detectHorizontalDragGestures(
                        onDragStart = { miniDx = 0f },
                        onDragEnd = { if (miniDx > 100f) vm.prev() else if (miniDx < -100f) vm.next() },
                    ) { _, dx -> miniDx += dx }
                }
                .padding(start = Spacing.sm, end = Spacing.xs, top = Spacing.sm, bottom = Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(46.dp), cornerRadius = Radius.sm.value.toInt(), sizeDp = 46)
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Text(
                    track.title, color = colors.foreground, style = AMType.Subhead,
                    fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(track.displayArtist, color = colors.textMuted, style = AMType.Caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconAction(
                if (playback.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                if (playback.isPlaying) tr("player.pause") else tr("mobile.play"), tint = colors.foreground, iconSize = 28,
            ) { vm.togglePlay() }
            IconAction(Icons.Filled.SkipNext, tr("player.next"), tint = colors.foreground, iconSize = 24) { vm.next() }
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(colors.foreground.copy(alpha = 0.15f))) {
            Box(Modifier.fillMaxWidth(shownProgress).height(2.dp).background(colors.accent))
        }
    }
}

// ---------------------------------------------------------------------------
// Fullscreen now playing — Apple Music layout: ambient blurred cover stage,
// naked-glyph transport (no filled circles), artist in the red accent, custom
// thin scrubber, volume row with speaker glyphs, bottom actions row, and an
// interactive drag-to-dismiss where the artwork shrinks as you pull down.
// ---------------------------------------------------------------------------

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
    val scope = rememberCoroutineScope()
    var showLyrics by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    var coverDx by remember { mutableStateOf(0f) }

    // Interactive dismissal: pulling the stage down slides it while the artwork
    // scales back; release past the threshold closes, otherwise it springs home.
    val dismissY = remember { Animatable(0f) }
    val dismissYv = dismissY.value // reading .value subscribes this scope to changes
    val artScale = (1f - (dismissYv / 2200f)).coerceIn(0.72f, 1f)

    Box(
        Modifier
            .fillMaxSize()
            .background(colors.background)
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { _, amt ->
                        if (amt > 0) scope.launch { dismissY.snapTo(dismissY.value + amt) }
                    },
                    onDragEnd = {
                        if (dismissY.value > 420f) onClose()
                        else scope.launch { dismissY.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy)) }
                    },
                )
            },
    ) {
        // Liner signature stage: the now-playing screen is layered over a
        // blown-up, heavily blurred copy of the cover art, dimmed by a vertical
        // scrim so it reads as an ambient colour field (always dark), with a soft
        // warm glow bleeding from the top edge.
        if (!track.image.isNullOrBlank()) {
            // Resolve the relative art path against the server base — a raw
            // "/api/art/…" path made OkHttp throw inside the loader and the
            // ambient backdrop silently never rendered.
            val resolveUrl = LocalApiUrl.current
            NetworkImage(
                resolveUrl(track.image),
                Modifier.fillMaxSize().blur(72.dp),
                contentScale = ContentScale.Crop,
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Black.copy(alpha = 0.38f),
                            Color.Black.copy(alpha = 0.18f),
                            Color.Black.copy(alpha = 0.30f),
                            Color.Black.copy(alpha = 0.62f),
                        ),
                    ),
                ),
            )
            // Warm top glow — the cover's colour bleeding over the edge.
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        listOf(Color.White.copy(alpha = 0.10f), Color.Transparent),
                    ),
                ),
            )
        }
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(horizontal = 20.dp)
                .graphicsLayer { translationY = dismissY.value },
        ) {
            // Top bar: dismiss chevron · view label · track menu.
            Row(Modifier.fillMaxWidth().padding(vertical = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
                IconAction(Icons.Filled.KeyboardArrowDown, tr("player.minimize"), tint = colors.foreground, iconSize = 28) { onClose() }
                Spacer(Modifier.weight(1f))
                Text(
                    if (showLyrics) tr("player.lyrics") else tr("mobile.play"),
                    color = colors.textMuted, style = AMType.Caption1,
                    fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
                )
                Spacer(Modifier.weight(1f))
                IconAction(EllipsisCircleIcon, tr("player.trackOptions"), tint = colors.foreground, iconSize = 24) { vm.openTrackMenu(track) }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    showQueue -> QueuePane(playback, ui, vm)
                    showLyrics -> LyricsPane(ui, vm, positionMs, track)
                    else -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CoverArt(
                            track.image, track.albumhash ?: track.title,
                            // Swipe the cover horizontally → next / prev (Apple Music).
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .graphicsLayer {
                                    scaleX = artScale
                                    scaleY = artScale
                                }
                                .shadow(24.dp, AMShapes.card, clip = false)
                                .pointerInput(track.trackhash) {
                                    detectHorizontalDragGestures(
                                        onDragStart = { coverDx = 0f },
                                        onDragEnd = {
                                            if (coverDx > 120f) vm.prev()
                                            else if (coverDx < -120f) vm.next()
                                        },
                                    ) { _, amt -> coverDx += amt }
                                },
                            cornerRadius = 12, sizeDp = 0,
                        )
                    }
                }
            }

            // Title + artist (artist in the accent, like Apple Music) + heart.
            Row(Modifier.fillMaxWidth().padding(top = Spacing.md), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(track.title, color = colors.foreground, style = AMType.Title2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(2.dp))
                    Text(track.displayArtist, color = colors.accent, style = AMType.Title3, fontWeight = FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconAction(Icons.Filled.Share, tr("player.share"), tint = colors.textMuted, iconSize = 22) { vm.shareTrack(track) }
                IconAction(
                    if (vm.isFavorite(track.trackhash)) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    tr("common.favoriteAria"),
                    tint = if (vm.isFavorite(track.trackhash)) colors.accent else colors.textMuted,
                    iconSize = 24,
                ) { vm.toggleFavorite(track.trackhash) }
            }

            // Scrubber (custom thin Apple Music slider) + time labels.
            // Prefer the player-reported duration: when metadata lacks `duration` the
            // bar used to stay dead at zero even though playback knows the length.
            // The fraction comes from PlaybackProgress (floating-point) — a raw
            // `positionMs / durMs` on two Longs is integer division that stays 0 for
            // the whole track, which pinned the fullscreen bar at 0:00.
            val durMs = if (playback.durationMs > 0) playback.durationMs else ((track.duration ?: 0.0) * 1000.0).toLong()
            var scrub by remember { mutableStateOf<Float?>(null) }
            val progress = scrub ?: PlaybackProgress.fraction(positionMs, durMs)
            AMSlider(
                value = progress,
                onScrub = { scrub = it },
                onCommit = {
                    vm.seekTo((it * durMs).toLong())
                    scrub = null
                },
            )
            Row(Modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDuration(((scrub ?: progress) * durMs) / 1000.0), color = colors.textMuted, style = AMType.Caption2)
                Text("-" + formatDuration(((1f - (scrub ?: progress)) * durMs) / 1000.0), color = colors.textMuted, style = AMType.Caption2)
            }

            // Transport — naked glyphs (no filled circle): shuffle · prev · play · next · repeat.
            Row(
                Modifier.fillMaxWidth().padding(top = Spacing.sm),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconAction(
                    Icons.Filled.Shuffle, tr("common.shuffle"),
                    tint = if (playback.shuffle) colors.accent else colors.textMuted, iconSize = 24,
                ) { vm.toggleShuffle() }
                IconAction(Icons.Filled.SkipPrevious, tr("player.previous"), tint = colors.foreground, iconSize = 42) { vm.prev() }
                // Solid accent play/pause — the one loud control of the transport,
                // matching the web's signal-button treatment.
                Box(
                    Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(colors.accent)
                        .clickable { vm.togglePlay() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (playback.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        if (playback.isPlaying) tr("player.pause") else tr("mobile.play"),
                        tint = colors.ink, modifier = Modifier.size(40.dp),
                    )
                }
                IconAction(Icons.Filled.SkipNext, tr("player.next"), tint = colors.foreground, iconSize = 42) { vm.next() }
                IconAction(
                    if (playback.repeat == "one") Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                    tr("player.repeat"),
                    tint = if (playback.repeat != "off") colors.accent else colors.textMuted, iconSize = 24,
                ) { vm.cycleRepeat() }
            }

            // Volume — Apple Music's speaker-flanked slider.
            Row(Modifier.fillMaxWidth().padding(top = Spacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.VolumeDown, tr("player.volumeMin"), tint = colors.textMuted, modifier = Modifier.size(16.dp))
                AMSlider(
                    value = ui.volume,
                    onScrub = { vm.setVolume(it) },
                    onCommit = { vm.setVolume(it) },
                    modifier = Modifier.weight(1f).padding(horizontal = Spacing.sm),
                )
                Icon(Icons.Filled.VolumeUp, tr("player.volumeMax"), tint = colors.textMuted, modifier = Modifier.size(16.dp))
            }

            // Bottom actions — lyrics · queue · sleep timer · visualizer.
            Row(
                Modifier.fillMaxWidth().padding(top = Spacing.xs, bottom = Spacing.xs),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconAction(
                    Icons.Filled.Lyrics, tr("player.lyrics"),
                    tint = if (showLyrics) colors.accent else colors.textMuted, iconSize = 22,
                ) { showLyrics = !showLyrics; showQueue = false }
                IconAction(
                    Icons.Filled.QueueMusic, tr("player.queue"),
                    tint = if (showQueue) colors.accent else colors.textMuted, iconSize = 22,
                ) { showQueue = !showQueue; showLyrics = false }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(width = 48.dp, height = 34.dp).clip(AMShapes.pill).clickable {
                            if (ui.sleepActive) vm.cancelSleepTimer() else showSleep = !showSleep
                        },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Bedtime, tr("player.sleep"),
                            tint = if (ui.sleepActive) colors.accent else colors.textMuted,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    // Live "m:ss" countdown while a timed sleep is armed; tapping the
                    // icon cancels (the "Fin du titre" mode has no countdown).
                    val remaining = rememberSleepCountdown(ui.sleepEndsAt)
                    if (ui.sleepActive && remaining.isNotEmpty()) {
                        Text(remaining, color = colors.accent, style = AMType.Caption2)
                    }
                }
                IconAction(
                    Icons.Filled.GraphicEq, tr("player.visualizer"),
                    tint = colors.textMuted, iconSize = 22,
                ) { vm.toggleVisualizer() }
            }

            // Sleep-timer options sheet (revealed by the bedtime action).
            if (showSleep && !ui.sleepActive) {
                Column(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                    if (ui.sleepEndOfTrack) {
                        Text(tr("player.sleepEndOfTrack"), color = colors.textMuted, style = AMType.Caption1)
                    }
                    androidx.compose.foundation.layout.FlowRow(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf(5, 10, 15, 30, 45, 60).forEach { m ->
                            Box(
                                Modifier
                                    .clip(CircleShape)
                                    .background(colors.panel2.copy(alpha = 0.7f))
                                    .clickable { vm.startSleepTimer(m); showSleep = false }
                                    .padding(horizontal = 14.dp, vertical = 7.dp),
                            ) { Text(tr("common.minutesShort", params = mapOf("n" to m)), color = colors.foreground, style = AMType.Caption1) }
                        }
                        Box(
                            Modifier
                                .clip(CircleShape)
                                .background(colors.panel2.copy(alpha = 0.7f))
                                .clickable { vm.sleepAfterTrack(); showSleep = false }
                                .padding(horizontal = 14.dp, vertical = 7.dp),
                        ) { Text(tr("player.endOfTrack"), color = colors.foreground, style = AMType.Caption1) }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// AMSlider — the thin iOS scrubber: 7dp rounded track, plain fill, a thumb
// that only appears while touched, tap-to-jump and drag-to-scrub.
// ---------------------------------------------------------------------------

@Composable
private fun AMSlider(
    value: Float,
    onScrub: (Float) -> Unit,
    onCommit: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalAuralis.current
    var active by remember { mutableStateOf(false) }
    var fraction by remember { mutableStateOf(value) }
    var dragStart by remember { mutableStateOf(0f) }
    // Follow the external position only while idle (never fight the finger).
    LaunchedEffect(value) { if (!active) fraction = value }

    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(26.dp)
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    val f = (offset.x / size.width).coerceIn(0f, 1f)
                    fraction = f
                    onCommit(f)
                }
            }
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { active = true; dragStart = fraction },
                    onDragEnd = {
                        active = false
                        onCommit(fraction)
                    },
                    // Cancel restores the pre-drag value instead of freezing the
                    // thumb mid-track where the finger gave up.
                    onDragCancel = { active = false; fraction = dragStart; onScrub(dragStart) },
                ) { change, amt ->
                    change.consume()
                    fraction = (fraction + amt / size.width).coerceIn(0f, 1f)
                    onScrub(fraction)
                }
            },
    ) {
        val trackW = maxWidth
        // The fill glides between position ticks while idle; while touched it
        // follows the finger 1:1 (never fight the drag).
        val idle by animateFloatAsState(fraction, animationSpec = Motion.snappy, label = "sliderFill")
        val thumbAlpha by animateFloatAsState(if (active) 1f else 0f, animationSpec = Motion.quick, label = "sliderThumb")
        val shown = if (active) fraction else idle
        Box(
            Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .height(7.dp)
                .clip(CircleShape)
                .background(colors.foreground.copy(alpha = 0.18f)),
        )
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .fillMaxWidth(shown)
                .height(7.dp)
                .clip(CircleShape)
                .background(if (active) colors.accent else colors.foreground),
        )
        // Thumb — larger, and it fades in while touched (Apple Music-style).
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .offset(x = (trackW - 18.dp) * shown)
                .size(18.dp)
                .graphicsLayer { alpha = thumbAlpha }
                .clip(CircleShape)
                .background(colors.foreground),
        )
    }
}

// ---------------------------------------------------------------------------
// Lyrics — full-bleed pane: active line big/bold, neighbours dimmed, tap = seek.
// ---------------------------------------------------------------------------

@Composable
private fun LyricsPane(ui: UiState, vm: AppViewModel, positionMs: Long, track: Track) {
    val colors = LocalAuralis.current
    val lyrics = ui.lyrics
    val posSec = positionMs / 1000.0 + ui.lyricsOffset
    // AppViewModel already fetches lyrics on every track change; this pane-open call
    // only covers a track that was already playing before the ViewModel existed
    // (session restore — the track-change hook never ran for it). Wait a beat and
    // re-check the LIVE idle state (rememberUpdatedState: the effect lambda captures
    // stale values) so the two paths never race and request the same track twice.
    val stillIdle by rememberUpdatedState(ui.lyrics === LyricsResult.NONE && !ui.lyricsLoading)
    LaunchedEffect(track.trackhash) {
        delay(500)
        if (stillIdle) vm.fetchLyrics(false)
    }
    if (ui.lyricsLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(tr("lyrics.loading"), color = colors.textMuted, style = AMType.Subhead)
        }
        return
    }
    if (lyrics.lines.isEmpty()) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (lyrics.status == "instrumental") tr("lyrics.instrumental") else tr("lyrics.noLyrics"), color = colors.textMuted, style = AMType.Title3)
            Spacer(Modifier.height(10.dp))
            Box(Modifier.clip(CircleShape).background(colors.panel2.copy(alpha = 0.7f)).clickable { vm.fetchLyrics(true) }.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(tr("lyrics.searchOnline"), color = colors.foreground, style = AMType.Subhead)
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
                val alignLabel = if (ui.lyricsAligning) tr("lyrics.aligning") else tr("lyrics.wordByWord")
                val alignDesc = tr("lyrics.alignTitle")
                val delayDesc = tr("lyrics.delay")
                val resetDesc = tr("lyrics.resetOffset")
                val advanceDesc = tr("lyrics.advance")
                Box(
                    Modifier.clip(CircleShape).background(if (kOn) colors.accent else colors.panel2.copy(alpha = 0.7f))
                        .clickable { vm.toggleKaraoke() }.padding(horizontal = 12.dp, vertical = 6.dp),
                ) { Text(tr("lyrics.karaoke"), color = if (kOn) colors.ink else colors.textMuted, style = AMType.Caption1, fontWeight = FontWeight.SemiBold) }
                Spacer(Modifier.width(10.dp))
                // Forced word-by-word alignment (web GenerateWordByWord): the heavy
                // job runs server-side and the view model polls it.
                Box(
                    Modifier.clip(CircleShape).background(colors.panel2.copy(alpha = 0.7f))
                        .clickable(enabled = !ui.lyricsAligning) { vm.alignLyrics() }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                ) {
                    Text(
                        alignLabel, color = colors.textMuted, style = AMType.Caption1, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { contentDescription = alignDesc },
                    )
                }
                Spacer(Modifier.width(14.dp))
                Text("−", color = colors.foreground, fontSize = 20.sp,
                    modifier = Modifier.clickable { vm.adjustLyricsOffset(-0.1f) }
                        .semantics { contentDescription = delayDesc }.padding(horizontal = 8.dp))
                // The offset chip resets to the default on tap (web SyncOffset).
                Text("%+.1fs".format(ui.lyricsOffset), color = colors.textMuted, style = AMType.Caption1,
                    modifier = Modifier.clickable { vm.resetLyricsOffset() }
                        .semantics { contentDescription = resetDesc })
                Text("+", color = colors.foreground, fontSize = 20.sp,
                    modifier = Modifier.clickable { vm.adjustLyricsOffset(0.1f) }
                        .semantics { contentDescription = advanceDesc }.padding(horizontal = 8.dp))
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
                Text(builder, fontSize = 21.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth().clickable { vm.seekTo((line.time * 1000).toLong()) }.padding(vertical = 8.dp), textAlign = TextAlign.Center)
            } else {
                Text(
                    line.text.ifBlank { "♪" },
                    color = if (isActive && synced) colors.foreground else color,
                    fontSize = if (isActive) 22.sp else 18.sp,
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
    // Keep each track's REAL queue index: jumpTo/removeFromQueue and currentIndex
    // all address the controller's actual queue, but mapNotNull would renumber the
    // rows whenever a queueId doesn't resolve in trackByHash (a hash dropped after a
    // rescan, or an Android-Auto "track:"-prefixed id) — tapping would then hit the
    // wrong song and the "now playing" highlight would drift.
    val tracks = playback.queueIds.mapIndexedNotNull { realIndex, hash ->
        ui.trackByHash[hash]?.let { realIndex to it }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(tr("mobile.queue"), color = colors.foreground, style = AMType.Title3, modifier = Modifier.weight(1f))
            // Web QueueList shortcut: shuffle the WHOLE library into the queue.
            Text(
                tr("player.shuffle"), color = colors.textMuted, style = AMType.Footnote,
                modifier = Modifier.clickable { vm.playLibraryShuffled() }.padding(horizontal = 10.dp),
            )
            Text(tr("queue.clear"), color = colors.accent, style = AMType.Footnote, modifier = Modifier.clickable { vm.clearQueue() })
        }
        LazyColumn(Modifier.fillMaxSize()) {
            itemsIndexed(tracks) { _, (realIndex, t) ->
                val isCurrent = realIndex == playback.currentIndex
                Row(
                    Modifier.fillMaxWidth().clickable { vm.jumpTo(realIndex) }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CoverArt(t.image, t.albumhash ?: t.title, Modifier.size(40.dp), cornerRadius = 8, sizeDp = 40)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(t.title, color = if (isCurrent) colors.accent else colors.foreground, style = AMType.Subhead, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(t.displayArtist, color = colors.textMuted, style = AMType.Caption1, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    // Per-row reorder (web QueueList move up/down).
                    Icon(
                        Icons.Filled.KeyboardArrowUp, tr("queue.moveUp"), tint = colors.textFaint,
                        modifier = Modifier.size(24.dp)
                            .clickable(enabled = realIndex > 0) { vm.moveQueueItem(realIndex, realIndex - 1) },
                    )
                    Icon(
                        Icons.Filled.KeyboardArrowDown, tr("queue.moveDown"), tint = colors.textFaint,
                        modifier = Modifier.size(24.dp).clickable(enabled = realIndex < tracks.size - 1) {
                            vm.moveQueueItem(realIndex, realIndex + 1)
                        },
                    )
                    if (!isCurrent) {
                        Text("✕", color = colors.textFaint, fontSize = 16.sp, modifier = Modifier.clickable { vm.removeFromQueue(realIndex) }.padding(8.dp))
                    } else {
                        Spacer(Modifier.width(8.dp))
                    }
                }
            }
        }
    }
}
