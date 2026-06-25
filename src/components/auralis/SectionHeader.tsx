"use client";

import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
  className?: string;
  icon?: React.ReactNode;
}

export function SectionHeader({ title, action, onAction, className }: SectionHeaderProps) {
  // Spotify shelf header: just a big bold title (hover-underlines) on the left and
  // a muted "Tout afficher" link on the right. No eyebrow, no accent icon — those
  // props are still accepted for call-site stability but intentionally not rendered.
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <h2 className="min-w-0 truncate text-[20px] font-black tracking-[-0.02em] text-foreground hover:underline lg:text-[24px]">
        {title}
      </h2>
      {action && (
        <button
          onClick={onAction}
          className="no-drag shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
        </button>
      )}
    </div>
  );
}

/** "Now playing" indicator — a small, static three-bar glyph at fixed varied
 *  heights. It reads instantly as "playing" without pretending to be a live
 *  spectrum analyser (a fake looping equaliser that ignores the real audio is a
 *  cheap-template tell). `active` simply dims it when paused. */
export function EqualizerBars({ active = true, className }: { active?: boolean; className?: string }) {
  const heights = [52, 100, 72, 40];
  return (
    <div className={cn("flex items-end gap-[2px] h-3.5", className, !active && "opacity-40")} aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-primary/85"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
