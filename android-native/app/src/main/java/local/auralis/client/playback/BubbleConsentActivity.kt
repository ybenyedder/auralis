package local.auralis.client.playback

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle

/**
 * Transparent trampoline for the system "enregistrer mon écran" consent dialog
 * (MediaProjectionManager.createScreenCaptureIntent) when it must be raised
 * FROM the bubble itself — the first tap without a projection, or after a
 * revocation. An activity is required because the consent is an ActivityResult;
 * the outcome is forwarded to [ShazamBubbleService], which promotes itself to a
 * mediaProjection foreground service afterwards (Android 14+ demands the
 * consent BEFORE startForeground with that type).
 *
 * The Settings/first-run setup path uses an in-app ActivityResult launcher
 * instead (ui/components/BubbleToggle.kt) — this trampoline only serves taps
 * that happen while Auralis has no UI on screen.
 */
class BubbleConsentActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mpm = getSystemService(MediaProjectionManager::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_CONSENT)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CONSENT && resultCode == RESULT_OK && data != null) {
            ShazamBubbleService.onProjectionGranted(this, resultCode, data)
        } else {
            ShazamBubbleService.onProjectionDenied(this)
        }
        finish()
    }

    companion object {
        private const val REQUEST_CONSENT = 0x5343

        /** Raise the system screen-capture consent dialog on behalf of the bubble. */
        fun launch(context: Context) {
            context.startActivity(
                Intent(context, BubbleConsentActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
