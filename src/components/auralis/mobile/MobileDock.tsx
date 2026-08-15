"use client";

import { Home, Search, Library, Heart, Play, Pause } from "lucide-react";
import { usePlayer, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "../Artwork";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";
import { useT } from "@/lib/auralis/i18n";
import { cn } from "@/lib/utils";

interface Tab {
  id: ViewId;
  labelKey: string;
  labelFallback: string;
  icon: React.ComponentType<{ className?: string; fill?: string }>;
  owns: ViewId[];
}

// Spotify mobile app has 3 main tabs: Home, Search, Your Library
const TABS: Tab[] = [
  { id: "home", labelKey: "mobile.home", labelFallback: "Accueil", icon: Home, owns: ["home"] },
  { id: "explore", labelKey: "mobile.search", labelFallback: "Recherche", icon: Search, owns: ["explore"] },
  { id: "library", labelKey: "mobile.library", labelFallback: "Bibliothèque", icon: Library, owns: ["library", "album", "artist", "playlist", "folders", "recents", "insights", "settings", "favorites"] },
];

export function MobileDock() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center justify-end md:hidden pointer-events-none">
      <div className="w-full px-2 pb-2 pointer-events-auto">
        <MiniPlayer />
      </div>
      <div className="w-full pointer-events-auto pb-[env(safe-area-inset-bottom)] glass">
        <TabBar />
      </div>
    </div>
  );
}

function MiniPlayer() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const openFullscreen = usePlayer((s) => s.toggleFullscreenPlayer);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const fav = usePlayer((s) => (currentTrack ? s.favorites.has(currentTrack.trackhash) : false));
  const t = useT();

  if (!currentTrack) return null;

  return (
    <div 
      className="relative flex flex-col overflow-hidden rounded-md matte-panel-2 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
    >
      <div className="flex h-14 items-center gap-2 px-2 py-1">
        <button
          onClick={openFullscreen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={t("mobile.openPlayer", "Ouvrir le lecteur")}
        >
          <Artwork
            title={currentTrack.title}
            trackhash={currentTrack.trackhash}
            size={40}
            rounded={4}
            colors={currentTrack.color}
            image={currentTrack.image}
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
              {trackTitle(currentTrack)}
            </span>
            <span className="block truncate text-[12px] font-medium leading-tight text-[var(--text-muted)]">
              {trackArtist(currentTrack)}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1 pr-1">
          <button
            onClick={() => toggleFavorite(currentTrack.trackhash)}
            aria-label={fav ? t("mobile.removeFavorite", "Retirer des favoris") : t("mobile.addFavorite", "Ajouter aux favoris")}
            className="tap-press grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Heart className={cn("size-5", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")} />
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? t("mobile.pause", "Pause") : t("mobile.play", "Lecture")}
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <MiniProgress />
    </div>
  );
}

function MiniProgress() {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const trackhash = usePlayer((s) => s.currentTrack?.trackhash);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div className="h-[2px] w-full bg-white/20">
      <div key={trackhash} className="h-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TabBar() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);
  const t = useT();

  return (
    <nav aria-label={t("mobile.mainNav", "Navigation principale")} className="flex h-[64px] items-stretch justify-around px-2">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.owns.includes(view.view);
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            aria-current={active ? "page" : undefined}
            className="tap-press relative flex w-16 flex-col items-center justify-center gap-1"
          >
            <Icon
              className={cn(
                "size-6 transition-colors",
                active ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
              )}
              fill={active ? "currentColor" : "none"}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none transition-colors",
                active ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
              )}
            >
              {t(tab.labelKey, tab.labelFallback)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
