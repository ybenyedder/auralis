"use client";

import { useMemo } from "react";
import { Compass } from "lucide-react";
import { shuffleArray } from "@/store/slices/helpers";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { paletteForName } from "@/lib/auralis/brand";
import { useT } from "@/lib/auralis/i18n";
import { AlbumCard, ArtistCard } from "../Cards";
import { MoodMixes } from "../MoodMixes";
import { SkeletonCategoryGrid } from "../Skeletons";

/**
 * "Parcourir" — the Browse root tab (Apple Music style). This is a DISCOVERY
 * screen: mood mixes, genre shelves and entry points into the catalogue. It is
 * deliberately distinct from the "Rechercher" tab (SearchView): no search field
 * lives here, so the two dock tabs can never be confused with each other.
 */
export function BrowseView() {
  const t = useT();
  const playList = usePlayer((s) => s.playList);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const status = useLibraryStore((s) => s.status);

  // Genre "mixes": one card per well-represented genre, plays a shuffle of it.
  const genreMixes = useMemo(() => {
    const byGenre = new Map<string, typeof tracks>();
    for (const tr of tracks) {
      if (!tr.genre) continue;
      const arr = byGenre.get(tr.genre) ?? [];
      arr.push(tr);
      byGenre.set(tr.genre, arr);
    }
    return [...byGenre.entries()]
      .filter(([, arr]) => arr.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([genre, arr]) => ({ genre, tracks: arr }));
  }, [tracks]);

  const loading = (status === "idle" || status === "loading") && albums.length === 0 && artists.length === 0;
  const browseAll = t("search.browseAll", "Parcourir tout");

  return (
    <div className="fade-up px-4 pb-6 pt-3 lg:px-6 lg:pt-5">
      {/* iOS Large Title */}
      <h1 className="mb-5 text-[28px] font-black tracking-tight text-foreground lg:text-[34px]">
        {t("mobile.browse", "Parcourir")}
      </h1>

      <MoodMixes />

      {/* Cold start: nothing has resolved yet — show a category-grid skeleton under
          the section title instead of an empty page that reads as broken on mobile. */}
      {loading && (
        <div className="mb-7 lg:mb-8">
          <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{browseAll}</h2>
          <SkeletonCategoryGrid />
        </div>
      )}

      {genreMixes.length > 0 && (
        <div className="mb-7 lg:mb-8">
          <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{browseAll}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {genreMixes.map(({ genre, tracks: gt }) => {
              const [c0, c1] = paletteForName(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => playList(shuffleArray(gt), 0)}
                  aria-label={t("common.play", "Lire") + ` — ${genre}`}
                  className="tap-press group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left"
                  style={{ background: c0 }}
                >
                  <span className="pointer-events-none absolute inset-0 bg-black/20" aria-hidden />
                  <span className="pointer-events-none relative block max-w-[80%] text-[18px] font-black leading-tight text-white">{genre}</span>
                  {/* Tilted thumbnail in the bottom-right corner — Spotify's category-card motif. */}
                  <span
                    className="pointer-events-none absolute -bottom-2 -right-3 h-[72px] w-[72px] rotate-[25deg] rounded-xs border border-black/20"
                    style={{ background: c1 }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback shelves when there aren't enough tagged genres to build mixes. */}
      {genreMixes.length === 0 && albums.length > 0 && (
        <div className="mb-7 lg:mb-8">
          <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{browseAll}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {albums.slice(0, 12).map((album) => (
              <AlbumCard key={album.albumhash} album={album} />
            ))}
          </div>
        </div>
      )}

      {genreMixes.length === 0 && albums.length === 0 && artists.length > 0 && (
        <div className="mb-7 lg:mb-8">
          <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{browseAll}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {artists.slice(0, 12).map((artist) => (
              <ArtistCard key={artist.artisthash} artist={artist} />
            ))}
          </div>
        </div>
      )}

      {!loading && genreMixes.length === 0 && albums.length === 0 && artists.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
            <Compass className="size-7 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-bold text-muted-foreground">
            {t("radio.empty", "Aucun contenu disponible")}
          </p>
        </div>
      )}
    </div>
  );
}
