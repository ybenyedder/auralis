"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  VolumeX,
  ListMusic,
  Maximize2,
  Moon,
  X,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "./Artwork";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

export function PlayerBar() {
  const {
    currentTrack,
    isPlaying,
    volume,
    muted,
    repeat,
    shuffle,
    togglePlay,
    playNext,
    playPrev,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    isFavorite,
    toggleFullscreenPlayer,
    toggleQueue,
    queueOpen,
    sleepTimer,
    startSleepTimer,
    cancelSleepTimer,
  } = usePlayer();

  const [sleepOpen, setSleepOpen] = useState(false);
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return;
    const t = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sleepTimer.active, sleepTimer.endsAt]);

  const sleepRemaining = (() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return "";
    const ms = sleepTimer.endsAt - timerNow;
    if (ms <= 0) return "";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  const vol = muted ? 0 : volume;
  const fav = currentTrack ? isFavorite(currentTrack.trackhash) : false;

  return (
    <footer className="glass-chrome keyline-top relative z-30 flex h-[76px] flex-col justify-center bg-[var(--panel)] px-4">

      {/* Row 1 — meta · transport · secondary, all on ONE vertically-centred line so
          the transport controls align with the side controls (they used to sit
          higher because the scrubber was stacked beneath them in the centre). */}
      <div className="flex flex-1 items-center gap-3 lg:gap-6">

      {/* Left: track info */}
      <div className="flex min-w-0 items-center gap-3" style={{ flexBasis: "28%" }}>
        {currentTrack ? (
          <>
            <button onClick={toggleFullscreenPlayer} aria-label="Expand player" className="shrink-0">
              <Artwork
                title={currentTrack.title}
                trackhash={currentTrack.trackhash}
                size={44}
                rounded={9}
                colors={currentTrack.color}
                image={currentTrack.image}
              />
            </button>
            <div className="min-w-0">
              <button
                onClick={toggleFullscreenPlayer}
                className="block max-w-[210px] truncate text-left text-[13px] font-bold text-foreground transition-colors hover:text-primary-soft"
              >
                {trackTitle(currentTrack)}
              </button>
              <p className="mt-0.5 max-w-[210px] truncate text-[11.5px] text-muted-foreground/75">
                {trackArtist(currentTrack)}
              </p>
            </div>
            <button
              onClick={() => toggleFavorite(currentTrack.trackhash)}
              aria-label={fav ? "Remove from favorites" : "Add to favorites"}
              className={cn("ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-colors", fav ? "bg-primary/15 text-primary" : "text-muted-foreground/45 hover:bg-white/[0.06] hover:text-foreground")}
            >
              <Heart className={cn("size-4", fav && "fill-primary")} />
            </button>
          </>
        ) : (
          <p className="text-[12px] font-medium text-muted-foreground/45">Aucune lecture</p>
        )}
      </div>

      {/* Center: transport controls (the scrubber now lives on its own row below) */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShuffle}
            aria-label="Shuffle"
            className={cn("grid h-9 w-9 place-items-center rounded-[11px] transition-colors", shuffle ? "bg-primary/15 text-primary" : "text-muted-foreground/45 hover:bg-white/[0.06] hover:text-foreground")}
          >
            <Shuffle className="size-4" />
          </button>
          <button
            onClick={playPrev}
            disabled={!currentTrack}
            aria-label="Previous"
            className="grid h-9 w-9 place-items-center rounded-[11px] text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
          >
            <SkipBack className="size-[18px] fill-current" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="signal-button grid h-10 w-10 place-items-center rounded-[12px] transition-[filter,transform] active:translate-y-px disabled:opacity-30"
          >
            {isPlaying
              ? <Pause className="size-[18px] fill-current" />
              : <Play className="size-[18px] fill-current ml-0.5" />}
          </button>
          <button
            onClick={playNext}
            disabled={!currentTrack}
            aria-label="Next"
            className="grid h-9 w-9 place-items-center rounded-[11px] text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
          >
            <SkipForward className="size-[18px] fill-current" />
          </button>
          <button
            onClick={cycleRepeat}
            aria-label="Repeat"
            className={cn("grid h-9 w-9 place-items-center rounded-[11px] transition-colors", repeat !== "off" ? "bg-primary/15 text-primary" : "text-muted-foreground/45 hover:bg-white/[0.06] hover:text-foreground")}
          >
            {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </button>
        </div>
      </div>

      {/* Right: secondary controls */}
      <div className="flex min-w-0 items-center justify-end gap-2" style={{ flexBasis: "28%" }}>
        {/* Sleep timer */}
        <div className="relative">
          <button
            onClick={() => setSleepOpen((v) => !v)}
            aria-label="Sleep timer"
            className={cn("grid h-9 w-9 place-items-center rounded-[11px] transition-colors hover:bg-white/[0.06]", sleepTimer.active ? "bg-primary/15 text-primary" : "text-muted-foreground/45 hover:text-foreground")}
          >
            <Moon className="size-4" />
          </button>
          {sleepOpen && (
            <SleepPopover
              active={sleepTimer.active}
              minutes={sleepTimer.minutes}
              remaining={sleepRemaining}
              onPick={(m) => { startSleepTimer(m); setSleepOpen(false); }}
              onCancel={() => { cancelSleepTimer(); setSleepOpen(false); }}
              onClose={() => setSleepOpen(false)}
            />
          )}
        </div>

        <button
          onClick={toggleQueue}
          aria-label="Queue"
          className={cn("grid h-9 w-9 place-items-center rounded-[11px] transition-colors hover:bg-white/[0.06]", queueOpen ? "bg-primary/15 text-primary" : "text-muted-foreground/45 hover:text-foreground")}
        >
          <ListMusic className="size-4" />
        </button>

        {/* Volume */}
        <div className="hidden lg:flex items-center gap-2">
          <button
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="grid h-9 w-9 place-items-center rounded-[11px] text-muted-foreground/45 transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            {muted || vol === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <VolumeSlider value={vol} onChange={setVolume} />
        </div>

        <button
          onClick={toggleFullscreenPlayer}
          aria-label="Expand player"
          className="grid h-9 w-9 place-items-center rounded-[11px] text-muted-foreground/45 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
      </div>

      {/* Row 2 — scrubber, centred under the transport and pinned to the bottom edge */}
      <div className="mx-auto w-full pb-1.5" style={{ maxWidth: 520 }}>
        <PlayerScrubber onSeek={seek} disabled={!currentTrack} />
      </div>
    </footer>
  );
}

/** Position display + seek bar. Subscribes to the playhead store alone, so the rest
 * of the player bar stays static during playback. */
function PlayerScrubber({ onSeek, disabled }: { onSeek: (seconds: number) => void; disabled: boolean }) {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const [drag, setDrag] = useState<number | null>(null);
  // While dragging, show the dragged percentage; otherwise track real playback.
  const livePct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const value = drag ?? livePct;
  const shownPosition = drag !== null ? (drag / 100) * (duration || 0) : position;
  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground/55">{formatDuration(shownPosition)}</span>
      <ProgressBar
        value={value}
        onDrag={(pct) => setDrag(pct)}
        onCommit={(pct) => { onSeek((pct / 100) * (duration || 0)); setDrag(null); }}
        disabled={disabled}
      />
      <span className="w-8 text-[10px] tabular-nums text-muted-foreground/55">{formatDuration(duration)}</span>
    </div>
  );
}

