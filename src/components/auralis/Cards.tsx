"use client";

import { memo, useMemo, type MouseEvent } from "react";
import { Play, MoreVertical } from "lucide-react";
import type { Album, Artist, Playlist } from "@/lib/auralis/types";
import { usePlayer } from "@/store/player";
import { tracksForHashesFrom, tracksOfAlbumFrom, useLibraryStore } from "@/store/library";
import { useAlbumContextMenu, useArtistContextMenu } from "./ContextMenu";
import { Artwork } from "./Artwork";
import { paletteForName, albumArtist, formatCount } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

interface AlbumCardProps {
  album: Album;
  onOpen?: () => void;
}

export const AlbumCard = memo(function AlbumCard({ album, onOpen }: AlbumCardProps) {
  // Atomic selectors: actions are stable refs (no re-render), and we watch ONLY a
  // derived boolean instead of the whole currentTrack — so a track change no longer
  // re-renders every album card in the grid.
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const openAlbumContextMenu = usePlayer((s) => s.openAlbumContextMenu);
  const isPlaying = usePlayer((s) => s.currentTrack?.albumhash === album.albumhash);
  const onContext = useAlbumContextMenu();
  const colors = album.color ?? paletteForName(album.title);

  const handlePlay = (event: MouseEvent) => {
    event.stopPropagation();
    // Read tracks lazily so the card never subscribes to the (large) tracks array.
    const list = tracksOfAlbumFrom(useLibraryStore.getState().tracks, album.albumhash);
    if (list.length) playList(list, 0);
  };

  const onMore = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openAlbumContextMenu(e.clientX, e.clientY, album);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (onOpen ? onOpen() : navigate("album", album.albumhash))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (onOpen) onOpen();
          else navigate("album", album.albumhash);
        }
      }}
      onContextMenu={(e) => onContext(e, album)}
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-[13px] p-2.5 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis card-lift"
    >
      <div className="relative">
        <Artwork
          title={album.title}
          albumhash={album.albumhash}
          size={156}
          rounded={9}
          colors={colors}
          image={album.image}
          fluid
          className="w-full aspect-square transition-transform lg:group-hover:scale-[1.02]"
        />
        <button
          onClick={handlePlay}
          aria-label={`Lire ${album.title}`}
          className={cn(
            "signal-button absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full transition-all lg:h-9 lg:w-9 lg:rounded-[11px]",
            "opacity-100 lg:translate-y-2 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100",
            isPlaying && "lg:translate-y-0 lg:opacity-100",
          )}
        >
          <Play className="size-4 fill-current ml-0.5" />
        </button>
        <button
          onClick={onMore}
          aria-label="Plus d'options"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition-all hover:bg-black/90 lg:h-7 lg:w-7 lg:rounded-[9px] lg:bg-black/70 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <MoreVertical className="size-4 lg:size-3.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-tight text-foreground">{album.title}</p>
        <p className="mt-1 truncate text-[11.5px] leading-tight text-muted-foreground">
          {albumArtist(album)} · {album.year}
        </p>
      </div>
    </div>
  );
});

export const ArtistCard = memo(function ArtistCard({ artist }: { artist: Artist }) {
  const navigate = usePlayer((s) => s.navigate);
  const openArtistContextMenu = usePlayer((s) => s.openArtistContextMenu);
  const onContext = useArtistContextMenu();
  const colors = paletteForName(artist.name);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("artist", artist.artisthash)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("artist", artist.artisthash);
        }
      }}
      onContextMenu={(e) => onContext(e, artist)}
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-[13px] p-2.5 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis card-lift"
    >
      <div className="relative">
        {artist.image ? (
          <Artwork
            name={artist.name}
            artisthash={artist.artisthash}
            image={artist.image}
            size={156}
            rounded={9}
            colors={colors}
            fluid
            className="w-full aspect-square transition-transform lg:group-hover:scale-[1.01]"
          />
        ) : (
          <div
            className="cover-fallback flex aspect-square w-full items-end overflow-hidden rounded-[9px] border border-[var(--line)] p-3 transition-transform lg:group-hover:scale-[1.01]"
            style={{ backgroundColor: colors[0] }}
          >
            <span className="text-[34px] font-black leading-none text-white/82">{artist.name.slice(0, 1).toUpperCase()}</span>
            <span className="absolute inset-x-0 bottom-0 h-2" style={{ background: colors[1] }} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openArtistContextMenu(e.clientX, e.clientY, artist);
          }}
          aria-label="Plus d'options"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white transition-all hover:bg-black/90 lg:h-7 lg:w-7 lg:rounded-[9px] lg:bg-black/70 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <MoreVertical className="size-4 lg:size-3.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-tight text-foreground">{artist.name}</p>
        <p className="mt-1 text-[11.5px] leading-tight text-muted-foreground">
          {formatCount(artist.playcount)} écoutes · Artiste
        </p>
      </div>
    </div>
  );
});

export const PlaylistTile = memo(function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const navigate = usePlayer((s) => s.navigate);
  const playList = usePlayer((s) => s.playList);
  const tracks = useLibraryStore((state) => state.tracks);
  const colors = playlist.color ?? paletteForName(playlist.name);
  // Memoise the cover lookup — it scans the whole library; recomputing it on every
  // render (e.g. parent re-render) was wasted work per tile.
  const coverImage = useMemo(
    () => tracksForHashesFrom(tracks, playlist.trackhashes ?? []).find((t) => t.image)?.image,
    [tracks, playlist.trackhashes],
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("playlist", String(playlist.id))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("playlist", String(playlist.id));
        }
      }}
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-[13px] p-2.5 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis card-lift"
    >
      <div className="relative">
        {coverImage ? (
          <Artwork
            name={playlist.name}
            image={coverImage}
            size={156}
            rounded={9}
            colors={colors}
            showInitials={false}
            fluid
            className="w-full aspect-square transition-transform lg:group-hover:scale-[1.02]"
          />
        ) : (
          <div
            className="cover-fallback flex aspect-square w-full items-end overflow-hidden rounded-[9px] border border-[var(--line)]"
            style={{ backgroundColor: colors[0] }}
          >
            <span className="absolute inset-x-0 top-0 h-2" style={{ background: colors[1] }} />
            <span className="relative line-clamp-3 p-3 text-[15px] font-black leading-tight text-white/95">
              {playlist.name}
            </span>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const list = tracksForHashesFrom(tracks, playlist.trackhashes ?? []);
            if (list.length) playList(list, 0);
          }}
          aria-label={`Lire ${playlist.name}`}
          className="signal-button absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full opacity-100 transition-all lg:h-9 lg:w-9 lg:translate-y-2 lg:rounded-[11px] lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100"
        >
          <Play className="size-4 fill-current ml-0.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black leading-tight text-foreground">{playlist.name}</p>
        <p className="mt-1 truncate text-[11.5px] leading-tight text-muted-foreground">
          {playlist.trackcount} tracks
        </p>
      </div>
    </div>
  );
});

