package local.auralis.client.ui.components

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.i18n.Messages
import local.auralis.client.i18n.tr
import local.auralis.client.model.Track
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.EyebrowStyle
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Radius
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type
import local.auralis.client.ui.theme.shimmer
import dev.chrisbanes.haze.hazeEffect
import kotlinx.coroutines.delay
import kotlin.math.abs

// ---- multi-select ----------------------------------------------------------
// Selection is wired once at the Shell root and read by every TrackRow through this
// CompositionLocal, so rows gain Spotify-style long-press-to-select + checkbox without
// threading callbacks through every screen's call site.
data class SelectionController(
    val active: Boolean = false,
    val isSelected: (String) -> Boolean = { false },
    val toggle: (String) -> Unit = {},
    val begin: (String) -> Unit = {},
)
val LocalSelection = staticCompositionLocalOf { SelectionController() }

// ---- now-playing toggle ----------------------------------------------------
// Tapping the CURRENT track must pause/resume it, never rebuild the queue from
// zero (the old behaviour: every row click called playTrack → playTracks(..., 0)).
// Wired once at the Shell root like LocalSelection, so every TrackRow agrees.
val LocalPlayingToggle = staticCompositionLocalOf<() -> Unit> { {} }

// ---- frosted surfaces (Apple Music glass) -----------------------------------
// Real backdrop blur via Haze. The Shell provides the HazeState (over the
// scrolling content) and the AM-tinted HazeStyle; components below render with
// [amFrosted]. When the locals are absent (previews, tests) the modifier falls
// back to a solid panel color, so every call site stays preview-safe.
val LocalHazeState = staticCompositionLocalOf<dev.chrisbanes.haze.HazeState?> { null }
val LocalHazeStyle = staticCompositionLocalOf<dev.chrisbanes.haze.HazeStyle?> { null }

/** Apple Music's frosted material: clips to [shape], then blurs whatever scrolls
 *  behind. Falls back to a solid [fallback] fill when blur isn't available. */
@Composable
fun Modifier.amFrosted(shape: Shape? = null, fallback: Color): Modifier {
    val haze = LocalHazeState.current
    val style = LocalHazeStyle.current
    var m = this
    if (shape != null) m = m.clip(shape)
    return if (haze != null && style != null) m.hazeEffect(haze, style) else m.background(fallback)
}

// ---- formatting ------------------------------------------------------------

fun formatDuration(seconds: Double?): String {
    val s = (seconds ?: 0.0).toInt()
    val m = s / 60
    val r = s % 60
    return "%d:%02d".format(m, r)
}

fun formatLongDuration(totalSeconds: Double): String = Messages.formatLongDuration(totalSeconds)

// ---- sleep-timer countdown --------------------------------------------------

/** "m:ss" like the web's sleep badge ("4:59"); empty once expired. */
fun formatCountdown(remainingMs: Long): String {
    val total = (remainingMs / 1000).coerceAtLeast(0)
    return "%d:%02d".format(total / 60, total % 60)
}

/** Live [formatCountdown] for the armed sleep timer — ticks once a second while
 *  `sleepEndsAt` (SystemClock.elapsedRealtime-based, like the accounting's timer)
 *  is set. Returns "" when no timed sleep is running ("Fin du titre" has none). */
