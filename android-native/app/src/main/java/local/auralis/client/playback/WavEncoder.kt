package local.auralis.client.playback

// Minimal WAV (RIFF) writer for the Shazam bubble's capture pipeline. The
// internal-audio / mic capture yields raw 16-bit mono PCM; the header is written
// CLIENT-SIDE so POST /api/recognize receives a plain audio/wav body the server
// feeds straight to ffmpeg. Pure Kotlin (no Android imports) — JVM-unit-testable.

object WavEncoder {

    /** The capture rate the bubble aims for (44.1 kHz — the music-stream rate). */
    const val SAMPLE_RATE = 44_100

    /** Canonical 44-byte WAV header for linear PCM audio. */
    fun header(dataSizeBytes: Int, sampleRate: Int, channels: Int = 1, bitsPerSample: Int = 16): ByteArray {
        require(dataSizeBytes >= 0) { "negative data size" }
        require(sampleRate > 0) { "sample rate must be positive" }
        require(channels > 0 && bitsPerSample > 0 && bitsPerSample % 8 == 0) { "bad format" }
        val blockAlign = channels * bitsPerSample / 8
        val byteRate = sampleRate * blockAlign
        val out = ByteArray(44)
        fun ascii(at: Int, s: String) = s.toByteArray(Charsets.US_ASCII).copyInto(out, at)
        fun u32(at: Int, v: Int) {
            out[at] = (v and 0xFF).toByte()
            out[at + 1] = ((v ushr 8) and 0xFF).toByte()
            out[at + 2] = ((v ushr 16) and 0xFF).toByte()
            out[at + 3] = ((v ushr 24) and 0xFF).toByte()
        }
        fun u16(at: Int, v: Int) {
            out[at] = (v and 0xFF).toByte()
            out[at + 1] = ((v ushr 8) and 0xFF).toByte()
        }
        ascii(0, "RIFF")
        u32(4, 36 + dataSizeBytes)          // RIFF chunk size
        ascii(8, "WAVE")
        ascii(12, "fmt ")
        u32(16, 16)                          // fmt sub-chunk size (PCM)
        u16(20, 1)                           // audio format: 1 = linear PCM
        u16(22, channels)
        u32(24, sampleRate)
        u32(28, byteRate)
        u32(32, blockAlign)
        u16(34, bitsPerSample)
        ascii(36, "data")
        u32(40, dataSizeBytes)
        return out
    }

    /** A complete WAV file for mono 16-bit PCM [samples] (little-endian payload). */
    fun encodePcm16Mono(samples: ShortArray, sampleRate: Int = SAMPLE_RATE): ByteArray {
        val dataSize = samples.size * 2
        val out = ByteArray(44 + dataSize)
        header(dataSize, sampleRate).copyInto(out, 0)
        var i = 44
        for (s in samples) {
            val v = s.toInt()
            out[i] = (v and 0xFF).toByte()
            out[i + 1] = ((v ushr 8) and 0xFF).toByte()
            i += 2
        }
        return out
    }
}
