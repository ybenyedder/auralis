"use client";

import { usePlayer } from "@/store/player";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastHost() {
  // Atomic selectors: this host is always mounted, so a whole-store subscription
  // re-rendered it on every state change. It only needs the toast + its dismisser.
  // (Auto-dismiss is scheduled by notify() in the store — a single source of truth
  // that also extends the window when the toast carries an action.)
  const toast = usePlayer((s) => s.toast);
  const dismissToast = usePlayer((s) => s.dismissToast);

  if (!toast) return null;

  const action = toast.action;
  const tone = toast.tone;
  const Icon = tone === "error" ? AlertTriangle : tone === "info" ? Info : CheckCircle2;
  const iconClass =
    tone === "error"
      ? "text-destructive"
      : tone === "info"
        ? "text-foreground"
        : "text-emerald";

  return (
    <div
      role="status"
      // Errors interrupt; success/info wait their turn for screen readers.
      aria-live={tone === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed bottom-[calc(var(--tabbar-h)+var(--miniplayer-h)+var(--safe-bottom)+12px)] left-1/2 z-[80] -translate-x-1/2 lg:bottom-[92px]"
    >
      <div className="toast-in matte-panel pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5">
        <span className={cn("grid size-5 shrink-0 place-items-center", iconClass)}>
          <Icon className="size-3.5" />
        </span>
        <p className="max-w-sm line-clamp-2 text-[12.5px] font-semibold text-foreground">
          {toast.message}
        </p>
        {action && (
          <button
            onClick={() => { action.run(); dismissToast(); }}
            className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white transition-colors duration-200 hover:bg-white/20"
          >
            {action.label}
          </button>
        )}
        <button
          onClick={dismissToast}
          aria-label="Fermer"
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--panel-3)] hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