@Composable
fun rememberSleepCountdown(sleepEndsAt: Long?): String {
    var nowMs by remember { mutableStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(sleepEndsAt) {
        while (sleepEndsAt != null) {
            nowMs = SystemClock.elapsedRealtime()
            delay(1000)
        }
    }
    return if (sleepEndsAt == null) "" else formatCountdown(sleepEndsAt - nowMs)
}

// Deterministic cover palette for tracks/albums without real art (hashed name).
private val palettes = listOf(
    Triple(Color(0xFF2A2821), Color(0xFFD95F45), Color(0xFFC6A15B)),
    Triple(Color(0xFF1E2A28), Color(0xFF6EB29E), Color(0xFFB7D8CC)),
    Triple(Color(0xFF241F2A), Color(0xFF8B5CF6), Color(0xFFC79BFB)),
    Triple(Color(0xFF2A2420), Color(0xFFFB923C), Color(0xFFFDC289)),
    Triple(Color(0xFF1F2530), Color(0xFF38BDF8), Color(0xFF8AD8FB)),
    Triple(Color(0xFF2A1F25), Color(0xFFFF5FA2), Color(0xFFFF9CC6)),
)

fun paletteFor(seed: String?): Triple<Color, Color, Color> {
    val s = seed ?: "auralis"
    var h = 0
    for (c in s) h = (h * 31 + c.code) and 0x7fffffff
    return palettes[abs(h) % palettes.size]
}

// ---- brand -------------------------------------------------------------------
// The Auralis logo: a five-bar "aura equalizer" glyph (mirrors web's AuralisGlyph
// SVG, viewBox 32x32) that reads as both a waveform and the apex of an "A".

@Composable
fun AuralisGlyph(modifier: Modifier = Modifier.size(20.dp), tint: Color = LocalAuralis.current.accent) {
    Canvas(modifier) {
        val scale = size.width / 32f
        val barW = 3.7f * scale
        val rx = CornerRadius(1.85f * scale, 1.85f * scale)
        listOf(
            Triple(3.4f, 19f, 0.5f),
            Triple(8.9f, 13f, 0.75f),
            Triple(14.15f, 5f, 1f),
            Triple(19.4f, 13f, 0.75f),
            Triple(24.9f, 19f, 0.5f),
        ).forEach { (x, y, alpha) ->
            drawRoundRect(
                color = tint.copy(alpha = alpha),
                topLeft = Offset(x * scale, y * scale),
                size = Size(barW, (27f - y) * scale),
                cornerRadius = rx,
            )
        }
    }
}

/** The badged mark used in headers / splash screens — a circle housing the glyph. */
@Composable
fun BrandMark(size: Int = 30, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(colors.panel2)
            .border(1.dp, colors.lineStrong, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        AuralisGlyph(Modifier.size((size * 0.67f).dp), tint = colors.accent)
    }
}

// ---- atoms -----------------------------------------------------------------

@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = EyebrowStyle,
        color = LocalAuralis.current.brass,
        modifier = modifier,
    )
}

/** The 34pt bold large title that opens each tab's content (Liner/Apple Music). */
@Composable
fun LargeTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = AMType.LargeTitle,
        color = LocalAuralis.current.foreground,
        modifier = modifier,
    )
}

/**
 * Spotify-style playlist cover: a 2×2 mosaic of the first four tracks' ALBUM
 * covers (1 track → its album cover, 2 → split, 3 → 2+1). This replaces the
 * hash-seeded gradient wash that made every auto-covered playlist look
 * machine-generated — the mosaic is always real album art. The seeded gradient
 * remains only as a last resort for a truly empty playlist.
 */
@Composable
fun PlaylistMosaic(
    tracks: List<Track>,
    seed: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Int = 10,
    sizeDp: Int = 0,
) {
    val covers = tracks.take(4).map { it.image }
    Box(
        modifier
            .clip(RoundedCornerShape(cornerRadius.dp))
            .background(LocalAuralis.current.panel2),
    ) {
        when {
            covers.isEmpty() -> CoverArt(null, seed, Modifier.fillMaxSize(), cornerRadius = cornerRadius, sizeDp = sizeDp)
            covers.size == 1 -> CoverArt(covers[0], tracks[0].albumhash ?: seed, Modifier.fillMaxSize(), cornerRadius = cornerRadius, sizeDp = sizeDp)
            covers.size == 2 -> Column(Modifier.fillMaxSize()) {
                CoverArt(covers[0], tracks[0].albumhash ?: seed, Modifier.fillMaxWidth().weight(1f), cornerRadius = 0, sizeDp = sizeDp / 2)
                CoverArt(covers[1], tracks[1].albumhash ?: seed, Modifier.fillMaxWidth().weight(1f), cornerRadius = 0, sizeDp = sizeDp / 2)
            }
            covers.size == 3 -> Row(Modifier.fillMaxSize()) {
                CoverArt(covers[0], tracks[0].albumhash ?: seed, Modifier.fillMaxHeight().weight(1f), cornerRadius = 0, sizeDp = sizeDp / 2)
                Column(Modifier.fillMaxHeight().weight(1f)) {
                    CoverArt(covers[1], tracks[1].albumhash ?: seed, Modifier.fillMaxWidth().weight(1f), cornerRadius = 0, sizeDp = sizeDp / 2)
                    CoverArt(covers[2], tracks[2].albumhash ?: seed, Modifier.fillMaxWidth().weight(1f), cornerRadius = 0, sizeDp = sizeDp / 2)
                }
            }
            else -> Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    CoverArt(covers[0], tracks[0].albumhash ?: seed, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = sizeDp / 2)
                    CoverArt(covers[1], tracks[1].albumhash ?: seed, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = sizeDp / 2)
                }
                Row(Modifier.fillMaxWidth().weight(1f)) {
                    CoverArt(covers[2], tracks[2].albumhash ?: seed, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = sizeDp / 2)
                    CoverArt(covers[3], tracks[3].albumhash ?: seed, Modifier.weight(1f).fillMaxSize(), cornerRadius = 0, sizeDp = sizeDp / 2)
                }
            }
        }
    }
}

