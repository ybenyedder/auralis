"use client";

import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { Search, X, Play, Loader2 } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore, artistPlayTotals } from "@/store/library";
import { api } from "@/lib/auralis/api";
import { paletteForName, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn, foldAccents } from "@/lib/utils";
import type { Track } from "@/lib/auralis/types";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";
import { Artwork } from "../Artwork";
import { VirtualList } from "../Virtualized";
import { MoodMixes } from "../MoodMixes";
import { SkeletonCategoryGrid } from "../Skeletons";

type ResultTab = "all" | "songs" | "albums" | "artists";

export function ExploreView() {
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const playCounts = usePlayer((s) => s.playCounts);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const rawArtists = useLibraryStore((s) => s.artists);
  const status = useLibraryStore((s) => s.status);
  const query = searchQuery.trim().toLowerCase();
  const deferredQuery = useDeferredValue(query);
  const [tab, setTab] = useState<ResultTab>("all");

  // The shared catalogue is user-independent (artist.playcount is always 0); derive
  // the per-user play total client-side so cards show "N écoutes", like the other views.
  const artists = useMemo(() => {
    const tally = artistPlayTotals(tracks, playCounts);
    return rawArtists.map((a) => ({ ...a, playcount: tally.get(a.artisthash) ?? 0 }));
  }, [rawArtists, tracks, playCounts]);

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

  // Server FTS5 search (ranked + diacritic-tolerant). Debounced; resolves hashes
  // back to the library's own Track instances so the rest of the UI (rows, context
  // menu, playback) gets identical objects. Null while idle or offline — the client
  // filter below is the fallback so search always works without the network.
  const [serverTracks, setServerTracks] = useState<Track[] | null>(null);
  // True while the server query is in flight — drives the discreet spinner in the
  // search bar. Only ever set from inside the debounce/fetch callbacks (async), and
  // gated on a non-empty query at render time, so a stale `true` is never visible.
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!deferredQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerTracks(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      setSearching(true);
      void api
        .get<{ tracks: Track[] }>(`/api/search?q=${encodeURIComponent(deferredQuery)}&limit=100`)
        .then((res) => {
          if (cancelled) return;
          const idx = useLibraryStore.getState().trackIndex;
          setServerTracks(res.tracks.map((t) => idx.get(t.trackhash) ?? t));
          setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          setServerTracks(null);
          setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [deferredQuery]);

  // Client fallback search (instant, offline, broad): folds accents like the server
  // index. Albums/artists are matched by their OWN names here, which is wider than
  // the server's (it only derives them from matching tracks).
  const results = useMemo(() => {
    if (!deferredQuery) return null;
    const q = foldAccents(deferredQuery);
    const foundTracks = tracks.filter(
      (track) =>
        foldAccents(track.title).includes(q) ||
        foldAccents(track.artist || "").includes(q) ||
        foldAccents(track.album || "").includes(q) ||
        foldAccents(track.genre || "").includes(q),
    );
    const foundAlbums = albums.filter(
      (album) =>
        foldAccents(album.title).includes(q) ||
        album.albumartists.some((artist) => foldAccents(artist.name).includes(q)),
    );
    const foundArtists = artists.filter(
      (artist) => foldAccents(artist.name).includes(q) || artist.genres?.some((genre) => foldAccents(genre).includes(q)),
    );
    return { tracks: foundTracks, albums: foundAlbums, artists: foundArtists };
  }, [albums, artists, deferredQuery, tracks]);

  // Track list = server ranking first (when available), then any client-only matches
  // appended, deduped. Falls back to pure client matches offline.
  const trackResults = useMemo(() => {
    const client = results?.tracks ?? [];
    if (!serverTracks || serverTracks.length === 0) return client;
    const seen = new Set(serverTracks.map((t) => t.trackhash));
    return [...serverTracks, ...client.filter((t) => !seen.has(t.trackhash))];
  }, [serverTracks, results]);

  // "Meilleur résultat": prefer an exact/prefix artist hit, then exact album, then
  // the top-ranked track, then whatever else surfaced — mirrors Spotify's top hit.
  const best = useMemo(() => {
    if (!results) return null;
    const q = foldAccents(deferredQuery);
    const artist =
      results.artists.find((a) => foldAccents(a.name) === q) ??
      results.artists.find((a) => foldAccents(a.name).startsWith(q));
    if (artist) return { type: "artist" as const, artist };
    const album = results.albums.find((a) => foldAccents(a.title) === q);
    if (album) return { type: "album" as const, album };
    if (trackResults[0]) return { type: "track" as const, track: trackResults[0] };
    if (results.artists[0]) return { type: "artist" as const, artist: results.artists[0] };
    if (results.albums[0]) return { type: "album" as const, album: results.albums[0] };
    return null;
  }, [results, trackResults, deferredQuery]);

  const searchBar = (sticky: boolean) => (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-5 py-3 bg-[var(--panel-2)] border border-transparent hover:bg-[var(--panel-3)] hover:border-[var(--panel-3)] focus-within:border-white transition-all h-12 max-w-[360px]",
      )}
    >
      <Search className="size-5 text-[var(--text-muted)]" />
      <input
        type="search"
        aria-label="Que souhaitez-vous écouter ?"
        value={searchQuery}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Que souhaitez-vous écouter ?"
        className="min-h-[28px] w-full bg-transparent text-[14px] font-medium text-white placeholder:text-[var(--text-muted)] outline-none"
      />
      {sticky && searching && query && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--text-muted)]" aria-label="Recherche en cours" />}
      {sticky && searchQuery && (
        <button
          onClick={() => setSearch("")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/10 hover:text-foreground lg:h-8 lg:w-8"
          aria-label="Effacer"
        >
          <X className="size-4 lg:size-3.5" />
        </button>
      )}
    </div>
  );

  if (!query) {
    return (
      <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
        <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 bg-[var(--background)] px-4 pt-4 md:hidden">
          {searchBar(false)}
        </div>

        <MoodMixes />

        {/* Cold start: nothing has resolved yet — show a category-grid skeleton under
            the section title instead of an empty page that reads as broken on mobile. */}
        {genreMixes.length === 0 && albums.length === 0 && artists.length === 0 && (status === "idle" || status === "loading") && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <SkeletonCategoryGrid />
          </div>
        )}

        {genreMixes.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {genreMixes.map(({ genre, tracks: gt }) => {
                const [c0, c1] = paletteForName(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => playList(shuffleArray(gt), 0)}
                    aria-label={`Lire un mix ${genre}`}
                    className="group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left"
                    style={{ background: c0 }}
                  >
                    <span className="absolute inset-0 bg-black/20" aria-hidden />
                    <span className="relative block max-w-[80%] text-[18px] font-black leading-tight text-white">{genre}</span>
                    {/* Tilted thumbnail in the bottom-right corner — Spotify's category-card motif. */}
                    <span
                      className="absolute -bottom-2 -right-3 h-[72px] w-[72px] rotate-[25deg] rounded-xs border border-black/20"
                      style={{ background: c1 }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {genreMixes.length === 0 && albums.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {albums.slice(0, 12).map((album) => (
                <AlbumCard key={album.albumhash} album={album} />
              ))}
            </div>
          </div>
        )}

        {genreMixes.length === 0 && albums.length === 0 && artists.length > 0 && (
          <div className="mb-7 lg:mb-8">
            <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Parcourir tout</h2>
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

  const empty = results && results.tracks.length === 0 && results.albums.length === 0 && results.artists.length === 0 && trackResults.length === 0;
  // `empty` only reflects the UNION of all categories — a query can have hits in
  // one category (e.g. songs) and none in another. Without this, switching to an
  // empty category's tab rendered a blank page: none of the tab-scoped sections
  // below match, and the "Aucun résultat" block only shows when `empty` is true.
  const emptyForTab =
    !!results &&
    !empty &&
    (tab === "songs" ? trackResults.length === 0
      : tab === "albums" ? results.albums.length === 0
      : tab === "artists" ? results.artists.length === 0
      : false);

  const TABS: { id: ResultTab; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "songs", label: "Titres" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artistes" },
  ];

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="safe-px sticky top-0 z-10 -mx-4 mb-4 bg-[var(--background)] px-4 lg:static lg:mx-0 lg:mb-5 lg:bg-transparent lg:px-0 pt-4">
        {searchBar(true)}
      </div>

      {!empty && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto scroll-hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors",
                tab === t.id ? "bg-white text-black" : "bg-[var(--panel-2)] text-foreground hover:bg-[var(--panel-3)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {empty || emptyForTab ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center lg:py-20">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
            <Search className="size-7 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-bold text-muted-foreground">
            {emptyForTab
              ? `Aucun résultat dans "${TABS.find((t) => t.id === tab)?.label}" pour “${searchQuery}”`
              : `Aucun résultat pour “${searchQuery}”`}
          </p>
        </div>
      ) : (
        results && (
          <div className="space-y-8">
            {/* Top hit + first few songs, like Spotify's two-column header. */}
            {tab === "all" && best && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <SectionHeader title="Meilleur résultat" />
                  <BestResult best={best} trackResults={trackResults} playList={playList} navigate={navigate} />
                </section>
                {trackResults.length > 0 && (
                  <section className="min-w-0">
                    <SectionHeader title="Titres" />
                    <div className="flex flex-col">
                      {trackResults.slice(0, 4).map((track, index) => (
                        <TrackRow key={track.trackhash} track={track} index={index} list={trackResults} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {(tab === "all" || tab === "artists") && results.artists.length > 0 && (
              <section>
                <SectionHeader title="Artistes" eyebrow={`${results.artists.length} trouvés`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.artists.slice(0, tab === "artists" ? 48 : 12).map((artist) => (
                    <ArtistCard key={artist.artisthash} artist={artist} />
                  ))}
                </div>
              </section>
            )}

            {(tab === "all" || tab === "albums") && results.albums.length > 0 && (
              <section>
                <SectionHeader title="Albums" eyebrow={`${results.albums.length} trouvés`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.albums.slice(0, tab === "albums" ? 48 : 12).map((album) => (
                    <AlbumCard key={album.albumhash} album={album} />
                  ))}
                </div>
              </section>
            )}

            {tab === "songs" && trackResults.length > 0 && (
              <section>
                <SectionHeader title="Titres" eyebrow={`${trackResults.length} trouvés`} />
                <TrackListHeader />
                <VirtualList items={trackResults} itemKey={(t) => t.trackhash} estimateHeight={56} gap={2}>
                  {(track, index) => <TrackRow track={track} index={index} list={trackResults} />}
                </VirtualList>
              </section>
            )}
          </div>
        )
      )}
    </div>
  );
}

type BestModel =
  | { type: "artist"; artist: import("@/lib/auralis/types").Artist }
  | { type: "album"; album: import("@/lib/auralis/types").Album }
  | { type: "track"; track: Track };

function BestResult({
  best,
  trackResults,
  playList,
  navigate,
}: {
  best: BestModel;
  trackResults: Track[];
  playList: (list: Track[], startIndex?: number) => void;
  navigate: (view: "album" | "artist", id?: string) => void;
}) {
  const round = best.type === "artist";
  const title = best.type === "artist" ? best.artist.name : best.type === "album" ? best.album.title : trackTitle(best.track);
  const subtitle =
    best.type === "artist" ? "Artiste" : best.type === "album" ? `Album · ${best.album.albumartists[0]?.name ?? ""}` : trackArtist(best.track);
  const colors =
    best.type === "track"
      ? best.track.color ?? paletteForName(best.track.trackhash)
      : best.type === "album"
        ? best.album.color ?? paletteForName(best.album.albumhash)
        : paletteForName(best.artist.artisthash);
  const image = best.type === "track" ? best.track.image : best.type === "album" ? best.album.image : best.artist.image;

  const onActivate = () => {
    if (best.type === "artist") navigate("artist", best.artist.artisthash);
    else if (best.type === "album") navigate("album", best.album.albumhash);
    else playList(trackResults, 0);
  };

  return (
    <div
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className="group matte-panel relative flex cursor-pointer flex-col gap-4 rounded-lg p-5 focus-auralis"
    >
      <Artwork
        title={title}
        colors={colors}
        image={image}
        rounded={round ? 9999 : 8}
        size={92}
        className="shadow-xl"
      />
      <div className="min-w-0">
        <p className="truncate text-[26px] font-black tracking-tight text-foreground">{title}</p>
        <p className="mt-1 truncate text-[13px] font-semibold text-muted-foreground">{subtitle}</p>
      </div>
      {best.type === "track" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            playList(trackResults, 0);
          }}
          aria-label="Lire"
          className="signal-button absolute bottom-5 right-5 grid size-12 translate-y-2 place-items-center rounded-full opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <Play className="size-5 fill-current ml-0.5" />
        </button>
      )}
    </div>
  );
}
