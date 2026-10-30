package local.auralis.client.i18n

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the pure fr/en catalogue (web src/lib/auralis/messages.ts
 *  mirror): catalog completeness and translate() fallback/params semantics. */
class MessagesTest {

    @Test
    fun `every french key exists in english and vice versa`() {
        val fr = Messages.keys(Locale.FR)
        val en = Messages.keys(Locale.EN)
        val missingEn = fr - en
        val missingFr = en - fr
        assertTrue("keys missing from EN: $missingEn", missingEn.isEmpty())
        assertTrue("keys missing from FR: $missingFr", missingFr.isEmpty())
        assertTrue("catalogue must not be empty", fr.isNotEmpty())
    }

    @Test
    fun `no catalog value is blank`() {
        for (locale in listOf(Locale.FR, Locale.EN)) {
            for (key in Messages.keys(locale)) {
                val value = Messages.translate(locale, key)
                assertTrue("$locale/$key is blank", value.isNotBlank())
                assertTrue("$locale/$key fell through to the key", value != key)
            }
        }
    }

    @Test
    fun `translate resolves the locale's own value`() {
        assertEquals("Annuler", Messages.translate(Locale.FR, "common.cancel"))
        assertEquals("Cancel", Messages.translate(Locale.EN, "common.cancel"))
    }

    @Test
    fun `translate falls back to french then fallback then key`() {
        // Unknown key: the explicit fallback wins, then the raw key.
        assertEquals("fallback", Messages.translate(Locale.EN, "nope.nope", "fallback"))
        assertEquals("nope.nope", Messages.translate(Locale.EN, "nope.nope"))
        // Unknown key with a French-looking fallback keeps the fallback verbatim.
        assertEquals("Secours", Messages.translate(Locale.FR, "nope.nope", "Secours"))
    }

    @Test
    fun `params replace named placeholders`() {
        assertEquals(
            "3 titres",
            Messages.translate(Locale.FR, "common.tracksCount", params = mapOf("count" to 3)),
        )
        assertEquals(
            "3 tracks",
            Messages.translate(Locale.EN, "common.tracksCount", params = mapOf("count" to 3)),
        )
        assertEquals(
            "Scanning… 12/30",
            Messages.translate(Locale.EN, "settings.scanProgress", params = mapOf("done" to 12, "total" to 30)),
        )
        // Unreplaced placeholders stay as-is when no param is supplied.
        assertEquals("{count} titres", Messages.translate(Locale.FR, "common.tracksCount"))
    }

    @Test
    fun `placeholder replacement works on fallback strings too`() {
        assertEquals(
            "hello X",
            Messages.translate(Locale.EN, "nope.nope", "hello {who}", params = mapOf("who" to "X")),
        )
    }

    @Test
    fun `locale autonyms are shown literally like the web selector`() {
        assertEquals("Français", Locale.FR.autonym)
        assertEquals("English", Locale.EN.autonym)
        assertEquals(Locale.FR, Locale.from(null))
        assertEquals(Locale.EN, Locale.from("en"))
        assertEquals(Locale.FR, Locale.from("de"))
    }

    @Test
    fun `duration formatting follows the locale`() {
        assertEquals("1 h 5 min", Messages.translate(Locale.FR, "common.longDuration", params = mapOf("h" to 1, "m" to 5)))
        assertEquals("1 hr 5 min", Messages.translate(Locale.EN, "common.longDuration", params = mapOf("h" to 1, "m" to 5)))
    }

    @Test
    fun `web keys keep their web wording`() {
        // A sample of keys whose strings mirror src/lib/auralis/messages.ts exactly.
        assertEquals("Télécharger une sauvegarde", Messages.translate(Locale.FR, "settings.downloadBackup"))
        assertEquals("Download a backup", Messages.translate(Locale.EN, "settings.downloadBackup"))
        assertEquals("Générer le karaoké mot-à-mot en alignant les paroles sur l'audio (traitement local)", Messages.translate(Locale.FR, "lyrics.alignTitle"))
        assertEquals("Word-by-word", Messages.translate(Locale.EN, "lyrics.wordByWord"))
        assertEquals("Sombre", Messages.translate(Locale.FR, "settings.mode.dark"))
        assertEquals("System", Messages.translate(Locale.EN, "settings.mode.auto"))
    }
}
