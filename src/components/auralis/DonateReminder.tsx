"use client";

import { useEffect, useState } from "react";
import { Heart, X, ExternalLink } from "lucide-react";
import { DONATE_URL } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

// localStorage flag so the support reminder is shown EXACTLY ONCE per device,
// whether the user donates, defers or dismisses it. Bump the suffix to re-prompt
// an existing install (kept stable so updates don't nag returning users).
const REMINDED_KEY = "auralis.support.reminded.v1";

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

/** One-time, non-intrusive support reminder. Mounts once in the app shell; shows
 *  a gentle modal a few seconds after the app settles, then never again. */
export function DonateReminder() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let shown = true;
    try {
      shown = window.localStorage.getItem(REMINDED_KEY) === "1";
    } catch {
      // Private mode / storage blocked: skip the reminder rather than nag every load.
      shown = true;
    }
    if (shown) return;

    // Let the first listening session breathe before asking for anything.
    const timer = window.setTimeout(() => setOpen(true), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(REMINDED_KEY, "1");
    } catch {
      /* storage unavailable — the in-memory close already hides it for this session */
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Soutenir Auralis"
    >
      <div className="backdrop-in absolute inset-0 bg-black/65" onClick={dismiss} />
      <div className="scale-in matte-panel relative m-3 w-full max-w-[420px] overflow-hidden rounded-[16px]">
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="absolute right-3 top-3 grid size-7 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        <div className="px-6 pb-6 pt-7 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-[14px] bg-primary/15 text-primary-soft">
            <Heart className="size-6" />
          </span>
          <h2 className="text-[19px] font-black leading-tight text-foreground">
            Auralis est gratuit et open-source
          </h2>
          <p className="mx-auto mt-2 max-w-[320px] text-[13px] leading-relaxed text-muted-foreground">
            Pas de pub, pas de pistage, pas d&apos;abonnement. Si Auralis embellit
            votre écoute, un petit don aide à le maintenir et à le faire grandir.
            Ce rappel n&apos;apparaît qu&apos;une seule fois.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={() => {
                openDonate();
                dismiss();
              }}
              className="tap-press inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-primary text-[14px] font-black text-[var(--paper)] transition-transform hover:brightness-110"
            >
              <Heart className="size-4" />
              Faire un don
              <ExternalLink className="size-3.5 opacity-70" />
            </button>
            <button
              onClick={dismiss}
              className="tap-press inline-flex h-10 items-center justify-center rounded-[12px] text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              Peut-être plus tard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
