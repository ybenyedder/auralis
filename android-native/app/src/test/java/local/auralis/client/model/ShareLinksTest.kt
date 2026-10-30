package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Test

/** JVM unit tests for the share payload building (web lib/auralis/share.ts). */
class ShareLinksTest {

    @Test
    fun `urls mirror the web deep-link shape`() {
        assertEquals("http://srv:4237/?view=track&id=abc", ShareLinks.trackUrl("http://srv:4237", "abc"))
        assertEquals("http://srv/?view=album&id=a1", ShareLinks.albumUrl("http://srv/", "a1"))
        assertEquals("https://x/?view=artist&id=r1", ShareLinks.artistUrl("https://x", "r1"))
    }

    @Test
    fun `url ids are percent-encoded`() {
        assertEquals(
            "http://srv/?view=track&id=h%26s%3F",
            ShareLinks.trackUrl("http://srv", "h&s?"),
        )
    }

    @Test
    fun `text is the web share phrasing plus the link`() {
        val url = ShareLinks.trackUrl("http://srv", "abc")
        assertEquals(
            "J’écoute Pyramid Song — Radiohead sur Auralis\nhttp://srv/?view=track&id=abc",
            ShareLinks.text(ShareLinks.label("Pyramid Song", "Radiohead"), url),
        )
    }

    @Test
    fun `label joins title and artist with an em dash`() {
        assertEquals("T — A", ShareLinks.label("T", "A"))
    }
}
