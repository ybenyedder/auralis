"use client";

import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, X, Trash2, Shuffle } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { Artwork } from "./Artwork";
import { EqualizerBars } from "./SectionHeader";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/auralis/types";

export function QueueList({ maxHeight }: { maxHeight?: string }) {
  const shuffledQueue = usePlayer((s) => s.shuffledQueue);
  const currentIndex = usePlayer((s) => s.currentIndex);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const jumpToQueueIndex = usePlayer((s) => s.jumpToQueueIndex);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const reorderQueue = usePlayer((s) => s.reorderQueue);
  const clearQueue = usePlayer((s) => s.clearQueue);
  const playList = usePlayer((s) => s.playList);
  const libraryTracks = useLibraryStore((s) => s.tracks);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-2 lg:py-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground lg:text-[11px]">{shuffledQueue.length} titres</p>
        <button
          onClick={clearQueue}
          className="tap-press flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold text-muted-foreground/70 transition-all duration-200 hover:bg-white/[0.04] hover:text-foreground hover:scale-105 lg:min-h-0 lg:gap-1 lg:text-[10.5px]"
        >
          <Trash2 className="size-3.5 lg:size-3" /> Nettoyer
        </button>
      </div>
      <div
        className="min-h-0 flex-1 px-2 pb-4 lg:overflow-y-auto lg:scroll-auralis lg:[max-height:var(--queue-max-h)]"
        style={maxHeight ? ({ "--queue-max-h": maxHeight } as CSSProperties) : undefined}
      >
        {shuffledQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <p className="text-[12px] text-muted-foreground/60">La file est vide.</p>
            <button
              onClick={() => libraryTracks.length && playList(shuffleArray(libraryTracks), 0)}
              disabled={libraryTracks.length === 0}
              className="signal-button tap-press flex items-center gap-2 rounded-md px-4 py-2.5 text-[12.5px] font-black disabled:opacity-40"
            >
              <Shuffle className="size-4" /> Lecture aléatoire
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {shuffledQueue.map((track, index) => (
              <QueueRow
                key={`${track.trackhash}-${index}`}
                track={track}
                index={index}
                active={index === currentIndex}
                isPlaying={isPlaying}
                canMoveUp={index > 0}
                canMoveDown={index < shuffledQueue.length - 1}
                onPlay={() => jumpToQueueIndex(index)}
                onRemove={() => removeFromQueue(index)}
                onMoveUp={() => reorderQueue(index, index - 1)}
                onMoveDown={() => reorderQueue(index, index + 1)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueRow({
  track,
  index,
  active,
  isPlaying,
  canMoveUp,
  canMoveDown,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  track: Track;
  index: number;
  active: boolean;
  isPlaying: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-sm px-2 py-1.5 transition-all duration-200 lg:py-2 hover:bg-white/[0.10]",
        active && "text-foreground"
      )}
    >
      <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground lg:text-[10px]">{index + 1}</span>
      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Artwork title={track.title} trackhash={track.trackhash} size={32} rounded={4} colors={track.color} image={track.image} fluid className="size-9 lg:size-8" />
        <div className="min-w-0">
          <p className={cn("truncate text-[13px] font-bold leading-tight lg:text-[12px]", active ? "text-primary-soft" : "text-foreground")}>{trackTitle(track)}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground lg:text-[10.5px]">{trackArtist(track)}</p>
        </div>
      </button>
      {active ? <EqualizerBars active={isPlaying} className="h-3" /> : <span className="hidden text-[10px] tabular-nums text-muted-foreground lg:inline">{formatDuration(track.duration)}</span>}
      <div className="flex items-center gap-0.5 lg:hidden lg:group-hover:flex">
        <button onClick={onMoveUp} disabled={!canMoveUp} className="tap-press grid size-10 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-foreground disabled:opacity-25 lg:size-6" aria-label="Monter dans la file">
          <ArrowUp className="size-4 lg:size-3" />
        </button>
        <button onClick={onMoveDown} disabled={!canMoveDown} className="tap-press grid size-10 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-foreground disabled:opacity-25 lg:size-6" aria-label="Descendre dans la file">
          <ArrowDown className="size-4 lg:size-3" />
        </button>
        <button onClick={onRemove} className="tap-press grid size-10 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:text-foreground lg:size-6" aria-label="Retirer de la file">
          <X className="size-4 lg:size-3" />
        </button>
      </div>
    </div>
  );
}
