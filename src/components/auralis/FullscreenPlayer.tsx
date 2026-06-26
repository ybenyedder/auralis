"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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
import { LyricsView } from "./LyricsView";
import { QueueList } from "./QueueList";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
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

  const colors = currentTrack.color ?? ["#2a2a2a", "#121212", "#000000"];
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
      className="fixed inset-0 z-[60] bg-[var(--background)]"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? "none" : "transform 0.2s ease"
      }}
    >
      {/* Background Gradient */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-80" 
        style={{ background: `linear-gradient(to bottom, ${colors[0] || '#535353'}, var(--background))` }} 
      />

      <div className="relative z-10 flex h-full flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">

      {/* Top bar */}
      <div className="flex h-16 items-center justify-between px-4">
        <button
          onClick={closeFullscreenPlayer}
          aria-label="Réduire le lecteur"
          className="grid h-10 w-10 place-items-center text-white"
        >
          <ChevronDown className="size-8" />
        </button>
        <div
          className="flex-1 cursor-grab select-none text-center active:cursor-grabbing px-2"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerEnd}
          onPointerCancel={onDragPointerEnd}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/80">
            {currentTrack.album ? "LECTURE DE L'ALBUM" : "LECTURE EN COURS"}
          </p>
          <p className="text-[12px] font-bold text-white truncate">
            {currentTrack.album || trackArtist(currentTrack)}
          </p>
        </div>
        <button
          onClick={openMore}
          aria-label="Options du titre"
          className="grid h-10 w-10 place-items-center text-white"
        >
          <MoreHorizontal className="size-6" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-6">
        {showLyrics ? (
          <div className="min-h-0 flex-1 pt-2">
            <LyricsView variant="stage" />
          </div>
        ) : showQueue ? (
          <div className="flex min-h-0 flex-1 flex-col pt-2">
            <QueueList />
          </div>
        ) : (
          /* Mobile Stage: Artwork + Meta */
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
            <div className="w-full flex justify-center">
              <Artwork
                fluid
                title={currentTrack.title}
                trackhash={currentTrack.trackhash}
                size={400}
                rounded={8}
                colors={colors}
                image={currentTrack.image}
                className="w-full aspect-square max-w-[400px] shadow-xl"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex flex-col min-w-0 pr-4">
                <h1 className="truncate text-[24px] font-bold text-white">{trackTitle(currentTrack)}</h1>
                <p className="truncate text-[16px] font-medium text-[var(--text-muted)]">{trackArtist(currentTrack)}</p>
              </div>
              <button
                onClick={onFav}
                aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                className="shrink-0 transition-transform active:scale-90"
              >
                <Heart
                  className={cn("size-[26px]", favPop && "heart-pop", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-white")}
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
          className={cn("grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90", shuffle ? "text-[var(--primary)]" : "text-white")}
          aria-label="Lecture aléatoire"
        >
          <Shuffle className="size-6" />
        </button>
        <button onClick={playPrev} className="grid h-12 w-12 place-items-center rounded-full text-white transition-transform active:scale-90" aria-label="Précédent">
          <SkipBack className="size-7 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Lecture"}
          className="grid h-16 w-16 place-items-center rounded-full bg-white text-black transition-transform active:scale-90"
        >
          {isPlaying ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current ml-1" />}
        </button>
        <button onClick={playNext} className="grid h-12 w-12 place-items-center rounded-full text-white transition-transform active:scale-90" aria-label="Suivant">
          <SkipForward className="size-7 fill-current" />
        </button>
        <button
          onClick={cycleRepeat}
          className={cn("grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90", repeat !== "off" ? "text-[var(--primary)]" : "text-white")}
          aria-label="Répéter"
        >
          {repeat === "one" ? <Repeat1 className="size-6" /> : <Repeat className="size-6" />}
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between px-6 pb-6">
        <button
          onClick={toggleLyrics}
          aria-label="Paroles"
          aria-pressed={lyricsOpen}
          className={cn("grid h-10 w-10 place-items-center transition-colors", lyricsOpen ? "text-[var(--primary)]" : "text-white/70 hover:text-white")}
        >
          <Mic2 className="size-5" />
        </button>
        <div className="flex gap-4">
          <button
            onClick={() => void shareTrack(currentTrack, notify)}
            aria-label="Partager"
            className="grid h-10 w-10 place-items-center text-white/70 hover:text-white"
          >
            <Share2 className="size-5" />
          </button>
          <button
            onClick={toggleQueue}
            aria-label="File d'attente"
            aria-pressed={queueOpen}
            className={cn("grid h-10 w-10 place-items-center transition-colors", queueOpen ? "text-[var(--primary)]" : "text-white/70 hover:text-white")}
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
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white group-hover:bg-[var(--primary)]" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100 shadow-md"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(position)}</span>
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
