package local.auralis.client.net

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for the pure URL-building logic in [AuralisApi]. These run on
 * the local JVM (no emulator), fast, and guard the URL-encoding / sizing rules
 * that the player + lock-screen artwork depend on.
 *
 * Layout convention: `app/src/test/` = JVM unit tests; `app/src/androidTest/` =
 * instrumented on-device tests. We put pure-logic tests here so they don't need
 * a connected device to run in CI.
 */
class AuralisApiTest {

    private fun api(base: String = "http://localhost:4237", token: String? = "t"): AuralisApi =
        AuralisApi().apply { configure(base, token) }

    @Test
    fun `isConfigured is false without base or token`() {
        val a = AuralisApi()
        assertFalse(a.isConfigured())
        a.configure("http://x", null)
        assertFalse("token-less should not be configured", a.isConfigured())
        a.configure("   ", "t")
        assertFalse("blank base should not be configured", a.isConfigured())
    }

    @Test
    fun `isConfigured is true with base and token`() {
        assertTrue(api().isConfigured())
    }

    @Test
    fun `streamUrl encodes each path segment and joins with slash`() {
        val a = api(base = "http://host:4237")
        val url = a.streamUrl("Artist/Album/Song ?.mp3")
        // Each segment is URL-encoded, so a space and "?" are escaped.
        assertEquals("http://host:4237/api/stream/Artist/Album/Song%20%3F.mp3", url)
    }

    @Test
    fun `streamUrl collapses backslash and duplicate separators`() {
        val a = api(base = "http://host")
        val url = a.streamUrl("\\a//b\\c.mp3")
        assertEquals("http://host/api/stream/a/b/c.mp3", url)
    }

    @Test
    fun `assetUrl returns null for blank input`() {
        assertNull(api().assetUrl(null))
        assertNull(api().assetUrl(""))
        assertNull(api().assetUrl("   "))
    }

    @Test
    fun `assetUrl returns absolute external urls untouched`() {
        val a = api(base = "http://host")
        assertEquals("https://cdn.example/x.png", a.assetUrl("https://cdn.example/x.png"))
    }

    @Test
    fun `assetUrl prefixes the configured base for relative paths`() {
        val a = api(base = "http://host:4237")
        assertEquals("http://host:4237/api/art/abc", a.assetUrl("/api/art/abc"))
        // A path missing the leading slash still resolves correctly.
        assertEquals("http://host:4237/api/art/abc", a.assetUrl("api/art/abc"))
    }

    @Test
    fun `artUrl appends width only for the art endpoint`() {
        val a = api(base = "http://host")
        assertEquals("http://host/api/art/abc?w=512", a.artUrl("/api/art/abc", 512))
        // External URLs are returned untouched (only our endpoint understands ?w=).
        assertEquals("https://cdn.example/x.png", a.artUrl("https://cdn.example/x.png", 512))
        // null input → null.
        assertNull(a.artUrl(null, 256))
    }
}
