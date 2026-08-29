package local.auralis.client.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

// Hand-drawn stand-ins for the SF Symbols Apple Music actually ships, where no
// Material glyph comes close. Paths use black fill/stroke only — Icon() tints
// the whole vector via a ColorFilter, so these pick up any tint like the
// Material icon set.

/** SF Symbol "dot.radiowaves.left.and.right" — the Radio tab glyph (Material's
 *  "Radio" is a hardware box, nothing like Apple's broadcast waves). */
val RadioWavesIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "RadioWaves",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        // Center dot.
        path(fill = SolidColor(Color.Black)) {
            moveTo(14.15f, 12f)
            arcTo(2.15f, 2.15f, 0f, false, false, 9.85f, 12f)
            arcTo(2.15f, 2.15f, 0f, false, false, 14.15f, 12f)
            close()
        }
        // Nested arcs either side ("(" and ")" pairs).
        path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.9f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ) {
            moveTo(8.1f, 9.5f)
            curveTo(6.7f, 10.35f, 6.7f, 13.65f, 8.1f, 14.5f)
            moveTo(5.4f, 7.6f)
            curveTo(3.2f, 9.25f, 3.2f, 14.75f, 5.4f, 16.4f)
            moveTo(15.9f, 9.5f)
            curveTo(17.3f, 10.35f, 17.3f, 13.65f, 15.9f, 14.5f)
            moveTo(18.6f, 7.6f)
            curveTo(20.8f, 9.25f, 20.8f, 14.75f, 18.6f, 16.4f)
        }
    }.build()
}

/** SF Symbol "ellipsis.circle" — the now-playing screen's menu affordance. */
val EllipsisCircleIcon: ImageVector by lazy {
    ImageVector.Builder(
        name = "EllipsisCircle",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    ).apply {
        // Ring.
        path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.5f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ) {
            moveTo(12f, 2.75f)
            arcTo(9.25f, 9.25f, 0f, false, false, 12f, 21.25f)
            arcTo(9.25f, 9.25f, 0f, false, false, 12f, 2.75f)
            close()
        }
        // Three dots.
        path(fill = SolidColor(Color.Black)) {
            moveTo(8.35f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 6.05f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 8.35f, 12f)
            close()
            moveTo(13.15f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 10.85f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 13.15f, 12f)
            close()
            moveTo(17.95f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 15.65f, 12f)
            arcTo(1.15f, 1.15f, 0f, false, false, 17.95f, 12f)
            close()
        }
    }.build()
}
