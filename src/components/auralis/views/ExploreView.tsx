"use client";

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { paletteForName } from "@/lib/auralis/brand";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";

export function ExploreView() {
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const playList = usePlayer((s) => s.playList);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const query = searchQuery.trim().toLowerCase();

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
    if (!query) return null;
    const foundTracks = tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(query) ||
        (track.artist || "").toLowerCase().includes(query) ||
        (track.album || "").toLowerCase().includes(query) ||
        (track.genre || "").toLowerCase().includes(query),
    );
    const foundAlbums = albums.filter(
      (album) => album.title.toLowerCase().includes(query) || album.albumartists.some((artist) => artist.name.toLowerCase().includes(query)),
    );
    const foundArtists = artists.filter(
      (artist) => artist.name.toLowerCase().includes(query) || artist.genres?.some((genre) => genre.toLowerCase().includes(query)),
    );
    return { tracks: foundTracks, albums: foundAlbums, artists: foundArtists };
  }, [albums, artists, query, tracks]);

  const historyTracks = useMemo(
    () => tracksForHashesFrom(tracks, recentTrackhashes).slice(0, 12),
    [tracks, recentTrackhashes],
  );
  const previewTracks = tracks.slice(0, 8);

  if (!query) {
    return (
      <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
        <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 bg-background px-4 md:static md:mx-0 md:mb-6 md:bg-transparent md:px-0">
          <div className="matte-panel flex items-center gap-2 rounded-full px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] focus-within:ring-2 focus-within:ring-white/10 transition-all">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="search"
              aria-label="Rechercher titres, artistes, albums"
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher titres, artistes, albums"
              className="min-h-[28px] w-full bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/70 outline-none lg:text-[14px]"
            />
          </div>
        </div>

        {genreMixes.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <SectionHeader title="Tes mix par genre" eyebrow="Ambiances" />
            <div className="snap-x -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 xl:grid-cols-4">
              {genreMixes.map(({ genre, tracks: gt }) => {
                const [c0, c1, c2] = paletteForName(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => playList(shuffleArray(gt), 0)}
                    aria-label={`Lire un mix ${genre}`}
                    className="card-lift tap-press relative flex h-24 w-[160px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl border-none shadow-[0_4px_16px_rgba(0,0,0,0.15)] p-4 text-left lg:w-auto"
                    style={{ background: `radial-gradient(120% 90% at 15% 12%, ${c2}55, transparent 55%), linear-gradient(150deg, ${c0}, ${c1})` }}
                  >
                    <span className="truncate text-[14px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">{genre}</span>
                    <span className="mt-0.5 text-[11px] font-bold text-white/75">{gt.length} titres</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {historyTracks.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <SectionHeader title="Historique" eyebrow="Récemment écouté" />
            <div className="space-y-0.5">
              {historyTracks.map((track, index) => (
                <TrackRow key={track.trackhash} track={track} index={index} list={historyTracks} showAlbum={false} />
              ))}
            </div>
          </div>
        )}

        <SectionHeader title="Catalogue complet" eyebrow="Titres" />
        <TrackListHeader />
        <div className="space-y-0.5">
          {previewTracks.map((track, index) => (
            <TrackRow key={track.trackhash} track={track} index={index} list={previewTracks} />
          ))}
        </div>
      </div>
    );
  }

  const empty = results && results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0;

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 bg-background px-4 lg:static lg:mx-0 lg:mb-6 lg:bg-transparent lg:px-0">
        <div className="flex items-center gap-2 rounded-full border border-transparent bg-white/10 px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] focus-within:ring-2 focus-within:ring-white/10 transition-all">
          <Search className="size-4 text-primary-soft" />
          <input
            type="search"
            aria-label="Rechercher dans la bibliothèque"
            autoFocus
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher"
            className="min-h-[28px] w-full bg-transparent text-[16px] text-foreground outline-none lg:text-[14px]"
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
                  {results.artists.map((artist) => (
                    <ArtistCard key={artist.artisthash} artist={artist} />
                  ))}
                </div>
              </section>
            )}
            {results.albums.length > 0 && (
              <section>
                <SectionHeader title="Albums" eyebrow={`${results.albums.length} trouvés`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.albums.map((album) => (
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
                  {results.tracks.map((track, index) => (
                    <TrackRow key={track.trackhash} track={track} index={index} list={results.tracks} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}
