"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ChevronDown,
  Mic2,
  ListMusic,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { shareTrack } from "@/lib/auralis/share";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "./Artwork";
import { ConnectButton } from "./ConnectButton";
import { LyricsView } from "./LyricsView";
import { QueueList } from "./QueueList";
import { formatDuration, paletteForName, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

export function FullscreenPlayer() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const repeat = usePlayer((s) => s.repeat);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const playPrev = usePlayer((s) => s.playPrev);
  const seek = usePlayer((s) => s.seek);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  // Atomic reactive favorite read (subscribed to the set), valid before the early
  // return below. The old stable isFavorite fn ref never re-rendered on un-favorite.
  const fav = usePlayer((s) => (currentTrack ? s.favorites.has(currentTrack.trackhash) : false));
  const closeFullscreenPlayer = usePlayer((s) => s.closeFullscreenPlayer);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  const notify = usePlayer((s) => s.notify);

  const [favPop, setFavPop] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, rootRef);

  useEffect(() => {
    if (!currentTrack) closeFullscreenPlayer();
  }, [currentTrack, closeFullscreenPlayer]);

  if (!currentTrack) return null;

  const colors = currentTrack.color ?? paletteForName(currentTrack.trackhash);
  const onFav = () => { if (!fav) setFavPop(true); toggleFavorite(currentTrack.trackhash); };

  const openMore = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.left, rect.top - 8, currentTrack);
  };

  const onDragPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    dragStart.current = e.clientY;
    setDragging(true);
  };
  const onDragPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onDragPointerEnd = () => {
    if (dragStart.current === null) return;
    if (dragY > 120) {
      closeFullscreenPlayer();
    }
    dragStart.current = null;
    setDragging(false);
    setDragY(0);
  };

  const showLyrics = lyricsOpen;
  const showQueue = queueOpen && !lyricsOpen;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Lecteur plein écran"
      // `no-drag`: this full-screen overlay paints OVER the Electron TitleBar, but
      // the OS still treats the titlebar's `-webkit-app-region: drag` rect as
      // draggable underneath — so a press on the top-left back button started a
      // window-move instead of firing the click ("I could see it, it didn't work").
      // Carving the whole overlay out of the drag region restores every control.
      // No-op in the browser/mobile (app-region does nothing there).
      className="no-drag fixed inset-0 z-[60] bg-black"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? "none" : "transform 0.2s ease",
        // The now-playing stage is dominated by the ambient blurred cover, so it
        // is ALWAYS rendered in a dark palette — even when the app is in light
        // mode — exactly like Apple Music's full-screen player.
        "--background": "#000000",
        "--foreground": "#ffffff",
        "--text-muted": "#98989f",
        "--text-faint": "#636366",
      } as CSSProperties}
    >
      {/* Apple Music signature backdrop: a blown-up, heavily blurred copy of the
          cover art — saturated and dimmed so it reads as an ambient colour field
          behind the now-playing stage. This is the defining visual of Apple Music's
          full-screen player. Falls back to a palette tint wash when there is no art. */}
      {currentTrack.image ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 scale-[1.35] pointer-events-none"
            style={{
              backgroundImage: `url("${currentTrack.image}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "saturate(1.8) blur(74px) brightness(0.62)",
              transition: "background-image 0.7s ease",
            }}
          />
          {/* Vertical legibility scrim — darker at top/bottom so artwork + text pop,
              exactly like Apple Music's now-playing gradient overlay. */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 32%, rgba(0,0,0,0.28) 70%, rgba(0,0,0,0.62) 100%)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 pointer-events-none transition-[background] duration-700 ease-out"
          style={{
            background: `linear-gradient(to bottom, ${colors[0] || "#1c1c1e"}cc 0%, var(--background) 75%)`,
          }}
        />
      )}

      <div className="relative z-10 flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">

      {/* Top bar */}
      <div className="flex h-16 items-center justify-between px-4">
        <button
          type="button"
          onClick={closeFullscreenPlayer}
          aria-label="Réduire le lecteur"
          className="grid h-10 w-10 place-items-center text-foreground transition-transform active:scale-90"
        >
          <ChevronDown className="size-7" strokeWidth={2.25} />
        </button>
        <div
          className="flex-1 cursor-grab select-none text-center active:cursor-grabbing px-2"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerEnd}
          onPointerCancel={onDragPointerEnd}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {currentTrack.album ? "LECTURE DE L'ALBUM" : "LECTURE EN COURS"}
          </p>
          <p className="text-[12px] font-bold text-foreground truncate">
            {currentTrack.album || trackArtist(currentTrack)}
          </p>
        </div>
        <button
          onClick={openMore}
          aria-label="Options du titre"
          className="grid h-10 w-10 place-items-center text-foreground"
        >
          <MoreHorizontal className="size-6" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-6">
        {showLyrics ? (
          /* Spotify-style lyrics stage. Desktop: cover (+ meta) pinned left, paroles
             scrolling right, both bathed in the cover-themed backdrop above. Mobile:
             just the paroles, full-bleed. */
          <div className="min-h-0 flex-1 pt-2 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-stretch lg:gap-12 lg:px-2">
            <div className="hidden min-h-0 flex-col justify-center gap-7 lg:flex">
              <div className="w-full aspect-square overflow-hidden rounded-xl shadow-2xl shadow-black/40">
                <Artwork
                  fluid
                  title={currentTrack.title}
                  trackhash={currentTrack.trackhash}
                  imgSize={640}
                  rounded={14}
                  colors={colors}
                  image={currentTrack.image}
                  className="w-full h-full"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col">
                  <h1 className="truncate text-[28px] font-bold text-foreground">{trackTitle(currentTrack)}</h1>
                  <p className="truncate text-[17px] font-medium text-[var(--text-muted)]">{trackArtist(currentTrack)}</p>
                </div>
                <button
                  onClick={onFav}
                  aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className="shrink-0 transition-transform active:scale-90"
                >
                  <Heart
                    className={cn("size-[26px]", favPop && "heart-pop", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-foreground")}
                    onAnimationEnd={() => setFavPop(false)}
                  />
                </button>
              </div>
            </div>
            <div className="h-full min-h-0">
              <LyricsView variant="stage" />
            </div>
          </div>
        ) : showQueue ? (
          <div className="flex min-h-0 flex-1 flex-col pt-2">
            <QueueList />
          </div>
        ) : (
          /* Mobile Stage: Artwork + Meta */
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
            <div className="w-full flex justify-center">
              <div className="w-full max-w-[400px] aspect-square overflow-hidden rounded-xl shadow-2xl shadow-black/40">
                <Artwork
                  fluid
                  title={currentTrack.title}
                  trackhash={currentTrack.trackhash}
                  rounded={14}
                  colors={colors}
                  image={currentTrack.image}
                  className="w-full h-full"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0 pr-4">
                <h1 className="truncate text-[26px] font-bold text-foreground">{trackTitle(currentTrack)}</h1>
                <p className="truncate text-[16px] font-medium text-[var(--text-muted)]">{trackArtist(currentTrack)}</p>
              </div>
              <button
                onClick={onFav}
                aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                className="shrink-0 transition-transform active:scale-90"
              >
                <Heart
                  className={cn("size-[26px]", favPop && "heart-pop", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-foreground")}
                  onAnimationEnd={() => setFavPop(false)}
                />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrubber */}
      <div className="px-6 pt-2 pb-2">
        <FullscreenScrubber seek={seek} />
      </div>

      {/* Transport */}
      <div className="flex items-center justify-between px-6 pb-4">
        <button
          onClick={toggleShuffle}
          className={cn("grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90", shuffle ? "text-[var(--primary)]" : "text-foreground")}
          aria-label="Lecture aléatoire"
        >
          <Shuffle className="size-5" />
        </button>
        <button onClick={playPrev} className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-transform active:scale-90" aria-label="Précédent">
          <SkipBack className="size-7 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Lecture"}
          className="grid h-16 w-16 place-items-center rounded-full bg-[var(--primary)] text-white transition-transform active:scale-90"
        >
          {isPlaying ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current ml-1" />}
        </button>
        <button onClick={playNext} className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-transform active:scale-90" aria-label="Suivant">
          <SkipForward className="size-7 fill-current" />
        </button>
        <button
          onClick={cycleRepeat}
          className={cn("grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90", repeat !== "off" ? "text-[var(--primary)]" : "text-foreground")}
          aria-label="Répéter"
        >
          {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between px-6 pb-6">
        <button
          onClick={toggleLyrics}
          aria-label="Paroles"
          aria-pressed={lyricsOpen}
          className={cn("grid h-10 w-10 place-items-center transition-colors", lyricsOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")}
        >
          <Mic2 className="size-5" />
        </button>
        <div className="flex items-center gap-4">
          <ConnectButton variant="stage" />
          <button
            onClick={() => void shareTrack(currentTrack, notify)}
            aria-label="Partager"
            className="grid h-10 w-10 place-items-center text-[var(--text-muted)] hover:text-foreground"
          >
            <Share2 className="size-5" />
          </button>
          <button
            onClick={toggleQueue}
            aria-label="File d'attente"
            aria-pressed={queueOpen}
            className={cn("grid h-10 w-10 place-items-center transition-colors", queueOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")}
          >
            <ListMusic className="size-5" />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function FullscreenScrubber({ seek }: { seek: (time: number) => void }) {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const [scrubPct, setScrubPct] = useState<number | null>(null);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const pct = scrubPct ?? progress;
  const shownTime = scrubPct !== null ? (scrubPct / 100) * (duration || 0) : position;

  const onKeyDown = (e: React.KeyboardEvent) => {
    let target: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") target = Math.min(duration || 0, position + 5);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") target = Math.max(0, position - 5);
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = duration || 0;
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation();
    seek(target);
  };

  return (
    <div className="w-full">
      <div
        className="group relative flex cursor-pointer touch-none py-2 focus-auralis rounded-full"
        role="slider"
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`${formatDuration(shownTime)} sur ${formatDuration(duration)}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setScrubPct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
        }}
        onPointerMove={(e) => {
          if (scrubPct === null) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setScrubPct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
        }}
        onPointerUp={() => {
          if (scrubPct === null) return;
          seek((scrubPct / 100) * (duration || 0));
          setScrubPct(null);
        }}
      >
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="h-full rounded-full bg-foreground group-hover:bg-[var(--primary)]" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100 shadow-md"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(position)}</span>
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
