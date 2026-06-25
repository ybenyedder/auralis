"use client";

import { useEffect, useRef, useState } from "react";
import { Home, Search, Library, Heart, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { usePlayer, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "../Artwork";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

interface Tab {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Views that should keep this tab lit (detail pages reached from it). */
  owns: ViewId[];
}

// Four thumb-reachable destinations. Everything secondary (Recents, Folders,
// Insights, Settings) lives inside the Library hub or the header — not the bar.
const TABS: Tab[] = [
  { id: "home", label: "Accueil", icon: Home, owns: ["home"] },
  { id: "explore", label: "Recherche", icon: Search, owns: ["explore"] },
  { id: "library", label: "Bibliothèque", icon: Library, owns: ["library", "album", "artist", "playlist", "folders", "recents", "insights", "settings"] },
  { id: "favorites", label: "Favoris", icon: Heart, owns: ["favorites"] },
];

/**
 * The mobile bottom dock: a mini-player stacked over a four-tab bar, pinned to
 * the bottom of the viewport and padded for the home-indicator safe area.
 * Desktop renders its own PlayerBar/Sidebar instead — this is `lg:hidden`.
 */
export function MobileDock() {
  return (
    <div className="glass-chrome mobile-bar keyline-top safe-bottom fixed inset-x-0 bottom-0 z-40 md:hidden">
      <MiniPlayer />
      <TabBar />
    </div>
  );
}

function MiniPlayer() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const playPrev = usePlayer((s) => s.playPrev);
  const openFullscreen = usePlayer((s) => s.toggleFullscreenPlayer);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const fav = usePlayer((s) => (currentTrack ? s.favorites.has(currentTrack.trackhash) : false));
  const [pop, setPop] = useState(false);
  // Fire the heart-pop on the actual false→true favourite transition (any surface),
  // not on the tap — so a rapid double-tap that ends unfavourited never animates an
  // empty heart, and favouriting from elsewhere still pops here. Gated on the SAME
  // trackhash so skipping into an already-liked track (where `fav` flips true purely
  // from the track change) does NOT spuriously animate.
  const prevFav = useRef({ hash: currentTrack?.trackhash, fav });
  useEffect(() => {
    const hash = currentTrack?.trackhash;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fav && !prevFav.current.fav && prevFav.current.hash === hash) setPop(true);
    prevFav.current = { hash, fav };
  }, [fav, currentTrack?.trackhash]);

  if (!currentTrack) return null;

  return (
    <div className="relative h-[60px] border-b border-[var(--line)]">
      <MiniProgress />
      <div className="flex h-full items-center gap-3 px-3">
        <button
          onClick={openFullscreen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Ouvrir le lecteur"
        >
          <Artwork
            title={currentTrack.title}
            trackhash={currentTrack.trackhash}
            size={42}
            rounded={11}
            colors={currentTrack.color}
            image={currentTrack.image}
          />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold leading-tight text-foreground">
              {trackTitle(currentTrack)}
            </span>
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground/75">
              {trackArtist(currentTrack)}
            </span>
          </span>
        </button>

        <button
          onClick={() => toggleFavorite(currentTrack.trackhash)}
          aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
          className={cn("tap-press grid h-11 w-10 shrink-0 place-items-center rounded-full", fav ? "text-primary" : "text-muted-foreground/65")}
        >
          <Heart className={cn("size-[22px]", fav && "fill-primary", pop && "heart-pop")} onAnimationEnd={() => setPop(false)} />
        </button>
        <button
          onClick={playPrev}
          aria-label="Précédent"
          className="tap-press grid h-11 w-9 shrink-0 place-items-center rounded-full text-foreground/80"
        >
          <SkipBack className="size-5 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Lecture"}
          className="tap-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground"
        >
          {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current ml-0.5" />}
        </button>
        <button
          onClick={playNext}
          aria-label="Suivant"
          className="tap-press grid h-11 w-9 shrink-0 place-items-center rounded-full text-foreground/80"
        >
          <SkipForward className="size-5 fill-current" />
        </button>
      </div>
    </div>
  );
}

/** Hairline progress along the very top edge of the mini-player. Isolated so it
 * is the only thing re-rendering on each playback tick. */
function MiniProgress() {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const trackhash = usePlayer((s) => s.currentTrack?.trackhash);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div className="absolute inset-x-0 top-0 h-[2px] bg-white/[0.07]">
      {/* Keyed on the track so a song change remounts the bar instead of sweeping
          from the previous position; the short linear ease just smooths the ~4 Hz
          playback ticks (it no longer lags on seek/track-change). */}
      <div key={trackhash} className="h-full bg-primary transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TabBar() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);

  return (
    <nav aria-label="Navigation principale" className="flex h-[56px] items-stretch">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.owns.includes(view.view);
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.id)}
            aria-current={active ? "page" : undefined}
            className="tap-press relative flex flex-1 flex-col items-center justify-center gap-1"
          >
            <Icon
              className={cn(
                "size-[22px] transition-colors",
                active ? "text-primary" : "text-muted-foreground/55",
              )}
            />
            <span
              className={cn(
                "text-[10.5px] font-medium leading-none transition-colors",
                active ? "text-foreground" : "text-muted-foreground/55",
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
