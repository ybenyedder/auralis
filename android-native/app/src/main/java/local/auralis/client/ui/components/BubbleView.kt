package local.auralis.client.ui.components

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.animation.LinearInterpolator
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/**
 * The Shazam-style floating bubble drawn over other apps (attached to the
 * window by playback/ShazamBubbleService). Deliberately a plain View + Canvas,
 * not Compose: the overlay must stay cheap and robust while other apps are in
 * front and the Auralis UI is gone.
 *
 * States: [State.Idle] (waveform glyph), [State.Capturing] (pulsing ring +
 * countdown label), [State.Identifying] (spinning arc), [State.Success] (check +
 * track label), [State.Failed] (shaken cross + message). Drag anywhere on the
 * bubble to move it; a tap (no drag) fires [onTap].
 */
class BubbleView(context: Context) : View(context) {

    sealed class State {
        /** Resting glyph, no label. */
        object Idle : State()
        /** Recording: [label] like "Écoute… 8 s". */
        data class Capturing(val label: String) : State()
        /** Uploading/identifying: [label] "Identification…". */
        data class Identifying(val label: String) : State()
        /** Identified: [label] "{title} — {artist}". */
        data class Success(val label: String) : State()
        /** Nothing found / capture failed: [label] = message. */
        data class Failed(val label: String) : State()
    }

    /** Tap without drag — start an identification. */
    var onTap: (() -> Unit)? = null

    /** A drag just started (snapshot the window position here). */
    var onDragStart: (() -> Unit)? = null

    /** Dragged by (dx, dy) px since the drag started. */
    var onDrag: ((dx: Int, dy: Int) -> Unit)? = null

    /** A drag ended (finger lifted after moving) — the owner decides between
     *  the remove-target drop and the snap-back. Never fired on a tap. */
    var onDragEnd: (() -> Unit)? = null

    // Apple-Music-red accent (mirrors ui/theme/Theme.kt — the View lives outside
    // the Compose tree so it carries its own palette constants).
    private val accentColor = Color.parseColor("#FA233B")
    private val inkColor = Color.WHITE
    private val darkColor = Color.parseColor("#E61C1C1E")

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val circleD = dp(56f)
    private val labelGap = dp(6f)
    private val labelHeight = dp(24f)
    private val maxLabelWidth = dp(190f)

