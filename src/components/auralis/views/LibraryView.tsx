"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Music2, Disc3, UserRound, ListMusic, ArrowDownUp, LayoutGrid, List, History, FolderTree, BarChart3, Settings, ChevronRight, Plus, Heart } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard, PlaylistTile } from "../Cards";
import { VirtualList, VirtualGrid } from "../Virtualized";
import { cn, compareNames } from "@/lib/utils";
import { paletteForName, plural, trackTitle } from "@/lib/auralis/brand";
import type { Album, Artist } from "@/lib/auralis/types";

type Tab = "tracks" | "likes" | "albums" | "artists" | "playlists";

type SortMode = "az" | "za" | "year" | "plays";

export function LibraryView() {
  const [tab, setTab] = useState<Tab>("albums");
  const [sort, setSort] = useState<SortMode>("az");
  const [grid, setGrid] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const playCounts = usePlayer((s) => s.playCounts);
  const favorites = usePlayer((s) => s.favorites);
  const navigate = usePlayer((s) => s.navigate);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const playlists = useLibraryStore((s) => s.playlists);
  const status = useLibraryStore((s) => s.status);
  const allPlaylists = useMemo(() => [...customPlaylists, ...playlists], [customPlaylists, playlists]);

  const sortedAlbums = useMemo(() => {
    const next = [...albums];
    if (sort === "az") next.sort((a, b) => compareNames(a.title, b.title));
    if (sort === "za") next.sort((a, b) => compareNames(b.title, a.title));
    if (sort === "year") next.sort((a, b) => (b.year || 0) - (a.year || 0));
    return next;
  }, [albums, sort]);

  const playsKey = sort === "plays" ? playCounts : null;
  const sortedTracks = useMemo(() => {
    const next = [...tracks];
    if (sort === "az") next.sort((a, b) => compareNames(a.title, b.title));
    if (sort === "za") next.sort((a, b) => compareNames(b.title, a.title));
    if (sort === "plays") next.sort((a, b) => (playCounts[b.trackhash] ?? b.playcount ?? 0) - (playCounts[a.trackhash] ?? a.playcount ?? 0));
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, tracks, playsKey]);

  // Liked titles, surfaced directly inside the Library so the user's favourites are
  // always one tab away (driven by the live favorites set, never the stale per-track
  // flag). Re-sorted with the same control as the other tabs.
  const likedTracks = useMemo(() => {
    const liked = tracks.filter((t) => favorites.has(t.trackhash));
    if (sort === "az") liked.sort((a, b) => compareNames(trackTitle(a), trackTitle(b)));
    else if (sort === "za") liked.sort((a, b) => compareNames(trackTitle(b), trackTitle(a)));
    else if (sort === "plays") liked.sort((a, b) => (playCounts[b.trackhash] ?? b.playcount ?? 0) - (playCounts[a.trackhash] ?? a.playcount ?? 0));
    return liked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, favorites, sort, playsKey]);

  const sortedArtists = useMemo(() => {
    const next = [...artists];
    if (sort === "az") next.sort((a, b) => compareNames(a.name, b.name));
    if (sort === "za") next.sort((a, b) => compareNames(b.name, a.name));
    if (sort === "plays") next.sort((a, b) => (b.playcount || 0) - (a.playcount || 0));
    return next;
  }, [artists, sort]);

  const tabs: { id: Tab; label: string; icon: ComponentType<{ className?: string }>; count: number }[] = [
    { id: "albums", label: "Albums", icon: Disc3, count: albums.length },
    { id: "artists", label: "Artistes", icon: UserRound, count: artists.length },
    { id: "tracks", label: "Titres", icon: Music2, count: tracks.length },
    { id: "likes", label: "J'aime", icon: Heart, count: favorites.size },
    { id: "playlists", label: "Playlists", icon: ListMusic, count: allPlaylists.length },
  ];

  return (
    <div className="fade-up px-4 py-5 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
            Collection scannée
          </p>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">Bibliothèque</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {status === "loading" && tracks.length === 0 ? "Scan en cours…" : `${plural(tracks.length, "titre")} indexé${tracks.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="matte-panel flex h-10 items-center gap-1 rounded-full px-3 lg:h-auto lg:p-1.5 lg:px-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-9 cursor-pointer bg-transparent px-2 text-[13px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground lg:h-auto lg:py-1 lg:text-[11.5px]"
              aria-label="Trier"
            >
              <option value="az" className="bg-[var(--panel-2)]">A → Z</option>
              <option value="za" className="bg-[var(--panel-2)]">Z → A</option>
              <option value="year" className="bg-[var(--panel-2)]">Plus récents</option>
              <option value="plays" className="bg-[var(--panel-2)]">Plus joués</option>
            </select>
            <ArrowDownUp className="size-3 text-muted-foreground/70" />
          </div>
          {(tab === "albums" || tab === "artists") && (
            <div className="matte-panel flex items-center gap-0.5 rounded-full p-1 lg:p-1">
              <button
                onClick={() => setGrid(true)}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-200 lg:h-7 lg:w-7", grid ? "bg-white text-black shadow-sm" : "text-muted-foreground hover:bg-white/10 hover:text-foreground")}
                aria-label="Vue grille"
              >
                <LayoutGrid className="size-4 lg:size-3.5" />
              </button>
              <button
                onClick={() => setGrid(false)}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-200 lg:h-7 lg:w-7", !grid ? "bg-white text-black shadow-sm" : "text-muted-foreground hover:bg-white/10 hover:text-foreground")}
                aria-label="Vue liste"
              >
                <List className="size-4 lg:size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* On mobile the tabs share the row width equally (flex-1) so none gets pushed
          off-screen behind a hidden horizontal scroll; on desktop they revert to
          natural-width tabs. */}
      <div className="mb-5 flex items-center gap-0.5 border-b border-[var(--line)] lg:gap-1 lg:overflow-visible">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "relative flex h-11 flex-1 items-center justify-center gap-1.5 px-1 text-[12px] font-bold transition-colors lg:h-auto lg:flex-none lg:justify-start lg:gap-2 lg:px-3 lg:py-2 lg:text-[12.5px]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-3.5 shrink-0", item.id === "likes" && active && "fill-primary text-primary")} />
              <span className="truncate">{item.label}</span>
              <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground sm:inline-block">{item.count}</span>
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {tab === "albums" && (grid ? (
        <VirtualGrid
          items={sortedAlbums}
          itemKey={(a) => a.albumhash}
          minItemWidth={160}
          gap={8}
          estimateRowHeight={232}
        >
          {(album) => <AlbumCard album={album} />}
        </VirtualGrid>
      ) : (
        <div className="matte-panel rounded-lg p-2">
          <VirtualList items={sortedAlbums} itemKey={(a) => a.albumhash} estimateHeight={56}>
            {(album, index) => <AlbumListRow album={album} index={index} />}
          </VirtualList>
        </div>
      ))}

      {tab === "artists" && (grid ? (
        <VirtualGrid
          items={sortedArtists}
          itemKey={(a) => a.artisthash}
          minItemWidth={160}
          gap={8}
          estimateRowHeight={232}
        >
          {(artist) => <ArtistCard artist={artist} />}
        </VirtualGrid>
      ) : (
        <div className="matte-panel rounded-lg p-2">
          <VirtualList items={sortedArtists} itemKey={(a) => a.artisthash} estimateHeight={56}>
            {(artist, index) => <ArtistListRow artist={artist} index={index} />}
          </VirtualList>
        </div>
      ))}

      {tab === "tracks" && (
        <div className="matte-panel rounded-lg p-2">
          <TrackListHeader />
          {tracks.length === 0 ? (
            <EmptyHint label={status === "loading" ? "Scan en cours…" : "Aucun titre indexé. Lance un scan dans Réglages."} />
          ) : (
            <VirtualList items={sortedTracks} itemKey={(t) => t.trackhash} estimateHeight={56} gap={2}>
              {(track, index) => <TrackRow track={track} index={index} list={sortedTracks} />}
            </VirtualList>
          )}
        </div>
      )}

      {tab === "likes" && (
        <div className="matte-panel rounded-lg p-2">
          <TrackListHeader />
          {likedTracks.length === 0 ? (
            <EmptyHint label="Aucun titre aimé. Touche le cœur sur un titre pour le retrouver ici." />
          ) : (
            <VirtualList items={likedTracks} itemKey={(t) => t.trackhash} estimateHeight={56} gap={2}>
              {(track, index) => <TrackRow track={track} index={index} list={likedTracks} />}
            </VirtualList>
          )}
        </div>
      )}

      {tab === "playlists" && (
        <div>
          <div className="mb-3">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newName.trim();
                  if (!name) return;
                  const id = createPlaylist(name);
                  setNewName("");
                  setCreating(false);
                  navigate("playlist", id);
                }}
                className="matte-panel flex items-center gap-2 rounded-full p-1.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-white/10"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom de la playlist"
                  className="min-h-[40px] w-full bg-transparent px-4 text-[15px] text-foreground outline-none lg:text-[14px]"
                />
                <button type="submit" disabled={!newName.trim()} className="signal-button shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold transition-colors duration-200 disabled:opacity-40">
                  Créer
                </button>
                <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="ghost-button shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors duration-200">
                  Annuler
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:min-h-0 lg:py-2.5"
              >
                <Plus className="size-4" /> Nouvelle playlist
              </button>
            )}
          </div>
          {allPlaylists.length > 0 ? (
            <VirtualGrid
              items={allPlaylists}
              itemKey={(p) => p.id}
              minItemWidth={160}
              gap={8}
              estimateRowHeight={232}
            >
              {(playlist) => <PlaylistTile playlist={playlist} />}
            </VirtualGrid>
          ) : (
            <div className="matte-panel rounded-lg p-8 text-center text-[13px] font-bold text-muted-foreground">
              Aucune playlist. Crée-en une avec le bouton ci-dessus.
            </div>
          )}
        </div>
      )}

      <div className="mt-7 md:hidden">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
          Plus
        </p>
        <div className="matte-panel overflow-hidden rounded-lg">
          {moreLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <button
                key={link.view}
                onClick={() => navigate(link.view)}
                className={cn(
                  "tap-press flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[var(--panel-2)]",
                  index > 0 && "border-t border-[var(--line)]",
                )}
              >
                <Icon className="size-[18px] shrink-0 text-muted-foreground" />
                <span className="flex-1 text-[14px] font-bold text-foreground">{link.label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="px-3 py-12 text-center text-[13px] font-semibold text-muted-foreground">{label}</div>
  );
}

