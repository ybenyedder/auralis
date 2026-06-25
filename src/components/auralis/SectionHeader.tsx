"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  action?: string;
  onAction?: () => void;
  className?: string;
  icon?: React.ReactNode;
}

export function SectionHeader({ title, eyebrow, action, onAction, className, icon }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/65">{eyebrow}</p>
        )}
        <h2 className="flex min-w-0 items-center gap-2 text-[19px] font-bold tracking-[-0.01em] text-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="no-drag inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12.5px] font-semibold text-primary-soft transition-all duration-200 hover:bg-white/[0.04] hover:scale-105"
        >
          {action} <ChevronRight className="size-3.5" />
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