/**
 * Liner-style page hero: a small muted eyebrow (greeting / section kicker) over
 * the large title, with an optional muted subtitle beneath. This is the polished
 * replacement for a bare LargeTitle — it gives each tab an editorial opening
 * instead of a lone bold word stuck in the corner.
 */
@Composable
fun PageHero(
    title: String,
    modifier: Modifier = Modifier,
    eyebrow: String? = null,
    subtitle: String? = null,
) {
    val colors = LocalAuralis.current
    Column(modifier) {
        if (eyebrow != null) {
            Eyebrow(eyebrow)
            Spacer(Modifier.height(Spacing.xs))
        }
        Text(
            title,
            style = AMType.LargeTitle,
            color = colors.foreground,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
        if (subtitle != null) {
            Spacer(Modifier.height(Spacing.xs))
            Text(subtitle, style = AMType.Subhead, color = colors.textMuted)
        }
    }
}

/** Time-of-day greeting key ("Bonjour" / "Bonsoir"…) — the Liner-style warm
 *  kicker above the home hero. Uses the device clock. */
fun greetingKeyFor(hour: Int): String = when (hour) {
    in 5..11 -> "home.greeting.morning"
    in 12..17 -> "home.greeting.afternoon"
    in 18..22 -> "home.greeting.evening"
    else -> "home.greeting.night"
}

/** Apple Music shelf header: bold Title3 on the left, red "Tout afficher" link on the right. */
@Composable
fun SectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = Spacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = Type.Section,
            color = LocalAuralis.current.foreground,
        )
        if (action != null && onAction != null) {
            // "Tout afficher" — a text action, not a button: one per shelf max.
            Text(
                action,
                style = Type.Label,
                fontWeight = FontWeight.SemiBold,
                color = LocalAuralis.current.accent,
                modifier = Modifier
                    .clip(AMShapes.pill)
                    .clickable { onAction() }
                    .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            )
        }
    }
}

/**
 * The standard icon-only action: 22dp glyph centered in a 48dp touch target
 * (Material's minimum), used for every header/transport/hero icon button so
 * scattered under-sized icon buttons disappear from the app.
 */
@Composable
fun IconAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    modifier: Modifier = Modifier,
    tint: Color = LocalAuralis.current.foreground,
    iconSize: Int = 22,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .size(48.dp)
            .clip(AMShapes.pill)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon, label,
            tint = tint.copy(alpha = if (enabled) 1f else 0.4f),
            modifier = Modifier.size(iconSize.dp),
        )
    }
}

/** Static "now playing" glyph — four fixed-height bars, dimmed when paused. Mirrors
 * the web's EqualizerBars (a deliberately non-animated indicator, not a fake spectrum). */
@Composable
fun EqualizerBars(active: Boolean = true, modifier: Modifier = Modifier) {
    val colors = LocalAuralis.current
    val heights = listOf(7.dp, 14.dp, 10.dp, 6.dp)
    Row(modifier.height(14.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        heights.forEach { h ->
            Box(
                Modifier
                    .width(2.dp)
                    .height(h)
                    .clip(RoundedCornerShape(1.dp))
                    .background(colors.accent.copy(alpha = if (active) 0.85f else 0.34f)),
            )
        }
    }
}

/** Skeleton rows — shimmering blocks in the row rhythm while content loads,
 *  so lists never flash blank (the web skeleton pattern, mobile edition). */
@Composable
fun SkeletonRows(count: Int = 3) {
    repeat(count) {
        Row(Modifier.fillMaxWidth().padding(horizontal = Spacing.sm, vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(46.dp).clip(AMShapes.thumb).shimmer())
            Spacer(Modifier.width(Spacing.md))
            Column(Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth(0.7f).height(12.dp).clip(AMShapes.pill).shimmer())
                Spacer(Modifier.height(Spacing.sm))
                Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(AMShapes.pill).shimmer())
            }
        }
    }
}

