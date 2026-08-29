"use client";

import { ChevronLeft, Settings, Flame } from "lucide-react";
import { usePlayer, type ViewId } from "@/store/player";
import { useStats } from "@/store/stats";
import { useT } from "@/lib/auralis/i18n";
import { BrandMark } from "../BrandMark";

// The mobile ROOT tabs — every dock tab is a root screen and shows the wordmark;
// only true SECONDARY screens (album / artist / playlist / favorites / réglages…)
// get a back arrow + a category label. The old list omitted Radio and Rechercher,
// so those dock tabs showed a back button as if they were pushed detail views.
const ROOT_TABS: ViewId[] = ["home", "explore", "radio", "library", "search"];

// Compact category label shown on detail / secondary screens. Root tabs show the
// wordmark instead, because each root view renders its own large title.
const VIEW_LABEL: Partial<Record<ViewId, { key: string; fallback: string }>> = {
  album: { key: "mobile.album", fallback: "Album" },
  artist: { key: "mobile.artist", fallback: "Artiste" },
  playlist: { key: "mobile.playlist", fallback: "Playlist" },
  favorites: { key: "mobile.favorites", fallback: "Favoris" },
  recents: { key: "mobile.history", fallback: "Historique" },
  folders: { key: "mobile.folders", fallback: "Dossiers" },
  insights: { key: "mobile.analysis", fallback: "Analyse" },
  settings: { key: "mobile.settings", fallback: "Réglages" },
};

/**
 * The mobile top bar (`md:hidden`). A single quiet row: a back affordance on
 * secondary screens, the wordmark on the five root tabs, plus the listening
 * streak and Settings entries. Search lives in the DOCK as its own root tab —
 * the old header search button navigated to "Parcourir" even while the user
 * was already on "Rechercher", deepening the where-am-I confusion.
 */
export function MobileHeader() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);
  const back = usePlayer((s) => s.back);
  const streak = useStats((s) => s.streak);
  const t = useT();

  const isRoot = ROOT_TABS.includes(view.view);
  const labelEntry = VIEW_LABEL[view.view];

  return (
    <header className="mobile-bar safe-top safe-px z-30 flex shrink-0 items-center gap-1 border-b border-[var(--line)] px-2 md:hidden">
      <div className="flex h-14 items-center gap-1">
        {isRoot ? (
          <span className="flex items-center gap-2 pl-2">
            <BrandMark />
            <span className="text-[15px] font-bold tracking-tight text-foreground">Auralis</span>
          </span>
        ) : (
          <>
            <button
              onClick={back}
              aria-label={t("mobile.back", "Retour")}
              className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground"
            >
              <ChevronLeft className="size-6" />
            </button>
            {labelEntry && (
              <span className="min-w-0 truncate text-[15px] font-bold tracking-tight text-foreground">
                {t(labelEntry.key, labelEntry.fallback)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="ml-auto flex h-14 items-center gap-0.5">
        {streak > 0 && (
          <button
            onClick={() => navigate("insights")}
            aria-label={`${t("mobile.streak", "Série d'écoute")} : ${streak} ${streak === 1 ? t("mobile.day", "jour") : t("mobile.days", "jours")}`}
            className="tap-press mr-0.5 flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1.5 text-[12px] font-semibold text-primary-soft"
          >
            <Flame className="size-3.5" /> {streak}
          </button>
        )}
        <button
          onClick={() => navigate("settings")}
          aria-label={t("mobile.settings", "Réglages")}
          className="tap-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground/80"
        >
          <Settings className="size-[21px]" />
        </button>
      </div>
    </header>
  );
}
