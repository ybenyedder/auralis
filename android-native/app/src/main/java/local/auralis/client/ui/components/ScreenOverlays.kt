package local.auralis.client.ui.components

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import local.auralis.client.i18n.tr
import local.auralis.client.model.SmartConfig
import local.auralis.client.ui.AppViewModel
import local.auralis.client.ui.UiState
import local.auralis.client.ui.ViewId
import local.auralis.client.ui.theme.LocalAuralis
import local.auralis.client.ui.theme.Spacing
import local.auralis.client.ui.theme.Type

// Screen-level sheets and dialogs hoisted into the Shell overlay layer. Drawn
// inside the screens (Shell's content Column), they sat UNDER the floating
// mini player + dock and their bottom rows hid behind the music chrome; Shell
// renders this AFTER the chrome, so the scrim covers the whole window and the
// sheets win the z-order. The open/close state lives in UiState (see
// AppViewModel's "screen sheets" block) and resets on navigation, mirroring the
// screen-local `remember` state these used to be.

/** Library "+" add menu, library playlist-row ⋯ menu, playlist hero ⋯ menu and
 *  the create-playlist / import-link dialogs the "+" menu opens. */
@Composable
fun ScreenOverlays(ui: UiState, vm: AppViewModel) {
    val colors = LocalAuralis.current
    // Transient dialog state — kept here (always composed) so it survives the
    // dialog being closed and reopened, like the screen-local state did.
    var createName by remember { mutableStateOf("") }
    var linkUrl by remember { mutableStateOf("") }
    var linkBusy by remember { mutableStateOf(false) }
    // SAF file picker for the "+" menu's "Importer un fichier" row. Providers
    // label .m3u/.json with half a dozen MIME types (or none at all), so accept
    // any file and let the parser validate the content.
    val importFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importPlaylistFromUri(uri)
    }

    // The single "+" menu: every creation affordance behind one clean button.
    if (ui.addMenuOpen) {
        MenuSheetScaffold(onDismiss = { vm.closeAddMenu() }) {
            Text(
                tr("library.addMenu"), color = colors.textMuted, style = Type.Caption,
                modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.xs),
            )
            MenuRow(Icons.Filled.QueueMusic, tr("ctx.newPlaylist")) {
                vm.closeAddMenu(); vm.openCreatePlaylist()
            }
            MenuRow(Icons.Filled.Download, tr("library.importFile")) {
                vm.closeAddMenu(); importFile.launch(arrayOf("*/*"))
            }
            MenuRow(Icons.Filled.Link, tr("library.importFromServices")) {
                vm.closeAddMenu(); vm.openImportLink()
            }
        }
    }

    // The library playlist row ⋯ menu — pin / reorder live behind one calm button.
    ui.libraryMenuPlaylist?.let { pl ->
        MenuSheetScaffold(onDismiss = { vm.closeLibraryPlaylistMenu() }) {
            MenuRow(Icons.Filled.PushPin, tr(if (pl.pinned) "common.unpin" else "common.pin")) {
                vm.togglePin(pl.id); vm.closeLibraryPlaylistMenu()
            }
            MenuRow(Icons.Filled.ArrowUpward, tr("common.moveUp")) {
                vm.movePlaylist(pl.id, -1); vm.closeLibraryPlaylistMenu()
            }
            MenuRow(Icons.Filled.ArrowDownward, tr("common.moveDown")) {
                vm.movePlaylist(pl.id, 1); vm.closeLibraryPlaylistMenu()
            }
        }
    }

    // The playlist hero ⋯ menu — every secondary action in one calm sheet.
    if (ui.playlistMenuOpen && ui.nav.view == ViewId.PLAYLIST) {
        val playlistId = ui.nav.id ?: ""
        val pl = ui.playlists.find { it.id == playlistId }
        val isSmart = pl?.rules?.let { SmartConfig.fromJson(it) } != null
        val isCollaborator = pl?.collaborator == true
        MenuSheetScaffold(onDismiss = { vm.closePlaylistMenu() }) {
            if (!isCollaborator) {
                MenuRow(Icons.Filled.PushPin, tr(if (pl?.pinned == true) "common.unpin" else "common.pin")) {
                    vm.togglePin(playlistId); vm.closePlaylistMenu()
                }
                MenuRow(Icons.Filled.Edit, tr("detail.rename")) {
                    vm.setPlaylistRenaming(true); vm.closePlaylistMenu()
                }
            }
            MenuDivider()
            // Export works for every playlist (incl. smart + collaborator);
            // share/invite are owner-only and hidden for smart (rules, not
            // tracks, are what's shared) — mirroring the web buttons.
            MenuRow(Icons.Filled.Download, tr("detail.export")) {
                vm.openPlaylistExport(); vm.closePlaylistMenu()
            }
            if (!isCollaborator && !isSmart) {
                MenuRow(Icons.Filled.Share, if (pl?.shared == true) tr("detail.shared") else tr("ctx.share")) {
                    vm.sharePlaylist(playlistId, pl?.shared != true); vm.closePlaylistMenu()
                }
                if (pl?.shared == true) {
                    MenuRow(Icons.Filled.Person, tr("detail.invite")) {
                        vm.openPlaylistInvite(); vm.closePlaylistMenu()
                    }
                }
            }
            if (!isCollaborator) {
                MenuDivider()
                MenuRow(Icons.Filled.Delete, tr("detail.delete"), tone = colors.destructive) {
                    vm.deletePlaylist(playlistId); vm.navigate(ViewId.LIBRARY); vm.closePlaylistMenu()
                }
            }
        }
    }

    // "Nouvelle playlist" — name it and land on the fresh playlist.
    if (ui.createPlaylistOpen) {
        AlertDialog(
            onDismissRequest = { vm.closeCreatePlaylist() },
            containerColor = colors.panel,
            title = { Text(tr("ctx.newPlaylist"), color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = createName, onValueChange = { createName = it }, singleLine = true,
                    placeholder = { Text(tr("library.newPlaylistName"), color = colors.textFaint) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
                        focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val name = createName.trim()
                        if (name.isNotEmpty()) vm.createPlaylist(name) { id -> vm.navigate(ViewId.PLAYLIST, id) }
                        createName = ""; vm.closeCreatePlaylist()
                    },
                ) { Text(tr("common.create"), color = colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = { vm.closeCreatePlaylist() }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }

    // Streaming-service link import: the server resolves the URL to a tracklist
    // (rate-limited 10/min per account), then it's matched against THIS library.
    if (ui.importLinkOpen) {
        AlertDialog(
            onDismissRequest = { if (!linkBusy) vm.closeImportLink() },
            containerColor = colors.panel,
            title = { Text(tr("library.importLink"), color = colors.foreground) },
            text = {
                OutlinedTextField(
                    value = linkUrl, onValueChange = { linkUrl = it }, singleLine = true,
                    placeholder = { Text(tr("library.linkPlaceholder"), color = colors.textFaint) },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = colors.accent, unfocusedBorderColor = colors.lineStrong,
                        focusedTextColor = colors.foreground, unfocusedTextColor = colors.foreground, cursorColor = colors.accent,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    enabled = linkUrl.isNotBlank() && !linkBusy,
                    onClick = {
                        linkBusy = true
                        vm.importPlaylistFromUrl(linkUrl.trim()) { ok ->
                            linkBusy = false
                            if (ok) { vm.closeImportLink(); linkUrl = "" }
                        }
                    },
                ) { Text(if (linkBusy) tr("library.importing") else tr("library.import"), color = colors.accent) }
            },
            dismissButton = {
                TextButton(onClick = { vm.closeImportLink() }) { Text(tr("common.cancel"), color = colors.textMuted) }
            },
        )
    }
}
