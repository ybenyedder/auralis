package local.auralis.client.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import local.auralis.client.MainActivity

// Native background playback. A MediaSessionService hosts ExoPlayer + a MediaSession;
// media3 publishes the system media notification and lock-screen transport controls,
// handles audio focus, and keeps decoding alive with the screen off — replacing the
// old WebView wake-lock workaround entirely. The UI process drives it via MediaController.
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        // Tapping the media notification / lock-screen card must bring the native app
        // to the front. Without an explicit session activity, media3 attaches no
        // content intent, so the tap falls through to whatever the OS resolves (e.g.
        // the web/PWA) instead of MainActivity. MainActivity is launchMode=singleTask,
        // so SINGLE_TOP reuses the existing task rather than stacking a new instance.
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(openApp)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // If the user swipes the app away while paused, tear the service down.
        val player = session?.player
        if (player == null || (!player.playWhenReady) || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        super.onDestroy()
    }
}
