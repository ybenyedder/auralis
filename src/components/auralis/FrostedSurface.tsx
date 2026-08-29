"use client";

import { forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrollBlur } from "./useScrollBlur";

interface FrostedSurfaceProps {
  children: ReactNode;
  className?: string;
  threshold?: number;
  maxBlur?: number;
  containerRef?: React.RefObject<HTMLElement>;
}

/**
 * Surface frosted style Apple Music — le blur s'intensifie au scroll
 * À utiliser pour les headers, docks et autres surfaces flottantes
 */
export const FrostedSurface = forwardRef<HTMLDivElement, FrostedSurfaceProps>(
  ({ children, className, threshold = 60, maxBlur = 24, containerRef }, ref) => {
    // Hooks must be called unconditionally (rules-of-hooks): always run the
    // scroll-blur hook, and simply ignore its result when a containerRef is
    // supplied (callers then drive the blur themselves via useContainerScrollBlur).
    const { blurAmount, scrollProgress } = useScrollBlur(threshold, maxBlur);
    const active = !containerRef;

    const style = {
      backdropFilter: `blur(${active ? blurAmount : 0}px)`,
      WebkitBackdropFilter: `blur(${active ? blurAmount : 0}px)`,
      backgroundColor: `rgba(0, 0, 0, ${0.4 + (active ? scrollProgress : 0) * 0.2})`, // S'assombrit au scroll
    } as React.CSSProperties;

    return (
      <div
        ref={ref}
        className={cn("frosted-surface", className)}
        style={style}
      >
        {children}
      </div>
    );
  }
);

FrostedSurface.displayName = "FrostedSurface";
