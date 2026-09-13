"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/store/player";
import { useT } from "@/lib/auralis/i18n";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { Keyboard, X } from "lucide-react";

interface ShortcutGroup {
  key: string;
  fallback: string;
  items: { keys: string[]; descKey: string; descFallback: string }[];
}

// Keycap labels that are French words (unlike symbol/modifier glyphs) — mapped to
// catalogue keys so the caps follow the locale too. Anything not listed renders as-is.
const KEYCAP_KEYS: Record<string, [string, string]> = {
  "Espace": ["help.keySpace", "Espace"],
  "Maj": ["help.keyShift", "Maj"],
  "Échap": ["help.keyEscape", "Échap"],
};

const GROUPS: ShortcutGroup[] = [
  {
    key: "help.groupPlayback",
    fallback: "Lecture",
    items: [
      { keys: ["Espace"], descKey: "help.playPause", descFallback: "Lecture / pause" },
      { keys: ["←", "→"], descKey: "help.seek", descFallback: "Reculer / avancer de 5 s" },
      { keys: ["Maj", "←"], descKey: "mobile.previous", descFallback: "Titre précédent" },
      { keys: ["Maj", "→"], descKey: "mobile.next", descFallback: "Titre suivant" },
      { keys: ["↑", "↓"], descKey: "help.volumeArrows", descFallback: "Flèches (sur un contrôle) : volume · sinon défilement" },
      { keys: ["M"], descKey: "help.mute", descFallback: "Couper / rétablir le son" },
      { keys: ["L"], descKey: "help.toggleFavorite", descFallback: "Ajouter / retirer des favoris" },
      { keys: ["S"], descKey: "player.shuffle", descFallback: "Lecture aléatoire" },
      { keys: ["R"], descKey: "help.repeat", descFallback: "Répétition (off → tout → un)" },
    ],
  },
  {
    key: "help.groupNavigation",
    fallback: "Navigation",
    items: [
      { keys: ["Ctrl", "K"], descKey: "help.openPalette", descFallback: "Ouvrir la palette de commandes" },
      { keys: ["/"], descKey: "help.openPalette", descFallback: "Ouvrir la palette de commandes" },
      { keys: ["F"], descKey: "help.fullscreen", descFallback: "Ouvrir / fermer le lecteur plein écran" },
      { keys: ["Q"], descKey: "help.queue", descFallback: "Ouvrir / fermer la file d'attente" },
      { keys: ["V"], descKey: "help.visualizer", descFallback: "Ouvrir / fermer le visualiseur" },
      { keys: ["Échap"], descKey: "help.escape", descFallback: "Fermer l'overlay ou le plein écran" },
      { keys: ["?"], descKey: "help.showHelp", descFallback: "Afficher cette aide" },
    ],
  },
];

export function KeyboardHelp() {
  const t = useT();
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
    <div className="fixed inset-0 z-[78] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t("help.title", "Raccourcis clavier")}>
      <div className="backdrop-in absolute inset-0 bg-black/70" onClick={() => setHelpOpen(false)} />
      <div ref={dialogRef} className="scale-in matte-panel relative w-full max-w-[520px] overflow-hidden rounded-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-sm bg-primary/15 text-primary-soft">
              <Keyboard className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-bold leading-tight text-foreground">{t("help.title", "Raccourcis clavier")}</p>
            </div>
          </div>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label={t("player.close", "Fermer")}
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {GROUPS.map((g) => {
            const label = t(g.key, g.fallback);
            return (
            <div key={label}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/80">{label}</p>
              <div className="space-y-1.5">
                {g.items.map((it) => {
                  const desc = t(it.descKey, it.descFallback);
                  return (
                  <div key={desc} className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-foreground/85">{desc}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {it.keys.map((k) => {
                        const cap = KEYCAP_KEYS[k];
                        return (
                        <kbd
                          key={k}
                          className="min-w-[20px] rounded-full bg-[var(--panel-2)] px-2 py-0.5 text-center text-[10px] font-bold text-foreground/90 border border-transparent"
                        >
                          {cap ? t(cap[0], cap[1]) : k}
                        </kbd>
                        );
                      })}
                    </span>
                  </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--line)] px-5 py-2.5 text-center text-[10.5px] text-muted-foreground/70">
          <kbd className="rounded-full bg-[var(--panel-2)] px-2 py-0.5 font-bold">Esc</kbd> {t("help.escClose", "pour fermer")}
        </div>
      </div>
    </div>
  );
}
