package local.auralis.client.model

import org.json.JSONObject
import java.text.Normalizer

// Export / import playlists as portable files (faithful port of
// src/lib/auralis/playlistIO.ts). The local-first angle: your playlists are yours,
// leave the server as M3U (plays in VLC/foobar/…) or JSON (lossless round-trip),
// and re-import on any Auralis library. The M3U/JSON builders are byte-compatible
// with the web exports so files are interchangeable between clients. Pure Kotlin
// (org.json only) — JVM-unit-testable.

data class ExternalTrackEntry(val title: String, val artist: String? = null, val album: String? = null)

data class ImportedPlaylist(val name: String, val hashes: List<String>, val matched: Int, val total: Int)

data class LinkImportResult(
    val name: String,
    val hashes: List<String>,
    val matched: Int,
    val total: Int,
    /** "Artist — Title" of the entries we couldn't place, for a "N introuvables" hint. */
    val misses: List<String>,
)

private fun trackArtistName(t: Track): String =
    t.artist ?: t.artists.joinToString(", ") { it.name }

/** Filename slug for exports (web slug() in playlistIO.ts). */
fun playlistSlug(name: String): String {
    val s = name.trim()
        .replace(Regex("[^\\p{L}\\p{N}]+"), "-")
        .replace(Regex("^-+|-+$"), "")
        .lowercase()
    return s.ifBlank { "playlist" }
}

// --- accent folding ---------------------------------------------------------
// Note: the web playlistIO folds with NFKD (compatibility decomposition — also
// collapses "™", "½", "ﬁ"…), unlike foldAccents' NFD in the smart-list code.
// Mirrored exactly so matching behaves identically.

private fun fold(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFKD).replace(Regex("[\\u0300-\\u036f]"), "").lowercase()

/** Canonical title key: accent-folded, with parenthetical/bracketed noise, trailing
 *  "feat…"/"- remaster/live/edit…" and punctuation removed. */
private fun normTitle(s: String): String =
    fold(s)
        .replace(Regex("\\([^)]*\\)"), " ")
        .replace(Regex("\\[[^\\]]*\\]"), " ")
        .replace(Regex("\\b(feat|ft|featuring|with)\\.?\\s.*$", RegexOption.IGNORE_CASE), " ")
        .replace(
            Regex(
                "\\s[-–—:]\\s.*(remaster|remix|live|version|edit|mono|stereo|deluxe|acoustic|radio|mix|instrumental|demo|single).*$",
                RegexOption.IGNORE_CASE,
            ),
            " ",
        )
        .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
        .trim()

/** Significant words of an artist string, folded, splitting on all the ways
 *  multiple artists get joined ("A, B & C", "A feat. B", "A x B"). */
private fun artistWords(s: String): Set<String> =
    fold(s)
        .replace(Regex("\\b(feat|ft|featuring|with|and|vs|x)\\b"), " ")
        .replace(Regex("[^\\p{L}\\p{N}]+"), " ")
        .split(Regex("\\s+"))
        .filter { it.length > 1 }
        .toSet()

private fun overlaps(a: Set<String>, b: Set<String>): Boolean {
    if (a.isEmpty() || b.isEmpty()) return false
    for (w in a) if (b.contains(w)) return true
    return false
}

/** Resolve external { title, artist } entries against the current library. Returns
 *  matched hashes in source order (deduped), the match count, and the misses. */
fun matchLibraryTracks(entries: List<ExternalTrackEntry>, library: List<Track>): LinkImportResult {
    val byKey = HashMap<String, Track>()
    val byTitle = HashMap<String, MutableList<Track>>()
    for (t in library) {
        val nt = normTitle(t.title)
        if (nt.isEmpty()) continue
        val artist = trackArtistName(t)
        val key = "$nt ${artistWords(artist).sorted().joinToString(" ")}"
        if (!byKey.containsKey(key)) byKey[key] = t
        byTitle.getOrPut(nt) { ArrayList() }.add(t)
    }

    val seen = HashSet<String>()
    val hashes = ArrayList<String>()
    val misses = ArrayList<String>()
    var total = 0

    for (e in entries) {
        val nt = normTitle(e.title)
        if (nt.isEmpty()) continue
        total += 1
        val words = artistWords(e.artist ?: "")

        // 1) exact title + same artist word-set.
        var match: Track? = byKey["$nt ${words.sorted().joinToString(" ")}"]
        // 2) any library track with the same title whose artist words overlap.
        if (match == null) {
            val cands = byTitle[nt]
            if (cands != null) {
                match = if (words.isNotEmpty()) {
                    cands.firstOrNull { overlaps(words, artistWords(trackArtistName(it))) }
                } else {
                    cands[0]
                }
                // 3) same title, unknown/one candidate → take it (title-only fallback).
                if (match == null && cands.size == 1) match = cands[0]
            }
        }

        if (match != null && !seen.contains(match.trackhash)) {
            seen.add(match.trackhash)
            hashes.add(match.trackhash)
        } else if (match == null && misses.size < 60) {
            misses.add("${if (e.artist != null) "${e.artist} — " else ""}${e.title}")
        }
    }

    return LinkImportResult("", hashes, hashes.size, total, misses)
}

