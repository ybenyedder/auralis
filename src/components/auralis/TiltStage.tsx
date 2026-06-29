"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// Tilt is a JS-driven inline transform, not a CSS animation/transition, so the
// global prefers-reduced-motion media query (which only zeroes durations) does NOT
// neutralise it. Gate it explicitly, mirroring LyricsView's check.
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

interface TiltStageProps {
  children: ReactNode;
  /** Outer box — drive width/height here (e.g. `w-full aspect-square max-w-[400px]`). */
  className?: string;
  /** Corner radius (px) of the wrapped artwork so the glare + rim clip to it. */
  radius?: number;
  /** Max rotation in degrees at the edges. */
  max?: number;
}

/**
 * Press-and-hold 3D tilt for hero artwork. While the pointer is held the cover
 * rotates toward it (gyroscope feel), lifts a touch, casts a shadow that swings
 * opposite the tilt, and a specular highlight rides the surface under the finger.
 * Release springs it flat. Pointer-capture keeps it tracking outside the box;
 * `touch-action: none` makes the gesture a tilt rather than a scroll. No deps.
 */
export function TiltStage({ children, className = "", radius = 8, max = 16 }: TiltStageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [active, setActive] = useState(false);

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setTilt({
      ry: (px - 0.5) * 2 * max, // horizontal position → rotate around Y
      rx: (0.5 - py) * 2 * max, // vertical position → rotate around X
      gx: px * 100,
      gy: py * 100,
    });
  };

  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return;
    ref.current?.setPointerCapture?.(e.pointerId);
    if (e.pointerType !== "mouse") navigator.vibrate?.(8); // tiny haptic tick on touch
    setActive(true);
    track(e);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (active) track(e);
  };
  const end = () => {
    if (!active) return;
    setActive(false);
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 }); // spring back to flat
  };

  const innerStyle: CSSProperties = {
    transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${active ? 1.045 : 1})`,
    transformStyle: "preserve-3d",
    transition: active
      ? "transform 60ms linear"
      : "transform 600ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 600ms cubic-bezier(0.22, 1, 0.36, 1)",
    willChange: "transform",
    borderRadius: radius,
    boxShadow: active
      ? `${-tilt.ry * 1.4}px ${22 - tilt.rx * 1.4}px 48px rgba(0, 0, 0, 0.55)`
      : "0 12px 30px rgba(0, 0, 0, 0.40)",
  };

  return (
    <div
      ref={ref}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDragStart={(e) => e.preventDefault()} // kill the native image drag-ghost
      className={cn("relative select-none", className)}
      style={{ perspective: 1000, touchAction: "none" }}
    >
      <div className="relative h-full w-full" style={innerStyle}>
        {children}
        {/* Specular highlight riding the surface, brightest under the pointer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: radius,
            opacity: active ? 1 : 0,
            transition: "opacity 350ms ease",
            mixBlendMode: "soft-light",
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.55), rgba(255,255,255,0.06) 32%, transparent 56%)`,
          }}
        />
        {/* Hairline rim so the lifted card keeps a defined edge over the backdrop. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: radius, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)" }}
        />
      </div>
    </div>
  );
}
