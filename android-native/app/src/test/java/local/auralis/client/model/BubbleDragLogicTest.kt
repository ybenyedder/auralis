package local.auralis.client.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM unit tests for the bubble drag-to-dismiss maths (model/BubbleDragLogic.kt):
 *  the 85 % remove-zone threshold, the drop hit-test and the snap-back edges. */
class BubbleDragLogicTest {

    // ---- remove zone -------------------------------------------------------

    @Test
    fun `remove target appears below 85 percent of the screen`() {
        assertFalse(BubbleDragLogic.showsRemoveTarget(bubbleCenterY = 849f, screenHeight = 1000))
        assertTrue(BubbleDragLogic.showsRemoveTarget(bubbleCenterY = 850f, screenHeight = 1000))
        assertTrue(BubbleDragLogic.showsRemoveTarget(bubbleCenterY = 1200f, screenHeight = 1000))
    }

    @Test
    fun `degenerate screen sizes never show the target`() {
        assertFalse(BubbleDragLogic.showsRemoveTarget(500f, 0))
        assertFalse(BubbleDragLogic.showsRemoveTarget(500f, -1))
    }

    // ---- drop hit-test -----------------------------------------------------

    @Test
    fun `drop inside the bottom pill dismisses`() {
        assertTrue(BubbleDragLogic.isDismissDrop(500f, 900f, 1000, 1000))
    }

    @Test
    fun `drop above the zone snaps back`() {
        assertFalse(BubbleDragLogic.isDismissDrop(500f, 800f, 1000, 1000))
    }

    @Test
    fun `drop outside the pill's horizontal span snaps back`() {
        // The pill spans the middle 60 % of the width (200..800 on a 1000-wide screen).
        assertFalse(BubbleDragLogic.isDismissDrop(150f, 900f, 1000, 1000))
        assertFalse(BubbleDragLogic.isDismissDrop(850f, 900f, 1000, 1000))
        assertTrue(BubbleDragLogic.isDismissDrop(200f, 900f, 1000, 1000))
        assertTrue(BubbleDragLogic.isDismissDrop(800f, 900f, 1000, 1000))
    }

    @Test
    fun `drop with a degenerate width snaps back`() {
        assertFalse(BubbleDragLogic.isDismissDrop(500f, 900f, 0, 1000))
    }

    // ---- snap back ---------------------------------------------------------

    @Test
    fun `snap goes to the nearest horizontal edge`() {
        assertEquals(0, BubbleDragLogic.snapX(currentX = 100, bubbleWidth = 100, screenWidth = 1000))
        assertEquals(900, BubbleDragLogic.snapX(currentX = 850, bubbleWidth = 100, screenWidth = 1000))
        // Exact middle: tie goes to the left edge.
        assertEquals(0, BubbleDragLogic.snapX(currentX = 450, bubbleWidth = 100, screenWidth = 1000))
    }

    @Test
    fun `snap respects the bubble margin`() {
        assertEquals(12, BubbleDragLogic.snapX(currentX = 50, bubbleWidth = 100, screenWidth = 1000, margin = 12))
        assertEquals(888, BubbleDragLogic.snapX(currentX = 900, bubbleWidth = 100, screenWidth = 1000, margin = 12))
    }

    @Test
    fun `snap keeps the position on degenerate geometry`() {
        assertEquals(33, BubbleDragLogic.snapX(currentX = 33, bubbleWidth = 0, screenWidth = 1000))
        assertEquals(33, BubbleDragLogic.snapX(currentX = 33, bubbleWidth = 100, screenWidth = 0))
    }

    @Test
    fun `clampY keeps the bubble inside the screen`() {
        assertEquals(12, BubbleDragLogic.clampY(currentY = -40, bubbleHeight = 100, screenHeight = 1000, marginTop = 12, marginBottom = 12))
        assertEquals(888, BubbleDragLogic.clampY(currentY = 2000, bubbleHeight = 100, screenHeight = 1000, marginTop = 12, marginBottom = 12))
        assertEquals(400, BubbleDragLogic.clampY(currentY = 400, bubbleHeight = 100, screenHeight = 1000, marginTop = 12, marginBottom = 12))
        // Degenerate geometry: untouched.
        assertEquals(7, BubbleDragLogic.clampY(currentY = 7, bubbleHeight = 0, screenHeight = 0))
    }
}
