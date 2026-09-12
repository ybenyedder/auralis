"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Native-style pull-to-refresh for touch devices.
 *
 * Mounts on a scroll container (or the window when `scrollRef` is null and no
 * `scrollSelector` is given). On a touch device only (coarse pointer): a
 * touchstart at scrollTop ≤ threshold arms the gesture; touchmove pulls down
 * a spinner that tracks the finger (rubber-banded past the threshold so it
 * never feels wooden); releasing past the trigger fires `onRefresh` and
 * animates the indicator back. Mouse pointers, infinite carousels and inputs
 * are skipped — they should not eat the gesture.
 *
 * Returns the current pull distance and a "refreshing" flag so the caller
 * can render its own indicator at the top of the scrolled view. We deliberately
 * keep the indicator DOM in the caller (not injected here) so the host owns
 * layout/animation, while this hook only owns gesture math and the lifecycle.
 *
 * The gesture state lives in refs, NOT in the effect's dependency list: `pull`
 * updates on every finger-move frame, and re-resolving effect deps per frame
 * used to tear down and re-attach all four touch listeners ~15×/gesture.
 * Listeners bind once per (disabled, scrollRef, scrollSelector) change.
 */
export function usePullToRefresh(opts: {
  onRefresh: () => Promise<void> | void;
  scrollRef?: React.RefObject<HTMLElement | null>;
  scrollSelector?: string;
  threshold?: number; // pull distance (px) required to commit
  maxPull?: number; // rubber-band ceiling
  disabled?: boolean;
}): { pull: number; refreshing: boolean } {
  const { onRefresh, scrollRef, scrollSelector, threshold = 64, maxPull = 96, disabled } = opts;
  const [pull, setPullState] = useState(0);
  const [refreshing, setRefreshingState] = useState(false);
  // Render state mirrored into refs the (once-attached) handlers read live.
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const setPull = (v: number) => {
    pullRef.current = v;
    setPullState(v);
  };
  const setRefreshing = (v: boolean) => {
    refreshingRef.current = v;
    setRefreshingState(v);
  };
  // Keep the latest onRefresh in a ref so the listeners attached once (on mount)
  // never go stale — re-binding touchstart/move/up on every render would risk
  // leaking listeners or firing on detached DOM.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  const active = useRef(false);
  const startY = useRef(0);

  useEffect(() => {
    if (disabled) return;
    // Touch-only: anything that reports coarse pointer (a finger). A mouse
    // user pulling down on a scrollbar would otherwise hijack the page.
    const mq = window.matchMedia?.("(pointer: coarse)");
    if (!mq || !mq.matches) return;

    const resolveScrollEl = (): HTMLElement | null => {
      if (scrollRef?.current) return scrollRef.current;
      if (scrollSelector) return document.querySelector<HTMLElement>(scrollSelector);
      return null;
    };
    const getScrollTop = () => resolveScrollEl()?.scrollTop ?? 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (getScrollTop() > 1) return;
      // Opt-out for elements that should swallow the gesture (text inputs,
      // sliders, carousels that already pan horizontally, etc.).
      const target = e.target as Element | null;
      if (target?.closest("input, textarea, select, [data-no-pull-to-refresh]")) return;
      active.current = true;
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      // Rubber-band: half-speed past 0 (and capped) so the page resists the
      // finger — the native iOS feel.
      const eased = Math.min(maxPull, dy * 0.5);
      setPull(eased);
      // Only preventDefault when we're actively in a pull so we never block
      // a real vertical scroll that started mid-page.
      if (eased > 4 && e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!active.current) {
        setPull(0);
        return;
      }
      active.current = false;
      if (pullRef.current >= threshold) {
        setRefreshing(true);
        setPull(threshold);
        Promise.resolve(onRefreshRef.current())
          .catch(() => {})
          .finally(() => {
            setRefreshing(false);
            setPull(0);
          });
      } else {
        setPull(0);
      }
    };

    // Attach to the resolved scroll element. No body fallback: in this app
    // shell the page itself never scrolls, and binding to <body> made the
    // gesture fire mid-list wherever window.scrollY happened to read 0.
    const attachEl = resolveScrollEl();
    if (!attachEl) return;
    attachEl.addEventListener("touchstart", onTouchStart, { passive: true });
    attachEl.addEventListener("touchmove", onTouchMove, { passive: false });
    attachEl.addEventListener("touchend", onTouchEnd, { passive: true });
    attachEl.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      attachEl.removeEventListener("touchstart", onTouchStart);
      attachEl.removeEventListener("touchmove", onTouchMove);
      attachEl.removeEventListener("touchend", onTouchEnd);
      attachEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, scrollRef, scrollSelector, threshold, maxPull]);

  return { pull, refreshing };
}
