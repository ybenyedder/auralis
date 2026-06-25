"use client";

import { useMemo, useState } from "react";
import { Heart, Play, Shuffle, ArrowDownUp } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { formatLongDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";

type SortMode = "recent" | "az" | "za" | "artist" | "plays";

const SORT_LABELS: Record<SortMode, string> = {
  recent: "Récents",
  az: "A → Z",
  za: "Z → A",
  artist: "Artiste",
  plays: "Écoutes",
};

export function FavoritesView() {
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const favorites = usePlayer((s) => s.favorites);
  const tracks = useLibraryStore((s) => s.tracks);
  const [sort, setSort] = useState<SortMode>("recent");

  // Drive the list off the live `favorites` set ONLY. The old `|| track.is_favorite`
  // fallback used the server flag baked into the track object, which stays true
  // after you unfavourite — so the row never disappeared. The set is hydrated from
  // the server and updated optimistically, so it is the source of truth.
  const allFavTracks = useMemo(
    () => tracks.filter((track) => favorites.has(track.trackhash)),
    [favorites, tracks],
  );

  const favTracks = useMemo(() => {
    const next = [...allFavTracks];
    if (sort === "az") next.sort((a, b) => trackTitle(a).localeCompare(trackTitle(b), undefined, { numeric: true }));
    else if (sort === "za") next.sort((a, b) => trackTitle(b).localeCompare(trackTitle(a), undefined, { numeric: true }));
    else if (sort === "artist") next.sort((a, b) => trackArtist(a).localeCompare(trackArtist(b), undefined, { numeric: true }));
    else if (sort === "plays") next.sort((a, b) => (b.playcount || 0) - (a.playcount || 0));
    return next;
  }, [allFavTracks, sort]);

  const totalDuration = favTracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  return (
    <div className="fade-up">
      <section className="hero-cover px-4 pb-6 pt-7 lg:px-6 lg:pt-8">
        <div className="flex flex-col items-center text-center lg:flex-row lg:items-end lg:gap-5 lg:text-left">
          <div className="grid size-20 place-items-center rounded-full bg-[var(--primary)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] lg:size-28">
            <Heart className="size-8 fill-[var(--ink)] text-[var(--ink)] lg:size-11" />
          </div>
          <div className="mt-3 min-w-0 lg:mt-0 lg:pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">Sélection</p>
            <h1 className="mt-1 text-[26px] font-black leading-none tracking-tight text-foreground lg:text-[40px]">Favoris</h1>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {favTracks.length} titres · {formatLongDuration(totalDuration)}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
          <button
            onClick={() => favTracks.length && playList(favTracks, 0)}
            disabled={favTracks.length === 0}
            className="signal-button flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-black transition-all duration-200 hover:scale-105 shadow-[0_4px_12px_rgba(0,0,0,0.2)] disabled:opacity-40 lg:min-h-0 lg:flex-none lg:py-2.5"
          >
            <Play className="size-4 fill-current" /> Lire
          </button>
          <button
            onClick={() => favTracks.length && playList(shuffleArray(favTracks), 0)}
            disabled={favTracks.length === 0}
            className="ghost-button flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-bold transition-all duration-200 hover:scale-105 disabled:opacity-40 lg:min-h-0 lg:flex-none lg:py-2.5"
          >
            <Shuffle className="size-4" /> Aléatoire
          </button>
          {favTracks.length > 0 && (
            <div className="matte-panel flex min-h-[40px] w-full items-center gap-1 rounded-full p-0.5 lg:ml-1 lg:min-h-0 lg:w-auto">
              <ArrowDownUp className="ml-1.5 size-3 text-muted-foreground/70" />
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="flex-1 cursor-pointer bg-transparent px-1.5 py-1.5 text-[12.5px] font-semibold text-muted-foreground outline-none lg:flex-none lg:py-1 lg:text-[11.5px]"
                aria-label="Trier les favoris"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value} className="bg-[var(--panel-2)]">{label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        {favTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-dashed border-[var(--line-strong)]">
              <Heart className="size-7 text-muted-foreground/60" />
            </div>
            <p className="text-[14px] font-bold text-muted-foreground">Aucun favori pour l’instant</p>
            <p className="max-w-xs text-[12.5px] text-muted-foreground/70">Touche le cœur sur un titre pour le retrouver ici.</p>
            <button
              onClick={() => navigate("library")}
              className="signal-button tap-press mt-1 flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-black transition-all duration-200 hover:scale-105 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
            >
              <Play className="size-4 fill-current" /> Parcourir la bibliothèque
            </button>
          </div>
        ) : (
          <>
            <TrackListHeader />
            <div className="space-y-0.5">
              {favTracks.map((track, index) => (
                <TrackRow key={track.trackhash} track={track} index={index} list={favTracks} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