const moreLinks: { view: "recents" | "folders" | "insights" | "settings"; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { view: "recents", label: "Historique", icon: History },
  { view: "folders", label: "Dossiers", icon: FolderTree },
  { view: "insights", label: "Analyse", icon: BarChart3 },
  { view: "settings", label: "Réglages", icon: Settings },
];

function AlbumListRow({ album, index }: { album: Album; index: number }) {
  const navigate = usePlayer((s) => s.navigate);
  return (
    <button
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-all hover:bg-white/[0.04]"
      onClick={() => navigate("album", album.albumhash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-md border border-[var(--line)]" style={{ background: album.color?.[0] }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{album.title}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{album.albumartists[0]?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {album.year && <span>{album.year}</span>}
        <span className="tabular-nums">{plural(album.trackcount ?? 0, "titre")}</span>
      </div>
    </button>
  );
}

function ArtistListRow({ artist, index }: { artist: Artist; index: number }) {
  const navigate = usePlayer((s) => s.navigate);
  const colors = paletteForName(artist.name);
  return (
    <button
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-all hover:bg-white/[0.04]"
      onClick={() => navigate("artist", artist.artisthash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-full" style={{ background: colors[0] }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{artist.name}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{artist.genres?.join(", ") || "Artiste local"}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{plural(artist.albumcount ?? 0, "album")}</span>
        <span className="tabular-nums">{plural(artist.trackcount ?? 0, "titre")}</span>
      </div>
    </button>
  );
}
