package local.auralis.client.ui.theme

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import kotlin.math.abs

// ---------------------------------------------------------------------------
// Cover-driven ambient colour ("content is the colour", Liner's core idea).
//
// The app stage is near-black and the UI chrome is neutral, so the MOOD comes
// from the artwork: we sample the cover bitmap for two dominant tones and wash
// the background with them. When no cover is loaded the wash falls back to the
// accent-tinted neutral, so the stage never looks empty.
// ---------------------------------------------------------------------------

/** Two dominant tones pulled from a cover, used for the ambient wash. */
@Immutable
data class AmbientColors(val top: Color, val bottom: Color, val accent: Color)

/**
 * Extract two representative colours from a cover bitmap without pulling in the
 * androidx.palette library (the Android build is offline — no new Gradle deps).
 *
 * We bucket every pixel into coarse hue/luma buckets, keep the two buckets with
 * the most mass, and derive an accent (the more saturated of the two, pushed a
 * little brighter). Cheap enough for a 1280px cover and good enough for a
 * blurred wash.
 */
fun extractAmbient(bitmap: ImageBitmap?): AmbientColors? {
    if (bitmap == null || bitmap.width == 0 || bitmap.height == 0) return null
    val px = IntArray(bitmap.width * bitmap.height)
    bitmap.readPixels(px)

    // 6×6×6 RGB cube buckets → 216 slots, plus a luma accumulator per bucket.
    val counts = IntArray(216)
    val rSum = IntArray(216); val gSum = IntArray(216); val bSum = IntArray(216)
    for (p in px) {
        val a = (p ushr 24) and 0xFF
        if (a < 32) continue // skip transparent
        val r = (p ushr 16) and 0xFF
        val g = (p ushr 8) and 0xFF
        val b = p and 0xFF
        val idx = (r / 43) * 36 + (g / 43) * 6 + (b / 43)
        counts[idx]++
        rSum[idx] += r; gSum[idx] += g; bSum[idx] += b
    }
    // Take the two heaviest buckets.
    var i1 = -1; var i2 = -1
    for (i in counts.indices) {
        if (i1 < 0 || counts[i] > counts[i1]) { i2 = i1; i1 = i }
        else if (i2 < 0 || counts[i] > counts[i2]) { i2 = i }
    }
    if (i1 < 0) return null
    fun bucketColor(i: Int): Color {
        if (i < 0) return Color(0xFF1A1A1A)
        val n = counts[i].coerceAtLeast(1)
        return Color((rSum[i] / n), (gSum[i] / n), (bSum[i] / n))
    }
    val c1 = bucketColor(i1)
    val c2 = bucketColor(i2).takeIf { i2 >= 0 } ?: c1

    // Lift saturation/brightness for the accent so it reads on the dark stage.
    val accent = listOf(c1, c2).maxByOrNull { saturation(it) } ?: c1
    return AmbientColors(top = c1, bottom = c2, accent = brighten(accent, 0.18f))
}

private fun saturation(c: Color): Float {
    val mx = maxOf(c.red, c.green, c.blue)
    val mn = minOf(c.red, c.green, c.blue)
    return if (mx == 0f) 0f else (mx - mn) / mx
}

private fun brighten(c: Color, amount: Float): Color = Color(
    (c.red + (1f - c.red) * amount).coerceIn(0f, 1f),
    (c.green + (1f - c.green) * amount).coerceIn(0f, 1f),
    (c.blue + (1f - c.blue) * amount).coerceIn(0f, 1f),
)

/** Global holder for the ambient colours, driven by the now-playing cover. */
val LocalAmbient = staticCompositionLocalOf { AmbientColors(Color(0xFF12121A), Color(0xFF0A0A0A), LinerRedPrivate) }

// The accent used before any cover loads — a muted red that matches the accent
// token, referenced here to avoid a circular dependency on Theme.kt's privates.
private val LinerRedPrivate = Color(0xFFFF4D4D)

/**
 * The ambient stage: a soft two-tone radial wash over the deep-black canvas.
 * Colours animate between covers so the mood drifts rather than snaps.
 */
@Composable
fun AmbientBackdrop(
    ambient: AmbientColors,
    modifier: Modifier = Modifier,
    strength: Float = 1f,
) {
    val top by animateColorAsState(ambient.top, label = "ambientTop")
    val bottom by animateColorAsState(ambient.bottom, label = "ambientBottom")
    val accent by animateColorAsState(ambient.accent, label = "ambientAccent")
    val a by animateFloatAsState(strength, label = "ambientStrength")
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        // Vertical base wash: cover's top tone fading into near-black.
        drawRect(
            brush = Brush.verticalGradient(
                0f to top.copy(alpha = 0.30f * a),
                0.55f to bottom.copy(alpha = 0.16f * a),
                1f to Color.Black.copy(alpha = 0.0f),
            ),
        )
        // A warm glow in the upper third echoes the cover's accent colour.
        drawCircle(
            brush = Brush.radialGradient(
                0f to accent.copy(alpha = 0.22f * a),
                1f to accent.copy(alpha = 0f),
                center = Offset(w * 0.5f, h * 0.12f),
                radius = w * 0.9f,
            ),
            center = Offset(w * 0.5f, h * 0.12f),
            radius = w * 0.9f,
        )
    }
}