/**
 * Fine, clean progress bar. Dragging is tracked via an internal pointer-capture
 * flag (NOT e.buttons, which is 0 for touch — that broke seeking on the phone).
 * The fill follows the finger live with no CSS transition so the scrub is fluid,
 * and the actual audio seek is committed once on release.
 */
function ProgressBar({
  value,
  onDrag,
  onCommit,
  disabled,
}: {
  value: number;
  onDrag: (pct: number) => void;
  onCommit: (pct: number) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);

  const compute = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  };
  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onDrag(compute(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return;
    e.preventDefault();
    onDrag(compute(e.clientX));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    onCommit(compute(e.clientX));
  };

  const active = hover || dragging;
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn("group relative flex-1 cursor-pointer py-2.5 touch-none", disabled && "pointer-events-none opacity-30")}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      {/* Track */}
      <div className={cn("relative w-full rounded-[2px]", !dragging && "transition-all", active ? "h-1" : "h-[3px]", "bg-white/[0.09]")}>
        {/* Fill — no transition while dragging so it tracks the finger exactly */}
        <div
          className={cn("absolute inset-y-0 left-0 rounded-[2px]", !dragging && "transition-all")}
          style={{ width: `${value}%`, background: active ? "var(--paper)" : "rgba(237,227,207,0.58)" }}
        />
        {/* Thumb */}
        <div
          className={cn("pointer-events-none absolute top-1/2 h-3 w-2 -translate-y-1/2 rounded-[2px] bg-[var(--paper)]", !dragging && "transition-opacity")}
          style={{ left: `calc(${value}% - 6px)`, opacity: active ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const compute = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onChange(compute(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    onChange(compute(e.clientX));
  };

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative h-[3px] w-20 cursor-pointer rounded-[2px] bg-white/[0.09]"
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-[2px]"
        style={{ width: `${value * 100}%`, background: hover ? "var(--paper)" : "rgba(237,227,207,0.5)" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-2.5 w-1.5 -translate-y-1/2 rounded-[2px] bg-[var(--paper)]"
        style={{ left: `calc(${value * 100}% - 5px)`, opacity: hover ? 1 : 0 }}
      />
    </div>
  );
}

function SleepPopover({ active, minutes, remaining, onPick, onCancel, onClose }: {
  active: boolean; minutes: number; remaining: string;
  onPick: (m: number) => void; onCancel: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const options = [5, 10, 15, 30, 45, 60];
  return (
    <div
      ref={ref}
      className="matte-panel absolute bottom-10 right-0 z-40 w-[208px] overflow-hidden rounded-[13px] p-2"
    >
      <div className="flex items-center justify-between px-1.5 py-1 mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground">Sleep timer</p>
        {active && remaining && (
          <span className="rounded-[9px] bg-primary/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary-soft">
            {remaining}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {options.map((m) => (
          <button
            key={m}
            onClick={() => onPick(m)}
            className={cn(
              "rounded-[9px] py-1.5 text-[12px] font-semibold transition-colors",
              active && minutes === m ? "bg-primary text-black" : "bg-white/[0.05] text-foreground hover:bg-white/[0.09]",
            )}
          >
            {m}m
          </button>
        ))}
      </div>
      {active && (
        <button
          onClick={onCancel}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-[9px] bg-white/[0.04] py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
        >
          <X className="size-3" /> Cancel
        </button>
      )}
    </div>
  );
}
