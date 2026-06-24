"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  ListPlus,
  Plus,
  Heart,
  Disc3,
  UserRound,
  ChevronRight,
  ListMusic,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { albumsOfArtistFrom, tracksOfAlbumFrom, tracksOfArtistFrom, useLibraryStore } from "@/store/library";
import { trackArtist, trackTitle, albumArtist, formatCount } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { Track, Album, Artist, ViewId } from "@/lib/auralis/types";

export function ContextMenuHost() {
  const {
    contextMenu,
    closeContextMenu,
    playTrack,
    playList,
    addToQueueNext,
    addToQueueEnd,
    toggleFavorite,
    isFavorite,
    navigate,
    customPlaylists,
    createPlaylist,
    addToPlaylist,
  } = usePlayer();

  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<"playlists" | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Clamp the menu position into the viewport whenever it opens, and reset
  // the playlist submenu state. (Position only feeds the desktop popover; the
  // mobile sheet is pinned to the bottom and ignores the cursor coordinates.)
  useEffect(() => {
    if (!contextMenu.open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubmenu(null);
      return;
    }
    const menuW = 248;
    const menuH = 360;
    const x = Math.min(contextMenu.x, window.innerWidth - menuW - 8);
    const y = Math.min(contextMenu.y, window.innerHeight - menuH - 8);

    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [contextMenu.open, contextMenu.x, contextMenu.y]);

  useEffect(() => {
    if (!contextMenu.open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu.open, closeContextMenu]);

  if (!contextMenu.open) return null;

  const { track, album, artist } = contextMenu;
  const run = (fn: () => void) => {
    fn();
    closeContextMenu();
  };

  // One set of variant components drives both shells. `sheet` toggles the
  // touch-sized layout (bigger rows/icons, in-sheet playlist level) so the
  // exact same actions render in the desktop popover and the mobile sheet.
  const menu = (sheet: boolean) => (
    <>
      {track && (
        <TrackMenu
          track={track}
          run={run}
          submenu={submenu}
          setSubmenu={setSubmenu}
          sheet={sheet}
          playTrack={playTrack}
          addToQueueNext={addToQueueNext}
          addToQueueEnd={addToQueueEnd}
          toggleFavorite={toggleFavorite}
          isFavorite={isFavorite}
          navigate={navigate}
          customPlaylists={customPlaylists}
          createPlaylist={createPlaylist}
          addToPlaylist={addToPlaylist}
        />
      )}
      {album && !track && (
        <AlbumMenu
          album={album}
          run={run}
          submenu={submenu}
          setSubmenu={setSubmenu}
          sheet={sheet}
          playList={playList}
          addToQueueEnd={addToQueueEnd}
          navigate={navigate}
          customPlaylists={customPlaylists}
          createPlaylist={createPlaylist}
          addToPlaylist={addToPlaylist}
        />
      )}
      {artist && !track && !album && (
        <ArtistMenu
          artist={artist}
          run={run}
          sheet={sheet}
          playList={playList}
          addToQueueEnd={addToQueueEnd}
          navigate={navigate}
        />
      )}
    </>
  );

  return (
    <>
      {/* Desktop (lg+): the original cursor-anchored popover, unchanged. */}
      <div className="fixed inset-0 z-[70] hidden lg:block" aria-hidden>
        <div
          ref={ref}
          role="menu"
          className="scale-in matte-panel fixed w-[248px] overflow-hidden rounded-[13px]"
          style={{ left: pos.x, top: pos.y }}
        >
          {menu(false)}
        </div>
      </div>

      {/* Mobile (<lg): a bottom action sheet behind a dimming scrim. */}
      <div className="fixed inset-0 z-[70] lg:hidden">
        <button
          type="button"
          aria-label="Fermer"
          onClick={closeContextMenu}
          className="scrim-in absolute inset-0 bg-black/55"
        />
        <div
          role="menu"
          className="sheet-up matte-panel safe-bottom absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[14px] border-x-0 border-b-0"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="h-1 w-9 rounded-full bg-white/20" />
          </div>
          {menu(true)}
        </div>
      </div>
    </>
  );
}

// --- Track menu ---
function TrackMenu({
  track,
  run,
  submenu,
  setSubmenu,
  sheet,
  playTrack,
  addToQueueNext,
  addToQueueEnd,
  toggleFavorite,
  isFavorite,
  navigate,
  customPlaylists,
  createPlaylist,
  addToPlaylist,
}: {
  track: Track;
  run: (fn: () => void) => void;
  submenu: "playlists" | null;
  setSubmenu: (v: "playlists" | null) => void;
  sheet: boolean;
  playTrack: (track: Track, list?: Track[], startIndex?: number) => void;
  addToQueueNext: (track: Track) => void;
  addToQueueEnd: (track: Track) => void;
  toggleFavorite: (trackhash: string) => void;
  isFavorite: (trackhash: string) => boolean;
  navigate: (view: ViewId, id?: string) => void;
  customPlaylists: import("@/lib/auralis/types").Playlist[];
  createPlaylist: (name: string) => string;
  addToPlaylist: (id: string, track: Track) => void;
}) {
  const albums = useLibraryStore((state) => state.albums);
  const artists = useLibraryStore((state) => state.artists);
  const fav = isFavorite(track.trackhash);
  const album = track.albumhash ? albums.find((item) => item.albumhash === track.albumhash) : undefined;
  const artist = track.artists?.[0] ?? artists.find((item) => item.name === track.artist);

  // On mobile the playlist level takes over the whole sheet, so we hide the
  // primary action list while it is open.
  const playlistOpen = sheet && submenu === "playlists";

  return (
    <>
      {!playlistOpen && (
        <MenuHeader
          title={trackTitle(track)}
          subtitle={trackArtist(track)}
          colors={track.color ?? ["#2A2821", "#D95F45", "#C6A15B"]}
          initial={trackTitle(track)[0] || "A"}
          sheet={sheet}
        />
      )}
      <div className={cn(sheet ? "p-2" : "p-1.5", playlistOpen && "p-0")}>
        {!playlistOpen && (
          <>
            <MenuItem sheet={sheet} icon={Play} label="Play now" onClick={() => run(() => playTrack(track, [track], 0))} />
            <MenuItem sheet={sheet} icon={ListPlus} label="Play next" onClick={() => run(() => addToQueueNext(track))} />
            <MenuItem sheet={sheet} icon={Plus} label="Add to queue" onClick={() => run(() => addToQueueEnd(track))} />
          </>
        )}
        <PlaylistSubmenu
          submenu={submenu}
          setSubmenu={setSubmenu}
          sheet={sheet}
          customPlaylists={customPlaylists}
          onCreate={() => {
            const id = createPlaylist(`Playlist ${customPlaylists.length + 1}`);
            addToPlaylist(id, track);
          }}
          onAdd={(plId) => addToPlaylist(plId, track)}
          run={run}
        />
        {!playlistOpen && (
          <>
            <MenuItem
              sheet={sheet}
              icon={Heart}
              label={fav ? "Remove from favorites" : "Save to favorites"}
              onClick={() => run(() => toggleFavorite(track.trackhash))}
              accent={fav ? "primary" : undefined}
            />
            <div className="my-1 h-px bg-white/[0.06]" />
            {album && (
              <MenuItem
                sheet={sheet}
                icon={Disc3}
                label="Go to album"
                onClick={() => run(() => navigate("album", album.albumhash))}
              />
            )}
            {artist && (
              <MenuItem
                sheet={sheet}
                icon={UserRound}
                label="Go to artist"
                onClick={() => run(() => navigate("artist", artist.artisthash))}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// --- Album menu ---
function AlbumMenu({
  album,
  run,
  submenu,
  setSubmenu,
  sheet,
  playList,
  addToQueueEnd,
  navigate,
  customPlaylists,
  createPlaylist,
  addToPlaylist,
}: {
  album: Album;
  run: (fn: () => void) => void;
  submenu: "playlists" | null;
  setSubmenu: (v: "playlists" | null) => void;
  sheet: boolean;
  playList: (list: Track[], startIndex?: number) => void;
  addToQueueEnd: (track: Track) => void;
  navigate: (view: ViewId, id?: string) => void;
  customPlaylists: import("@/lib/auralis/types").Playlist[];
  createPlaylist: (name: string) => string;
  addToPlaylist: (id: string, track: Track) => void;
}) {
  const libraryTracks = useLibraryStore((state) => state.tracks);
  const tracks = tracksOfAlbumFrom(libraryTracks, album.albumhash);
  const artist = album.albumartists[0];

  const addAlbumToQueue = () => {
    tracks.forEach((t) => addToQueueEnd(t));
  };

  const playlistOpen = sheet && submenu === "playlists";

  return (
    <>
      {!playlistOpen && (
        <MenuHeader
          title={album.title}
          subtitle={`${albumArtist(album)} · ${album.year}`}
          colors={album.color ?? ["#2A2821", "#D95F45", "#C6A15B"]}
          initial={album.title[0] || "A"}
          sheet={sheet}
        />
      )}
      <div className={cn(sheet ? "p-2" : "p-1.5", playlistOpen && "p-0")}>
        {!playlistOpen && (
          <>
            <MenuItem sheet={sheet} icon={Play} label="Play album" onClick={() => run(() => playList(tracks, 0))} />
            <MenuItem sheet={sheet} icon={ListPlus} label="Add album to queue" onClick={() => run(addAlbumToQueue)} />
          </>
        )}
        <PlaylistSubmenu
          submenu={submenu}
          setSubmenu={setSubmenu}
          sheet={sheet}
          customPlaylists={customPlaylists}
          onCreate={() => {
            const id = createPlaylist(`Playlist ${customPlaylists.length + 1}`);
            tracks.forEach((t) => addToPlaylist(id, t));
          }}
          onAdd={(plId) => tracks.forEach((t) => addToPlaylist(plId, t))}
          run={run}
          labelOverride="Add album to playlist"
        />
        {!playlistOpen && (
          <>
            <div className="my-1 h-px bg-white/[0.06]" />
            <MenuItem sheet={sheet} icon={Disc3} label="Go to album" onClick={() => run(() => navigate("album", album.albumhash))} />
            {artist && (
              <MenuItem
                sheet={sheet}
                icon={UserRound}
                label="Go to artist"
                onClick={() => run(() => navigate("artist", artist.artisthash))}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// --- Artist menu ---
function ArtistMenu({
  artist,
  run,
  sheet,
  playList,
  addToQueueEnd,
  navigate,
}: {
  artist: Artist;
  run: (fn: () => void) => void;
  sheet: boolean;
  playList: (list: Track[], startIndex?: number) => void;
  addToQueueEnd: (track: Track) => void;
  navigate: (view: ViewId, id?: string) => void;
}) {
  const libraryTracks = useLibraryStore((state) => state.tracks);
  const albums = useLibraryStore((state) => state.albums);
  const topTracks = [...tracksOfArtistFrom(libraryTracks, artist.artisthash)].sort((a, b) => (b.playcount || 0) - (a.playcount || 0)).slice(0, 5);
  const albumCount = albumsOfArtistFrom(albums, artist.artisthash).length;

  return (
    <>
      <MenuHeader
        title={artist.name}
        subtitle={`${formatCount(artist.playcount)} plays · ${artist.genres?.join(", ") || "Artist"}`}
        colors={["#2A2821", "#D95F45", "#C6A15B"]}
        initial={artist.name[0] || "A"}
        round
        sheet={sheet}
      />
      <div className={sheet ? "p-2" : "p-1.5"}>
        <MenuItem sheet={sheet} icon={Play} label="Play top tracks" onClick={() => run(() => playList(topTracks, 0))} />
        <MenuItem sheet={sheet} icon={ListPlus} label="Add top tracks to queue" onClick={() => run(() => topTracks.forEach((t) => addToQueueEnd(t)))} />
        <div className="my-1 h-px bg-white/[0.06]" />
        <MenuItem sheet={sheet} icon={UserRound} label="Go to artist" onClick={() => run(() => navigate("artist", artist.artisthash))} />
        {albumCount > 0 && (
          <p className={cn("text-muted-foreground/70", sheet ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[10.5px]")}>{albumCount} albums · {artist.trackcount} tracks</p>
        )}
      </div>
    </>
  );
}

// --- Shared sub-components ---
function MenuHeader({
  title,
  subtitle,
  colors,
  initial,
  round,
  sheet,
}: {
  title: string;
  subtitle: string;
  colors: [string, string, string];
  initial: string;
  round?: boolean;
  sheet?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center border-b border-[var(--line)]",
        sheet ? "gap-3 px-4 pb-3 pt-1" : "gap-2.5 p-3",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-[9px] font-black text-white/85",
          sheet ? "size-12 text-[15px]" : "size-9 text-[11px]",
          round && "rounded-[11px]",
        )}
        style={{ background: colors[0], borderBottom: `4px solid ${colors[1]}` }}
      >
        {initial.toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className={cn("truncate font-bold text-foreground leading-tight", sheet ? "text-[15px]" : "text-[12px]")}>{title}</p>
        <p className={cn("mt-0.5 truncate text-muted-foreground leading-tight", sheet ? "text-[13px]" : "text-[10.5px]")}>{subtitle}</p>
      </div>
    </div>
  );
}

function PlaylistSubmenu({
  submenu,
  setSubmenu,
  sheet,
  customPlaylists,
  onCreate,
  onAdd,
  run,
  labelOverride,
}: {
  submenu: "playlists" | null;
  setSubmenu: (v: "playlists" | null) => void;
  sheet: boolean;
  customPlaylists: import("@/lib/auralis/types").Playlist[];
  onCreate: () => void;
  onAdd: (id: string) => void;
  run: (fn: () => void) => void;
  labelOverride?: string;
}) {
  const open = submenu === "playlists";

  // Mobile: the playlist level takes over the whole sheet (no side fly-out on
  // touch). A back row returns to the action list; rows are >=48px.
  if (sheet) {
    if (!open) {
      return (
        <MenuItem
          sheet
          icon={ListMusic}
          label={labelOverride ?? "Add to playlist"}
          trailing={<ChevronRight className="size-5 text-muted-foreground/70" />}
          onClick={() => setSubmenu("playlists")}
        />
      );
    }
    return (
      <div className="p-2">
        <button
          onClick={() => setSubmenu(null)}
          className="tap-press mb-1 flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-semibold text-foreground active:bg-white/[0.05]"
        >
          <ChevronRight className="size-5 rotate-180 text-muted-foreground/70" />
          {labelOverride ?? "Add to playlist"}
        </button>
        <div className="my-1 h-px bg-white/[0.06]" />
        <button
          onClick={() => run(onCreate)}
          className="tap-press flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-semibold text-primary-soft active:bg-white/[0.05]"
        >
          <Plus className="size-5" /> New playlist
        </button>
        {customPlaylists.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-muted-foreground/70">No custom playlists yet</p>
        ) : (
          customPlaylists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => run(() => onAdd(String(pl.id)))}
              className="tap-press flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium text-foreground/90 active:bg-white/[0.05]"
            >
              <span
                className="size-5 shrink-0 rounded-[7px]"
                style={{ background: pl.color?.[0], borderBottom: `3px solid ${pl.color?.[1]}` }}
              />
              <span className="truncate">{pl.name}</span>
              <span className="ml-auto text-[12px] text-muted-foreground">{pl.trackcount}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  // Desktop: the original side fly-out, untouched.
  return (
    <div className="relative">
      <MenuItem
        icon={ListMusic}
        label={labelOverride ?? "Add to playlist"}
        trailing={<ChevronRight className="size-3.5" />}
        onClick={() => setSubmenu(open ? null : "playlists")}
        active={open}
      />
      {open && (
        <div className="scale-in matte-panel mb-1 ml-2 overflow-hidden rounded-[11px]">
          <button
            onClick={() => run(onCreate)}
            className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12px] font-semibold text-primary-soft hover:bg-white/[0.05]"
          >
            <Plus className="size-3.5" /> New playlist
          </button>
          {customPlaylists.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-muted-foreground/70">No custom playlists yet</p>
          ) : (
            customPlaylists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => run(() => onAdd(String(pl.id)))}
                className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12px] font-medium text-foreground/90 hover:bg-white/[0.05]"
              >
                <span
                  className="size-4 shrink-0 rounded-[7px]"
                  style={{ background: pl.color?.[0], borderBottom: `3px solid ${pl.color?.[1]}` }}
                />
                <span className="truncate">{pl.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{pl.trackcount}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  trailing,
  active,
  accent,
  sheet,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  active?: boolean;
  accent?: "primary";
  sheet?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-md text-left font-medium transition-colors",
        // Touch sizing on the mobile sheet, original compact sizing on desktop.
        sheet
          ? "tap-press min-h-[48px] gap-3 px-3 text-[15px] active:bg-white/[0.05]"
          : "gap-2.5 px-2.5 py-2 text-[12.5px]",
        active ? "bg-white/[0.07] text-foreground" : "text-foreground/90 hover:bg-white/[0.05]",
        accent === "primary" && "text-primary",
      )}
    >
      <Icon className={cn("shrink-0", sheet ? "size-5" : "size-3.5", accent === "primary" && "fill-primary")} />
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

/** Helper to open the context menu from any track element. */
export function useTrackContextMenu() {
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  return (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, track);
  };
}

/** Helper to open the context menu from any album element. */
export function useAlbumContextMenu() {
  const openAlbumContextMenu = usePlayer((s) => s.openAlbumContextMenu);
  return (e: React.MouseEvent, album: Album) => {
    e.preventDefault();
    openAlbumContextMenu(e.clientX, e.clientY, album);
  };
}

/** Helper to open the context menu from any artist element. */
export function useArtistContextMenu() {
  const openArtistContextMenu = usePlayer((s) => s.openArtistContextMenu);
  return (e: React.MouseEvent, artist: Artist) => {
    e.preventDefault();
    openArtistContextMenu(e.clientX, e.clientY, artist);
  };
}
