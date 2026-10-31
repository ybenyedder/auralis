package local.auralis.client.playback

import android.animation.ValueAnimator
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import local.auralis.client.MainActivity
import local.auralis.client.R
import local.auralis.client.data.Prefs
import local.auralis.client.i18n.Messages
import local.auralis.client.model.BubbleDragLogic
import local.auralis.client.model.DownloadJobDto
import local.auralis.client.model.RecognizeResult
import local.auralis.client.net.AuralisApi
import local.auralis.client.ui.components.BubbleRemoveTargetView
import local.auralis.client.ui.components.BubbleView

/**
 * The system-wide "Shazam bubble". A foreground service that draws a draggable
 * bubble over other apps (WindowManager TYPE_APPLICATION_OVERLAY) and, on tap,
 * captures 10 s of the device's own playback audio — MediaProjection +
 * AudioPlaybackCapture on Android 10+ ("enregistrer mon écran" consent, the
 * real Shazam experience), the microphone on API 24-28 — then posts the WAV to
 * POST /api/recognize and auto-adds the identified song to the library.
 *
 * Foreground-service ordering (platform-enforced): the screen-capture consent is
 * acquired first, then startForeground(FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION),
 * and only then MediaProjectionManager.getMediaProjection() (Android 14+ throws
 * otherwise). The consent UI is either an in-app launcher
 * (ui/components/BubbleToggle.kt, first-run setup) or the transparent
 * BubbleConsentActivity trampoline (re-prompt on a bubble tap).
 */
