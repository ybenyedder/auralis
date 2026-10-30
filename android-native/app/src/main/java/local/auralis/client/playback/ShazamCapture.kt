package local.auralis.client.playback

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.os.Build
import androidx.annotation.RequiresApi

// Short PCM capture for the Shazam bubble. Two paths:
//   captureInternal — AudioPlaybackCapture over a MediaProjection (Android 10+):
//       grabs the device's OWN playback audio (USAGE_MEDIA: TikTok/YouTube/games),
//       exactly like the real Shazam's "screen recording" consent.
//   captureMic — AudioRecord from the microphone (API 24-28, or a lost
//       projection with a granted mic): everything audible around you.
// Both return mono 16-bit PCM; WavEncoder wraps it in a WAV header.

object ShazamCapture {

    /** Capture window in seconds (the bubble's countdown). */
    const val CAPTURE_SECONDS = 10

    /** Preferred rate — the device's music-stream rate. */
    const val TARGET_SAMPLE_RATE = WavEncoder.SAMPLE_RATE

    /** Some devices refuse 44.1 kHz on the mic path; 16 kHz always works. */
    const val FALLBACK_SAMPLE_RATE = 16_000

    /** Mono 16-bit PCM + the rate actually used (reported in the WAV header). */
    data class Recording(val samples: ShortArray, val sampleRate: Int)

    /** Capture [seconds] of internal playback audio (USAGE_MEDIA). API 29+.
     *  Returns null when the recorder cannot be created or nothing was read. */
    @RequiresApi(Build.VERSION_CODES.Q)
    @SuppressLint("MissingPermission")
    fun captureInternal(projection: MediaProjection, seconds: Int = CAPTURE_SECONDS): Recording? {
        val config = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .build()
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(TARGET_SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val rec = runCatching {
            AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(config)
                .setAudioFormat(format)
                .setBufferSizeInBytes(minBuffer(TARGET_SAMPLE_RATE) * 4)
                .build()
        }.getOrNull() ?: return null
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            runCatching { rec.release() }
            return null
        }
        return record(rec, TARGET_SAMPLE_RATE, seconds)
    }

    /** Capture [seconds] of ambient audio from the mic (RECORD_AUDIO required).
     *  Tries 44.1 kHz then falls back to 16 kHz. */
    @SuppressLint("MissingPermission")
    fun captureMic(seconds: Int = CAPTURE_SECONDS): Recording? {
        for (rate in listOf(TARGET_SAMPLE_RATE, FALLBACK_SAMPLE_RATE)) {
            val rec = runCatching {
                @Suppress("DEPRECATION")
                AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    rate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    minBuffer(rate) * 4,
                )
            }.getOrNull()
            if (rec != null && rec.state == AudioRecord.STATE_INITIALIZED) {
                return record(rec, rate, seconds)
            }
            runCatching { rec?.release() }
        }
        return null
    }

    private fun minBuffer(rate: Int): Int =
        AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            .coerceAtLeast(4096)

    /** Read mono 16-bit PCM until [seconds] elapse (or the stream stalls). */
    private fun record(rec: AudioRecord, sampleRate: Int, seconds: Int): Recording? {
        return runCatching {
            val total = sampleRate * seconds
            val out = ShortArray(total)
            val chunk = ShortArray(sampleRate / 4) // quarter-second reads
            rec.startRecording()
            try {
                var written = 0
                var idleReads = 0
                while (written < total && idleReads < 40) {
                    val n = rec.read(chunk, 0, minOf(chunk.size, total - written))
                    if (n > 0) {
                        System.arraycopy(chunk, 0, out, written, n)
                        written += n
                        idleReads = 0
                    } else {
                        // Nothing delivered (e.g. playback capture with no active
                        // playback). Give up after ~2 s of consecutive idle reads.
                        idleReads++
                        Thread.sleep(50)
                    }
                }
                if (written == 0) null else Recording(out.copyOf(written), sampleRate)
            } finally {
                runCatching { rec.stop() }
                runCatching { rec.release() }
            }
        }.getOrNull()
    }
}
