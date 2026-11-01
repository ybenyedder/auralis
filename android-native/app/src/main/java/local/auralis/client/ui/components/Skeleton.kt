package local.auralis.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.shimmer

// ---------------------------------------------------------------------------
// Full-screen loading skeleton. Instead of a spinner on a blank stage, the app
// shows the SHAPE of the incoming home screen — header, hero title, shelf cards,
// quick tiles, list rows — all shimmering, so the content feels like it is
// materialising rather than "waiting on a spinner". This mirrors Liner's calm
// loading rhythm and avoids the blank/flash-jump of a bare spinner.
// ---------------------------------------------------------------------------

@Composable
fun SkeletonScreen() {
    LazyColumn(
        Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm, bottom = 140.dp),
    ) {
        // Header bar: avatar on the right (matches the real top bar).
        item {
            Row(Modifier.fillMaxWidth().padding(vertical = Spacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f))
                Box(Modifier.size(38.dp).clip(CircleShape).shimmer())
            }
        }
        // Hero title.
        item {
            Spacer(Modifier.height(Spacing.sm))
            Box(Modifier.fillMaxWidth(0.55f).height(30.dp).clip(AMShapes.pill).shimmer())
            Spacer(Modifier.height(Spacing.sm))
            Box(Modifier.fillMaxWidth(0.34f).height(14.dp).clip(AMShapes.pill).shimmer())
            Spacer(Modifier.height(Spacing.xl))
        }
        // A shelf: header + horizontal cards.
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.fillMaxWidth(0.32f).height(18.dp).clip(AMShapes.pill).shimmer())
                Spacer(Modifier.weight(1f))
                Box(Modifier.fillMaxWidth(0.12f).height(13.dp).clip(AMShapes.pill).shimmer())
            }
            Spacer(Modifier.height(Spacing.md))
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.md)) {
                repeat(3) {
                    Column(Modifier.width(150.dp)) {
                        Box(Modifier.fillMaxWidth().height(150.dp).clip(AMShapes.card).shimmer())
                        Spacer(Modifier.height(Spacing.sm))
                        Box(Modifier.fillMaxWidth(0.8f).height(12.dp).clip(AMShapes.pill).shimmer())
                        Spacer(Modifier.height(6.dp))
                        Box(Modifier.fillMaxWidth(0.5f).height(10.dp).clip(AMShapes.pill).shimmer())
                    }
                }
            }
            Spacer(Modifier.height(Spacing.xl))
        }
        // Quick tiles (2 columns).
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.sm)) {
                repeat(2) {
                    Box(Modifier.weight(1f).height(56.dp).clip(AMShapes.tile).shimmer())
                }
            }
            Spacer(Modifier.height(Spacing.xl))
        }
        // List rows.
        items(5) {
            SkeletonRows(1)
        }
    }
}
