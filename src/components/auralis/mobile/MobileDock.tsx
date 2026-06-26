"use client";

import { Home, Search, Library, Heart, Play, Pause } from "lucide-react";
import { usePlayer, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "../Artwork";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

interface Tab {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string; fill?: string }>;
  owns: ViewId[];
}

// Spotify mobile app has 3 main tabs: Home, Search, Your Library
const TABS: Tab[] = [
  { id: "home", label: "Accueil", icon: Home, owns: ["home"] },
  { id: "explore", label: "Recherche", icon: Search, owns: ["explore"] },
  { id: "library", label: "Bibliothèque", icon: Library, owns: ["library", "album", "artist", "playlist", "folders", "recents", "insights", "settings", "favorites"] },
];

export function MobileDock() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center justify-end md:hidden pointer-events-none">
      <div className="w-full px-2 pb-2 pointer-events-auto">
        <MiniPlayer />
      </div>
      <div className="w-full bg-[var(--sidebar)] pointer-events-auto pb-[env(safe-area-inset-bottom)]">
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

  if (!currentTrack) return null;

  return (
    <div 
      className="relative flex flex-col overflow-hidden rounded-md bg-[var(--panel-2)] shadow-md"
    >
      <div className="flex h-14 items-center gap-2 px-2 py-1">
        <button
          onClick={openFullscreen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Ouvrir le lecteur"
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
            <span className="block truncate text-[13px] font-bold leading-tight text-white">
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
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            className="tap-press grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Heart className={cn("size-5", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")} />
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-white transition-transform active:scale-90"
          >
            {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current ml-0.5" />}
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

  return (
    <nav aria-label="Navigation principale" className="flex h-[64px] items-stretch justify-around px-2 bg-[var(--sidebar)]">
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
                active ? "text-white" : "text-[var(--text-muted)]",
              )}
              fill={active ? "currentColor" : "none"}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none transition-colors",
                active ? "text-white" : "text-[var(--text-muted)]",
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
