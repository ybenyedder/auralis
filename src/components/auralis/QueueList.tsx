"use client";

import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, X, Trash2 } from "lucide-react";
import { usePlayer } from "@/store/player";
import { Artwork } from "./Artwork";
import { EqualizerBars } from "./SectionHeader";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/auralis/types";

export function QueueList({ maxHeight }: { maxHeight?: string }) {
  const { shuffledQueue, currentIndex, isPlaying, jumpToQueueIndex, removeFromQueue, reorderQueue, clearQueue } = usePlayer();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 py-2 lg:py-2">
        <p className="text-[12px] font-black uppercase tracking-[0.12em] text-muted-foreground lg:text-[11px]">{shuffledQueue.length} titres</p>
        <button
          onClick={clearQueue}
          className="tap-press flex min-h-[40px] items-center gap-1.5 rounded-[9px] px-2.5 py-1 text-[12px] font-bold text-muted-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground lg:min-h-0 lg:gap-1 lg:text-[10.5px]"
        >
          <Trash2 className="size-3.5 lg:size-3" /> Nettoyer
        </button>
      </div>
      <div
        className="min-h-0 flex-1 px-2 pb-4 lg:overflow-y-auto lg:scroll-auralis lg:[max-height:var(--queue-max-h)]"
        style={maxHeight ? ({ "--queue-max-h": maxHeight } as CSSProperties) : undefined}
      >
        {shuffledQueue.length === 0 ? (
          <div className="flex h-28 items-center justify-center text-center text-[12px] text-muted-foreground/50">La file est vide.</div>
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
        "group flex items-center gap-2 rounded-[11px] px-2 py-1.5 transition-colors lg:py-2",
        active ? "bg-primary/12 text-foreground" : "hover:bg-white/[0.045]",
      )}
    >
      <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground/55 lg:text-[10px]">{index + 1}</span>
      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <Artwork title={track.title} trackhash={track.trackhash} size={32} rounded={9} colors={track.color} image={track.image} fluid className="size-9 lg:size-8" />
        <div className="min-w-0">
          <p className={cn("truncate text-[13px] font-bold leading-tight lg:text-[12px]", active ? "text-primary-soft" : "text-foreground")}>{trackTitle(track)}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground lg:text-[10.5px]">{trackArtist(track)}</p>
        </div>
      </button>
      {active ? <EqualizerBars active={isPlaying} className="h-3" /> : <span className="hidden text-[10px] tabular-nums text-muted-foreground/70 lg:inline">{formatDuration(track.duration)}</span>}
      <div className="flex items-center gap-0.5 lg:hidden lg:group-hover:flex">
        <button onClick={onMoveUp} disabled={!canMoveUp} className="tap-press grid size-10 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25 lg:size-6" aria-label="Monter dans la file">
          <ArrowUp className="size-4 lg:size-3" />
        </button>
        <button onClick={onMoveDown} disabled={!canMoveDown} className="tap-press grid size-10 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25 lg:size-6" aria-label="Descendre dans la file">
          <ArrowDown className="size-4 lg:size-3" />
        </button>
        <button onClick={onRemove} className="tap-press grid size-10 place-items-center rounded-[9px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground lg:size-6" aria-label="Remove from queue">
          <X className="size-4 lg:size-3" />
        </button>
      </div>
    </div>
  );
}
