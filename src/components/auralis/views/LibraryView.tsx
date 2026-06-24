"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Music2, Disc3, UserRound, ListMusic, ArrowDownUp, LayoutGrid, List, History, FolderTree, BarChart3, Settings, ChevronRight, Plus } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard, PlaylistTile } from "../Cards";
import { cn } from "@/lib/utils";
import { paletteForName } from "@/lib/auralis/brand";
import type { Album, Artist } from "@/lib/auralis/types";

type Tab = "tracks" | "albums" | "artists" | "playlists";

type SortMode = "az" | "za" | "year" | "plays";

export function LibraryView() {
  const [tab, setTab] = useState<Tab>("albums");
  const [sort, setSort] = useState<SortMode>("az");
  const [grid, setGrid] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const playCounts = usePlayer((s) => s.playCounts);
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
    if (sort === "az") next.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    if (sort === "za") next.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));
    if (sort === "year") next.sort((a, b) => (b.year || 0) - (a.year || 0));
    return next;
  }, [albums, sort]);

  const sortedTracks = useMemo(() => {
    const next = [...tracks];
    if (sort === "az") next.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    if (sort === "za") next.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));
    if (sort === "plays") next.sort((a, b) => (playCounts[b.trackhash] ?? b.playcount ?? 0) - (playCounts[a.trackhash] ?? a.playcount ?? 0));
    return next;
  }, [sort, tracks, playCounts]);

  const sortedArtists = useMemo(() => {
    const next = [...artists];
    if (sort === "az") next.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (sort === "za") next.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    if (sort === "plays") next.sort((a, b) => (b.playcount || 0) - (a.playcount || 0));
    return next;
  }, [artists, sort]);

  const tabs: { id: Tab; label: string; icon: ComponentType<{ className?: string }>; count: number }[] = [
    { id: "albums", label: "Albums", icon: Disc3, count: albums.length },
    { id: "artists", label: "Artistes", icon: UserRound, count: artists.length },
    { id: "tracks", label: "Titres", icon: Music2, count: tracks.length },
    { id: "playlists", label: "Playlists", icon: ListMusic, count: allPlaylists.length },
  ];

  return (
    <div className="fade-up px-4 py-5 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brass)]">
            Collection scannée
          </p>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">Bibliothèque</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {status === "loading" ? "Scan en cours…" : `${tracks.length} titres indexés`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="matte-panel flex h-10 items-center gap-1 rounded-[13px] px-1 lg:h-auto lg:p-0.5">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-9 cursor-pointer bg-transparent px-2 text-[13px] font-semibold text-muted-foreground outline-none lg:h-auto lg:py-1 lg:text-[11.5px]"
              aria-label="Trier"
            >
              <option value="az" className="bg-[#1b1a16]">A → Z</option>
              <option value="za" className="bg-[#1b1a16]">Z → A</option>
              <option value="year" className="bg-[#1b1a16]">Plus récents</option>
              <option value="plays" className="bg-[#1b1a16]">Plus joués</option>
            </select>
            <ArrowDownUp className="size-3 text-muted-foreground/70" />
          </div>
          {(tab === "albums" || tab === "artists") && (
            <div className="matte-panel flex items-center gap-0.5 rounded-[13px] p-1 lg:p-0.5">
              <button
                onClick={() => setGrid(true)}
                className={cn("grid h-8 w-8 place-items-center rounded-[9px] transition-colors lg:h-6 lg:w-6", grid ? "bg-[var(--paper)] text-[var(--ink)]" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
                aria-label="Vue grille"
              >
                <LayoutGrid className="size-4 lg:size-3.5" />
              </button>
              <button
                onClick={() => setGrid(false)}
                className={cn("grid h-8 w-8 place-items-center rounded-[9px] transition-colors lg:h-6 lg:w-6", !grid ? "bg-[var(--paper)] text-[var(--ink)]" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground")}
                aria-label="Vue liste"
              >
                <List className="size-4 lg:size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* On mobile the four tabs share the row width equally (flex-1) so none —
          notably "Playlists" — gets pushed off-screen behind a hidden horizontal
          scroll; on desktop they revert to natural-width tabs. */}
      <div className="mb-5 flex items-center gap-0.5 border-b border-[var(--line)] lg:gap-1 lg:overflow-visible">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "relative flex h-11 flex-1 items-center justify-center gap-1.5 px-1.5 text-[12px] font-bold transition-colors lg:h-auto lg:flex-none lg:justify-start lg:gap-2 lg:px-3 lg:py-2 lg:text-[12.5px]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
              <span className="hidden rounded-[7px] bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground sm:inline-block">{item.count}</span>
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {tab === "albums" && (grid ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {sortedAlbums.map((album) => <AlbumCard key={album.albumhash} album={album} />)}
        </div>
      ) : (
        <div className="matte-panel rounded-[13px] p-2">
          {sortedAlbums.map((album, index) => <AlbumListRow key={album.albumhash} album={album} index={index} />)}
        </div>
      ))}

      {tab === "artists" && (grid ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {sortedArtists.map((artist) => <ArtistCard key={artist.artisthash} artist={artist} />)}
        </div>
      ) : (
        <div className="matte-panel rounded-[13px] p-2">
          {sortedArtists.map((artist, index) => <ArtistListRow key={artist.artisthash} artist={artist} index={index} />)}
        </div>
      ))}

      {tab === "tracks" && (
        <div className="matte-panel rounded-[13px] p-2">
          <TrackListHeader />
          <div className="lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto lg:scroll-auralis">
            {sortedTracks.map((track, index) => <TrackRow key={track.trackhash} track={track} index={index} list={sortedTracks} />)}
          </div>
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
                className="matte-panel flex items-center gap-2 rounded-[13px] p-1.5"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom de la playlist"
                  className="min-h-[40px] w-full bg-transparent px-2 text-[15px] text-foreground outline-none lg:text-[14px]"
                />
                <button type="submit" disabled={!newName.trim()} className="signal-button shrink-0 rounded-[11px] px-4 py-2 text-[13px] font-black disabled:opacity-40">
                  Créer
                </button>
                <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="ghost-button shrink-0 rounded-[11px] px-3 py-2 text-[13px] font-bold">
                  Annuler
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-[13px] px-4 text-[13px] font-bold lg:min-h-0 lg:py-2"
              >
                <Plus className="size-4" /> Nouvelle playlist
              </button>
            )}
          </div>
          {allPlaylists.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {allPlaylists.map((playlist) => <PlaylistTile key={playlist.id} playlist={playlist} />)}
            </div>
          ) : (
            <div className="matte-panel rounded-[13px] p-8 text-center text-[13px] font-bold text-muted-foreground">
              Aucune playlist. Crée-en une avec le bouton ci-dessus.
            </div>
          )}
        </div>
      )}

      <div className="mt-7 md:hidden">
        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brass)]">
          Plus
        </p>
        <div className="matte-panel overflow-hidden rounded-[13px]">
          {moreLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <button
                key={link.view}
                onClick={() => navigate(link.view)}
                className={cn(
                  "tap-press flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[0.045]",
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
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-[9px] px-2 py-2 text-left hover:bg-white/[0.045]"
      onClick={() => navigate("album", album.albumhash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-md" style={{ background: album.color?.[0], borderBottom: `4px solid ${album.color?.[1]}` }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{album.title}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{album.albumartists[0]?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {album.year && <span>{album.year}</span>}
        <span className="tabular-nums">{album.trackcount} titres</span>
      </div>
    </button>
  );
}

function ArtistListRow({ artist, index }: { artist: Artist; index: number }) {
  const navigate = usePlayer((s) => s.navigate);
  const colors = paletteForName(artist.name);
  return (
    <button
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-[9px] px-2 py-2 text-left hover:bg-white/[0.045]"
      onClick={() => navigate("artist", artist.artisthash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-[9px] border border-[var(--line)]" style={{ background: colors[0], borderBottomColor: colors[1] }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{artist.name}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{artist.genres?.join(", ") || "Artiste local"}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{artist.albumcount} albums</span>
        <span className="tabular-nums">{artist.trackcount} titres</span>
      </div>
    </button>
  );
}
