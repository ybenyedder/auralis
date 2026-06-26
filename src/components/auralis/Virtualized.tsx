"use client";

// Windowing primitives — the single biggest reason Auralis stays instant and never
// crashes, no matter how large the library is. Instead of mounting one DOM node per
// item (a 1,000,000-track list = 1,000,000 fibers + nodes = guaranteed OOM/freeze on
// a phone), these render ONLY the rows/cards currently near the viewport — a constant
// ~30-60 nodes — and reserve the rest of the scroll height with a single spacer.
//
// They auto-detect the nearest scrollable ancestor (our shared <main>, or a panel's
// own overflow container), so they're drop-in: replace `arr.map(...)` with
// <VirtualList items={arr}>{...}</VirtualList> and the list is crash-proof. Heights
// and grid column counts are measured from the first real item, so they stay correct
// across breakpoints without the caller hard-coding pixel sizes.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Walk up from `el` to the first ancestor that is a scroll container — i.e. whose
 * computed `overflow-y` is auto/scroll/overlay. We deliberately do NOT require it to
 * currently overflow (`scrollHeight > clientHeight`): such an element IS the scroll
 * container by definition, even before content fills it, and resolving the same
 * element at every breakpoint keeps the window math stable across resizes. Falls back
 * to the document scroller.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return (typeof document !== "undefined" ? (document.scrollingElement as HTMLElement | null) : null);
}

/**
 * Core window math. Returns the half-open range of *rows* to render plus the pixel
 * offset of the first one. `rowCount` is item count for a list, or ceil(count/cols)
 * for a grid. Recomputes on scroll (rAF-throttled), resize, and content reflow.
 */
function useVirtualWindow(
  outerRef: RefObject<HTMLElement | null>,
  rowCount: number,
  stride: number,
  overscan: number,
  scrollRef?: RefObject<HTMLElement | null>,
) {
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: Math.min(rowCount, overscan * 3 + 12) });
  const scrollerRef = useRef<HTMLElement | null>(null);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const outer = outerRef.current;
    const scroller = scrollerRef.current;
    if (!outer || !scroller || stride <= 0) return;
    const scrollerTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    const offsetTop = outer.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
    const viewTop = scroller.scrollTop;
    const viewH = scroller.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 800);
    const rel = viewTop - offsetTop;
    const start = Math.max(0, Math.floor(rel / stride) - overscan);
    const end = Math.min(rowCount, Math.ceil((rel + viewH) / stride) + overscan);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [outerRef, rowCount, stride, overscan]);

  // Resolve the scroll parent once mounted, then keep the window in sync with it.
  useIsoLayoutEffect(() => {
    const scroller = scrollRef?.current ?? findScrollParent(outerRef.current);
    scrollerRef.current = scroller;
    measure();
    if (!scroller) return;

    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        measure();
      });
    };
    const scrollTarget: EventTarget = scroller === document.scrollingElement ? window : scroller;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Content above the list (heroes, tabs) and the list itself can reflow without a
    // scroll event — observe both so the offset stays honest.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    if (ro && outerRef.current) ro.observe(outerRef.current);
    if (ro && scroller !== document.scrollingElement) ro.observe(scroller);

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure, outerRef, scrollRef]);

  // Re-measure whenever the row count or stride changes (sort, filter, tab switch).
  useIsoLayoutEffect(() => { measure(); }, [rowCount, stride, measure]);

  return range;
}

/**
 * Measure the rendered height of a representative slot so the window math
 * self-corrects across breakpoints (no hard-coded pixel sizes). Returns a CALLBACK
 * ref: the caller attaches it to the first visible slot, and because that slot
 * changes as the window scrolls/recycles, the callback re-observes the current one —
 * keeping the measurement live even after a resize changes the row height.
 */
function useMeasuredSize(fallback: number) {
  const [size, setSize] = useState(fallback);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const apply = () => {
      const h = el.offsetHeight;
      if (h > 0) setSize((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
    };
    apply();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      roRef.current = ro;
    }
  }, []);
  return [size, measureRef] as const;
}

interface VirtualListProps<T> {
  items: T[];
  children: (item: T, index: number) => ReactNode;
  itemKey: (item: T, index: number) => string | number;
  /** Pixel height of one row before measurement kicks in. */
  estimateHeight?: number;
  /** Vertical gap between rows (px). */
  gap?: number;
  overscan?: number;
  className?: string;
  /** Override the auto-detected scroll container. */
  scrollRef?: RefObject<HTMLElement | null>;
}

/**
 * Virtualized vertical list. Renders only the rows near the viewport regardless of
 * `items.length`, so a million rows costs the same as a dozen.
 */
export function VirtualList<T>({
  items,
  children,
  itemKey,
  estimateHeight = 56,
  gap = 0,
  overscan = 8,
  className,
  scrollRef,
}: VirtualListProps<T>) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [rowH, measureRef] = useMeasuredSize(estimateHeight);
  const stride = rowH + gap;
  const { start, end } = useVirtualWindow(outerRef, items.length, stride, overscan, scrollRef);

  const total = items.length > 0 ? items.length * stride - gap : 0;
  const offset = start * stride;
  const slice = items.slice(start, end);

  return (
    <div ref={outerRef} className={className} style={{ position: "relative", height: total }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${offset}px)`, display: "flex", flexDirection: "column", rowGap: gap }}>
        {slice.map((item, i) => {
          const index = start + i;
          return (
            <div key={itemKey(item, index)} ref={i === 0 ? measureRef : undefined}>
              {children(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface VirtualGridProps<T> {
  items: T[];
  children: (item: T, index: number) => ReactNode;
  itemKey: (item: T, index: number) => string | number;
  /** Minimum column width; column count is derived from the container width. */
  minItemWidth: number;
  gap?: number;
  estimateRowHeight?: number;
  overscan?: number;
  className?: string;
  scrollRef?: RefObject<HTMLElement | null>;
}

/**
 * Virtualized responsive grid. Column count is measured from the container width
 * (like a CSS auto-fill grid), and only the visible rows of cards are mounted.
 */
export function VirtualGrid<T>({
  items,
  children,
  itemKey,
  minItemWidth,
  gap = 8,
  estimateRowHeight = 220,
  overscan = 3,
  className,
  scrollRef,
}: VirtualGridProps<T>) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [rowH, measureRef] = useMeasuredSize(estimateRowHeight);
  const [width, setWidth] = useState(0);

  useIsoLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = Math.max(1, Math.floor((width + gap) / (minItemWidth + gap))) || 1;
  const strideRow = rowH + gap;
  const rowCount = Math.ceil(items.length / columns);
  const { start, end } = useVirtualWindow(outerRef, rowCount, strideRow, overscan, scrollRef);

  const total = rowCount > 0 ? rowCount * strideRow - gap : 0;
  const offset = start * strideRow;
  const cols = `repeat(${columns}, minmax(0, 1fr))`;

  const rows: ReactNode[] = [];
  for (let r = start; r < end; r++) {
    const from = r * columns;
    const rowItems = items.slice(from, from + columns);
    rows.push(
      <div key={r} ref={r === start ? measureRef : undefined} style={{ display: "grid", gridTemplateColumns: cols, gap }}>
        {rowItems.map((item, c) => (
          <div key={itemKey(item, from + c)}>{children(item, from + c)}</div>
        ))}
      </div>,
    );
  }

  return (
    <div ref={outerRef} className={className} style={{ position: "relative", height: total }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${offset}px)`, display: "flex", flexDirection: "column", rowGap: gap }}>
        {rows}
      </div>
    </div>
  );
}
