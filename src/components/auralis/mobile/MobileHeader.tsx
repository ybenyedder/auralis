"use client";

import { ChevronLeft, Search, Settings, Flame } from "lucide-react";
import { usePlayer, type ViewId } from "@/store/player";
import { useStats } from "@/store/stats";
import { BrandMark } from "../BrandMark";

// The three real mobile root tabs (the bottom dock). Everything else — including
// Favoris — is a secondary screen reached from within them, so it gets a back arrow
// and a category title rather than the wordmark.
const ROOT_TABS: ViewId[] = ["home", "explore", "library"];

// Compact category label shown on detail / secondary screens. Root tabs show the
// wordmark instead, because each root view renders its own large title.
const VIEW_LABEL: Partial<Record<ViewId, string>> = {
  album: "Album",
  artist: "Artiste",
  playlist: "Playlist",
  favorites: "Favoris",
  recents: "Historique",
  folders: "Dossiers",
  insights: "Analyse",
  settings: "Réglages",
};

/**
 * The mobile top bar (`lg:hidden`). A single quiet row: a back affordance on
 * detail screens, the wordmark on root tabs, and Search / Settings entries that
 * have no place in the four-tab bottom bar. The desktop layout uses TitleBar
 * and the scroll-reveal StickyViewHeader instead.
 */
export function MobileHeader() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);
  const back = usePlayer((s) => s.back);
  const streak = useStats((s) => s.streak);

  const isRoot = ROOT_TABS.includes(view.view);
  const label = VIEW_LABEL[view.view];

  return (
    <header className="mobile-bar safe-top safe-px z-30 flex shrink-0 items-center gap-1 border-b border-[var(--line)] px-2 md:hidden">
      <div className="flex h-14 items-center gap-1">
        {isRoot ? (
          <span className="flex items-center gap-2 pl-2">
            <BrandMark />
            <span className="text-[15px] font-bold tracking-tight text-foreground">Auralis</span>
          </span>
        ) : (
          <button
            onClick={back}
            aria-label="Retour"
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
      </div>

      {label && (
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-foreground">
          {label}
        </span>
      )}

      <div className="ml-auto flex h-14 items-center gap-0.5">
        {streak > 0 && (
          <button
            onClick={() => navigate("insights")}
            aria-label={`Série d'écoute : ${streak} jours`}
            className="tap-press mr-0.5 flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1.5 text-[12px] font-semibold text-primary-soft"
          >
            <Flame className="size-3.5" /> {streak}
          </button>
        )}
        {view.view !== "explore" && (
          <button
            onClick={() => navigate("explore")}
            aria-label="Rechercher"
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground/80"
          >
            <Search className="size-[21px]" />
          </button>
        )}
        <button
          onClick={() => navigate("settings")}
          aria-label="Réglages"
          className="tap-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground/80"
        >
          <Settings className="size-[21px]" />
        </button>
      </div>
    </header>
  );
}