class ShazamBubbleService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var windowManager: WindowManager? = null
    private var bubbleView: BubbleView? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    /** The drag-to-dismiss "Supprimer" pill at the bottom edge (hidden until the
     *  bubble is dragged into the remove zone). */
    private var removeTarget: BubbleRemoveTargetView? = null
    private var removeTargetShown = false

    private var projection: MediaProjection? = null
    private var foreground = false
    private var projectionPromoted = false
    private var busy = false
    private var pendingIdentify = false

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            // The user (or system) revoked the screen-capture permission.
            projection = null
            BubbleBus.captureMode.value = BubbleBus.MODE_MIC
            updateNotification()
            postPlain(Messages.t("bubble.perm.screenLost"))
        }
    }

    // ---- lifecycle ----------------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        ensureChannel()
        BubbleBus.active.value = true
        addBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        val consentCode = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val consentData = intent?.let { IntentCompat.getParcelableExtra(it, EXTRA_RESULT_DATA, Intent::class.java) }
        val hasConsent = consentCode != 0 && consentData != null

        // Promote to a foreground service first (see the ordering note above).
        if (!foreground) {
            promoteForeground(withProjection = hasConsent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        } else if (hasConsent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !projectionPromoted) {
            // Upgrade the running service to the mediaProjection type now that
            // the consent landed.
            promoteForeground(withProjection = true)
        }

        when (action) {
            ACTION_START, ACTION_PROJECTION -> {
                if (hasConsent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    acquireProjection(consentCode, consentData!!)
                } else {
                    BubbleBus.captureMode.value = BubbleBus.MODE_MIC
                }
                updateNotification()
                val continueIdentify =
                    intent.getBooleanExtra(EXTRA_PENDING_IDENTIFY, false) ||
                        (action == ACTION_PROJECTION && pendingIdentify)
                if (continueIdentify) {
                    pendingIdentify = false
                    identify()
                }
            }
            ACTION_PROJECTION_DENIED -> {
                pendingIdentify = false
                BubbleBus.captureMode.value = BubbleBus.MODE_MIC
                updateNotification()
                postPlain(Messages.t("bubble.perm.screenDenied"))
            }
            ACTION_IDENTIFY -> identify()
            ACTION_STOP -> stopEverything()
            ACTION_RESET_PROJECTION -> resetProjection()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        removeBubble()
        removeRemoveTarget()
        runCatching { projection?.unregisterCallback(projectionCallback) }
        runCatching { projection?.stop() }
        projection = null
        BubbleBus.active.value = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ---- foreground + projection --------------------------------------------

    private fun promoteForeground(withProjection: Boolean) {
        val type = when {
            withProjection && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
                // Mic mode: the app already holds FOREGROUND_SERVICE_MEDIA_PLAYBACK.
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            else -> 0
        }
        ServiceCompat.startForeground(this, NOTIF_ID, activeNotification(), type)
        foreground = true
        projectionPromoted = withProjection
    }

    private fun acquireProjection(code: Int, data: Intent) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val manager = getSystemService(MediaProjectionManager::class.java)
        val proj = runCatching { manager.getMediaProjection(code, data) }.getOrNull()
        if (proj == null) {
            BubbleBus.captureMode.value = BubbleBus.MODE_MIC
            return
        }
        proj.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))
        projection = proj
        BubbleBus.captureMode.value = BubbleBus.MODE_INTERNAL
    }

    private fun resetProjection() {
        runCatching { projection?.unregisterCallback(projectionCallback) }
        runCatching { projection?.stop() }
        projection = null
        pendingIdentify = false
        updateNotification()
    }

    // ---- identification pipeline --------------------------------------------

    private fun identify() {
        if (busy) return
        // No consent yet (first tap / revoked): raise the system dialog and
        // continue the identification once it comes back granted.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && projection == null) {
            pendingIdentify = true
            BubbleConsentActivity.launch(this)
            return
        }
        busy = true
        scope.launch {
            try {
                // 1. Capture 10 s of internal playback audio (or mic fallback).
                val total = ShazamCapture.CAPTURE_SECONDS
                bubbleView?.setState(
                    BubbleView.State.Capturing(Messages.t("bubble.listening", params = mapOf("sec" to total))),
                )
                val startedAt = System.currentTimeMillis()
                val ticker = launch {
                    while (true) {
                        delay(400)
                        val left = (total - (System.currentTimeMillis() - startedAt) / 1000)
                            .toInt().coerceAtLeast(0)
                        bubbleView?.setState(
                            BubbleView.State.Capturing(Messages.t("bubble.listening", params = mapOf("sec" to left))),
                        )
                    }
                }
                val mode = BubbleBus.captureMode.value
                val recording = withContext(Dispatchers.IO) {
                    if (mode == BubbleBus.MODE_INTERNAL &&
                        projection != null &&
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ) {
                        ShazamCapture.captureInternal(projection!!)
                    } else {
                        ShazamCapture.captureMic()
                    }
                }
                ticker.cancel()
                if (recording == null || recording.samples.isEmpty()) {
                    failFlow()
                    return@launch
                }

                // 2. WAV (16-bit mono PCM, header client-side) → POST /api/recognize.
                bubbleView?.setState(BubbleView.State.Identifying(Messages.t("hum.analyzing")))
                val wav = withContext(Dispatchers.Default) {
                    WavEncoder.encodePcm16Mono(recording.samples, recording.sampleRate)
                }
                val api = withContext(Dispatchers.IO) {
                    val p = Prefs(applicationContext).load()
                    AuralisApi().apply { configure(p.serverBase, p.token) }
                }
                if (!api.isConfigured()) {
                    failFlow()
                    return@launch
                }
                val res = api.recognize(wav, "audio/wav")
                if (!api.apiLastOk || res.length() == 0) {
                    failFlow()
                    return@launch
                }

                // 3. Outcome → bubble state, notification, auto-add.
                val result = RecognizeResult.from(res)
                val outcome = BubbleOutcome.from(result)
                BubbleBus.lastResult.value = result
                BubbleBus.lastOutcome.value = outcome
                when (outcome) {
                    is BubbleOutcome.RemoteFound -> {
                        val label = (listOf(outcome.title) + outcome.artists).joinToString(" — ")
                        bubbleView?.setState(BubbleView.State.Success(label))
                        autoAdd(api, outcome)
                    }
                    is BubbleOutcome.LocalFound -> {
                        val label = (listOf(outcome.title) + outcome.artist).filter { it.isNotBlank() }
                            .joinToString(" — ")
                        bubbleView?.setState(BubbleView.State.Success(label))
                        postResult(outcome)
                    }
                    BubbleOutcome.NotFound -> {
                        bubbleView?.setState(BubbleView.State.Failed(Messages.t("bubble.notif.notFound")))
                        postResult(outcome)
                    }
                    BubbleOutcome.Failed -> failFlow()
                }
            } catch (e: Exception) {
                failFlow()
            } finally {
                busy = false
                // Flash the verdict on the bubble, then return to idle.
                scope.launch {
                    delay(4500)
                    if (!busy) bubbleView?.setState(BubbleView.State.Idle)
                }
            }
        }
    }

    private fun failFlow() {
        bubbleView?.setState(BubbleView.State.Failed(Messages.t("bubble.failed")))
        postPlain(Messages.t("bubble.failed"))
        scope.launch {
            delay(4500)
            if (!busy) bubbleView?.setState(BubbleView.State.Idle)
        }
    }

    /**
     * "Ajouter à la bibliothèque" for an identified global hit: start the query
     * download (same contract as AppViewModel.downloadHumMatch), follow the job
     * and post "Ajouté à ta bibliothèque : {title} — {artist}" when it lands.
     */
    private suspend fun autoAdd(api: AuralisApi, outcome: BubbleOutcome.RemoteFound) {
        val job = runCatching { api.startDownloadQuery(outcome.query, outcome.title) }.getOrNull()
        if (job == null) {
            postPlain(Messages.t("bubble.notif.downloadFailed", params = outcome.messageParams()))
            return
        }
        var current: DownloadJobDto = job
        var misses = 0
        while (true) {
            if (current.status == "done") {
                postPlain(Messages.t(outcome.messageKey, params = outcome.messageParams()))
                return
            }
            if (current.status == "error") {
                postPlain(Messages.t("bubble.notif.downloadFailed", params = outcome.messageParams()))
                return
            }
            delay(1500)
            val next: DownloadJobDto? = runCatching { api.downloadJob(job.id) }.getOrNull()
            if (next != null) {
                misses = 0
                current = next
            } else if (++misses > 60) {
                // Transient poll failures are fine; give up after a long outage.
                postPlain(Messages.t("bubble.notif.downloadFailed", params = outcome.messageParams()))
                return
            }
        }
    }

    // ---- notifications ------------------------------------------------------

    private fun ensureChannel() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                Messages.t("settings.bubble"),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { setShowBadge(false) }
            nm.createNotificationChannel(channel)
        }
    }

    /** The persistent "Bulle Shazam active" notification (content = identify). */
    private fun activeNotification(): Notification {
        val identifyIntent = PendingIntent.getService(
            this, 1,
            Intent(this, ShazamBubbleService::class.java).setAction(ACTION_IDENTIFY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = PendingIntent.getService(
            this, 2,
            Intent(this, ShazamBubbleService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val micNote = if (BubbleBus.captureMode.value == BubbleBus.MODE_MIC) {
            "\n" + Messages.t("bubble.notif.micNote")
        } else {
            ""
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bubble_notify)
            .setContentTitle(Messages.t("settings.bubble"))
            .setContentText(Messages.t("bubble.notif.active"))
            .setStyle(NotificationCompat.BigTextStyle().bigText(Messages.t("bubble.notif.active") + micNote))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(identifyIntent)
            .addAction(0, Messages.t("bubble.notif.stop"), stopIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification() {
        if (!foreground) return
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, activeNotification())
    }

    /** Result notification. A library match gets "Lire" / "Ajouter à la file". */
    private fun postResult(outcome: BubbleOutcome) {
        val text = Messages.t(outcome.messageKey, params = outcome.messageParams())
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bubble_notify)
            .setContentTitle(Messages.t("settings.bubble"))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(appIntent(0, null))
            .setAutoCancel(true)
        if (outcome is BubbleOutcome.LocalFound) {
            builder.addAction(0, Messages.t("common.play"), appIntent(3, outcome.trackhash to EXTRA_PLAY_TRACK))
            builder.addAction(0, Messages.t("ctx.addToQueue"), appIntent(4, outcome.trackhash to EXTRA_QUEUE_TRACK))
        }
        notifyNow(builder.build())
    }

    private fun postPlain(text: String) {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bubble_notify)
            .setContentTitle(Messages.t("settings.bubble"))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(appIntent(0, null))
            .setAutoCancel(true)
        notifyNow(builder.build())
    }

    private fun notifyNow(notification: Notification) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(System.currentTimeMillis().toInt(), notification)
    }

    /** MainActivity deep-link, optionally carrying a play/queue trackhash. */
    private fun appIntent(requestCode: Int, extra: Pair<String, String>?): PendingIntent {
        val intent = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (extra != null) intent.putExtra(extra.second, extra.first)
        return PendingIntent.getActivity(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    // ---- overlay bubble -----------------------------------------------------

    private fun addBubble() {
        if (!Settings.canDrawOverlays(this)) return
        val wm = getSystemService(WindowManager::class.java)
        windowManager = wm
        val margin = (12 * resources.displayMetrics.density).toInt()
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = margin
            y = (180 * resources.displayMetrics.density).toInt()
        }
        var baseX = params.x
        var baseY = params.y
        val view = BubbleView(this).apply {
            onTap = { identify() }
            onDragStart = { baseX = params.x; baseY = params.y }
            onDrag = { dx, dy ->
                params.x = baseX + dx
                params.y = baseY + dy
                runCatching { wm.updateViewLayout(this, params) }
                // Real-Shazam behaviour: dragging toward the bottom edge reveals
                // the remove target under the finger (≈ 85 % of screen height).
                val dm = resources.displayMetrics
                setRemoveTargetVisible(BubbleDragLogic.showsRemoveTarget(params.y + height / 2f, dm.heightPixels))
            }
            onDragEnd = {
                val dm = resources.displayMetrics
                val cx = params.x + width / 2f
                val cy = params.y + height / 2f
                if (removeTargetShown && BubbleDragLogic.isDismissDrop(cx, cy, dm.widthPixels, dm.heightPixels)) {
                    dismissBubble()
                } else {
                    // Anywhere else: hide the target and snap to the nearest edge.
                    setRemoveTargetVisible(false)
                    snapBubble(params, this, margin)
                }
            }
        }
        bubbleView = view
        bubbleParams = params
        runCatching { wm.addView(view, params) }
        addRemoveTarget()
    }

    /** The "Supprimer" pill, centered at the bottom — drawn only, never
     *  touchable, so it can't steal the bubble's gestures. */
    private fun addRemoveTarget() {
        val wm = windowManager ?: return
        if (removeTarget != null) return
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = (28 * resources.displayMetrics.density).toInt()
        }
        val view = BubbleRemoveTargetView(this, Messages.t("bubble.removeTarget")).apply {
            alpha = 0f
            scaleX = 0.8f
            scaleY = 0.8f
            visibility = View.GONE
        }
        removeTarget = view
        runCatching { wm.addView(view, params) }
    }

    /** Fade/scale the remove pill in or out as the bubble crosses the zone. */
    private fun setRemoveTargetVisible(visible: Boolean) {
        val view = removeTarget ?: return
        if (removeTargetShown == visible) return
        removeTargetShown = visible
        view.animate().cancel()
        if (visible) {
            view.visibility = View.VISIBLE
            view.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(150).start()
        } else {
            view.animate().alpha(0f).scaleX(0.8f).scaleY(0.8f).setDuration(120)
                .withEndAction { view.visibility = View.GONE }.start()
        }
    }

    private fun removeRemoveTarget() {
        val view = removeTarget ?: return
        removeTarget = null
        removeTargetShown = false
        runCatching { windowManager?.removeViewImmediate(view) }
    }

    /** Snap back to the nearest horizontal edge after an aborted drag (or an
     *  interrupted gesture) — the classic overlay-bubble settle. */
    private fun snapBubble(params: WindowManager.LayoutParams, view: BubbleView, margin: Int) {
        val wm = windowManager ?: return
        val dm = resources.displayMetrics
        val toX = BubbleDragLogic.snapX(params.x, view.width, dm.widthPixels, margin)
        val toY = BubbleDragLogic.clampY(params.y, view.height, dm.heightPixels, margin, margin)
        val fromX = params.x
        val fromY = params.y
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 220
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                val t = it.animatedValue as Float
                params.x = (fromX + (toX - fromX) * t).toInt()
                params.y = (fromY + (toY - fromY) * t).toInt()
                runCatching { wm.updateViewLayout(view, params) }
            }
        }.start()
    }

    /** Dropped on the remove target: hide the bubble, turn the persisted toggle
     *  off (the Settings switch follows via BubbleBus) and stop the service
     *  cleanly — with a toast pointing at the settings. */
    private fun dismissBubble() {
        removeBubble()
        removeRemoveTarget()
        BubbleBus.enabled.value = false
        Toast.makeText(applicationContext, Messages.t("bubble.dismissed"), Toast.LENGTH_SHORT).show()
        scope.launch {
            runCatching { Prefs(applicationContext).setBubbleEnabled(false) }
            stopEverything()
        }
    }

    private fun removeBubble() {
        val view = bubbleView ?: return
        bubbleView = null
        runCatching { windowManager?.removeViewImmediate(view) }
    }

    private fun stopEverything() {
        pendingIdentify = false
        @Suppress("DEPRECATION")
        stopForeground(true)
        foreground = false
        stopSelf()
    }

    companion object {
        private const val NOTIF_ID = 0x5342
        private const val CHANNEL_ID = "shazam_bubble"

        const val ACTION_START = "local.auralis.client.action.BUBBLE_START"
        const val ACTION_PROJECTION = "local.auralis.client.action.BUBBLE_PROJECTION"
        const val ACTION_PROJECTION_DENIED = "local.auralis.client.action.BUBBLE_PROJECTION_DENIED"
        const val ACTION_IDENTIFY = "local.auralis.client.action.BUBBLE_IDENTIFY"
        const val ACTION_STOP = "local.auralis.client.action.BUBBLE_STOP"
        const val ACTION_RESET_PROJECTION = "local.auralis.client.action.BUBBLE_RESET_PROJECTION"

        const val EXTRA_RESULT_CODE = "bubbleResultCode"
        const val EXTRA_RESULT_DATA = "bubbleResultData"
        const val EXTRA_PENDING_IDENTIFY = "bubblePendingIdentify"

        /** MainActivity deep-link extras ("Lire" / "Ajouter à la file"). */
        const val EXTRA_PLAY_TRACK = "bubblePlayTrack"
        const val EXTRA_QUEUE_TRACK = "bubbleQueueTrack"

        private fun send(context: Context, action: String, configure: (Intent) -> Unit = {}) {
            val intent = Intent(context, ShazamBubbleService::class.java).setAction(action)
            configure(intent)
            ContextCompat.startForegroundService(context, intent)
        }

        /** First-run setup: bubble on with an internal-audio projection consent
         *  result (from an ActivityResult launcher or BubbleConsentActivity). */
        fun startWithProjection(context: Context, resultCode: Int, data: Intent) {
            send(context, ACTION_START) {
                it.putExtra(EXTRA_RESULT_CODE, resultCode)
                it.putExtra(EXTRA_RESULT_DATA, data)
            }
        }

        /** First-run setup on API 24-28 (no playback capture): mic mode. */
        fun startMic(context: Context) = send(context, ACTION_START)

        /** Bubble tap after a consent prompt (BubbleConsentActivity result). */
        fun onProjectionGranted(context: Context, resultCode: Int, data: Intent) {
            send(context, ACTION_PROJECTION) {
                it.putExtra(EXTRA_RESULT_CODE, resultCode)
                it.putExtra(EXTRA_RESULT_DATA, data)
            }
        }

        fun onProjectionDenied(context: Context) = send(context, ACTION_PROJECTION_DENIED)

        /** Tap the bubble or the notification ("touche pour identifier"). */
        fun identify(context: Context) = send(context, ACTION_IDENTIFY)

        /** Settings toggle off. */
        fun stop(context: Context) = send(context, ACTION_STOP)

        /** Settings "Réinitialiser l'autorisation d'écran": drop the projection so
         *  the next identification re-prompts. */
        fun resetProjection(context: Context) = send(context, ACTION_RESET_PROJECTION)
    }
}
