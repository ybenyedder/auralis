"use client";

import type { ComponentType, ReactNode } from "react";

/** Shared empty state — one consistent look for "nothing here yet" across every
 *  view (replaces the ad-hoc EmptyHint / one-off centered text blocks). */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && (
        <div className="grid size-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
          <Icon className="size-7 text-muted-foreground/60" />
        </div>
      )}
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {hint && <p className="max-w-[340px] text-[13px] text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}
