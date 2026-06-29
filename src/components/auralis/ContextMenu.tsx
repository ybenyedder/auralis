"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  ListPlus,
  Plus,
  Heart,
  ThumbsDown,
  Disc3,
  UserRound,
  ChevronRight,
  ListMusic,
  Share2,
  Radio,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { shareTrack } from "@/lib/auralis/share";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { albumsOfArtistFrom, artistPlayTotals, tracksOfAlbumFrom, tracksOfArtistFrom, useLibraryStore } from "@/store/library";
import { trackArtist, trackTitle, albumArtist, formatCount, paletteForName } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { Track, Album, Artist, ViewId } from "@/lib/auralis/types";

export function ContextMenuHost() {
  // Atomic selectors (always-mounted host). Only `contextMenu` and `customPlaylists`
  // are reactive values; the rest are stable action refs that never cause a render.
  const contextMenu = usePlayer((s) => s.contextMenu);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const closeContextMenu = usePlayer((s) => s.closeContextMenu);
  const playTrack = usePlayer((s) => s.playTrack);
  const playList = usePlayer((s) => s.playList);
  const startRadio = usePlayer((s) => s.startRadio);
  const addToQueueNext = usePlayer((s) => s.addToQueueNext);
  const addToQueueEnd = usePlayer((s) => s.addToQueueEnd);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const isFavorite = usePlayer((s) => s.isFavorite);
  const toggleDislike = usePlayer((s) => s.toggleDislike);
  const isDisliked = usePlayer((s) => s.isDisliked);
  const navigate = usePlayer((s) => s.navigate);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const addToPlaylist = usePlayer((s) => s.addToPlaylist);

  const [submenu, setSubmenu] = useState<"playlists" | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const trapRef = useRef<HTMLDivElement>(null);
  // Trap focus inside the open menu/sheet and restore it to the opener on close.
  useFocusTrap(contextMenu.open, trapRef);

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
      // Close on any press outside the menu surfaces. Matching by attribute rather
      // than a single ref covers BOTH shells — the desktop popover and the mobile
      // bottom sheet. (The previous ref only wrapped the desktop popover, so every
      // tap inside the mobile sheet read as "outside" and closed the menu before the
      // tap's click could fire — which is why "Add to playlist" did nothing on touch.)
      const el = e.target as Element | null;
      if (el?.closest("[data-context-menu]")) return;
      closeContextMenu();
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
          startRadio={startRadio}
          addToQueueNext={addToQueueNext}
          addToQueueEnd={addToQueueEnd}
          toggleFavorite={toggleFavorite}
          isFavorite={isFavorite}
          toggleDislike={toggleDislike}
          isDisliked={isDisliked}
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
          startRadio={startRadio}
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
          startRadio={startRadio}
          addToQueueEnd={addToQueueEnd}
          navigate={navigate}
        />
      )}
    </>
  );

  return (
    <div ref={trapRef}>
      {/* Desktop (lg+): the original cursor-anchored popover. */}
      <div className="fixed inset-0 z-[70] hidden lg:block">
        <div
          data-context-menu
          role="menu"
          className="scale-in matte-panel fixed w-[248px] overflow-hidden rounded-lg"
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
          data-context-menu
          role="menu"
          className="sheet-up matte-panel safe-bottom absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-lg border-x-0 border-b-0"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
          </div>
          {menu(true)}
        </div>
      </div>
    </div>
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
  startRadio,
  addToQueueNext,
  addToQueueEnd,
  toggleFavorite,
  isFavorite,
  toggleDislike,
  isDisliked,
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
  startRadio: (seedHash: string, seedTrack?: Track) => Promise<void>;
  addToQueueNext: (track: Track) => void;
  addToQueueEnd: (track: Track) => void;
  toggleFavorite: (trackhash: string) => void;
  isFavorite: (trackhash: string) => boolean;
  toggleDislike: (trackhash: string) => void;
  isDisliked: (trackhash: string) => boolean;
  navigate: (view: ViewId, id?: string) => void;
  customPlaylists: import("@/lib/auralis/types").Playlist[];
  createPlaylist: (name: string) => string;
  addToPlaylist: (id: string, track: Track) => void;
}) {
  const albums = useLibraryStore((state) => state.albums);
  const artists = useLibraryStore((state) => state.artists);
  const fav = isFavorite(track.trackhash);
  const disliked = isDisliked(track.trackhash);
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
          colors={track.color ?? paletteForName(track.trackhash)}
          initial={trackTitle(track)[0] || "A"}
          sheet={sheet}
        />
      )}
      <div className={cn(sheet ? "p-2" : "p-1.5", playlistOpen && "p-0")}>
        {!playlistOpen && (
          <>
            <MenuItem sheet={sheet} icon={Play} label="Lire maintenant" onClick={() => run(() => playTrack(track, [track], 0))} />
            <MenuItem sheet={sheet} icon={Radio} label="Démarrer une radio" onClick={() => run(() => void startRadio(track.trackhash, track))} />
            <MenuItem sheet={sheet} icon={ListPlus} label="Lire ensuite" onClick={() => run(() => addToQueueNext(track))} />
            <MenuItem sheet={sheet} icon={Plus} label="Ajouter à la file" onClick={() => run(() => addToQueueEnd(track))} />
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
              label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
              onClick={() => run(() => toggleFavorite(track.trackhash))}
              accent={fav ? "primary" : undefined}
            />
            <MenuItem
              sheet={sheet}
              icon={ThumbsDown}
              label={disliked ? "Ne plus masquer" : "Je n'aime pas"}
              onClick={() => run(() => toggleDislike(track.trackhash))}
              accent={disliked ? "primary" : undefined}
            />
            <MenuItem
              sheet={sheet}
              icon={Share2}
              label="Partager"
              onClick={() => run(() => void shareTrack(track, usePlayer.getState().notify))}
            />
            <div className="my-1 h-px bg-[var(--line)]" />
            {album && (
              <MenuItem
                sheet={sheet}
                icon={Disc3}
                label="Aller à l'album"
                onClick={() => run(() => navigate("album", album.albumhash))}
              />
            )}
            {artist && (
              <MenuItem
                sheet={sheet}
                icon={UserRound}
                label="Aller à l'artiste"
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
  startRadio,
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
  startRadio: (seedHash: string, seedTrack?: Track) => Promise<void>;
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
          colors={album.color ?? paletteForName(album.albumhash)}
          initial={album.title[0] || "A"}
          sheet={sheet}
        />
      )}
      <div className={cn(sheet ? "p-2" : "p-1.5", playlistOpen && "p-0")}>
        {!playlistOpen && (
          <>
            <MenuItem sheet={sheet} icon={Play} label="Lire l'album" onClick={() => run(() => playList(tracks, 0))} />
            {tracks[0] && (
              <MenuItem sheet={sheet} icon={Radio} label="Démarrer une radio" onClick={() => run(() => void startRadio(tracks[0].trackhash, tracks[0]))} />
            )}
            <MenuItem sheet={sheet} icon={ListPlus} label="Ajouter l'album à la file" onClick={() => run(addAlbumToQueue)} />
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
          labelOverride="Ajouter l'album à une playlist"
        />
        {!playlistOpen && (
          <>
            <div className="my-1 h-px bg-[var(--line)]" />
            <MenuItem sheet={sheet} icon={Disc3} label="Aller à l'album" onClick={() => run(() => navigate("album", album.albumhash))} />
            {artist && (
              <MenuItem
                sheet={sheet}
                icon={UserRound}
                label="Aller à l'artiste"
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
  startRadio,
  addToQueueEnd,
  navigate,
}: {
  artist: Artist;
  run: (fn: () => void) => void;
  sheet: boolean;
  playList: (list: Track[], startIndex?: number) => void;
  startRadio: (seedHash: string, seedTrack?: Track) => Promise<void>;
  addToQueueEnd: (track: Track) => void;
  navigate: (view: ViewId, id?: string) => void;
}) {
  const libraryTracks = useLibraryStore((state) => state.tracks);
  const albums = useLibraryStore((state) => state.albums);
  const playCounts = usePlayer((s) => s.playCounts);
  const topTracks = [...tracksOfArtistFrom(libraryTracks, artist.artisthash)].sort((a, b) => (playCounts[b.trackhash] ?? 0) - (playCounts[a.trackhash] ?? 0)).slice(0, 5);
  const albumCount = albumsOfArtistFrom(albums, artist.artisthash).length;
  const artistPlays = artistPlayTotals(libraryTracks, playCounts).get(artist.artisthash) ?? 0;

  return (
    <>
      <MenuHeader
        title={artist.name}
        subtitle={`${artistPlays > 0 ? `${formatCount(artistPlays)} écoutes · ` : ""}${artist.genres?.join(", ") || "Artiste"}`}
        colors={["#282828", "#3E3E3E", "#535353"]}
        initial={artist.name[0] || "A"}
        round
        sheet={sheet}
      />
      <div className={sheet ? "p-2" : "p-1.5"}>
        <MenuItem sheet={sheet} icon={Play} label="Lire les titres populaires" onClick={() => run(() => playList(topTracks, 0))} />
        {topTracks[0] && (
          <MenuItem sheet={sheet} icon={Radio} label="Démarrer une radio de l'artiste" onClick={() => run(() => void startRadio(topTracks[0].trackhash, topTracks[0]))} />
        )}
        <MenuItem sheet={sheet} icon={ListPlus} label="Ajouter les titres à la file" onClick={() => run(() => topTracks.forEach((t) => addToQueueEnd(t)))} />
        <div className="my-1 h-px bg-[var(--line)]" />
        <MenuItem sheet={sheet} icon={UserRound} label="Aller à l'artiste" onClick={() => run(() => navigate("artist", artist.artisthash))} />
        {albumCount > 0 && (
          <p className={cn("text-muted-foreground/70", sheet ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[10.5px]")}>{albumCount} albums · {artist.trackcount} titres</p>
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
          "grid shrink-0 place-items-center font-black text-white/90",
          sheet ? "size-12 text-[15px] rounded-2xl" : "size-9 text-[11px] rounded-xl",
          round && "rounded-full",
        )}
        style={{ background: colors[0] }}
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
          label={labelOverride ?? "Ajouter à une playlist"}
          trailing={<ChevronRight className="size-5 text-muted-foreground/70" />}
          onClick={() => setSubmenu("playlists")}
        />
      );
    }
    return (
      <div className="p-2">
        <button
          role="menuitem"
          onClick={() => setSubmenu(null)}
          className="tap-press mb-1 flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-semibold text-foreground active:bg-[var(--panel-2)]"
        >
          <ChevronRight className="size-5 rotate-180 text-muted-foreground/70" />
          {labelOverride ?? "Ajouter à une playlist"}
        </button>
        <div className="my-1 h-px bg-[var(--line)]" />
        <button
          role="menuitem"
          onClick={() => run(onCreate)}
          className="tap-press flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-semibold text-primary-soft active:bg-[var(--panel-2)]"
        >
          <Plus className="size-5" /> Nouvelle playlist
        </button>
        {customPlaylists.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-muted-foreground/70">Aucune playlist personnelle</p>
        ) : (
          customPlaylists.map((pl) => (
            <button
              key={pl.id}
              role="menuitem"
              onClick={() => run(() => onAdd(String(pl.id)))}
              className="tap-press flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium text-foreground/90 active:bg-[var(--panel-2)]"
            >
              <span
                className="size-5 shrink-0 rounded-sm"
                style={{ background: pl.color?.[0] }}
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
        label={labelOverride ?? "Ajouter à une playlist"}
        trailing={<ChevronRight className="size-3.5" />}
        onClick={() => setSubmenu(open ? null : "playlists")}
        active={open}
      />
      {open && (
        <div className="scale-in matte-panel mb-1 ml-2 max-h-[min(360px,60vh)] overflow-y-auto scroll-auralis rounded-md">
          <button
            role="menuitem"
            onClick={() => run(onCreate)}
            className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12px] font-semibold text-primary-soft hover:bg-[var(--panel-2)]"
          >
            <Plus className="size-3.5" /> Nouvelle playlist
          </button>
          {customPlaylists.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-muted-foreground/70">Aucune playlist personnelle</p>
          ) : (
            customPlaylists.map((pl) => (
              <button
                key={pl.id}
                role="menuitem"
                onClick={() => run(() => onAdd(String(pl.id)))}
                className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12px] font-medium text-foreground/90 hover:bg-[var(--panel-2)]"
              >
                <span
                  className="size-4 shrink-0 rounded-sm"
                  style={{ background: pl.color?.[0] }}
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
          ? "tap-press min-h-[48px] gap-3 px-3 text-[15px] active:bg-[var(--panel-2)]"
          : "gap-2.5 px-2.5 py-2 text-[12.5px]",
        active ? "bg-white/5 text-foreground" : "text-foreground/90 hover:bg-white/[0.04]",
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
