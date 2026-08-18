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
  // Apple Music shelf header: a big bold title (no hover underline) on the left and
  // an accent-red "Tout afficher" link on the right. Apple Music renders "See All"
  // in the accent colour, not as a muted uppercase label.
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <h2 className="min-w-0 truncate am-title3 lg:am-title2 text-foreground">
        {title}
      </h2>
      {action && (
        <button
          onClick={onAction}
          className="no-drag shrink-0 am-footnote text-[var(--primary)] transition-opacity hover:opacity-70"
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
