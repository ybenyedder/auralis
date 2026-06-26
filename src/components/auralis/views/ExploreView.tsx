"use client";

import { useMemo, useDeferredValue } from "react";
import { Search, X } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { paletteForName } from "@/lib/auralis/brand";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";
import { MoodMixes } from "../MoodMixes";

export function ExploreView() {
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const playList = usePlayer((s) => s.playList);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const query = searchQuery.trim().toLowerCase();
  const deferredQuery = useDeferredValue(query);

  // Genre "mixes": one card per well-represented genre, plays a shuffle of it.
  const genreMixes = useMemo(() => {
    const byGenre = new Map<string, typeof tracks>();
    for (const t of tracks) {
      if (!t.genre) continue;
      const arr = byGenre.get(t.genre) ?? [];
      arr.push(t);
      byGenre.set(t.genre, arr);
    }
    return [...byGenre.entries()]
      .filter(([, arr]) => arr.length >= 5)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([genre, arr]) => ({ genre, tracks: arr }));
  }, [tracks]);

  const results = useMemo(() => {
    if (!deferredQuery) return null;
    const foundTracks = tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(deferredQuery) ||
        (track.artist || "").toLowerCase().includes(deferredQuery) ||
        (track.album || "").toLowerCase().includes(deferredQuery) ||
        (track.genre || "").toLowerCase().includes(deferredQuery),
    );
    const foundAlbums = albums.filter(
      (album) => album.title.toLowerCase().includes(deferredQuery) || album.albumartists.some((artist) => artist.name.toLowerCase().includes(deferredQuery)),
    );
    const foundArtists = artists.filter(
      (artist) => artist.name.toLowerCase().includes(deferredQuery) || artist.genres?.some((genre) => genre.toLowerCase().includes(deferredQuery)),
    );
    return { tracks: foundTracks, albums: foundAlbums, artists: foundArtists };
  }, [albums, artists, deferredQuery, tracks]);

  if (!query) {
    return (
      <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
        <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 bg-[var(--background)] px-4 lg:static lg:mx-0 lg:mb-6 lg:bg-transparent lg:px-0 pt-4">
          <div className="flex items-center gap-2 rounded-full px-5 py-3 bg-[var(--panel-2)] border border-transparent hover:bg-[var(--panel-2)] hover:border-[var(--panel-3)] focus-within:border-white transition-all h-12 max-w-[360px]">
            <Search className="size-5 text-[var(--text-muted)]" />
            <input
              type="search"
              aria-label="Que souhaitez-vous écouter ?"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Que souhaitez-vous écouter ?"
              className="min-h-[28px] w-full bg-transparent text-[14px] font-medium text-white placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
        </div>

        <MoodMixes />

        {genreMixes.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-black tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {genreMixes.map(({ genre, tracks: gt }) => {
                const [c0, c1] = paletteForName(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => playList(shuffleArray(gt), 0)}
                    aria-label={`Lire un mix ${genre}`}
                    className="group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left transition-transform duration-200 hover:scale-[1.02]"
                    style={{ background: `linear-gradient(150deg, ${c0}, ${c1})` }}
                  >
                    <span className="block max-w-[80%] text-[18px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">{genre}</span>
                    {/* Tilted thumbnail in the bottom-right corner — Spotify's category-card motif. */}
                    <span
                      className="absolute -bottom-2 -right-3 h-[72px] w-[72px] rotate-[25deg] rounded-[4px] shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
                      style={{ background: `linear-gradient(135deg, ${c1}, ${c0})` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {genreMixes.length === 0 && albums.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-black tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {albums.slice(0, 12).map((album) => (
                <AlbumCard key={album.albumhash} album={album} />
              ))}
            </div>
          </div>
        )}

        {genreMixes.length === 0 && albums.length === 0 && artists.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-black tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {artists.slice(0, 12).map((artist) => (
                <ArtistCard key={artist.artisthash} artist={artist} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const empty = results && results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0;

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 bg-[var(--background)] px-4 lg:static lg:mx-0 lg:mb-6 lg:bg-transparent lg:px-0 pt-4">
        <div className="flex items-center gap-2 rounded-full px-5 py-3 bg-[var(--panel-2)] border border-transparent hover:bg-[var(--panel-2)] hover:border-[var(--panel-3)] focus-within:border-white transition-all h-12 max-w-[360px]">
          <Search className="size-5 text-[var(--text-muted)]" />
          <input
            type="search"
            aria-label="Que souhaitez-vous écouter ?"
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Que souhaitez-vous écouter ?"
            className="min-h-[28px] w-full bg-transparent text-[14px] font-medium text-white placeholder:text-[var(--text-muted)] outline-none"
          />
          <button
            onClick={() => setSearch("")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/10 hover:text-foreground lg:h-8 lg:w-8"
            aria-label="Effacer"
          >
            <X className="size-4 lg:size-3.5" />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center lg:py-20">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
            <Search className="size-7 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-bold text-muted-foreground">Aucun résultat pour “{searchQuery}”</p>
        </div>
      ) : (
        results && (
          <div className="space-y-8">
            {results.artists.length > 0 && (
              <section>
                <SectionHeader title="Artistes" eyebrow={`${results.artists.length} trouvés`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.artists.slice(0, 24).map((artist) => (
                    <ArtistCard key={artist.artisthash} artist={artist} />
                  ))}
                </div>
              </section>
            )}
            {results.albums.length > 0 && (
              <section>
                <SectionHeader title="Albums" eyebrow={`${results.albums.length} trouvés`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.albums.slice(0, 24).map((album) => (
                    <AlbumCard key={album.albumhash} album={album} />
                  ))}
                </div>
              </section>
            )}
            {results.tracks.length > 0 && (
              <section>
                <SectionHeader title="Titres" eyebrow={`${results.tracks.length} trouvés`} />
                <TrackListHeader />
                <div className="space-y-0.5">
                  {results.tracks.slice(0, 100).map((track, index) => (
                    <TrackRow key={track.trackhash} track={track} index={index} list={results.tracks} />
                  ))}
                </div>
                {results.tracks.length > 100 && (
                  <p className="mt-3 px-2 text-[12px] font-medium text-[var(--text-muted)]">+{results.tracks.length - 100} autres</p>
                )}
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
