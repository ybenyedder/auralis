package local.auralis.client.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import local.auralis.client.i18n.tr
import local.auralis.client.model.ImportRow
import local.auralis.client.model.ImportRowState
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.theme.AMShapes
import local.auralis.client.ui.theme.AMType
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Motion
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

// Playlist import → the missing-tracks download batch, rebuilt around
// VISIBILITY: the batch auto-starts after the import and this live bottom sheet
// (rendered in Shell's overlay layer, like ScreenOverlays — not a dismissable
// dialog) shows every missing track landing in the playlist one by one. Closing
// the sheet keeps the batch running; the playlist screen keeps a small banner up
// while it does.

/** The live per-track download sheet: header counter + progress bar, a
 *  scrollable list of every missing track with its live status, and the
 *  "Voir la playlist" / "Fermer" / "Tout annuler" actions. */
@Composable
fun ImportDownloadSheet(ui: UiState, vm: AppViewModel) {
    val colors = LocalAuralis.current
    val dl = ui.importDownload ?: return
    if (!ui.importSheetOpen) return

    // Entrance: scrim fades in, sheet slides up (MenuSheetScaffold's motion).
    val enter = remember { Animatable(0f) }
    LaunchedEffect(Unit) { enter.animateTo(1f, Motion.gentle) }
    val e = enter.value

    Box(Modifier.fillMaxSize()) {
        // Tapping the scrim = "Fermer": the batch continues in the background.
        Box(
            Modifier.fillMaxSize()
                .graphicsLayer { alpha = e }
                .background(Color(0xAA000000))
                .clickable { vm.dismissImportSheet() },
        )
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .graphicsLayer { alpha = e; translationY = (1f - e) * 160f }
                .clip(AMShapes.sheet)
                .background(colors.panel)
                .navigationBarsPadding()
                .padding(horizontal = Spacing.md, vertical = Spacing.md),
        ) {
            // Drag handle (the shared bottom-sheet affordance).
            Box(
                Modifier.padding(bottom = Spacing.sm).align(Alignment.CenterHorizontally)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(colors.lineStrong),
            )

            // Header: "Import de « {playlist} » — {done}/{total}" + progress bar.
            Text(
                tr(
                    "import.sheetTitle",
                    params = mapOf(
                        "name" to dl.playlistName,
                        "done" to dl.done,
                        "total" to dl.total,
                    ),
                ),
                color = colors.foreground, style = AMType.Headline, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(Spacing.sm))
            LinearProgressIndicator(
                progress = { dl.finishedFraction },
                modifier = Modifier.fillMaxWidth(),
                color = colors.accent,
                trackColor = colors.panel2,
            )
            Spacer(Modifier.height(Spacing.sm))

            // The failed-to-start case: say WHY (server error text) and offer the
            // manual retry — the ONLY place the confirm affordance still exists.
            val startError = dl.startError
            if (startError != null) {
                Text(startError, color = colors.destructive, style = Type.Caption)
                Spacer(Modifier.height(Spacing.xs))
                TextButton(onClick = { vm.retryImportDownload() }) {
                    Text(
                        tr("import.downloadMissing", params = mapOf("count" to dl.total)),
                        color = colors.accent, fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            // Every missing track, live — "En attente…" → "Téléchargement… N%" →
            // "✅ Ajouté à la playlist" / "❌ Échec" / "Annulé".
            LazyColumn(Modifier.heightIn(max = 320.dp).fillMaxWidth()) {
                items(dl.rows) { row -> DownloadRow(row) }
            }

            Row(
                Modifier.fillMaxWidth().padding(top = Spacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (dl.running) {
                    TextButton(onClick = { vm.cancelImportDownload() }) {
                        Text(tr("import.cancelAll"), color = colors.destructive)
                    }
                }
                Spacer(Modifier.weight(1f))
                if (dl.done >= 1) {
                    TextButton(onClick = { vm.viewImportPlaylist() }) {
                        Text(tr("import.viewPlaylist"), color = colors.accent, fontWeight = FontWeight.SemiBold)
                    }
                }
                TextButton(onClick = { vm.dismissImportSheet() }) {
                    Text(tr("common.close"), color = colors.textMuted)
                }
            }
        }
    }
}

/** One missing track row: label + an animated live status (the added rows get a
 *  check; failed rows show the server's reason briefly). */
@Composable
private fun DownloadRow(row: ImportRow) {
    val colors = LocalAuralis.current
    val status = when (row.state) {
        ImportRowState.QUEUED -> tr("import.rowQueued")
        ImportRowState.DOWNLOADING -> tr("import.rowDownloading", params = mapOf("progress" to row.progress))
        ImportRowState.ADDED -> tr("import.rowAdded")
        ImportRowState.FAILED -> tr("import.rowFailed")
        ImportRowState.CANCELLED -> tr("import.rowCancelled")
    }
    val statusColor by animateColorAsState(
        targetValue = when (row.state) {
            ImportRowState.ADDED -> colors.brass
            ImportRowState.FAILED -> colors.destructive
            ImportRowState.CANCELLED -> colors.textFaint
            else -> colors.accent
        },
        label = "importRowTint",
    )
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Spacing.xs, vertical = Spacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The added rows get a check that scales in when the row settles.
        Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
            // Fully qualified: the scoped (RowScope) AnimatedVisibility overload
            // must not win over the top-level one inside this nested Box.
            androidx.compose.animation.AnimatedVisibility(
                visible = row.state == ImportRowState.ADDED,
                enter = scaleIn(initialScale = 0.4f) + fadeIn(),
                exit = scaleOut(targetScale = 0.4f) + fadeOut(),
            ) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = colors.brass, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.width(Spacing.sm))
        Column(Modifier.weight(1f)) {
            Text(row.label, color = colors.foreground, style = Type.Body, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val detail = row.detail
            if (detail != null && row.state == ImportRowState.FAILED) {
                Text(detail, color = colors.textMuted, style = Type.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.width(Spacing.sm))
        // Rows animate their status change (crossfade + tint).
        AnimatedContent(
            targetState = status,
            transitionSpec = { fadeIn(Motion.fade) togetherWith fadeOut(Motion.fade) },
            label = "importRowStatus",
        ) { text ->
            Text(text, color = statusColor, style = Type.Caption, maxLines = 1)
        }
    }
}

/** Small inline banner on the playlist screen while its import batch runs:
 *  "N titres en cours de téléchargement…" — tap to reopen the live sheet, so
 *  the tracks are seen arriving even after the sheet was closed. */
@Composable
fun ImportDownloadBanner(ui: UiState, vm: AppViewModel, playlistId: String) {
    val colors = LocalAuralis.current
    val dl = ui.importDownload ?: return
    if (!dl.running || dl.playlistId != playlistId || dl.pending == 0) return
    Row(
        Modifier.fillMaxWidth()
            .clip(AMShapes.card)
            .background(colors.panel2)
            .clickable { vm.openImportSheet() }
            .padding(horizontal = Spacing.md, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
    ) {
        EqualizerBars(active = true, modifier = Modifier.size(16.dp))
        Text(
            tr("import.bannerRunning", params = mapOf("count" to dl.pending)),
            color = colors.foreground, style = Type.Label,
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}