// Square webp buckets the art API can serve (mirror of server ART_VARIANT_SIZES).
private val ART_BUCKETS = intArrayOf(96, 160, 256, 384, 640)

/**
 * Rewrite an /api/art URL to fetch a right-sized webp thumbnail (`?w=<bucket>`)
 * instead of the full embedded original — which is frequently 1000–3000px / several
 * MB. `targetPx` is the actual on-screen pixel size (dp × density). We pick the
 * smallest bucket that covers it, so art stays crisp while a 46dp row thumbnail
 * downloads ~6KB instead of a multi-MB cover and the bitmap LRU holds far more.
 * A `targetPx` of 0 (or larger than the top bucket) keeps the original, for big
 * surfaces (full-screen player art, notifications) that want full resolution.
 */
fun sizedArtUrl(url: String?, targetPx: Int): String? {
    if (url.isNullOrBlank() || targetPx <= 0 || !url.contains("/api/art/")) return url
    val bucket = ART_BUCKETS.firstOrNull { it >= targetPx } ?: return url
    val sep = if (url.contains('?')) '&' else '?'
    return "$url${sep}w=$bucket"
}

@Composable
fun CoverArt(
    image: String?,
    seed: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Int = 12,
    sizeDp: Int = 180,
) {
    val (bg, c1, c2) = paletteFor(seed)
    val resolveUrl = local.auralis.client.ui.theme.LocalApiUrl.current
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    val targetPx = if (sizeDp <= 0) 0 else (sizeDp * density).toInt()
    Box(
        modifier
            .clip(RoundedCornerShape(cornerRadius.dp))
            .background(Brush.linearGradient(listOf(bg, c1.copy(alpha = 0.55f)))),
    ) {
        NetworkImage(
            url = sizedArtUrl(resolveUrl(image), targetPx),
            modifier = Modifier.fillMaxSize(),
            fallback = {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.MusicNote, null, tint = c2.copy(alpha = 0.8f), modifier = Modifier.size(28.dp))
                }
            },
        )
    }
}

/**
 * The canonical track row: rounded thumbnail + title/artist stack + duration +
 * overflow. A `LazyItemScope` extension so every list animates item appearance,
 * movement and dismissal ([animateItem]) for free.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LazyItemScope.TrackRow(
    track: Track,
    index: Int? = null,
    isCurrent: Boolean = false,
    isPlaying: Boolean = false,
    isFavorite: Boolean = false,
    onClick: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
    onMore: (() -> Unit)? = null,
) {
    val colors = LocalAuralis.current
    val sel = LocalSelection.current
    val onPlayingToggle = LocalPlayingToggle.current
    val selecting = sel.active
    val checked = selecting && sel.isSelected(track.trackhash)
    Row(
        Modifier
            .fillMaxWidth()
            .animateItem(placementSpec = Motion.placement)
            .clip(AMShapes.tile)
            // Tap toggles selection while selecting; on the CURRENT track it
            // pauses/resumes in place; otherwise it plays the tapped track.
            // Long-press always enters selection mode (Spotify-style).
            .combinedClickable(
                onClick = {
                    when {
                        selecting -> sel.toggle(track.trackhash)
                        isCurrent -> onPlayingToggle()
                        else -> onClick()
                    }
                },
                onLongClick = { sel.begin(track.trackhash) },
            )
            .background(if (checked) colors.accent.copy(alpha = 0.18f) else Color.Transparent)
            .padding(horizontal = Spacing.sm, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selecting) {
            Box(
                Modifier
                    .size(22.dp)
                    .clip(CircleShape)
                    .then(if (checked) Modifier.background(colors.accent) else Modifier.border(1.5.dp, colors.textFaint, CircleShape)),
                contentAlignment = Alignment.Center,
            ) {
                if (checked) Icon(Icons.Filled.Check, tr("common.selected"), tint = colors.ink, modifier = Modifier.size(14.dp))
            }
            Spacer(Modifier.width(Spacing.md))
        } else if (index != null) {
            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                if (isCurrent) {
                    // Dimmed when paused — the web's EqualizerBars contract.
                    EqualizerBars(active = isPlaying)
                } else {
                    Text("${index + 1}", color = colors.textFaint, style = Type.Caption)
                }
            }
            Spacer(Modifier.width(Spacing.md))
        }
        CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(46.dp), cornerRadius = Radius.sm.value.toInt(), sizeDp = 46)
        Spacer(Modifier.width(Spacing.md))
        Column(Modifier.weight(1f)) {
            Text(
                track.title,
                color = if (isCurrent) colors.accent else colors.foreground,
                style = Type.Body,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                track.displayArtist,
                color = colors.textMuted,
                style = Type.Caption,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // In selection mode the row's own affordances step aside for the checkbox.
        if (!selecting && onToggleFavorite != null) {
            // 40dp hit target (was a bare 20dp icon — below every mobile minimum).
            Box(Modifier.size(40.dp).clip(CircleShape).clickable { onToggleFavorite() }, contentAlignment = Alignment.Center) {
                Icon(
                    if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = tr("common.favoriteAria"),
                    tint = if (isFavorite) colors.accent else colors.textFaint,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(Spacing.xs))
        }
        Text(
            formatDuration(track.duration),
            color = colors.textFaint,
            style = Type.Caption,
        )
        if (!selecting && onMore != null) {
            Box(Modifier.size(40.dp).clip(CircleShape).clickable { onMore() }, contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Filled.MoreVert,
                    contentDescription = tr("common.moreOptions"),
                    tint = colors.textFaint,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

/**
 * Album/artist/playlist hero: a soft palette-tinted gradient scrim behind the
 * cover + title block (Apple Music/Spotify hero wash), fading to the page
 * background so titles and actions anchor cleanly.
 */
