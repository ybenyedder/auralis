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
  Mic2,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "./Artwork";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

export function PlayerBar() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const repeat = usePlayer((s) => s.repeat);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const playPrev = usePlayer((s) => s.playPrev);
  const seek = usePlayer((s) => s.seek);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const navigate = usePlayer((s) => s.navigate);
  const toggleFullscreenPlayer = usePlayer((s) => s.toggleFullscreenPlayer);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const sleepTimer = usePlayer((s) => s.sleepTimer);
  const startSleepTimer = usePlayer((s) => s.startSleepTimer);
  const sleepAfterTrack = usePlayer((s) => s.sleepAfterTrack);
  const cancelSleepTimer = usePlayer((s) => s.cancelSleepTimer);

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
  // Atomic, reactive read: subscribe to the favorites set itself so toggling the
  // heart re-renders this bar. Selecting the stable isFavorite fn ref never did.
  const fav = usePlayer((s) => (currentTrack ? s.favorites.has(currentTrack.trackhash) : false));

  return (
    <footer className="relative z-30 flex h-full w-full items-center justify-between bg-[var(--sidebar)] px-4">
      {/* Left: Track Info */}
      <div className="flex min-w-0 items-center justify-start gap-4" style={{ width: "30%" }}>
        {currentTrack ? (
          <>
            <button onClick={toggleFullscreenPlayer} aria-label="Agrandir" className="shrink-0 group relative overflow-hidden rounded-sm">
              <Artwork
                title={currentTrack.title}
                trackhash={currentTrack.trackhash}
                size={56}
                rounded={8}
                colors={currentTrack.color}
                image={currentTrack.image}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 className="size-5 text-white" />
              </div>
            </button>
            <div className="flex min-w-0 flex-col justify-center">
              <button
                onClick={toggleFullscreenPlayer}
                className="block truncate text-left text-[14px] font-medium text-white transition-colors hover:underline"
              >
                {trackTitle(currentTrack)}
              </button>
              {currentTrack.artists?.[0]?.artisthash ? (
                <button
                  onClick={() => {
                    const h = currentTrack.artists?.[0]?.artisthash;
                    if (h) navigate("artist", h);
                  }}
                  className="block truncate text-left text-[12px] text-[var(--text-muted)] transition-colors hover:text-white hover:underline"
                >
                  {trackArtist(currentTrack)}
                </button>
              ) : (
                <p className="block truncate text-left text-[12px] text-[var(--text-muted)]">
                  {trackArtist(currentTrack)}
                </p>
              )}
            </div>
            <button
              onClick={() => toggleFavorite(currentTrack.trackhash)}
              aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
              className="ml-2 flex shrink-0 items-center justify-center"
            >
              <Heart className={cn("size-4", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")} />
            </button>
          </>
        ) : (
          <p className="text-[14px] font-medium text-[var(--text-muted)]">Aucune lecture</p>
        )}
      </div>

      {/* Center: Controls & Scrubber */}
      <div className="flex flex-col items-center justify-center max-w-[722px]" style={{ width: "40%" }}>
        <div className="flex w-full items-center justify-center gap-5 mb-1">
          <button
            onClick={toggleShuffle}
            aria-label="Lecture aléatoire"
            className={cn("flex items-center justify-center transition-colors hover:text-white", shuffle ? "text-[var(--primary)]" : "text-[var(--text-muted)]")}
          >
            <Shuffle className="size-4" />
          </button>
          <button
            onClick={playPrev}
            disabled={!currentTrack}
            aria-label="Précédent"
            className="flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-white disabled:opacity-30 disabled:hover:text-[var(--text-muted)]"
          >
            <SkipBack className="size-5 fill-current" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!currentTrack}
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-black transition-transform duration-100 hover:scale-105 active:scale-100 disabled:opacity-30 disabled:hover:scale-100"
          >
            {isPlaying
              ? <Pause className="size-4 fill-current" />
              : <Play className="size-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={playNext}
            disabled={!currentTrack}
            aria-label="Suivant"
            className="flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-white disabled:opacity-30 disabled:hover:text-[var(--text-muted)]"
          >
            <SkipForward className="size-5 fill-current" />
          </button>
          <button
            onClick={cycleRepeat}
            aria-label="Répéter"
            className={cn("flex items-center justify-center transition-colors hover:text-white", repeat !== "off" ? "text-[var(--primary)]" : "text-[var(--text-muted)]")}
          >
            {repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </button>
        </div>
        <div className="w-full flex items-center justify-center">
          <PlayerScrubber onSeek={seek} disabled={!currentTrack} />
        </div>
      </div>

      {/* Right: Secondary Controls */}
      <div className="flex min-w-0 items-center justify-end gap-3" style={{ width: "30%" }}>
        {/* Sleep timer */}
        <div className="relative">
          <button
            onClick={() => setSleepOpen((v) => !v)}
            aria-label="Minuteur de veille"
            className={cn("flex items-center justify-center transition-colors", sleepTimer.active ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")}
          >
            <Moon className="size-[18px]" />
          </button>
          {sleepOpen && (
            <SleepPopover
              active={sleepTimer.active}
              minutes={sleepTimer.minutes}
              remaining={sleepRemaining}
              afterTrackActive={sleepTimer.endOfTrack ?? false}
              onPick={(m) => { startSleepTimer(m); setSleepOpen(false); }}
              onAfterTrack={() => { sleepAfterTrack(); setSleepOpen(false); }}
              onCancel={() => { cancelSleepTimer(); setSleepOpen(false); }}
              onClose={() => setSleepOpen(false)}
            />
          )}
        </div>

        <button
          onClick={toggleLyrics}
          aria-label="Paroles"
          aria-pressed={lyricsOpen}
          className={cn("flex items-center justify-center transition-colors", lyricsOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")}
        >
          <Mic2 className="size-[18px]" />
        </button>

        <button
          onClick={toggleQueue}
          aria-label="File d'attente"
          aria-pressed={queueOpen}
          className={cn("flex items-center justify-center transition-colors", queueOpen ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")}
        >
          <ListMusic className="size-[18px]" />
        </button>

        {/* Volume */}
        <div className="flex items-center gap-2 group w-[125px]">
          <button
            onClick={toggleMute}
            aria-label={muted ? "Rétablir le son" : "Couper le son"}
            className="flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-white"
          >
            {muted || vol === 0 ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </button>
          <VolumeSlider value={vol} onChange={setVolume} />
        </div>

        <button
          onClick={toggleFullscreenPlayer}
          aria-label="Plein écran"
          className="flex items-center justify-center text-[var(--text-muted)] transition-colors hover:text-white"
        >
          <Maximize2 className="size-[16px]" />
        </button>
      </div>
    </footer>
  );
}

function PlayerScrubber({ onSeek, disabled }: { onSeek: (seconds: number) => void; disabled: boolean }) {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const [drag, setDrag] = useState<number | null>(null);
  const livePct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const value = drag ?? livePct;
  const shownPosition = drag !== null ? (drag / 100) * (duration || 0) : position;
  
  return (
    <div className="flex w-full max-w-full items-center gap-2">
      <span className="w-10 text-right text-[11px] font-medium text-[var(--text-muted)]">{formatDuration(shownPosition)}</span>
      <ProgressBar
        value={value}
        onDrag={(pct) => setDrag(pct)}
        onCommit={(pct) => { onSeek((pct / 100) * (duration || 0)); setDrag(null); }}
        disabled={disabled}
      />
      <span className="w-10 text-left text-[11px] font-medium text-[var(--text-muted)]">{formatDuration(duration)}</span>
    </div>
  );
}

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
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(100, value + 5);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, value - 5);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(next);
  };
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="slider"
      aria-label="Position de lecture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      tabIndex={disabled ? -1 : 0}
      className={cn("group relative flex flex-1 items-center justify-center cursor-pointer h-4 touch-none focus-auralis rounded-full", disabled && "pointer-events-none opacity-30")}
    >
      <div className={cn("relative w-full rounded-full bg-[#4d4d4d]", "h-[4px]")}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${value}%`, background: active ? "var(--primary)" : "#ffffff" }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 aspect-square rounded-full bg-white transition-all ease-out"
          style={{ 
            left: `calc(${value}% - 6px)`, 
            height: active ? "12px" : "0px",
            opacity: active ? 1 : 0 
          }}
        />
      </div>
    </div>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const compute = (clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(compute(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    onChange(compute(e.clientX));
  };
  const onUp = () => setDragging(false);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowUp") onChange(Math.min(1, value + 0.05));
    else if (k === "ArrowLeft" || k === "ArrowDown") onChange(Math.max(0, value - 0.05));
    else if (k === "Home") onChange(0);
    else if (k === "End") onChange(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const active = hover || dragging;
  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative flex items-center w-full cursor-pointer h-4 touch-none focus-auralis rounded-full"
      tabIndex={0}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)} %`}
    >
      <div className="relative w-full rounded-full bg-[#4d4d4d] h-[4px]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${value * 100}%`, background: active ? "var(--primary)" : "#ffffff" }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 aspect-square rounded-full bg-white transition-all ease-out"
          style={{ 
            left: `calc(${value * 100}% - 6px)`, 
            height: active ? "12px" : "0px",
            opacity: active ? 1 : 0 
          }}
        />
      </div>
    </div>
  );
}

function SleepPopover({ active, minutes, remaining, afterTrackActive, onPick, onAfterTrack, onCancel, onClose }: {
  active: boolean; minutes: number; remaining: string; afterTrackActive: boolean;
  onPick: (m: number) => void; onAfterTrack: () => void; onCancel: () => void; onClose: () => void;
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
      className="absolute bottom-10 right-0 z-40 w-[208px] overflow-hidden rounded-lg bg-[var(--popover)] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      <div className="flex items-center justify-between px-1.5 py-1 mb-1">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">Minuteur de veille</p>
        {active && remaining && (
          <span className="rounded-sm bg-black/30 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--primary)]">
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
              "rounded-sm py-1.5 text-[12px] font-semibold transition-colors",
              active && !afterTrackActive && minutes === m ? "bg-[var(--primary)] text-black" : "bg-[var(--panel-3)] text-white hover:bg-[var(--accent)]"
            )}
          >
            {m}m
          </button>
        ))}
      </div>
      <button
        onClick={onAfterTrack}
        className={cn(
          "mt-1 w-full rounded-sm py-1.5 text-[11.5px] font-semibold transition-colors",
          afterTrackActive ? "bg-[var(--primary)] text-black" : "bg-[var(--panel-3)] text-white hover:bg-[var(--accent)]"
        )}
      >
        Fin du titre
      </button>
      {active && (
        <button
          onClick={onCancel}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-sm bg-[var(--panel-3)] py-1.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent)] hover:text-white"
        >
          <X className="size-3" /> Annuler
        </button>
      )}
    </div>
  );
}
