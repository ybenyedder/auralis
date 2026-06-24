"use client";

import { Heart } from "lucide-react";
import { DONATE_URL } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

/** Opens the PayPal donation page. Uses a real navigation so it works in the
 *  browser, the Electron shell and the Android WebView alike. */
export function openDonate() {
  if (typeof window === "undefined") return;
  window.open(DONATE_URL, "_blank", "noopener,noreferrer");
}

/** A reusable "Soutenir" button. `variant` adapts it to a settings card row or a
 *  standalone pill. */
export function DonateButton({
  className,
  label = "Soutenir Auralis",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      onClick={openDonate}
      className={cn(
        "tap-press inline-flex items-center gap-2 rounded-[11px] border border-primary/25 bg-primary/12 px-3.5 py-2 text-[13px] font-bold text-primary-soft transition-colors hover:bg-primary/20",
        className,
      )}
    >
      <Heart className="size-4" />
      {label}
    </button>
  );
}
