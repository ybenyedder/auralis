"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/store/player";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { Keyboard, X } from "lucide-react";

interface ShortcutGroup {
  label: string;
  items: { keys: string[]; desc: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: "Lecture",
    items: [
      { keys: ["Espace"], desc: "Lecture / pause" },
      { keys: ["←", "→"], desc: "Reculer / avancer de 5 s" },
      { keys: ["Maj", "←"], desc: "Titre précédent" },
      { keys: ["Maj", "→"], desc: "Titre suivant" },
      { keys: ["↑", "↓"], desc: "Volume + / −" },
      { keys: ["M"], desc: "Couper / rétablir le son" },
      { keys: ["L"], desc: "Ajouter / retirer des favoris" },
      { keys: ["S"], desc: "Lecture aléatoire" },
      { keys: ["R"], desc: "Répétition (off → tout → un)" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { keys: ["Ctrl", "K"], desc: "Ouvrir la palette de commandes" },
      { keys: ["/"], desc: "Ouvrir la palette de commandes" },
      { keys: ["F"], desc: "Ouvrir / fermer le lecteur plein écran" },
      { keys: ["Q"], desc: "Ouvrir / fermer la file d'attente" },
      { keys: ["V"], desc: "Ouvrir / fermer le visualiseur" },
      { keys: ["Échap"], desc: "Fermer l'overlay ou le plein écran" },
      { keys: ["?"], desc: "Afficher cette aide" },
    ],
  },
];

export function KeyboardHelp() {
  const helpOpen = usePlayer((s) => s.helpOpen);
  const setHelpOpen = usePlayer((s) => s.setHelpOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(helpOpen, dialogRef);

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
    <div className="fixed inset-0 z-[78] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Raccourcis clavier">
      <div className="backdrop-in absolute inset-0 bg-black/70" onClick={() => setHelpOpen(false)} />
      <div ref={dialogRef} className="scale-in matte-panel relative w-full max-w-[520px] overflow-hidden rounded-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-sm bg-primary/15 text-primary-soft">
              <Keyboard className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-black leading-tight text-foreground">Raccourcis clavier</p>
            </div>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label="Fermer"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/[0.04] hover:text-foreground hover:scale-105"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/80">{g.label}</p>
              <div className="space-y-1.5">
                {g.items.map((it) => (
                  <div key={it.desc} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-foreground/85">{it.desc}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[20px] rounded-full bg-white/5 px-2 py-0.5 text-center text-[10px] font-bold text-foreground/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border border-transparent"
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
          <kbd className="rounded-full bg-white/5 px-2 py-0.5 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">Esc</kbd>
        </div>
      </div>
    </div>
  );
}
