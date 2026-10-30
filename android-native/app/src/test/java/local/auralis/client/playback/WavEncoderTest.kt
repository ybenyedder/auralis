package local.auralis.client.playback

import org.junit.Assert.assertEquals
import org.junit.Test

/** JVM tests for the client-side WAV writer (the Shazam bubble uploads
 *  audio/wav to POST /api/recognize — the header must be canonical). */
class WavEncoderTest {

    private fun u32(b: ByteArray, at: Int): Int =
        (b[at].toInt() and 0xFF) or
            ((b[at + 1].toInt() and 0xFF) shl 8) or
            ((b[at + 2].toInt() and 0xFF) shl 16) or
            ((b[at + 3].toInt() and 0xFF) shl 24)

    private fun u16(b: ByteArray, at: Int): Int =
        (b[at].toInt() and 0xFF) or ((b[at + 1].toInt() and 0xFF) shl 8)

    private fun ascii(b: ByteArray, at: Int, len: Int): String = String(b, at, len, Charsets.US_ASCII)

    @Test
    fun `header describes the pcm payload`() {
        val samples = ShortArray(5)
        val wav = WavEncoder.encodePcm16Mono(samples, 44_100)
        assertEquals(44 + 10, wav.size)
        assertEquals("RIFF", ascii(wav, 0, 4))
        assertEquals(36 + 10, u32(wav, 4))            // RIFF chunk size
        assertEquals("WAVE", ascii(wav, 8, 4))
        assertEquals("fmt ", ascii(wav, 12, 4))
        assertEquals(16, u32(wav, 16))                // fmt sub-chunk size
        assertEquals(1, u16(wav, 20))                 // linear PCM
        assertEquals(1, u16(wav, 22))                 // mono
        assertEquals(44_100, u32(wav, 24))
        assertEquals(88_200, u32(wav, 28))            // byte rate (44100 * 2)
        assertEquals(2, u16(wav, 32))                 // block align
        assertEquals(16, u16(wav, 34))                // bits per sample
        assertEquals("data", ascii(wav, 36, 4))
        assertEquals(10, u32(wav, 40))                // payload bytes
    }

    @Test
    fun `samples round-trip little endian`() {
        val samples = shortArrayOf(0, 1, -1, 32767, -32768)
        val wav = WavEncoder.encodePcm16Mono(samples, 44_100)
        for ((i, s) in samples.withIndex()) {
            val lo = wav[44 + i * 2].toInt() and 0xFF
            val hi = wav[44 + i * 2 + 1].toInt()
            assertEquals("sample $i", s.toInt(), lo or (hi shl 8))
        }
    }

    @Test
    fun `empty payload still yields a valid header`() {
        val wav = WavEncoder.encodePcm16Mono(ShortArray(0), 22_050)
        assertEquals(44, wav.size)
        assertEquals(36, u32(wav, 4))
        assertEquals(22_050, u32(wav, 24))
        assertEquals(44_100, u32(wav, 28))
        assertEquals(0, u32(wav, 40))
    }

    @Test
    fun `header is reusable for stereo 8-bit layouts`() {
        val h = WavEncoder.header(dataSizeBytes = 1000, sampleRate = 48_000, channels = 2, bitsPerSample = 16)
        assertEquals(1036, u32(h, 4))
        assertEquals(2, u16(h, 22))
        assertEquals(48_000, u32(h, 24))
        assertEquals(192_000, u32(h, 28))             // 48000 * 2ch * 2B
        assertEquals(4, u16(h, 32))
        assertEquals(1000, u32(h, 40))
    }
}
