"use client";

import { useMemo } from "react";
import { Clock3, Play, History } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { SectionHeader } from "../SectionHeader";
import { TrackRow } from "../TrackRow";
import { Artwork } from "../Artwork";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";

export function RecentsView() {
  const playTrack = usePlayer((s) => s.playTrack);
  const navigate = usePlayer((s) => s.navigate);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const tracks = useLibraryStore((s) => s.tracks);

  const recent = useMemo(() => tracksForHashesFrom(tracks, recentTrackhashes), [recentTrackhashes, tracks]);
  const hasLive = recentTrackhashes.length > 0;
  const groups = useMemo(() => {
    if (recent.length === 0) return [];
    return [
      { label: "Dernières lectures", items: recent.slice(4, 10) },
      { label: "Plus ancien", items: recent.slice(10) },
    ].filter((group) => group.items.length > 0);
  }, [recent]);

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">Historique</p>
        <h1 className="flex items-center gap-2 text-[28px] font-black tracking-tight text-foreground">
          <Clock3 className="size-6 text-primary-soft" /> Récents
          {hasLive && (
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary-soft">
              {recent.length} lus
            </span>
          )}
        </h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
        {recent.slice(0, 4).map((track, index) => (
          <button
            key={`${track.trackhash}-${index}`}
            onClick={() => playTrack(track, recent, index)}
            aria-label={`Lire ${trackTitle(track)}`}
            className="group matte-panel tap-press relative flex items-center gap-3 overflow-hidden rounded-2xl p-2.5 text-left transition-all active:scale-[0.98] lg:hover:bg-white/[0.04]"
          >
            <Artwork title={track.title} trackhash={track.trackhash} size={44} rounded={10} colors={track.color} image={track.image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold leading-tight text-foreground lg:text-[12.5px]">{trackTitle(track)}</p>
              {/* Order label sits inline under the artist on mobile so it never overlaps the
                  title at narrow (~190px) card widths; floats to the corner on desktop. */}
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] leading-tight text-muted-foreground">
                <span className="truncate">{trackArtist(track)}</span>
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/55 lg:hidden">
                  {index === 0 ? "Latest" : `#${index + 1}`}
                </span>
              </p>
            </div>
            {/* Persistent, >=44px play target on touch; hover-revealed glyph on desktop. */}
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary transition-opacity lg:size-auto lg:bg-transparent lg:opacity-0 lg:group-hover:opacity-100">
              <Play className="size-4 fill-current" />
            </span>
            <span className="absolute right-2 top-2 hidden text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/60 lg:block">
              {index === 0 ? "Latest" : `${index + 1}`}
            </span>
          </button>
        ))}
        {recent.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-[var(--line-strong)]">
              <History className="size-6 text-muted-foreground/60" />
            </div>
            <p className="text-[13px] font-bold text-muted-foreground">Aucun historique réel pour l’instant</p>
            <p className="max-w-xs text-[12px] text-muted-foreground/70">Lance quelques titres : ils apparaîtront ici après écoute.</p>
            <button
              onClick={() => navigate("library")}
              className="signal-button tap-press mt-1 flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-black transition-all duration-200 hover:scale-105 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
            >
              <Play className="size-4 fill-current" /> Parcourir la bibliothèque
            </button>
          </div>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.label} className="mb-6">
          <SectionHeader title={group.label} eyebrow="Session" />
          <div className="space-y-0.5">
            {group.items.map((track, index) => (
              <TrackRow key={`${group.label}-${track.trackhash}-${index}`} track={track} index={index} list={group.items} compact />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
