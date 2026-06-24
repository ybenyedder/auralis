"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player";
import { CheckCircle2, X } from "lucide-react";

export function ToastHost() {
  const { toast, dismissToast } = usePlayer();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 2600);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(var(--tabbar-h)+var(--miniplayer-h)+var(--safe-bottom)+12px)] left-1/2 z-[80] -translate-x-1/2 lg:bottom-[92px]"
    >
      <div className="toast-in matte-panel pointer-events-auto flex items-center gap-3 rounded-[13px] px-4 py-2.5">
        <span className="grid size-5 place-items-center rounded-[9px] bg-emerald/15 text-emerald">
          <CheckCircle2 className="size-3.5" />
        </span>
        <p className="max-w-xs truncate text-[12.5px] font-semibold text-foreground">
          {toast.message}
        </p>
        <button
          onClick={dismissToast}
          aria-label="Dismiss"
          className="grid size-5 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  );
}
