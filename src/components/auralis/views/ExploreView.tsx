"use client";

import { useMemo } from "react";
import { Search, X } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";

export function ExploreView() {
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const query = searchQuery.trim().toLowerCase();

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
          <div className="matte-panel flex items-center gap-2 rounded-[13px] px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher titres, artistes, albums"
              className="min-h-[28px] w-full bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/70 outline-none lg:text-[14px]"
            />
          </div>
        </div>

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
        <div className="matte-panel flex items-center gap-2 rounded-[13px] border-primary/30 px-4 py-3">
          <Search className="size-4 text-primary-soft" />
          <input
            value={searchQuery}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher"
            className="min-h-[28px] w-full bg-transparent text-[16px] text-foreground outline-none lg:text-[14px]"
          />
          <button
            onClick={() => setSearch("")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground lg:h-6 lg:w-6 lg:rounded-[9px]"
            aria-label="Effacer"
          >
            <X className="size-4 lg:size-3.5" />
          </button>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center lg:py-20">
          <div className="grid h-16 w-16 place-items-center rounded-[13px] border border-dashed border-[var(--line-strong)]">
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
