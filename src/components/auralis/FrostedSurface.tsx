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
    const { blurAmount, scrollProgress } = containerRef
      ? { blurAmount: 0, scrollProgress: 0 } // Pour conteneurs, utilisez useContainerScrollBlur directement
      : useScrollBlur(threshold, maxBlur);

    const style = {
      backdropFilter: `blur(${blurAmount}px)`,
      WebkitBackdropFilter: `blur(${blurAmount}px)`,
      backgroundColor: `rgba(0, 0, 0, ${0.4 + scrollProgress * 0.2})`, // S'assombrit au scroll
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
