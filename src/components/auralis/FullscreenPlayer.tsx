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
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "./Artwork";
import { LyricsView } from "./LyricsView";
import { EqualizerBars } from "./SectionHeader";
import { QueueList } from "./QueueList";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { ThemeBackdrop } from "./ThemeBackdrop";
import { cn } from "@/lib/utils";

export function FullscreenPlayer() {
  // NOTE: position/duration are intentionally NOT read here — they tick ~4×/s and
  // would re-render this whole heavy surface (artwork, lyrics, transport) every
  // frame. The live progress is isolated in <FullscreenScrubber> below.
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
  const isFavorite = usePlayer((s) => s.isFavorite);
  const closeFullscreenPlayer = usePlayer((s) => s.closeFullscreenPlayer);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  const notify = usePlayer((s) => s.notify);
  // The next track (if any) for an "À suivre" anticipation peek. These change only
  // on track/queue edits, not per frame, so subscribing is cheap.
  const nextTrack = usePlayer((s) => s.shuffledQueue[s.currentIndex + 1] ?? null);

  const [favPop, setFavPop] = useState(false);
  // Drag-down-to-close gesture on the mobile top region.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (!currentTrack) closeFullscreenPlayer();
  }, [currentTrack, closeFullscreenPlayer]);

  if (!currentTrack) return null;

  const colors = currentTrack.color ?? ["#2A2821", "#D95F45", "#E5A184"];
  const fav = isFavorite(currentTrack.trackhash);
  const onFav = () => { if (!fav) setFavPop(true); toggleFavorite(currentTrack.trackhash); };

  const openMore = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.left, rect.top - 8, currentTrack);
  };

  // Drag-down to dismiss (mobile only — desktop never starts the gesture).
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

  // What occupies the mobile stage: lyrics, queue, or artwork + meta.
  const showLyrics = lyricsOpen;
  const showQueue = queueOpen && !lyricsOpen;

  return (
    <div
      className="rise-in fixed inset-0 z-[60] bg-[var(--bg-solid)]"
      style={dragY ? { transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 0.2s ease" } : undefined}
    >
      {/* The fullscreen sheet carries its OWN animated backdrop so it fully
          occludes the app shell underneath (with glass themes a transparent
          shell would otherwise bleed through). */}
      <ThemeBackdrop />
      <div className="app-chrome safe-top safe-bottom relative z-[1] flex h-full flex-col">

      {/* Top bar — only the centre label is the drag-to-dismiss handle so the
          Réduire / options buttons always receive clean taps (the old full-width
          pointer handlers could swallow the close button's click). */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 lg:px-6 lg:py-4">
        <button
          onClick={closeFullscreenPlayer}
          aria-label="Réduire le lecteur"
          title="Réduire (Échap)"
          className="ghost-button tap-press z-[1] flex h-11 items-center gap-2 rounded-[11px] px-3 transition-colors lg:h-9"
        >
          <ChevronDown className="size-6 lg:size-5" />
          <span className="hidden text-[12.5px] font-bold lg:inline">Réduire</span>
        </button>
        <p
          className="flex-1 cursor-grab select-none text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground active:cursor-grabbing"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerEnd}
          onPointerCancel={onDragPointerEnd}
        >En lecture</p>
        {/* Mobile: a "more" button (matches native now-playing). Desktop keeps the queue toggle. */}
        <button
          onClick={openMore}
          aria-label="Options du titre"
          className="ghost-button tap-press grid h-11 w-11 place-items-center rounded-[11px] transition-colors lg:hidden"
        >
          <MoreHorizontal className="size-6" />
        </button>
        <button
          onClick={toggleQueue}
          className={cn("hidden h-9 w-9 place-items-center rounded-[11px] transition-colors lg:grid", queueOpen ? "bg-primary/15 text-primary" : "ghost-button")}
          aria-label="File d'attente"
        >
          <ListMusic className="size-5" />
        </button>
      </div>

      {/* ===== Mobile stage (below lg): single vertical centered column ===== */}
      <div className="flex flex-1 min-h-0 flex-col px-5 lg:hidden">

        {/* Lyrics fill the stage when open */}
        {showLyrics ? (
          <div className="min-h-0 flex-1 pt-2">
            <LyricsView variant="stage" />
          </div>
        ) : showQueue ? (
          <div className="flex min-h-0 flex-1 flex-col pt-2">
            <QueueList />
          </div>
        ) : (
          /* Artwork + meta, stacked and centered */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
            <div className="relative">
              <Artwork
                fluid
                title={currentTrack.title}
                trackhash={currentTrack.trackhash}
                size={360}
                rounded={13}
                colors={colors}
                image={currentTrack.image}
                className={cn("w-[min(74vw,360px)] aspect-square transition-transform duration-500", isPlaying ? "scale-100" : "scale-[0.97]")}
              />
              {isPlaying && (
                <div className="matte-panel absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[11px] px-3 py-1">
                  <span className="flex items-end gap-[2px] h-2.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="eq-bar w-[2px] rounded-[1px] bg-primary" style={{ height: "100%", animationDelay: `${i * 0.18}s`, animationDuration: `${0.7 + (i % 2) * 0.25}s` }} />
                    ))}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-wider text-primary-soft">En lecture</span>
                </div>
              )}
            </div>
            <div className="w-full text-center">
              <h1 className="text-[24px] font-black leading-tight tracking-tight text-foreground sm:text-[28px]">{trackTitle(currentTrack)}</h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">{trackArtist(currentTrack)}</p>
              {currentTrack.album && <p className="mt-1 text-[12px] text-muted-foreground/65">{currentTrack.album} · {currentTrack.year}</p>}
              {nextTrack && (
                <button onClick={toggleQueue} className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground/80">
                  <span className="shrink-0 font-black uppercase tracking-wider text-[var(--brass)]">À suivre</span>
                  <span className="truncate">{trackTitle(nextTrack)} — {trackArtist(nextTrack)}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== Desktop stage (lg+): artwork + lyrics split — preserved ===== */}
      <div className="hidden flex-1 min-h-0 items-center justify-center gap-10 px-10 pb-6 lg:flex">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Artwork
              title={currentTrack.title}
              trackhash={currentTrack.trackhash}
              size={340}
              rounded={13}
              colors={colors}
              image={currentTrack.image}
              className={cn("transition-transform duration-500", isPlaying && "scale-100", !isPlaying && "scale-95")}
            />
            {isPlaying && (
              <div className="matte-panel absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-[11px] px-3 py-1">
                <span className="flex items-end gap-[2px] h-2.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="eq-bar w-[2px] rounded-[1px] bg-primary" style={{ height: "100%", animationDelay: `${i * 0.18}s`, animationDuration: `${0.7 + (i % 2) * 0.25}s` }} />
                  ))}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-primary-soft">En lecture</span>
              </div>
            )}
          </div>
          <div className="text-center max-w-md">
            <h1 className="text-[30px] font-black leading-tight tracking-tight text-foreground">{trackTitle(currentTrack)}</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">{trackArtist(currentTrack)}</p>
            {currentTrack.album && <p className="mt-0.5 text-[12px] text-muted-foreground/65">{currentTrack.album} · {currentTrack.year}</p>}
            {nextTrack && (
              <button onClick={toggleQueue} className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate text-[11px] text-muted-foreground/55 transition-colors hover:text-foreground/80">
                <span className="shrink-0 font-black uppercase tracking-wider text-[var(--brass)]">À suivre</span>
                <span className="truncate">{trackTitle(nextTrack)} — {trackArtist(nextTrack)}</span>
              </button>
            )}
          </div>
        </div>

        {/* Lyrics panel (desktop) */}
        <div className="hidden h-[460px] w-[380px] flex-col lg:flex">
          <div className="mb-3 flex items-center justify-center">
            <button
              onClick={toggleLyrics}
              className={cn(
                "flex items-center gap-1.5 rounded-[11px] px-3.5 py-1.5 text-[11.5px] font-bold transition-colors",
                lyricsOpen ? "signal-button" : "ghost-button",
              )}
            >
              <Mic2 className="size-3.5" /> {lyricsOpen ? "Paroles" : "Afficher les paroles"}
            </button>
          </div>
          {lyricsOpen ? (
            <div className="min-h-0 flex-1">
              <LyricsView variant="stage" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground/45">
              <Mic2 className="size-9" />
              <p className="max-w-[220px] text-[12px]">Affiche les paroles synchronisées pendant la lecture.</p>
            </div>
          )}
        </div>
      </div>

      {/* Scrubber — isolated so the ~4×/s playhead tick only re-renders this row. */}
      <FullscreenScrubber seek={seek} />

      {/* Transport */}
      <div className="mx-auto flex w-full items-center justify-between px-6 pb-5 lg:max-w-2xl lg:justify-center lg:gap-6 lg:px-10 lg:pb-8">
        <button
          onClick={toggleShuffle}
          className={cn("tap-press grid h-11 w-11 place-items-center rounded-[11px] transition-colors lg:h-10 lg:w-10", shuffle ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
          aria-label="Lecture aléatoire"
        >
          <Shuffle className="size-5" />
        </button>
        <button onClick={playPrev} className="tap-press grid h-12 w-12 place-items-center rounded-[11px] text-foreground/80 transition-colors hover:bg-white/[0.06] hover:text-foreground lg:h-10 lg:w-10" aria-label="Précédent">
          <SkipBack className="size-7 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Lecture"}
          className="signal-button tap-press grid h-16 w-16 place-items-center rounded-[16px] transition-[filter,transform] active:translate-y-px lg:h-14 lg:w-14"
        >
          {isPlaying ? <Pause className="size-7 fill-current" /> : <Play className="size-7 fill-current ml-1" />}
        </button>
        <button onClick={playNext} className="tap-press grid h-12 w-12 place-items-center rounded-[11px] text-foreground/80 transition-colors hover:bg-white/[0.06] hover:text-foreground lg:h-10 lg:w-10" aria-label="Suivant">
          <SkipForward className="size-7 fill-current" />
        </button>
        <button
          onClick={cycleRepeat}
          className={cn("tap-press grid h-11 w-11 place-items-center rounded-[11px] transition-colors lg:h-10 lg:w-10", repeat !== "off" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
          aria-label="Répéter"
        >
          {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
        </button>
      </div>

      {/* Secondary actions */}
      {/* Mobile: Favorite + Paroles toggle + File toggle, evenly spaced. */}
      <div className="flex w-full items-center justify-around px-6 pb-4 lg:hidden">
        <button
          onClick={onFav}
          aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
          className={cn("tap-press grid h-11 w-11 place-items-center rounded-[11px] transition-colors", fav ? "text-primary" : "text-muted-foreground")}
        >
          <Heart className={cn("size-6", fav && "fill-primary", favPop && "heart-pop")} onAnimationEnd={() => setFavPop(false)} />
        </button>
        <button
          onClick={toggleLyrics}
          className={cn("tap-press flex h-11 items-center gap-2 rounded-[11px] px-4 text-[12px] font-bold transition-colors", lyricsOpen ? "bg-primary/15 text-primary" : "text-muted-foreground")}
        >
          <Mic2 className="size-5" /> Paroles
        </button>
        <button
          onClick={toggleQueue}
          className={cn("tap-press flex h-11 items-center gap-2 rounded-[11px] px-4 text-[12px] font-bold transition-colors", queueOpen ? "bg-primary/15 text-primary" : "text-muted-foreground")}
        >
          <ListMusic className="size-5" /> File
        </button>
        <button
          onClick={() => void shareTrack(currentTrack, notify)}
          aria-label="Partager le titre"
          className="tap-press grid h-11 w-11 place-items-center rounded-[11px] text-muted-foreground transition-colors"
        >
          <Share2 className="size-5" />
        </button>
      </div>

      {/* Desktop footer actions — preserved */}
      <div className="mx-auto hidden w-full max-w-2xl items-center justify-between px-10 pb-6 lg:flex">
        <button
          onClick={onFav}
          className={cn("flex items-center gap-2 rounded-[11px] px-3 py-1.5 text-[12px] font-bold transition-colors", fav ? "bg-primary/15 text-primary" : "ghost-button")}
        >
          <Heart className={cn("size-4", fav && "fill-primary", favPop && "heart-pop")} onAnimationEnd={() => setFavPop(false)} />
          {fav ? "Aimé" : "Aimer"}
        </button>
        {isPlaying && (
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <EqualizerBars active className="h-3" /> En lecture
          </span>
        )}
        <button onClick={openMore} className="ghost-button grid h-8 w-8 place-items-center rounded-[11px] transition-colors" aria-label="Options du titre">
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      </div>
    </div>
  );
}

/** Live progress row, isolated from the parent. It alone subscribes to the playhead
 *  store (position/duration tick ~4×/s), so the heavy FullscreenPlayer surface above
 *  doesn't re-render on every frame — only this thin scrubber does. */
function FullscreenScrubber({ seek }: { seek: (time: number) => void }) {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const [scrubPct, setScrubPct] = useState<number | null>(null);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const pct = scrubPct ?? progress;

  return (
    <div className="mx-auto w-full px-5 pb-2 lg:max-w-2xl lg:px-10 lg:pb-3">
      <div className="flex items-center gap-3">
        <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">{formatDuration(position)}</span>
        <div
          className="group relative flex-1 cursor-pointer touch-none py-3 lg:py-2"
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
          <div className="h-1.5 w-full overflow-hidden rounded-[2px] bg-white/15">
            <div className="h-full rounded-[2px] bg-[var(--paper)]" style={{ width: `${pct}%` }} />
          </div>
          {/* Thumb: always visible on mobile, hover/scrub-only on desktop. */}
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-2 -translate-y-1/2 rounded-[2px] bg-[var(--paper)] transition-opacity lg:opacity-0"
            style={{ left: `calc(${pct}% - 4px)`, opacity: scrubPct !== null ? 1 : undefined }}
          />
        </div>
        <span className="w-10 text-[11px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
