"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
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
  Timer,
  X,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { shareTrack } from "@/lib/auralis/share";
import { useT } from "@/lib/auralis/i18n";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "./Artwork";
import { ConnectButton } from "./ConnectButton";
import { LyricsView } from "./LyricsView";
import { QueueList } from "./QueueList";
import { formatDuration, paletteForName, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

// Horizontal swipe-to-skip tuning (touch only): how far (px) the finger must
// travel before releasing commits to next/prev. Below that the gesture reads
// as a tap and nothing happens.
const SWIPE_SKIP_PX = 70;

// Small haptic tick for touch feedback (swipe-to-skip, transport buttons).
// Guarded: vibrate() is missing on iOS Safari and can throw in embedded
// webviews — never let feedback break the interaction itself.
const hapticTick = () => {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(10);
  } catch {
    /* unsupported — silently skip */
  }
};

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
  // Sleep timer — surfaced on mobile via a bottom sheet (desktop keeps the
  // PlayerBar moon popover).
  const sleepTimer = usePlayer((s) => s.sleepTimer);
  const startSleepTimer = usePlayer((s) => s.startSleepTimer);
  const sleepAfterTrack = usePlayer((s) => s.sleepAfterTrack);
  const cancelSleepTimer = usePlayer((s) => s.cancelSleepTimer);

  const t = useT();

  const [favPop, setFavPop] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<number | null>(null);

  // Horizontal swipe-to-skip on the artwork stage (touch pointers only).
  const [swipeDx, setSwipeDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  // Axis lock, decided on the first decisive movement: a mostly-vertical
  // gesture is left alone (nothing scrolls on this screen, but we never fight
  // the finger either).
  const swipeAxis = useRef<"x" | "y" | null>(null);
  const swipeHaptic = useRef(false);

  // Mobile sleep-timer sheet + its 1s countdown tick.
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, rootRef);

  useEffect(() => {
    if (!currentTrack) closeFullscreenPlayer();
  }, [currentTrack, closeFullscreenPlayer]);

  // Keep a 1s "now" tick while a countdown sleep timer runs, so the mobile
  // timer badge counts down (same pattern as the desktop PlayerBar).
  useEffect(() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return;
    const tick = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [sleepTimer.active, sleepTimer.endsAt]);

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

  // --- Horizontal swipe-to-skip (touch only) ---
  // Same contract as the vertical drag-to-dismiss above: mouse pointers are
  // ignored outright so desktop dragging never moves the artwork.
  const onSwipePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
    swipeAxis.current = null;
    swipeHaptic.current = false;
  };
  const onSwipePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    // Lock the axis once the gesture becomes decisive; if it resolves
    // vertical, stop tracking entirely (let it be).
    if (swipeAxis.current === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (swipeAxis.current !== "x") return;
    setSwiping(true);
    setSwipeDx(dx);
    // One haptic tick the moment the skip threshold is crossed (re-armed when
    // the finger comes back near the origin, so a wiggle can re-trigger).
    if (!swipeHaptic.current && Math.abs(dx) > SWIPE_SKIP_PX) {
      swipeHaptic.current = true;
      hapticTick();
    } else if (swipeHaptic.current && Math.abs(dx) < SWIPE_SKIP_PX * 0.6) {
      swipeHaptic.current = false;
    }
  };
  const onSwipePointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    const wasHorizontal = swipeAxis.current === "x";
    swipeStart.current = null;
    swipeAxis.current = null;
    // Commit the skip only on a decisive horizontal fling — never on a tap
    // (tiny movement) and never when the gesture resolved as vertical.
    if (wasHorizontal && Math.abs(dx) > SWIPE_SKIP_PX && Math.abs(dx) > Math.abs(dy)) {
      hapticTick();
      if (dx < 0) playNext();
      else playPrev();
    }
    // Reset — the artwork springs back via the CSS transition below.
    setSwiping(false);
    setSwipeDx(0);
  };

  // Artwork drag visuals: rubber-banded translation (dx * 0.5, clamped) plus a
  // fade proportional to |dx|, and the side skip-hint opacity (grows with
  // |dx|, capped at 0.9).
  const swipeAbs = Math.abs(swipeDx);
  const swipeTranslate = Math.max(-120, Math.min(120, swipeDx * 0.5));
  const swipeOpacity = Math.max(0, 1 - swipeAbs / 300);
  const swipeHintOpacity = Math.min(0.9, swipeAbs / 150);

  // Sleep-timer labels: minutes for the mobile button badge, m:ss for the
  // sheet header ("Fin du titre" mode has no countdown — only the accent).
  const sleepRemainingMin = (() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return null;
    const ms = sleepTimer.endsAt - timerNow;
    if (ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / 60000));
  })();
  const sleepRemainingLabel = (() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return "";
    const ms = sleepTimer.endsAt - timerNow;
    if (ms <= 0) return "";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  const showLyrics = lyricsOpen;
  const showQueue = queueOpen && !lyricsOpen;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("player.fullscreen", "Lecteur plein écran")}
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
          aria-label={t("player.minimize", "Réduire le lecteur")}
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
            {currentTrack.album ? t("player.playingAlbum", "LECTURE DE L'ALBUM") : t("player.playingNow", "LECTURE EN COURS")}
          </p>
          <p className="text-[12px] font-bold text-foreground truncate">
            {currentTrack.album || trackArtist(currentTrack)}
          </p>
        </div>
        <button
          onClick={openMore}
          aria-label={t("player.trackOptions", "Options du titre")}
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
                  aria-label={fav ? t("common.removeFavorite", "Retirer des favoris") : t("common.addFavorite", "Ajouter aux favoris")}
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
          /* Mobile Stage: Artwork + Meta. The whole stage doubles as a
             touch-only swipe surface: fling the artwork left/right to change
             track (mouse pointers are ignored — desktop keeps its buttons). */
          <div
            className="relative flex min-h-0 flex-1 touch-pan-y select-none flex-col justify-center gap-8"
            onPointerDown={onSwipePointerDown}
            onPointerMove={onSwipePointerMove}
            onPointerUp={onSwipePointerEnd}
            onPointerCancel={onSwipePointerEnd}
          >
            <div className="relative w-full flex justify-center">
              {/* Skip hints on the side being swiped toward (touch gestures
                  only — they stay at opacity 0 for mouse users). */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-2 flex items-center"
                style={{ opacity: swipeDx < 0 ? swipeHintOpacity : 0, transition: swiping ? "none" : "opacity 0.2s ease" }}
              >
                <SkipForward className="size-10 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" strokeWidth={2.5} />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-2 flex items-center"
                style={{ opacity: swipeDx > 0 ? swipeHintOpacity : 0, transition: swiping ? "none" : "opacity 0.2s ease" }}
              >
                <SkipBack className="size-10 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" strokeWidth={2.5} />
              </div>
              {/* The artwork card: translated with a slight rubber-band
                  resistance (dx * 0.5) and faded proportionally to |dx| while
                  dragging; springs back on release. */}
              <div
                className="w-full max-w-[400px] aspect-square overflow-hidden rounded-xl shadow-2xl shadow-black/40"
                style={{
                  transform: swipeDx ? `translateX(${swipeTranslate}px)` : undefined,
                  opacity: swipeDx ? swipeOpacity : undefined,
                  transition: swiping ? "none" : "transform 0.25s ease, opacity 0.25s ease",
                }}
              >
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
                aria-label={fav ? t("common.removeFavorite", "Retirer des favoris") : t("common.addFavorite", "Ajouter aux favoris")}
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
          aria-label={t("player.shuffle", "Lecture aléatoire")}
        >
          <Shuffle className="size-5" />
        </button>
        <button
          onClick={playPrev}
          onPointerDown={(e) => { if (e.pointerType === "touch") hapticTick(); }}
          className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          aria-label={t("player.previous", "Précédent")}
        >
          <SkipBack className="size-7 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          onPointerDown={(e) => { if (e.pointerType === "touch") hapticTick(); }}
          aria-label={isPlaying ? t("player.pause", "Pause") : t("player.play", "Lecture")}
          className="grid h-16 w-16 place-items-center rounded-full bg-[var(--primary)] text-white transition-transform active:scale-90"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-8" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-8 ml-1" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
            </svg>
          )}
        </button>
        <button
          onClick={playNext}
          onPointerDown={(e) => { if (e.pointerType === "touch") hapticTick(); }}
          className="grid h-12 w-12 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          aria-label={t("player.next", "Suivant")}
        >
          <SkipForward className="size-7 fill-current" />
        </button>
        <button
          onClick={cycleRepeat}
          className={cn("grid h-12 w-12 place-items-center rounded-full transition-transform active:scale-90", repeat !== "off" ? "text-[var(--primary)]" : "text-foreground")}
          aria-label={t("player.repeat", "Répéter")}
        >
          {repeat === "one" ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between px-6 pb-6">
        {/* Sleep timer — mobile only (desktop keeps the PlayerBar moon).
            Turns accent + shows the remaining minutes while a timer runs. */}
        <button
          onClick={() => setSleepSheetOpen(true)}
          aria-label={t("mobile.sleepTimer", "Minuteur")}
          aria-haspopup="dialog"
          className={cn(
            "md:hidden flex h-10 items-center gap-1 rounded-full px-2 transition-colors",
            sleepTimer.active ? "text-[var(--primary)]" : "text-[var(--text-muted)]"
          )}
        >
          <Timer className="size-5" />
          {sleepRemainingMin !== null && (
            <span className="min-w-4 text-[12px] font-bold tabular-nums">{sleepRemainingMin}</span>
          )}
        </button>
        <button
          onClick={toggleLyrics}
          aria-label={t("player.lyrics", "Paroles")}
          aria-pressed={lyricsOpen}
          className={cn("grid h-10 w-10 place-items-center transition-colors", lyricsOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")}
        >
          <Mic2 className="size-5" />
        </button>
        <div className="flex items-center gap-4">
          <ConnectButton variant="stage" />
          <button
            onClick={() => void shareTrack(currentTrack, notify, usePlayer.getState().locale)}
            aria-label={t("player.share", "Partager")}
            className="grid h-10 w-10 place-items-center text-[var(--text-muted)] hover:text-foreground"
          >
            <Share2 className="size-5" />
          </button>
          <button
            onClick={toggleQueue}
            aria-label={t("player.queue", "File d'attente")}
            aria-pressed={queueOpen}
            className={cn("grid h-10 w-10 place-items-center transition-colors", queueOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")}
          >
            <ListMusic className="size-5" />
          </button>
        </div>
      </div>

      {/* Sleep-timer bottom sheet (mobile): matte panel anchored above the
          bottom actions, behind a dimmed scrim — same sheet/scrim pair as the
          mobile context menu. */}
      {sleepSheetOpen && (
        <>
          <button
            type="button"
            aria-label={t("player.close", "Fermer")}
            onClick={() => setSleepSheetOpen(false)}
            className="scrim-in absolute inset-0 z-20 bg-black/55"
          />
          <div
            role="dialog"
            aria-label={t("mobile.sleepTimer", "Minuteur")}
            className="sheet-up absolute inset-x-0 bottom-0 z-30"
          >
            <div className="safe-bottom rounded-t-2xl border-t border-white/10 bg-[var(--panel-2)] px-5 pt-3 pb-4 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]">
              {/* Drag handle */}
              <div className="flex justify-center pb-2">
                <span className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
              </div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t("mobile.sleepTimer", "Minuteur")}
                </p>
                {sleepRemainingLabel && (
                  <span className="rounded-sm bg-black/30 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--primary)]">
                    {sleepRemainingLabel}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => { startSleepTimer(m); setSleepSheetOpen(false); }}
                    className={cn(
                      "rounded-lg py-2.5 text-[13px] font-semibold transition-all active:scale-95",
                      sleepTimer.active && !sleepTimer.endOfTrack && sleepTimer.minutes === m
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--surface-3)] text-foreground"
                    )}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <button
                onClick={() => { sleepAfterTrack(); setSleepSheetOpen(false); }}
                className={cn(
                  "mt-2 w-full rounded-lg py-2.5 text-[13px] font-semibold transition-all active:scale-95",
                  sleepTimer.endOfTrack ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-3)] text-foreground"
                )}
              >
                {t("player.endOfTrack", "Fin du titre")}
              </button>
              {sleepTimer.active && (
                <button
                  onClick={() => { cancelSleepTimer(); setSleepSheetOpen(false); }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--surface-3)] py-2.5 text-[13px] font-medium text-[var(--text-muted)] transition-all active:scale-95"
                >
                  <X className="size-4" /> {t("common.cancel", "Annuler")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

function FullscreenScrubber({ seek }: { seek: (time: number) => void }) {
  const t = useT();
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const [scrubPct, setScrubPct] = useState<number | null>(null);

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const pct = scrubPct ?? progress;
  const shownTime = scrubPct !== null ? (scrubPct / 100) * (duration || 0) : position;
  // Touch ergonomics: while a scrub is in progress the thumb is force-shown
  // and slightly enlarged (see below) so a finger can keep track of it.
  const scrubbing = scrubPct !== null;

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
        className="group relative flex cursor-pointer touch-none py-3 focus-auralis rounded-full"
        role="slider"
        aria-label={t("player.playbackPosition", "Position de lecture")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={t("player.playbackPositionText", "{current} sur {duration}", { current: formatDuration(shownTime), duration: formatDuration(duration) })}
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
        {/* Slim pill track, generous touch target: the row's py-3 padding
            widens the hit area, and the thumb grows to h-4 w-4 and stays
            visible for the whole drag. */}
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-md transition-all duration-100",
            scrubbing ? "h-4 w-4 opacity-100" : "h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-active:opacity-100"
          )}
          style={{ left: `calc(${pct}% - ${scrubbing ? 8 : 7}px)` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(position)}</span>
        <span className="text-[12px] font-medium text-[var(--text-muted)]">{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