private fun normPath(p: String): String =
    p.replace('\\', '/').replace(Regex("^/+"), "").lowercase()

/** Decode a `/api/stream/<encoded/segments>` URL (or a bare path) back to the
 *  library-relative filepath we index by. */
private fun pathFromUri(uri: String): String {
    val noQuery = uri.substringBefore("?")
    val marker = "/api/stream/"
    val at = noQuery.indexOf(marker)
    val tail = if (at >= 0) noQuery.substring(at + marker.length) else noQuery
    return tail.split("/").filter { it.isNotEmpty() }.joinToString("/") { decodeUriComponent(it) }
}

/** encodeURIComponent (NOT URLDecoder — a literal "+" stays a "+"). Lenient: a
 *  malformed escape sequence passes through unchanged instead of throwing. */
private fun encodeUriComponent(s: String): String {
    val hex = "0123456789ABCDEF"
    val sb = StringBuilder()
    for (b in s.toByteArray(Charsets.UTF_8)) {
        val c = b.toInt() and 0xFF
        val unreserved = c in 'A'.code..'Z'.code || c in 'a'.code..'z'.code ||
            c in '0'.code..'9'.code || "-_.!~*'()".indexOf(c.toChar()) >= 0
        if (unreserved) sb.append(c.toChar())
        else sb.append('%').append(hex[c shr 4]).append(hex[c and 0xF])
    }
    return sb.toString()
}

private fun decodeUriComponent(s: String): String {
    val out = StringBuilder()
    val bytes = ArrayList<Byte>()
    fun flush() {
        if (bytes.isNotEmpty()) {
            out.append(String(bytes.toByteArray(), Charsets.UTF_8))
            bytes.clear()
        }
    }
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '%' && i + 2 < s.length) {
            val b = s.substring(i + 1, i + 3).toIntOrNull(16)
            if (b != null) {
                bytes.add(b.toByte())
                i += 3
                continue
            }
        }
        flush()
        out.append(c)
        i++
    }
    flush()
    return out.toString()
}

/** Parse a JSON or M3U playlist file and resolve its entries against the current
 *  library — by trackhash first, then by file path, then by "title|artist". Returns
 *  the matched hashes (in file order) plus how many of the total resolved. */
fun parsePlaylistFile(fileName: String, text: String, library: List<Track>): ImportedPlaylist {
    val byHash = HashMap<String, Track>()
    val byPath = HashMap<String, Track>()
    val byTitle = HashMap<String, Track>()
    for (t in library) {
        byHash[t.trackhash] = t
        byPath[normPath(t.filepath ?: "")] = t
        byTitle["${t.title}|${trackArtistName(t)}".lowercase()] = t
    }

    var name = fileName.replace(Regex("\\.[^.]*$"), "")
    val hashes = ArrayList<String>()
    var total = 0

    val trimmed = text.removePrefix("\uFEFF").trimStart()
    val isJson = fileName.lowercase().endsWith(".json") || trimmed.startsWith("{")

    if (isJson) {
        val data = JSONObject(text.removePrefix("\uFEFF"))
        // `name = data.name || name` — an empty/missing name keeps the filename.
        data.str("name")?.takeIf { it.isNotEmpty() }?.let { name = it }
        val arr = data.optJSONArray("tracks") ?: org.json.JSONArray()
        for (i in 0 until arr.length()) {
            val t = arr.optJSONObject(i) ?: continue
            total += 1
            val th = t.str("trackhash")
            val fp = t.str("filepath")
            val title = t.str("title")
            val m = (th?.let { byHash[it] })
                ?: (fp?.let { byPath[normPath(it)] })
                ?: (title?.let { byTitle["${it}|${t.str("artist") ?: ""}".lowercase()] })
            if (m != null) hashes.add(m.trackhash)
        }
    } else {
        // M3U / M3U8
        var pendingTitle = ""
        for (raw in text.removePrefix("\uFEFF").split(Regex("\\r?\\n"))) {
            val line = raw.trim()
            if (line.isEmpty()) continue
            if (line.startsWith("#PLAYLIST:")) {
                name = line.substring("#PLAYLIST:".length).trim().ifBlank { name }
                continue
            }
            if (line.startsWith("#EXTINF:")) {
                // "artist - title"
                pendingTitle = line.substring(line.indexOf(',') + 1).trim()
                continue
            }
            if (line.startsWith("#")) continue
            total += 1
            val path = pathFromUri(line)
            var m = byPath[normPath(path)] ?: byHash[line]
            if (m == null && pendingTitle.isNotEmpty()) {
                // EXTINF is "artist - title"; the library key is "title|artist".
                val dash = pendingTitle.indexOf(" - ")
                if (dash >= 0) {
                    val artist = pendingTitle.substring(0, dash).trim()
                    val title = pendingTitle.substring(dash + 3).trim()
                    m = byTitle["${title}|${artist}".lowercase()]
                }
            }
            if (m != null) hashes.add(m.trackhash)
            pendingTitle = ""
        }
    }

    return ImportedPlaylist(name, hashes, hashes.size, total)
}

