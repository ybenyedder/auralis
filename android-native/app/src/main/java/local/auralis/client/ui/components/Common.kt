package local.auralis.client.ui.components

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import local.auralis.client.model.Track
import local.auralis.client.ui.theme.EyebrowStyle
import local.auralis.client.ui.theme.LocalAuralis
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

// ---- formatting ------------------------------------------------------------

fun formatDuration(seconds: Double?): String {
    val s = (seconds ?: 0.0).toInt()
    val m = s / 60
    val r = s % 60
    return "%d:%02d".format(m, r)
}

fun formatLongDuration(totalSeconds: Double): String {
    val total = totalSeconds.toLong()
    val h = total / 3600
    val m = (total % 3600) / 60
    return if (h > 0) "${h} h ${m} min" else "${m} min"
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

@Composable
fun SectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp, color = LocalAuralis.current.foreground)
        if (action != null && onAction != null) {
            Text(
                action.uppercase(),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.8.sp,
                color = LocalAuralis.current.textMuted,
                modifier = Modifier.clickable { onAction() },
            )
        }
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

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackRow(
    track: Track,
    index: Int? = null,
    isCurrent: Boolean = false,
    isFavorite: Boolean = false,
    onClick: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
    onMore: (() -> Unit)? = null,
) {
    val colors = LocalAuralis.current
    val sel = LocalSelection.current
    val selecting = sel.active
    val checked = selecting && sel.isSelected(track.trackhash)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            // Tap toggles selection while selecting; otherwise plays. Long-press always
            // enters selection mode (Spotify-style).
            .combinedClickable(
                onClick = { if (selecting) sel.toggle(track.trackhash) else onClick() },
                onLongClick = { sel.begin(track.trackhash) },
            )
            .background(if (checked) colors.accent.copy(alpha = 0.18f) else Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 7.dp),
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
                if (checked) Icon(Icons.Filled.Check, null, tint = colors.ink, modifier = Modifier.size(14.dp))
            }
            Spacer(Modifier.width(12.dp))
        } else if (index != null) {
            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
                if (isCurrent) {
                    EqualizerBars(active = true)
                } else {
                    Text("${index + 1}", color = colors.textFaint, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.width(10.dp))
        }
        CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(46.dp), cornerRadius = 8, sizeDp = 46)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.title,
                color = if (isCurrent) colors.accent else colors.foreground,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                track.displayArtist,
                color = colors.textMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // In selection mode the row's own affordances step aside for the checkbox.
        if (!selecting && onToggleFavorite != null) {
            Icon(
                if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = "Favori",
                tint = if (isFavorite) colors.accent else colors.textFaint,
                modifier = Modifier.size(20.dp).clickable { onToggleFavorite() },
            )
            Spacer(Modifier.width(10.dp))
        }
        Text(
            formatDuration(track.duration),
            color = colors.textFaint,
            fontSize = 12.sp,
        )
        if (!selecting && onMore != null) {
            Spacer(Modifier.width(6.dp))
            Icon(
                Icons.Filled.MoreVert,
                contentDescription = "Plus d'options",
                tint = colors.textFaint,
                modifier = Modifier.size(20.dp).clickable { onMore() },
            )
        }
    }
}

/** Album/artist/playlist hero: a soft palette-tinted gradient wash behind the cover +
 * title block, mirroring the web's `hero-cover` + `coverVars()`. */
@Composable
fun DetailHero(seed: String?, centered: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val colors = LocalAuralis.current
    val (_, c1, _) = paletteFor(seed)
    Box(
        Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    listOf(c1.copy(alpha = 0.32f), c1.copy(alpha = 0.08f), Color.Transparent),
                ),
            )
            .padding(top = 16.dp, bottom = 4.dp),
    ) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
            content = content,
        )
    }
}

/** Spotify's signature 56dp solid-accent circular hero play button — icon only, no label. */
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
            if (playing) "Pause" else "Lire",
            tint = colors.ink, modifier = Modifier.size(26.dp),
        )
    }
}

/** Icon-only ghost shuffle button next to the hero play button (no pill background). */
@Composable
fun HeroShuffleButton(enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .size(36.dp)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Shuffle, "Aléatoire",
            tint = colors.textMuted.copy(alpha = if (enabled) 1f else 0.4f),
            modifier = Modifier.size(24.dp),
        )
    }
}

@Composable
fun PlayPill(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Row(
        modifier
            .clip(CircleShape)
            .background(colors.accent)
            .clickable { onClick() }
            .padding(horizontal = 20.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.PlayArrow, null, tint = colors.ink, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = colors.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@Composable
fun GhostPill(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = LocalAuralis.current
    Box(
        modifier
            .clip(CircleShape)
            .background(colors.panel2)
            .clickable { onClick() }
            .padding(horizontal = 18.dp, vertical = 11.dp),
    ) {
        Text(label, color = colors.foreground, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
    }
}

@Composable
fun ColumnScopeSpacer(height: Int) {
    Spacer(Modifier.height(height.dp))
}