    private var state: State = State.Idle

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = dp(11f)
    }

    // ---- animations ---------------------------------------------------------

    private var pulse = 0f
    private var spin = 0f

    private val pulseAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1100
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener { pulse = it.animatedValue as Float; invalidate() }
    }

    private val spinAnimator = ValueAnimator.ofFloat(0f, 360f).apply {
        duration = 900
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener { spin = it.animatedValue as Float; invalidate() }
    }

    private val shakeAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 420
        addUpdateListener {
            val t = it.animatedValue as Float
            translationX = (sin(t * PI * 6) * dp(5f) * (1 - t)).toFloat()
            if (t >= 1f) translationX = 0f
        }
    }

    fun setState(state: State) {
        this.state = state
        when (state) {
            is State.Capturing -> { if (!pulseAnimator.isRunning) pulseAnimator.start() }
            is State.Identifying -> { if (!spinAnimator.isRunning) spinAnimator.start() }
            is State.Failed -> { shakeAnimator.cancel(); shakeAnimator.start() }
            else -> { pulseAnimator.cancel(); spinAnimator.cancel(); translationX = 0f }
        }
        requestLayout()
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        pulseAnimator.cancel()
        spinAnimator.cancel()
        shakeAnimator.cancel()
    }

    // ---- measuring / drawing ------------------------------------------------

    private fun label(): String? = when (val s = state) {
        is State.Capturing -> s.label
        is State.Identifying -> s.label
        is State.Success -> s.label
        is State.Failed -> s.label
        State.Idle -> null
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val label = label()
        val textW = if (label == null) 0f else (textPaint.measureText(label) + dp(18f)).coerceAtMost(maxLabelWidth)
        val w = maxOf(circleD, textW).toInt()
        val h = (circleD + if (label == null) dp(4f) else labelGap + labelHeight).toInt()
        setMeasuredDimension(w, h)
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = circleD / 2f
        val r = circleD / 2f

        when (val s = state) {
            is State.Capturing -> {
                // Expanding pulse rings behind the live "recording" bubble.
                for (i in 0 until 2) {
                    val p = (pulse + i * 0.5f) % 1f
                    strokePaint.color = accentColor
                    strokePaint.alpha = ((1 - p) * 130).toInt()
                    strokePaint.strokeWidth = dp(2.5f)
                    canvas.drawCircle(cx, cy, r + dp(3f) + p * dp(14f), strokePaint)
                }
                fillPaint.color = accentColor
                canvas.drawCircle(cx, cy, r, fillPaint)
                drawWaveform(canvas, cx, cy, r, inkColor)
            }
            is State.Identifying -> {
                fillPaint.color = darkColor
                canvas.drawCircle(cx, cy, r, fillPaint)
                strokePaint.color = accentColor
                strokePaint.strokeWidth = dp(4f)
                val arcR = r - dp(6f)
                canvas.save()
                canvas.rotate(spin, cx, cy)
                canvas.drawArc(RectF(cx - arcR, cy - arcR, cx + arcR, cy + arcR), 0f, 270f, false, strokePaint)
                canvas.restore()
            }
            is State.Success -> {
                fillPaint.color = accentColor
                canvas.drawCircle(cx, cy, r, fillPaint)
                drawCheck(canvas, cx, cy, r)
            }
            is State.Failed -> {
                fillPaint.color = darkColor
                canvas.drawCircle(cx, cy, r, fillPaint)
                drawCross(canvas, cx, cy, r)
            }
            State.Idle -> {
                fillPaint.color = darkColor
                canvas.drawCircle(cx, cy, r, fillPaint)
                strokePaint.color = accentColor
                strokePaint.alpha = 60
                strokePaint.strokeWidth = dp(2f)
                canvas.drawCircle(cx, cy, r - dp(1.5f), strokePaint)
                strokePaint.alpha = 255
                drawWaveform(canvas, cx, cy, r, accentColor)
            }
        }

        label()?.let { label ->
            val ty = circleD + labelGap + labelHeight * 0.72f
            fillPaint.color = darkColor
            val tw = (textPaint.measureText(label) + dp(18f)).coerceAtMost(maxLabelWidth)
            val rect = RectF(cx - tw / 2f, circleD + labelGap, cx + tw / 2f, circleD + labelGap + labelHeight)
            canvas.drawRoundRect(rect, labelHeight / 2f, labelHeight / 2f, fillPaint)
            textPaint.color = inkColor
            // Clip the label to its pill so long titles ellipsize visually.
            canvas.save()
            canvas.clipRect(rect.left + dp(2f), rect.top, rect.right - dp(2f), rect.bottom)
            canvas.drawText(label, cx, ty, textPaint)
            canvas.restore()
        }
    }

    /** Five rounded waveform bars (the Auralis logo idea — a waveform "A"). */
    private fun drawWaveform(canvas: Canvas, cx: Float, cy: Float, r: Float, color: Int) {
        val barW = r * 0.16f
        val maxH = r * 1.1f
        val heights = floatArrayOf(0.34f, 0.68f, 1f, 0.68f, 0.34f)
        val gap = barW * 0.85f
        val totalW = heights.size * barW + (heights.size - 1) * gap
        var x = cx - totalW / 2f + barW / 2f
        fillPaint.color = color
        for (h in heights) {
            val bh = maxH * h
            canvas.drawRoundRect(
                RectF(x - barW / 2f, cy - bh / 2f, x + barW / 2f, cy + bh / 2f),
                barW / 2f, barW / 2f, fillPaint,
            )
            x += barW + gap
        }
    }

    private fun drawCheck(canvas: Canvas, cx: Float, cy: Float, r: Float) {
        strokePaint.color = inkColor
        strokePaint.strokeWidth = dp(4.5f)
        val path = Path().apply {
            moveTo(cx - r * 0.38f, cy + r * 0.02f)
            lineTo(cx - r * 0.10f, cy + r * 0.30f)
            lineTo(cx + r * 0.42f, cy - r * 0.28f)
        }
        canvas.drawPath(path, strokePaint)
    }

    private fun drawCross(canvas: Canvas, cx: Float, cy: Float, r: Float) {
        strokePaint.color = inkColor
        strokePaint.strokeWidth = dp(4.5f)
        val d = r * 0.32f
        canvas.drawLine(cx - d, cy - d, cx + d, cy + d, strokePaint)
        canvas.drawLine(cx + d, cy - d, cx - d, cy + d, strokePaint)
    }

    // ---- touch: drag to move, tap to identify -------------------------------

    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.rawX
                downY = event.rawY
                dragging = false
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.rawX - downX
                val dy = event.rawY - downY
                if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
                    dragging = true
                    onDragStart?.invoke()
                }
                if (dragging) onDrag?.invoke(dx.toInt(), dy.toInt())
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (!dragging) onTap?.invoke() else onDragEnd?.invoke()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                // Interrupted drag: let the owner snap the bubble back into place.
                if (dragging) onDragEnd?.invoke()
                return true
            }
        }
        return super.onTouchEvent(event)
    }
}

