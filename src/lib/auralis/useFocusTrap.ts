"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside an open modal/dialog and restore it on close.
 *
 * - On open: remembers the element that had focus, then moves focus to
 *   `initialFocus` (or the first focusable child, or the container itself).
 * - While open: Tab / Shift+Tab cycle within the container instead of escaping
 *   to the page behind the scrim.
 * - On close/unmount: focus returns to wherever it was before — so keyboard and
 *   switch-control users aren't dumped at the top of the document.
 *
 * Refs are passed (stable identities) so this hook has no churny object deps.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;

    const focusInitial = () => {
      const target =
        initialFocusRef?.current ??
        container.querySelector<HTMLElement>(FOCUSABLE) ??
        container;
      target.focus?.();
    };
    const t = setTimeout(focusInitial, 20);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        container.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(t);
      container.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, initialFocusRef]);
}
