package local.auralis.client.i18n

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Compose glue for the pure [Messages] catalogue. The active [Locale] is provided
 * at the app root (from AppViewModel state) so every `tr(...)` read recomposes
 * live when the user switches language in Settings.
 */
class Strings(val locale: Locale) {
    fun t(key: String, fallback: String? = null, params: Map<String, Any> = emptyMap()): String =
        Messages.translate(locale, key, fallback, params)
}

val LocalStrings = staticCompositionLocalOf { Strings(Messages.current) }

/** Translate a catalogue key in the current composition's locale. */
@Composable
fun tr(key: String, fallback: String? = null, params: Map<String, Any> = emptyMap()): String =
    LocalStrings.current.t(key, fallback, params)
