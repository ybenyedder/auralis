"use client";

import { memo, useMemo, type MouseEvent } from "react";
import { Play, MoreVertical } from "lucide-react";
import type { Album, Artist, Playlist } from "@/lib/auralis/types";
import { usePlayer } from "@/store/player";
import { tracksForHashes, tracksFromIndex, tracksOfAlbumFrom, useLibraryStore } from "@/store/library";
import { useAlbumContextMenu, useArtistContextMenu } from "./ContextMenu";
import { Artwork } from "./Artwork";
import { paletteForName, albumArtist, formatCount, plural } from "@/lib/auralis/brand";
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
  const colors = album.color ?? paletteForName(album.albumhash);

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
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-lg p-3 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis"
    >
      <div className="relative">
        <Artwork
          title={album.title}
          albumhash={album.albumhash}
          size={156}
          rounded={8}
          colors={colors}
          image={album.image}
          fluid
          className="w-full aspect-square"
        />
        <button
          onClick={handlePlay}
          aria-label={`Lire ${album.title}`}
          className={cn(
            "signal-button absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-200",
            "opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
            isPlaying && "lg:opacity-100",
          )}
        >
          <Play className="size-4 fill-current ml-0.5" />
        </button>
        <button
          onClick={onMore}
          aria-label="Plus d'options"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-200 hover:bg-black/70 hover:text-white lg:h-7 lg:w-7 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <MoreVertical className="size-4 lg:size-3.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight text-foreground">{album.title}</p>
        <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
          {albumArtist(album)} · {album.year ?? "année inconnue"}
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
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-lg p-3 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis"
    >
      <div className="relative">
        {artist.image ? (
          <Artwork
            name={artist.name}
            artisthash={artist.artisthash}
            image={artist.image}
            size={156}
            rounded={9999}
            colors={colors}
            fluid
            className="w-full aspect-square"
          />
        ) : (
          <div
            className="cover-fallback grid aspect-square w-full place-items-center overflow-hidden rounded-full border-none p-3"
            style={{ backgroundColor: colors[0] }}
          >
            <span className="text-[34px] font-bold leading-none text-white/85">{artist.name.slice(0, 1).toUpperCase()}</span>
          </div>
        )}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openArtistContextMenu(e.clientX, e.clientY, artist);
          }}
          aria-label="Plus d'options"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-all duration-200 hover:bg-black/70 hover:text-white lg:h-7 lg:w-7 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <MoreVertical className="size-4 lg:size-3.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight text-foreground">{artist.name}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          {artist.playcount ? `${formatCount(artist.playcount)} écoutes · Artiste` : "Artiste"}
        </p>
      </div>
    </div>
  );
});

export const PlaylistTile = memo(function PlaylistTile({ playlist }: { playlist: Playlist }) {
  const navigate = usePlayer((s) => s.navigate);
  const playList = usePlayer((s) => s.playList);
  const trackIndex = useLibraryStore((state) => state.trackIndex);
  const colors = playlist.color ?? paletteForName(playlist.name);
  // Memoise the cover lookup over the prebuilt index — recomputing it on every
  // render (e.g. parent re-render) was wasted work per tile, and the old helper
  // rebuilt a whole-library Map each call.
  const coverImage = useMemo(
    () => tracksFromIndex(trackIndex, playlist.trackhashes ?? []).find((t) => t.image)?.image,
    [trackIndex, playlist.trackhashes],
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
      className="group matte-panel relative flex cursor-pointer flex-col gap-2.5 rounded-lg p-3 text-left transition-colors hover:bg-[var(--panel-2)] focus-auralis"
    >
      <div className="relative">
        {coverImage ? (
          <Artwork
            name={playlist.name}
            image={coverImage}
            size={156}
            rounded={8}
            colors={colors}
            showInitials={false}
            fluid
            className="w-full aspect-square"
          />
        ) : (
          <div
            className="cover-fallback relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-none"
            style={{ background: colors[0] }}
          >
            <span className="absolute inset-0 bg-black/20" aria-hidden />
            <span className="relative p-4 text-center text-[18px] font-bold tracking-tight leading-tight text-white/95 line-clamp-3">
              {playlist.name}
            </span>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const list = tracksForHashes(playlist.trackhashes ?? []);
            if (list.length) playList(list, 0);
          }}
          aria-label={`Lire ${playlist.name}`}
          className="signal-button absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full opacity-100 shadow-[0_8px_16px_rgba(0,0,0,0.4)] transition-all duration-200 lg:opacity-0 lg:group-hover:opacity-100"
        >
          <Play className="size-4 fill-current ml-0.5" />
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-tight text-foreground">{playlist.name}</p>
        <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
          {plural(playlist.trackcount ?? 0, "titre")}
        </p>
      </div>
    </div>
  );
});

