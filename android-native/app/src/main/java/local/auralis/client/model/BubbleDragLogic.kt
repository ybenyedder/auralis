package local.auralis.client.model

// Pure drag-to-dismiss maths for the Shazam bubble (ui/components/BubbleView +
// playback/ShazamBubbleService). Kept Android-free so the thresholds are
// JVM-testable (see BubbleDragLogicTest).

/**
 * Real-Shazam behaviour: dragging the bubble toward the BOTTOM edge reveals a
 * "Supprimer" pill centered at the bottom; dropping inside it dismisses the
 * bubble, dropping anywhere else snaps it back to the nearest edge. All the
 * threshold maths lives here.
 */
object BubbleDragLogic {

    /** The remove target fades in once the bubble's CENTER drops below this
     *  fraction of the screen height. */
    const val DISMISS_LINE = 0.85f

    /** The drop must land within this fraction of the screen width, centered —
     *  the remove pill spans the middle of the bottom edge. */
    const val TARGET_WIDTH_FRACTION = 0.6f

    /** Reveal the bottom remove target while dragging. */
    fun showsRemoveTarget(bubbleCenterY: Float, screenHeight: Int): Boolean =
        screenHeight > 0 && bubbleCenterY >= screenHeight * DISMISS_LINE

    /** Release inside the remove pill → dismiss; anywhere else → snap back. */
    fun isDismissDrop(
        bubbleCenterX: Float,
        bubbleCenterY: Float,
        screenWidth: Int,
        screenHeight: Int,
    ): Boolean {
        if (!showsRemoveTarget(bubbleCenterY, screenHeight) || screenWidth <= 0) return false
        val half = screenWidth * TARGET_WIDTH_FRACTION / 2f
        val mid = screenWidth / 2f
        return bubbleCenterX >= mid - half && bubbleCenterX <= mid + half
    }

    /** Nearest horizontal edge for the bubble window after an aborted drag
     *  (left margin or right margin — the closer side wins). */
    fun snapX(currentX: Int, bubbleWidth: Int, screenWidth: Int, margin: Int = 0): Int {
        if (screenWidth <= 0 || bubbleWidth <= 0) return currentX
        val left = margin.coerceAtLeast(0)
        val right = (screenWidth - bubbleWidth - margin).coerceAtLeast(left)
        return if (currentX - left <= right - currentX) left else right
    }

    /** Keep the bubble inside the screen vertically after a drag. */
    fun clampY(currentY: Int, bubbleHeight: Int, screenHeight: Int, marginTop: Int = 0, marginBottom: Int = 0): Int {
        if (screenHeight <= 0 || bubbleHeight <= 0) return currentY
        val max = (screenHeight - bubbleHeight - marginBottom).coerceAtLeast(marginTop)
        return currentY.coerceIn(marginTop, max)
    }
}
