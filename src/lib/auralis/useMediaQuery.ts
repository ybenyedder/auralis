"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe: returns `false` on the server and the
 * first client render (matching the server HTML), then resolves to the real match
 * after mount. Use for layout branches that can't be expressed in pure CSS — e.g.
 * deciding which scroll container a virtualized list should bind to.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Tailwind `lg` breakpoint (≥1024px). True once mounted on a desktop-width viewport. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
