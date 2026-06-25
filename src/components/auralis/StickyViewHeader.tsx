"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { usePlayer } from "@/store/player";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEW_TITLES: Record<string, string> = {
  home: "Accueil",
  explore: "Recherche",
  library: "Bibliothèque",
  favorites: "Favoris",
  recents: "Historique",
  folders: "Dossiers",
  insights: "Analyse",
  settings: "Réglages",
  album: "Album",
  artist: "Artiste",
  playlist: "Playlist",
};

export function StickyViewHeader({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const view = usePlayer((s) => s.view);
  const navHistory = usePlayer((s) => s.navHistory);
  const back = usePlayer((s) => s.back);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 80);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, view]);

  const title = VIEW_TITLES[view.view] ?? "Auralis";
  const canBack = navHistory.length > 0;

  return (
    <div
      className={cn(
        "pointer-events-none sticky top-0 z-20 flex h-12 items-center gap-2 px-4 transition-all duration-300",
        scrolled ? "opacity-100" : "opacity-0",
      )}
      style={{
        background: scrolled ? "var(--panel)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
      }}
    >
      <div className={cn("pointer-events-auto flex items-center gap-1", !canBack && "opacity-40")}>
        <button
          onClick={back}
          disabled={!canBack}
          aria-label="Retour"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/[0.04] hover:text-white hover:scale-105 disabled:cursor-default"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
      <p className="pointer-events-auto truncate text-[13px] font-black tracking-tight text-foreground">{title}</p>
    </div>
  );
}
