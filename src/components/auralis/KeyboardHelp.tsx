"use client";

import { useEffect } from "react";
import { usePlayer } from "@/store/player";
import { Keyboard, X } from "lucide-react";

interface ShortcutGroup {
  label: string;
  items: { keys: string[]; desc: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: "Playback",
    items: [
      { keys: ["Space"], desc: "Play / pause" },
      { keys: ["←", "→"], desc: "Seek −5s / +5s" },
      { keys: ["Shift", "←"], desc: "Previous track" },
      { keys: ["Shift", "→"], desc: "Next track" },
      { keys: ["↑", "↓"], desc: "Volume up / down" },
      { keys: ["M"], desc: "Mute / unmute" },
      { keys: ["S"], desc: "Toggle shuffle" },
      { keys: ["R"], desc: "Cycle repeat (off → all → one)" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { keys: ["⌘", "K"], desc: "Open command palette" },
      { keys: ["/"], desc: "Open command palette" },
      { keys: ["F"], desc: "Open / close fullscreen player" },
      { keys: ["V"], desc: "Open / close Auralis Scope visualizer" },
      { keys: ["Esc"], desc: "Close overlay or fullscreen" },
      { keys: ["?"], desc: "Show this help" },
    ],
  },
];

export function KeyboardHelp() {
  const { helpOpen, setHelpOpen } = usePlayer();

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen, setHelpOpen]);

  if (!helpOpen) return null;

  return (
    <div className="fixed inset-0 z-[78] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="backdrop-in absolute inset-0 bg-black/70" onClick={() => setHelpOpen(false)} />
      <div className="scale-in matte-panel relative w-full max-w-[520px] overflow-hidden rounded-[8px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-[9px] bg-primary/15 text-primary-soft">
              <Keyboard className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-black leading-tight text-foreground">Keyboard shortcuts</p>
            </div>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">{g.label}</p>
              <div className="space-y-1.5">
                {g.items.map((it) => (
                  <div key={it.desc} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-foreground/85">{it.desc}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[20px] rounded-[9px] border border-[var(--line)] bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] font-bold text-foreground/90"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--line)] px-5 py-2.5 text-center text-[10.5px] text-muted-foreground/70">
          <kbd className="rounded-[9px] border border-[var(--line)] bg-white/[0.05] px-1 font-bold">Esc</kbd>
        </div>
      </div>
    </div>
  );
}
