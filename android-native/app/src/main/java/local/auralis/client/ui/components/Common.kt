package local.auralis.client.ui.components

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.Black, color = LocalAuralis.current.foreground)
        if (action != null && onAction != null) {
            Text(
                action,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = LocalAuralis.current.textMuted,
                modifier = Modifier.clickable { onAction() },
            )
        }
    }
}

@Composable
fun CoverArt(
    image: String?,
    seed: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Int = 12,
) {
    val (bg, c1, c2) = paletteFor(seed)
    val resolveUrl = local.auralis.client.ui.theme.LocalApiUrl.current
    Box(
        modifier
            .clip(RoundedCornerShape(cornerRadius.dp))
            .background(Brush.linearGradient(listOf(bg, c1.copy(alpha = 0.55f)))),
    ) {
        NetworkImage(
            url = resolveUrl(image),
            modifier = Modifier.fillMaxSize(),
            fallback = {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.MusicNote, null, tint = c2.copy(alpha = 0.8f), modifier = Modifier.size(28.dp))
                }
            },
        )
    }
}

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
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .clickable { onClick() }
            .background(if (isCurrent) colors.panel2 else Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverArt(track.image, track.albumhash ?: track.title, Modifier.size(46.dp), cornerRadius = 8)
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
        if (onToggleFavorite != null) {
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
        if (onMore != null) {
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
