"use client";

// Horizontal swipe-between-root-tabs gesture for the mobile shell — native
// parity with Apple Music / YouTube Music tab paging: on a root tab, a
// decisive left/right swipe moves to the adjacent dock tab.
//
// Deliberately passive & observe-only: the browser keeps full control of
// scrolling (vertical lists, horizontal carousels). The gesture only *commits*
// on touchend, so it can never fight a native scroll.
//
// Guards (each one disqualifies the gesture):
//   • Multi-touch (pinch-zoom).
//   • Started on an interactive surface that owns horizontal drags:
//     text fields, selects, sliders, tab lists, or anything opting out via
//     [data-no-tab-swipe].
//   • Started on (or inside) a horizontal scroller that can still consume the
//     drag in that direction — album shelves and mood-mix carousels scroll
//     natively; only when such a scroller is at its edge does the swipe fall
//     through to a tab change (classic iOS rubber-band-then-page behaviour).
//   • Vertical-dominant motion (axis lock at the first decisive move).
//   • Not on a root tab view (detail screens like album/artist keep their
//     push-navigation semantics — native apps don't page-swipe pushed screens).
//   • No adjacent tab in the swipe direction (first/last tab).

import { useEffect, type RefObject } from "react";
import { usePlayer, type ViewId } from "@/store/player";

/** Dock order — must stay in sync with MobileDock's TABS. */
const TAB_ORDER: ViewId[] = ["home", "explore", "radio", "library", "search"];

/** Minimum horizontal travel (px) before release counts as a swipe. */
const SWIPE_MIN_PX = 72;
/** Horizontal dominance required at release (|dx| > ratio × |dy|). */
const SWIPE_RATIO = 1.6;
/** Movement (px) before the gesture axis is decided. */
const AXIS_LOCK_PX = 9;

/** Subtle haptic tick on commit (no-op where unsupported). */
function hapticTick() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(8);
    } catch {
      /* unavailable */
    }
  }
}

/** True when `node` (or an ancestor up to `boundary`) scrolls horizontally and
 *  can still consume a drag towards `dirRight` (true = finger moving right). */
function horizontalScrollerConsumes(node: HTMLElement, boundary: HTMLElement, dirRight: boolean): boolean {
  let el: HTMLElement | null = node;
  while (el && el !== boundary) {
    const style = window.getComputedStyle(el);
    const scrollsX = style.overflowX === "auto" || style.overflowX === "scroll";
    if (scrollsX && el.scrollWidth > el.clientWidth + 2) {
      // The carousel owns the drag while there is room in this direction; at
      // its edge the drag falls through to a tab swipe (iOS rubber-band feel).
      const canGo = dirRight ? el.scrollLeft > 1 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      if (canGo) return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function useTabSwipe(
  mainRef: RefObject<HTMLElement | null>,
  /** Called by the hook when it commits a swipe so the view container can
   *  animate in from the correct side; page.tsx stores it in state and
   *  clears it after the animation window. */
  onSwipe: (direction: "next" | "prev") => void,
) {
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof window === "undefined" || !window.matchMedia) return;

    // Touch-primary AND mobile layout only — a desktop/touchscreen hybrid
    // (Windows laptop, iPad ≥768px) shows the sidebar shell where paging
    // between tabs has no visible dock to reflect it.
    const mobileMQ = window.matchMedia("(pointer: coarse) and (max-width: 767px)");

    let startX = 0;
    let startY = 0;
    let axis: "x" | "y" | null = null;
    let eligible = false;
    let targetEl: HTMLElement | null = null;

    const targetIndex = (dirRight: boolean): number => {
      const idx = TAB_ORDER.indexOf(usePlayer.getState().view.view);
      if (idx === -1) return -1;
      return dirRight ? idx - 1 : idx + 1;
    };

    const reset = () => {
      axis = null;
      eligible = false;
      targetEl = null;
    };

    const onStart = (e: TouchEvent) => {
      reset();
      if (!mobileMQ.matches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      const target = t.target instanceof HTMLElement ? t.target : null;
      if (!target) return;
      // Surfaces that own horizontal drags: text selection in inputs, native
      // selects, sliders, tab strips — plus an explicit opt-out hook.
      if (target.closest("input, textarea, select, [contenteditable], [role='slider'], [role='tablist'], [data-no-tab-swipe]")) {
        return;
      }
      targetEl = target;
      eligible = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!eligible) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          axis = "x";
          const dirRight = dx > 0;
          // The gesture becomes a candidate tab swipe: it must have somewhere
          // to go, and no carousel under the finger may want the drag instead.
          const idx = targetIndex(dirRight);
          if (idx < 0 || idx >= TAB_ORDER.length) {
            eligible = false;
            return;
          }
          if (targetEl && horizontalScrollerConsumes(targetEl, el, dirRight)) {
            eligible = false;
          }
        } else {
          axis = "y";
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!eligible || axis !== "x") {
        reset();
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      reset();
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy) * SWIPE_RATIO) return;
      const dirRight = dx > 0;
      const idx = targetIndex(dirRight);
      if (idx < 0 || idx >= TAB_ORDER.length) return;
      onSwipe(dirRight ? "prev" : "next");
      hapticTick();
      usePlayer.getState().navigate(TAB_ORDER[idx]);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", reset);
    };
  }, [mainRef, onSwipe]);
}
