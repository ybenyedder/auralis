package local.auralis.client.ui.theme

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// Auralis design tokens — the single source of truth for spacing, corner radii,
// shapes, motion and loading shimmer. Every UI surface reads its metrics from
// here so the whole app moves and breathes as one system (no ad-hoc dp values).
// Mirrors the web design system (docs/design-system.md).
// ---------------------------------------------------------------------------

/**
 * Spacing scale: the ONLY legal layout gaps (4/8/12/16/24/32 dp), named by step.
 * `xs` for in-row icon↔label gaps, `sm` for row padding, `md` between related
 * elements, `lg` the screen gutter, `xl/xxl` between shelves and sections.
 */
object Spacing {
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 24.dp
    val xxl: Dp = 32.dp
}

/**
 * Corner-radius scale: `xs` tiny chips/thumbnails, `sm` rows + small tiles,
 * `md` cards + covers, `lg` sheets + heroes, `xl` oversized stage art,
 * `pill` fully-rounded buttons/chips.
 */
object Radius {
    val xs: Dp = 6.dp
    val sm: Dp = 10.dp
    val md: Dp = 14.dp
    val lg: Dp = 20.dp
    val xl: Dp = 28.dp
    val pill: Dp = 999.dp
}

/** The canonical shapes — cards, tiles, sheets, pills — derived from [Radius]. */
object AMShapes {
    /** Small tiles, row thumbnails, list rows. */
    val tile = RoundedCornerShape(Radius.sm)

    /** Cards: shelf cards, panels, settings groups, dialogs. */
    val card = RoundedCornerShape(Radius.md)

    /** Heroes / large stage art. */
    val hero = RoundedCornerShape(Radius.lg)

    /** Bottom sheets: rounded top edge only. */
    val sheet = RoundedCornerShape(topStart = Radius.lg, topEnd = Radius.lg)

    /** Buttons, chips, tags — fully rounded. */
    val pill = RoundedCornerShape(Radius.pill)

    /** Cover-art thumbnails inside rows (tracks, queue, menus). */
    val thumb = RoundedCornerShape(Radius.xs)
}

/**
 * Semantic type aliases onto the Apple-Music type scale (AMType). Screens use
 * these names instead of raw `sp` values so the hierarchy stays consistent:
 * `Title` screen/hero titles · `Section` shelf headers · `Body` primary text ·
 * `Label` buttons and secondary rows · `Caption` metadata and hints.
 */
object Type {
    /** Screen / hero titles (Title1, 28sp Bold). */
    val Title get() = AMType.Title1

    /** Section + shelf headers (Title3, 20sp SemiBold). */
    val Section get() = AMType.Title3

    /** Primary reading text, row titles (Subhead, 15sp). */
    val Body get() = AMType.Subhead

    /** Buttons, chips, secondary rows (Footnote + semibold). */
    val Label get() = AMType.Footnote

    /** Metadata, hints, timers (Caption1, 12sp). */
    val Caption get() = AMType.Caption1
}

/**
 * Motion tokens: one spring/fade vocabulary for the whole app. Route pushes
 * slide with a soft spring while crossfading; state changes (pills, chips,
 * progress) tween fast-out-slow-in.
 */
object Motion {
    /** Standard layout/list spring — soft landing, no bounce. */
    val standard: FiniteAnimationSpec<Float> = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)

    /** Placement spring for lazy-list item movement ([animateItem]). */
    val placement: FiniteAnimationSpec<androidx.compose.ui.unit.IntOffset> =
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)

    /** Route push/pop slide — the shared navigation motion (with a fade). */
    val slide: FiniteAnimationSpec<androidx.compose.ui.unit.IntOffset> =
        spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)

    /** Emphasis spring — a touch quicker, for interactive feedback. */
    val snappy: FiniteAnimationSpec<Float> = spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)

    /** Fade timing used across route transitions and image crossfades. */
    val fade: FiniteAnimationSpec<Float> = tween(220, easing = FastOutSlowInEasing)

    /** Small state changes (pill highlight, indicator, progress). */
    val quick: FiniteAnimationSpec<Float> = tween(180, easing = FastOutSlowInEasing)

    /** Slow state changes (scrims, sheets settling). */
    val gentle: FiniteAnimationSpec<Float> = tween(320, easing = FastOutSlowInEasing)
}

// ---- surfaces ---------------------------------------------------------------

/**
 * A tonal card surface: rounded clip + panel fill + 1dp hairline border — the
 * standard treatment for every card, panel and grouped settings section.
 */
@Composable
fun Modifier.tonalCard(
    shape: Shape = AMShapes.card,
    fill: androidx.compose.ui.graphics.Color = LocalAuralis.current.panel,
    border: Boolean = true,
): Modifier {
    val colors = LocalAuralis.current
    val clipped = this.clip(shape).background(fill)
    return if (border) clipped.border(1.dp, colors.line, shape) else clipped
}

// ---- loading shimmer --------------------------------------------------------

/**
 * Loading shimmer: a soft highlight sweeping across the surface while content
 * loads (the mobile cousin of the web's skeleton shimmer). Pass [active] to
 * stop the animation once the real content arrives.
 */
@Composable
fun Modifier.shimmer(active: Boolean = true): Modifier {
    if (!active) return this
    val colors = LocalAuralis.current
    val transition = rememberInfiniteTransition(label = "shimmer")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1150, easing = FastOutSlowInEasing), RepeatMode.Restart),
        label = "shimmerProgress",
    )
    val base = colors.panel2
    val highlight = colors.panel3
    return this.drawWithCache {
        val band = size.width * 0.7f
        val x = -band + (size.width + band * 2f) * progress
        val brush = Brush.linearGradient(
            colors = listOf(base, highlight, base),
            start = Offset(x, 0f),
            end = Offset(x + band, size.height),
        )
        onDrawBehind { drawRect(brush) }
    }
}