/** Extended-M3U export (web exportPlaylistM3U). The URI line is the absolute
 *  stream URL so the file plays in other apps; EXTINF carries "artist - title"
 *  for readability + title fallback. */
fun exportPlaylistM3U(name: String, tracks: List<Track>, streamBase: String): String {
    val lines = ArrayList<String>()
    lines.add("#EXTM3U")
    lines.add("#PLAYLIST:$name")
    for (t in tracks) {
        val secs = Math.round(t.duration ?: 0.0)
        lines.add("#EXTINF:$secs,${trackArtistName(t)} - ${t.title}")
        val fp = t.filepath
        lines.add(
            if (!fp.isNullOrEmpty()) {
                "$streamBase/api/stream/" + fp.split(Regex("[\\\\/]+")).filter { it.isNotEmpty() }
                    .joinToString("/") { encodeUriComponent(it) }
            } else {
                t.trackhash
            },
        )
    }
    return lines.joinToString("\n")
}

/** Lossless JSON export keyed on trackhash (web exportPlaylistJSON) — byte-
 *  compatible (JSON.stringify(data, null, 2) layout) so a web re-import is exact. */
fun exportPlaylistJSON(name: String, tracks: List<Track>, exportedAt: String): String {
    val sb = StringBuilder()
    sb.append("{\n")
    sb.append("  \"auralisPlaylist\": 1,\n")
    sb.append("  \"name\": ").append(jsonString(name)).append(",\n")
    sb.append("  \"exportedAt\": ").append(jsonString(exportedAt)).append(",\n")
    sb.append("  \"tracks\": ")
    if (tracks.isEmpty()) {
        sb.append("[]\n")
    } else {
        sb.append("[\n")
        tracks.forEachIndexed { i, t ->
            sb.append("    {\n")
            sb.append("      \"trackhash\": ").append(jsonString(t.trackhash)).append(",\n")
            sb.append("      \"title\": ").append(jsonString(t.title)).append(",\n")
            sb.append("      \"artist\": ").append(jsonString(trackArtistName(t))).append(",\n")
            sb.append("      \"album\": ").append(jsonString(t.album ?: "")).append(",\n")
            sb.append("      \"filepath\": ").append(jsonString(t.filepath ?: "")).append("\n")
            sb.append("    }").append(if (i == tracks.lastIndex) "\n" else ",\n")
        }
        sb.append("  ]\n")
    }
    sb.append("}")
    return sb.toString()
}

/** JS JSON.stringify string escaping (no unicode escaping for non-ASCII). */
private fun jsonString(s: String): String {
    val sb = StringBuilder("\"")
    for (c in s) {
        when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\b' -> sb.append("\\b")
            '\u000C' -> sb.append("\\f")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else ->
                if (c.code < 0x20) sb.append("\\u%04X".format(c.code))
                else sb.append(c)
        }
    }
    return sb.append('"').toString()
}

/** JS `new Date().toISOString()` — UTC, always 3 fractional digits. */
fun isoNow(): String {
    val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    f.timeZone = java.util.TimeZone.getTimeZone("UTC")
    return f.format(java.util.Date())
}
