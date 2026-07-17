package local.auralis.client.ui.theme

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

// Animated themed backdrop painted behind the whole UI for glass themes — the
// native equivalent of the web's <ThemeBackdrop/>. Two renderers cover the six
// backdrop kinds: a star/meteor field (starfield, galaxy) and a flowing colour
// cloud (aurora, nebula, mesh, ocean).

private class Star(val x: Float, val y: Float, val r: Float, val phase: Float, val tw: Float)

@Composable
fun ThemeBackdrop(modifier: Modifier = Modifier) {
    val backdrop = LocalBackdrop.current
    if (backdrop.kind == "none" || backdrop.colors.isEmpty()) return

    val transition = rememberInfiniteTransition(label = "backdrop")
    val t by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 90_000, easing = LinearEasing)),
        label = "t",
    )

    when (backdrop.kind) {
        "starfield", "galaxy" -> StarField(modifier, backdrop, t)
        else -> FlowField(modifier, backdrop, t)
    }
}

@Composable
private fun StarField(modifier: Modifier, backdrop: Backdrop, t: Float) {
    val count = (140 * backdrop.intensity).toInt().coerceIn(60, 260)
    val stars = remember(count) {
        val rnd = Random(count * 7919L)
        List(count) {
            Star(rnd.nextFloat(), rnd.nextFloat(), rnd.nextFloat() * 1.6f + 0.4f, rnd.nextFloat(), rnd.nextFloat() * 0.8f + 0.4f)
        }
    }
    val starColor = backdrop.colors.firstOrNull() ?: Color.White
    val glow = backdrop.colors
    val isGalaxy = backdrop.kind == "galaxy"
    val meteors = if (isGalaxy) backdrop.meteors else 0

    Canvas(modifier.fillMaxSize()) {
        val w = size.width; val h = size.height
        // Nebula glows (galaxy only).
        if (isGalaxy) {
            glow.take(3).forEachIndexed { i, c ->
                val cx = w * (0.3f + 0.4f * sin((t * 2 * PI + i * 1.7).toFloat()))
                val cy = h * (0.25f + 0.5f * cos((t * 2 * PI * 0.8 + i).toFloat()))
                val rad = (w.coerceAtLeast(h)) * 0.55f
                drawCircle(
                    brush = Brush.radialGradient(listOf(c.copy(alpha = 0.16f * backdrop.intensity), Color.Transparent), center = Offset(cx, cy), radius = rad),
                    radius = rad, center = Offset(cx, cy),
                )
            }
        }
        // Stars (drift downward slowly + twinkle).
        stars.forEach { s ->
            val y = ((s.y + t * 0.08f) % 1f) * h
            val x = s.x * w
            val twinkle = 0.35f + 0.65f * (0.5f + 0.5f * sin((t * 2 * PI * 4 * s.tw + s.phase * 6.28).toFloat()))
            drawCircle(color = starColor.copy(alpha = twinkle.coerceIn(0f, 1f)), radius = s.r, center = Offset(x, y))
        }
        // Meteors.
        for (i in 0 until meteors) {
            val p = ((t * (1.2f + i * 0.15f)) + i * 0.37f) % 1f
            val mx = w * (1.1f - p * 1.3f)
            val my = h * (-0.1f + p * 0.9f) + i * 40f
            val len = 120f
            val c = glow.getOrElse(i % glow.size.coerceAtLeast(1)) { starColor }
            drawLine(
                brush = Brush.linearGradient(listOf(c.copy(alpha = 0.0f), c.copy(alpha = 0.8f)), start = Offset(mx + len, my - len * 0.7f), end = Offset(mx, my)),
                start = Offset(mx + len, my - len * 0.7f), end = Offset(mx, my), strokeWidth = 2f,
            )
        }
    }
}

@Composable
private fun FlowField(modifier: Modifier, backdrop: Backdrop, t: Float) {
    val colors = backdrop.colors
    val intensity = backdrop.intensity
    Canvas(modifier.fillMaxSize()) {
        val w = size.width; val h = size.height
        val maxDim = w.coerceAtLeast(h)
        colors.forEachIndexed { i, c ->
            val sp = 0.6f + i * 0.18f
            val cx = w * (0.5f + 0.34f * sin((t * 2 * PI * sp + i * 1.3).toFloat()))
            val cy = h * (0.5f + 0.32f * cos((t * 2 * PI * sp * 1.25 + i * 0.7).toFloat()))
            val rad = maxDim * (0.42f + 0.08f * i)
            drawCircle(
                brush = Brush.radialGradient(
                    listOf(c.copy(alpha = 0.30f * intensity), Color.Transparent),
                    center = Offset(cx, cy), radius = rad,
                ),
                radius = rad, center = Offset(cx, cy),
            )
        }
    }
}
