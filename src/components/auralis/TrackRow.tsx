"use client";

import { memo, useState } from "react";
import { Play, Pause, Heart, MoreHorizontal, Clock3 } from "lucide-react";
import type { Track } from "@/lib/auralis/types";
import { usePlayer } from "@/store/player";
import { useTrackContextMenu } from "./ContextMenu";
import { Artwork } from "./Artwork";
import { EqualizerBars } from "./SectionHeader";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

interface TrackRowProps {
  track: Track;
  index?: number;
  list?: Track[];
  showAlbum?: boolean;
  showArt?: boolean;
  compact?: boolean;
  onPlay?: () => void;
}

// memo + atomic selectors: a row only re-renders when ITS own current/playing/
// favourite state flips — not on every unrelated store write (a long list used
// to re-render every row on each playhead tick / favourite toggle).
export const TrackRow = memo(function TrackRow({
  track,
  index,
  list,
  showAlbum = true,
  showArt = true,
  compact = false,
  onPlay,
}: TrackRowProps) {
  const isCurrent = usePlayer((s) => s.currentTrack?.trackhash === track.trackhash);
  const isCurrentPlaying = usePlayer((s) => s.isPlaying && s.currentTrack?.trackhash === track.trackhash);
  const fav = usePlayer((s) => s.favorites.has(track.trackhash));
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playTrack = usePlayer((s) => s.playTrack);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  const onContext = useTrackContextMenu();
  // Transient heart-pop, fired only when ADDING to favourites (cleared on
  // animationend so it replays next time and never runs on mount/scroll).
  const [pop, setPop] = useState(false);

  const onFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fav) setPop(true);
    toggleFavorite(track.trackhash);
  };

  const handlePlay = () => {
    if (isCurrent) togglePlay();
    else if (onPlay) onPlay();
    else playTrack(track, list ?? [track], list ? index : 0);
  };

  const onMore = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom + 4, track);
  };

  return (
    <div
      className={cn(
        "lazy-row group relative grid cursor-pointer items-center gap-3 rounded-[9px] px-2 transition-colors",
        compact ? "grid-cols-[20px_1fr_auto] py-1.5" : "grid-cols-[24px_minmax(0,1fr)_auto] py-2.5 lg:py-2",
        showAlbum && !compact && "md:grid-cols-[24px_minmax(0,1.6fr)_minmax(0,1fr)_auto]",
        isCurrent ? "bg-primary/12 text-foreground" : "active:bg-white/[0.06] lg:hover:bg-white/[0.045]",
      )}
      onClick={handlePlay}
      onContextMenu={(e) => onContext(e, track)}
    >
      {/* Index / play */}
      <div className="grid place-items-center">
        <button
          onClick={(e) => { e.stopPropagation(); handlePlay(); }}
          aria-label={isCurrentPlaying ? "Pause" : `Play ${trackTitle(track)}`}
          className="relative grid h-5 w-5 place-items-center"
        >
          {isCurrentPlaying ? (
            <>
              <span className="absolute inset-0 grid place-items-center opacity-100 group-hover:opacity-0">
                <EqualizerBars active className="h-3" />
              </span>
              <Pause className="size-3.5 fill-current text-foreground/80 opacity-0 group-hover:opacity-100" />
            </>
          ) : (
            <>
              <span className={cn("text-[12px] tabular-nums group-hover:opacity-0", isCurrent ? "text-foreground/80" : "text-muted-foreground/50")}>
                {typeof index === "number" ? index + 1 : ""}
              </span>
              <Play className="absolute size-3.5 fill-current text-foreground/80 opacity-0 group-hover:opacity-100" />
            </>
          )}
        </button>
      </div>

      {/* Title + art */}
      <div className="flex min-w-0 items-center gap-3">
        {showArt && (
          <Artwork
            title={track.title}
            trackhash={track.trackhash}
            size={compact ? 32 : 36}
            rounded={9}
            colors={track.color}
            image={track.image}
            className="track-art transition-transform shrink-0"
          />
        )}
        <div className="min-w-0">
          <p className={cn("truncate text-[14px] font-bold leading-snug lg:text-[13px]", isCurrent ? "text-primary" : "text-foreground/90")}>
            {trackTitle(track)}
          </p>
          <p className="truncate text-[12px] text-muted-foreground leading-snug mt-0.5 lg:text-[11.5px]">
            {trackArtist(track)}
          </p>
        </div>
      </div>

      {/* Album */}
      {showAlbum && !compact && (
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-[12px] text-muted-foreground/60">{track.album}</p>
        </div>
      )}

      {/* Actions + duration. On touch the controls are always reachable; on desktop
          the favorite/more affordances stay hover-revealed to keep rows quiet. */}
      <div className="flex items-center justify-end gap-0.5 lg:gap-1">
        <button
          onClick={onFav}
          aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
          className={cn(
            // Always reachable on touch (the old `hidden lg:grid` made favouriting
            // impossible on phones); hover-revealed on desktop to keep rows quiet.
            "grid h-9 w-9 place-items-center rounded-full transition-all lg:h-7 lg:w-7 lg:rounded-[9px]",
            fav
              ? "bg-primary/15 text-primary opacity-100"
              : "text-muted-foreground/45 opacity-100 hover:bg-white/[0.06] hover:text-foreground/70 lg:opacity-0 lg:group-hover:opacity-100",
          )}
        >
          <Heart className={cn("size-4 lg:size-3.5", fav && "fill-primary", pop && "heart-pop")} onAnimationEnd={() => setPop(false)} />
        </button>
        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground/50 lg:w-10">
          {formatDuration(track.duration)}
        </span>
        <button
          onClick={onMore}
          aria-label="Plus d'options"
          className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground/55 transition-all hover:bg-white/[0.06] hover:text-foreground/70 lg:h-7 lg:w-7 lg:rounded-[9px] lg:text-muted-foreground/40 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <MoreHorizontal className="size-4 lg:size-3.5" />
        </button>
      </div>
    </div>
  );
});

export function TrackListHeader() {
  return (
    <div className="mb-1 hidden grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] px-2 pb-2 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/45 lg:grid md:grid-cols-[24px_minmax(0,1.6fr)_minmax(0,1fr)_auto]">
      <div className="text-center">#</div>
      <div>Titre</div>
      <div className="hidden md:block">Album</div>
      <div className="flex items-center justify-end">
        <Clock3 className="size-3" />
      </div>
    </div>
  );
}
