"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, X } from "lucide-react";
import { DONATE_URL } from "@/lib/auralis/brand";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
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
        "tap-press inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-4 py-2 text-[13px] font-bold text-primary-soft shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all duration-200 hover:bg-primary/20 hover:scale-105",
        className,
      )}
    >
      <Heart className="size-4" />
      {label}
    </button>
  );
}

const LAUNCH_KEY = "auralis.launchCount";
// Counts every app/site launch exactly once per page load. A module-level guard
// keeps React StrictMode's double-invoked effect from counting twice.
let launchCounted = false;

/** Reads + increments the launch counter and decides whether the reminder is due
 *  on THIS launch: the very first launch, then again every 3 launches after it
 *  (launches 1, 4, 7, 10, …). Returns null when the counter is unavailable. */
function isReminderDue(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const count = (Number.parseInt(window.localStorage.getItem(LAUNCH_KEY) || "0", 10) || 0) + 1;
    window.localStorage.setItem(LAUNCH_KEY, String(count));
    return count === 1 || (count - 1) % 3 === 0;
  } catch {
    return false;
  }
}

/** A dismissible donation reminder shown on the first launch and then every 3rd
 *  launch thereafter. Mounted once in the app shell; it self-manages its trigger. */
export function DonateModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);

  useEffect(() => {
    // Runs after hydration (so the initial client render matches the SSR markup,
    // which is empty), then opens the modal when this launch is due.
    if (launchCounted) return;
    launchCounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-mount reveal
    if (isReminderDue()) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Soutenir Auralis">
      <div className="backdrop-in absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
      <div ref={dialogRef} className="scale-in matte-panel relative w-full max-w-[400px] overflow-hidden rounded-sm">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary/15 text-primary-soft">
            <Heart className="size-5" />
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-white/[0.04] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-3">
          <p className="text-[16px] font-black leading-tight text-foreground">Soutenir Auralis</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {"Auralis est gratuit, sans publicité et sans pistage. Si l'app te plaît, un petit don aide à couvrir les coûts et à faire avancer le projet."}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="tap-press rounded-full px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-white/[0.04] hover:text-foreground"
            >
              Plus tard
            </button>
            <button
              onClick={() => {
                openDonate();
                setOpen(false);
              }}
              className="tap-press inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-4 py-2 text-[13px] font-bold text-primary-soft transition-colors duration-200 hover:bg-primary/20"
            >
              <Heart className="size-4" />
              Faire un don
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
