package local.auralis.client.model

import local.auralis.client.i18n.Messages
import java.net.URLEncoder

/**
 * Share payloads (web lib/auralis/share.ts): the "what I'm listening to" phrase
 * plus the deep link into the web app (`<origin>/?view=…`), handed to the native
 * share sheet and copied to the clipboard as a fallback. Pure string building —
 * the URL shape and the French phrasing are pinned by unit tests.
 */
object ShareLinks {

    /** Deep link to one entity of the web shell (`/?view=<view>&id=<hash>`). */
    fun viewUrl(base: String, view: String, id: String): String =
        "${base.trimEnd('/')}/?view=$view&id=${encode(id)}"

    fun trackUrl(base: String, trackhash: String): String = viewUrl(base, "track", trackhash)
    fun albumUrl(base: String, albumhash: String): String = viewUrl(base, "album", albumhash)
    fun artistUrl(base: String, artisthash: String): String = viewUrl(base, "artist", artisthash)

    /** Web toast.shareText ("J’écoute {label} sur Auralis") + the deep link. */
    fun text(label: String, url: String): String =
        Messages.t("toast.shareText", params = mapOf("label" to label)) + "\n" + url

    /** "Title — Artist", the label the web shares (trackTitle — trackArtist). */
    fun label(title: String, artist: String): String = "$title — $artist"

    private fun encode(v: String): String = URLEncoder.encode(v, "UTF-8")
}