/**
 * The drag-to-dismiss remove target: a red "Supprimer" trash pill revealed at
 * the BOTTOM of the screen while the Shazam bubble is dragged low (faded/scaled
 * in by playback/ShazamBubbleService). Pure drawing, deliberately not touchable
 * — the drop decision is made from the bubble's position (model/BubbleDragLogic),
 * so the pill never steals the bubble's gestures.
 */
class BubbleRemoveTargetView(context: Context, private val label: String) : View(context) {

    private val accentColor = Color.parseColor("#FA233B")
    private val inkColor = Color.WHITE

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val pillW = dp(180f)
    private val pillH = dp(52f)

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = dp(13f)
        typeface = Typeface.DEFAULT_BOLD
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(pillW.toInt(), pillH.toInt())
    }

    override fun onDraw(canvas: Canvas) {
        val rect = RectF(0f, 0f, width.toFloat(), height.toFloat())
        fillPaint.color = accentColor
        canvas.drawRoundRect(rect, pillH / 2f, pillH / 2f, fillPaint)

        // Trash glyph + "Supprimer" label, side by side inside the pill.
        val glyphR = dp(9f)
        val textW = textPaint.measureText(label)
        val totalW = glyphR * 2f + dp(10f) + textW
        val left = width / 2f - totalW / 2f
        drawTrash(canvas, left + glyphR, height / 2f, glyphR)
        textPaint.color = inkColor
        canvas.drawText(label, left + glyphR * 2f + dp(10f) + textW / 2f, height / 2f + dp(4.5f), textPaint)
    }

    /** Small trash can: lid, handle and a tapered body with two ribs. */
    private fun drawTrash(canvas: Canvas, cx: Float, cy: Float, r: Float) {
        strokePaint.color = inkColor
        strokePaint.strokeWidth = dp(1.8f)
        // Handle + lid.
        canvas.drawLine(cx - r * 0.22f, cy - r * 0.72f, cx + r * 0.22f, cy - r * 0.72f, strokePaint)
        canvas.drawLine(cx - r * 0.55f, cy - r * 0.45f, cx + r * 0.55f, cy - r * 0.45f, strokePaint)
        // Body (slightly tapered).
        canvas.drawLine(cx - r * 0.42f, cy - r * 0.28f, cx - r * 0.3f, cy + r * 0.72f, strokePaint)
        canvas.drawLine(cx + r * 0.42f, cy - r * 0.28f, cx + r * 0.3f, cy + r * 0.72f, strokePaint)
        canvas.drawLine(cx - r * 0.3f, cy + r * 0.72f, cx + r * 0.3f, cy + r * 0.72f, strokePaint)
        // Ribs.
        canvas.drawLine(cx - r * 0.12f, cy - r * 0.12f, cx - r * 0.08f, cy + r * 0.5f, strokePaint)
        canvas.drawLine(cx + r * 0.12f, cy - r * 0.12f, cx + r * 0.08f, cy + r * 0.5f, strokePaint)
    }
}