@Composable
fun DetailHero(seed: String?, centered: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val colors = LocalAuralis.current
    val (_, c1, _) = paletteFor(seed)
    Box(
        Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(
                        c1.copy(alpha = 0.38f),
                        c1.copy(alpha = 0.14f),
                        colors.background.copy(alpha = 0f),
                    ),
                ),
            )
            .padding(top = Spacing.lg, bottom = Spacing.xs),
    ) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
            content = content,
        )
    }
}

/** Spotify's signature 56dp solid-accent circular hero play button — the ONE
 *  primary action of every detail screen (icon only, no label). */
@Composable
fun HeroPlayButton(enabled: Boolean = true, playing: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(colors.accent.copy(alpha = if (enabled) 1f else 0.4f))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            if (playing) tr("player.pause") else tr("common.play"),
            tint = colors.ink, modifier = Modifier.size(26.dp),
        )
    }
}

/**
 * The hero's secondary action: icon-only ghost shuffle on a tonal pill —
 * paired with [HeroPlayButton]; everything else belongs in the ⋯ menu.
 */
@Composable
fun HeroShuffleButton(enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(colors.panel2.copy(alpha = if (enabled) 1f else 0.4f))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Shuffle, tr("common.shuffle"),
            tint = colors.foreground.copy(alpha = if (enabled) 0.85f else 0.4f),
            modifier = Modifier.size(22.dp),
        )
    }
}

/** Filled primary pill — the single loudest action of a block ("Lire", "Enregistrer").
 *  [icon] = null renders a label-only pill (no play triangle on non-play actions). */
@Composable
fun PlayPill(label: String, modifier: Modifier = Modifier, icon: ImageVector? = Icons.Filled.PlayArrow, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        modifier
            .clip(AMShapes.pill)
            .background(colors.accent)
            .clickable { onClick() }
            .padding(horizontal = 20.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = colors.ink, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Spacing.sm))
        }
        Text(label, color = colors.ink, style = Type.Body, fontWeight = FontWeight.Bold)
    }
}

/** Tonal secondary pill — at most one per block, beside the primary action. */
@Composable
fun GhostPill(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .clip(AMShapes.pill)
            .background(colors.panel2)
            .clickable { onClick() }
            .padding(horizontal = 18.dp, vertical = 11.dp),
    ) {
        Text(label, color = colors.foreground, style = Type.Body, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun ColumnScopeSpacer(height: Int) {
    Spacer(Modifier.height(height.dp))
}
