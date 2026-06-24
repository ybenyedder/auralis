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
          <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted-foreground/55">{eyebrow}</p>
        )}
        <h2 className="flex min-w-0 items-center gap-2 text-[19px] font-bold tracking-[-0.01em] text-foreground">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="no-drag inline-flex shrink-0 items-center gap-0.5 rounded-[10px] px-2 py-1 text-[12.5px] font-semibold text-primary-soft transition-colors hover:bg-white/[0.06]"
        >
          {action} <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function EqualizerBars({ active = true, className }: { active?: boolean; className?: string }) {
  const bars = [0, 1, 2, 3];
  return (
    <div className={cn("flex items-end gap-[2px] h-3.5", className)} aria-hidden="true">
      {bars.map((i) => (
        <span
          key={i}
          className={cn("w-[2px] rounded-[1px] bg-foreground/60", active ? "eq-bar" : "opacity-30")}
          style={{
            height: "100%",
            animationDelay: `${i * 0.18}s`,
            animationDuration: `${0.7 + (i % 2) * 0.25}s`,
          }}
        />
      ))}
    </div>
  );
}
