"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Disc3,
  Download,
  Radio,
  FileText,
  FolderOpen,
  HardDrive,
  ImagePlus,
  Info,
  ListMusic,
  Lock,
  LogOut,
  Palette,
  Pause,
  PencilLine,
  Play,
  Shuffle,
  Share2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useStats } from "@/store/stats";
import { THEMES, THEME_LIST, THEME_GROUPS, type Theme } from "@/lib/auralis/themes";
import { api } from "@/lib/auralis/api";
import {
  albumsOfArtistFrom,
  artistPlayTotals,
  tracksFromIndex,
  tracksOfAlbumFrom,
  tracksOfArtistFrom,
  useLibraryStore,
} from "@/store/library";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard } from "../Cards";
import { VirtualList, VirtualGrid } from "../Virtualized";
import { Artwork } from "../Artwork";
import {
  albumArtist,
  brand,
  coverVars,
  formatCount,
  formatLongDuration,
  paletteForName,
  plural,
} from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import type { Artist } from "@/lib/auralis/types";
import { CONTACT_EMAIL, PROJECT_REPO } from "@/lib/auralis/brand";
import { DonateButton, openDonate } from "../DonateReminder";
import { exportPlaylistM3U, exportPlaylistJSON } from "@/lib/auralis/playlistIO";
import { evaluateSmartList } from "@/lib/auralis/smartlist";
import { Heart } from "lucide-react";

const STORAGE_KEY = "auralis.vault.v1";

type SettingsSection =
  | "appearance"
  | "playback"
  | "library"
  | "lyrics"
  | "account"
  | "data"
  | "about";
type SettingsRow = {
  label: string;
  value: string;
  type: "text" | "toggle" | "action";
  active?: boolean;
  onAction?: () => void;
  tone?: "success" | "warning" | "danger";
};

export function AlbumDetail({ albumhash }: { albumhash: string }) {
  const playList = usePlayer((s) => s.playList);
  const startRadio = usePlayer((s) => s.startRadio);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const tracks = useLibraryStore((state) => state.tracks);
  const albums = useLibraryStore((state) => state.albums);
  const status = useLibraryStore((state) => state.status);
  const album = useMemo(
    () => albums.find((item) => item.albumhash === albumhash),
    [albums, albumhash],
  );
  const albumTracks = useMemo(
    () => (album ? tracksOfAlbumFrom(tracks, album.albumhash) : []),
    [album, tracks],
  );

  if (!album) return <EmptyDetail label="Album introuvable" loading={status !== "ready"} />;

  const colors = album.color ?? paletteForName(album.albumhash);
  const isPlayingThis =
    currentTrack?.albumhash === album.albumhash && isPlaying;
  const totalDuration = albumTracks.reduce(
    (sum, track) => sum + (track.duration || 0),
    0,
  );
  const primaryArtistHash = album.albumartists[0]?.artisthash ?? "";
  const otherAlbums = albumsOfArtistFrom(albums, primaryArtistHash)
    .filter((item) => item.albumhash !== album.albumhash)
    .slice(0, 6);

  return (
    <div className="fade-up">
      <section className="hero-cover px-4 pb-6 pt-7 lg:px-6 lg:pt-8" style={coverVars(colors)}>
        <div className="flex flex-col items-center text-center lg:flex-row lg:items-end lg:gap-6 lg:text-left">
          <Artwork
            title={album.title}
            albumhash={album.albumhash}
            size={208}
            rounded={12}
            colors={colors}
            image={album.image}
            fluid
            className="w-[min(56vw,240px)] aspect-square lg:w-52 lg:h-52"
          />
          <div className="mt-4 min-w-0 lg:mt-0 lg:pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
              Album
            </p>
            <h1 className="mt-1 text-[clamp(24px,7vw,32px)] font-black leading-tight tracking-tight text-foreground lg:text-[clamp(30px,4.5vw,56px)] lg:leading-none">
              {album.title}
            </h1>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {albumArtist(album)} · {album.year ?? "année inconnue"} ·{" "}
              {plural(albumTracks.length, "titre")} · {formatLongDuration(totalDuration)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-5">
          <button
            onClick={() => {
              if (currentTrack?.albumhash === album.albumhash) togglePlay();
              else playList(albumTracks, 0);
            }}
            disabled={albumTracks.length === 0}
            aria-label={isPlayingThis ? "Pause" : "Lire l'album"}
            className="signal-button grid h-14 w-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
          >
            {isPlayingThis ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={() => albumTracks.length && playList(shuffleArray(albumTracks), 0)}
            disabled={albumTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Lecture aléatoire de l'album"
          >
            <Shuffle className="size-6" />
          </button>
          <button
            onClick={() => albumTracks[0] && void startRadio(albumTracks[0].trackhash, albumTracks[0])}
            disabled={albumTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Démarrer une radio"
            title="Démarrer une radio"
          >
            <Radio className="size-6" />
          </button>
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        <TrackListHeader />
        <VirtualList items={albumTracks} itemKey={(t) => t.trackhash} estimateHeight={56} gap={2}>
          {(track, index) => (
            <TrackRow track={track} index={index} list={albumTracks} showAlbum={false} />
          )}
        </VirtualList>

        {otherAlbums.length > 0 && (
          <div className="mt-8">
            <SectionHeader
              title={`Autres albums de ${album.albumartists[0]?.name ?? "cet artiste"}`}
              eyebrow="Discographie"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {otherAlbums.map((item) => (
                <AlbumCard key={item.albumhash} album={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArtistDetail({ artisthash }: { artisthash: string }) {
  const playList = usePlayer((s) => s.playList);
  const startRadio = usePlayer((s) => s.startRadio);
  const playCounts = usePlayer((s) => s.playCounts);
  const tracks = useLibraryStore((state) => state.tracks);
  const artists = useLibraryStore((state) => state.artists);
  const albums = useLibraryStore((state) => state.albums);
  const status = useLibraryStore((state) => state.status);
  const artist = useMemo<Artist | undefined>(
    () => artists.find((item) => item.artisthash === artisthash),
    [artists, artisthash],
  );
  const artistAlbums = useMemo(
    () => albumsOfArtistFrom(albums, artisthash),
    [albums, artisthash],
  );
  // Compute the full artist track list ONCE, then derive the top-8 from it — so the
  // header count is the real total (not capped at 8) and the shuffle button reuses it.
  const artistTracks = useMemo(
    () => tracksOfArtistFrom(tracks, artisthash),
    [tracks, artisthash],
  );
  // "Popular" = the user's own most-played, from the player store's authoritative
  // counts (the catalogue is user-independent and carries no per-account plays).
  const topTracks = useMemo(
    () => [...artistTracks].sort((a, b) => (playCounts[b.trackhash] ?? 0) - (playCounts[a.trackhash] ?? 0)).slice(0, 8),
    [artistTracks, playCounts],
  );
  const artistPlays = artistPlayTotals(tracks, playCounts).get(artisthash) ?? 0;

  if (!artist) return <EmptyDetail label="Artiste introuvable" loading={status !== "ready"} />;
  const colors = paletteForName(artist.name);

  return (
    <div className="fade-up">
      <section className="hero-cover px-4 pb-6 pt-7 lg:px-6 lg:pt-8" style={coverVars(colors)}>
        <div className="relative flex flex-col items-center text-center lg:flex-row lg:items-end lg:gap-6 lg:text-left">
          {artist.image ? (
            <Artwork
              name={artist.name}
              artisthash={artist.artisthash}
              image={artist.image}
              size={176}
              rounded={999}
              colors={colors}
              fluid
              className="w-[min(52vw,200px)] aspect-square lg:size-44"
            />
          ) : (
            <div
              className="cover-fallback relative grid w-[min(52vw,200px)] aspect-square shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--line)] p-4 lg:size-44"
              style={{ backgroundColor: colors[0] }}
            >
              <span className="text-[18vw] font-black leading-none text-white/82 lg:text-[64px]">
                {artist.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="mt-4 min-w-0 lg:mt-0 lg:pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
              Artiste
            </p>
            <h1 className="mt-1 text-[clamp(24px,7vw,32px)] font-black leading-tight tracking-tight text-foreground lg:text-[clamp(30px,4.5vw,56px)] lg:leading-none">
              {artist.name}
            </h1>
            {artist.bio && (
              <p className="mt-3 max-w-xl text-[13px] text-muted-foreground">
                {artist.bio}
              </p>
            )}
            <p className="mt-2 text-[12px] text-muted-foreground">
              {artistPlays > 0 ? `${formatCount(artistPlays)} écoutes · ` : ""}
              {plural(artist.albumcount ?? artistAlbums.length, "album")} ·{" "}
              {plural(artist.trackcount ?? artistTracks.length, "titre")}
              {artist.genres?.length ? ` · ${artist.genres.join(", ")}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-5">
          <button
            onClick={() => topTracks.length && playList(topTracks, 0)}
            disabled={topTracks.length === 0}
            aria-label="Lire l'artiste"
            className="signal-button grid h-14 w-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
          >
            <Play className="size-6 fill-current ml-0.5" />
          </button>
          <button
            onClick={() => artistTracks.length && playList(shuffleArray(artistTracks), 0)}
            disabled={topTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Lecture aléatoire de l'artiste"
          >
            <Shuffle className="size-6" />
          </button>
          <button
            onClick={() => { const seed = topTracks[0] ?? artistTracks[0]; if (seed) void startRadio(seed.trackhash, seed); }}
            disabled={artistTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label="Démarrer une radio de l'artiste"
            title="Démarrer une radio"
          >
            <Radio className="size-6" />
          </button>
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        <SectionHeader title="Populaire" eyebrow="Titres" />
        <div className="mb-8 space-y-0.5">
          {topTracks.map((track, index) => (
            <TrackRow
              key={track.trackhash}
              track={track}
              index={index}
              list={topTracks}
              showAlbum
            />
          ))}
        </div>

        <SectionHeader
          title="Discographie"
          eyebrow={plural(artistAlbums.length, "album")}
        />
        <VirtualGrid items={artistAlbums} itemKey={(a) => a.albumhash} minItemWidth={160} gap={8} estimateRowHeight={232}>
          {(item) => <AlbumCard album={item} />}
        </VirtualGrid>
      </div>
    </div>
  );
}

export function PlaylistDetail({ id }: { id: string }) {
  const playList = usePlayer((s) => s.playList);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const renamePlaylist = usePlayer((s) => s.renamePlaylist);
  const setPlaylistCover = usePlayer((s) => s.setPlaylistCover);
  const deletePlaylist = usePlayer((s) => s.deletePlaylist);
  const navigate = usePlayer((s) => s.navigate);
  const removeFromPlaylist = usePlayer((s) => s.removeFromPlaylist);
  const reorderInPlaylist = usePlayer((s) => s.reorderInPlaylist);
  const sharePlaylist = usePlayer((s) => s.sharePlaylist);
  const addPlaylistCollaborator = usePlayer((s) => s.addPlaylistCollaborator);
  const trackIndex = useLibraryStore((state) => state.trackIndex);
  const allTracks = useLibraryStore((state) => state.tracks);
  const favorites = usePlayer((s) => s.favorites);
  const playCounts = usePlayer((s) => s.playCounts);
  const libraryPlaylists = useLibraryStore((state) => state.playlists);
  const status = useLibraryStore((state) => state.status);
  const libraryPlaylist = useMemo(
    () => libraryPlaylists.find((item) => String(item.id) === id),
    [libraryPlaylists, id],
  );
  const customPlaylist = useMemo(
    () => customPlaylists.find((item) => String(item.id) === id),
    [customPlaylists, id],
  );
  const playlist = customPlaylist ?? libraryPlaylist;
  const isCustom = Boolean(customPlaylist);
  const isSmart = Boolean(playlist?.rules);
  const isCollaborator = Boolean(playlist?.collaborator);
  // Smart playlists are computed LIVE from their rules against the whole library
  // (so they always reflect the current collection); static ones resolve hashes.
  const tracks = useMemo(() => {
    if (!playlist) return [];
    if (playlist.rules) return evaluateSmartList(allTracks, playlist.rules, { favorites, playCounts });
    return tracksFromIndex(trackIndex, playlist.trackhashes ?? []);
  }, [trackIndex, playlist, allTracks, favorites, playCounts]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!playlist) return <EmptyDetail label="Playlist introuvable" loading={isCustom ? false : status !== "ready"} />;

  const colors = playlist.color ?? paletteForName(playlist.name);
  // A user-set cover always wins; otherwise fall back to the first track with art.
  const coverImage = playlist.image ?? tracks.find((track) => track.image)?.image;

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const MAX_BYTES = 8 * 1024 * 1024;
    if (file.size > MAX_BYTES) { window.alert("Image trop lourde (8 Mo max)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setCoverBusy(true);
      void setPlaylistCover(id, String(reader.result)).finally(() => setCoverBusy(false));
    };
    reader.readAsDataURL(file);
  };
  const totalDuration = tracks.reduce(
    (sum, track) => sum + (track.duration || 0),
    0,
  );
  const isPlayingThis =
    tracks.some((track) => track.trackhash === currentTrack?.trackhash) &&
    isPlaying;

  const saveName = () => {
    if (isCustom && name.trim()) renamePlaylist(id, name.trim());
    setEditing(false);
  };

  const deleteCurrentPlaylist = () => {
    if (!isCustom) return;
    const ok = window.confirm(`Supprimer la playlist « ${playlist.name} » ?`);
    if (!ok) return;
    deletePlaylist(id);
    navigate("library");
  };

  return (
    <div className="fade-up">
      <section className="hero-cover px-4 pb-6 pt-7 lg:px-6 lg:pt-8" style={coverVars(colors)}>
        <div className="flex flex-col items-center text-center lg:flex-row lg:items-end lg:gap-6 lg:text-left">
          <div className="group relative w-[min(56vw,240px)] shrink-0 lg:size-[208px]">
            {coverImage ? (
              <Artwork
                name={playlist.name}
                image={coverImage}
                size={208}
                rounded={12}
                colors={colors}
                showInitials={false}
                fluid
                className="aspect-square size-full"
              />
            ) : (
              <div
                className="cover-fallback relative flex aspect-square size-full items-end overflow-hidden rounded-lg border border-[var(--line)] p-4"
                style={{ backgroundColor: colors[0] }}
              >
                <span className="relative text-[18px] font-black leading-tight text-white">
                  {playlist.name}
                </span>
              </div>
            )}
            {isCustom && !isCollaborator && (
              <>
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverBusy}
                  aria-label="Changer la pochette"
                  title="Changer la pochette"
                  className="absolute inset-0 grid place-items-center rounded-lg bg-black/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 disabled:opacity-100"
                >
                  <span className="flex flex-col items-center gap-1.5 text-white">
                    <ImagePlus className="size-7" />
                    <span className="text-[11px] font-semibold">{coverBusy ? "Envoi…" : "Changer la pochette"}</span>
                  </span>
                </button>
                {/* Always-visible badge — the hover overlay above is desktop-only discoverable,
                    this keeps the affordance reachable on touch (no hover state there). */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/65 text-white opacity-100 transition-opacity duration-200 group-hover:opacity-0"
                >
                  <ImagePlus className="size-4" />
                </span>
              </>
            )}
          </div>
          <div className="mt-4 w-full min-w-0 lg:mt-0 lg:w-auto lg:pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
              {isCollaborator
                ? `Collaboratif · de ${playlist.owner ?? "un membre"}`
                : isSmart
                  ? "Smart playlist · règles dynamiques"
                  : playlist.shared
                    ? "Playlist partagée"
                    : isCustom
                      ? "Playlist locale"
                      : "Playlist catalogue"}
            </p>
            {editing && isCustom ? (
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={saveName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") {
                    setName(playlist.name);
                    setEditing(false);
                  }
                }}
                className="mt-1 w-full rounded-md border border-[var(--line-strong)] bg-black/20 px-3 py-2 text-center text-[22px] font-black leading-tight tracking-tight text-foreground outline-none lg:text-left lg:text-[clamp(30px,4.5vw,56px)] lg:leading-none"
              />
            ) : (
              <h1 className="mt-1 text-[clamp(24px,7vw,32px)] font-black leading-tight tracking-tight text-foreground lg:text-[clamp(30px,4.5vw,56px)] lg:leading-none">
                {playlist.name}
              </h1>
            )}
            {playlist.description && (
              <p className="mt-3 max-w-xl text-[13px] text-muted-foreground">
                {playlist.description}
              </p>
            )}
            <p className="mt-3 text-[13px] text-muted-foreground">
              {plural(tracks.length, "titre")} · {formatLongDuration(totalDuration)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-5">
          <button
            onClick={() => {
              if (isPlayingThis) togglePlay();
              else playList(tracks, 0);
            }}
            disabled={tracks.length === 0}
            aria-label={isPlayingThis ? "Pause" : "Lire la playlist"}
            className="signal-button grid h-14 w-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
          >
            {isPlayingThis ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current ml-0.5" />
            )}
          </button>
          {isCustom && (
            <>
              {!isCollaborator && (
                <button
                  onClick={() => { setName(playlist.name); setEditing(true); }}
                  className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <PencilLine className="size-5" /> Renommer
                </button>
              )}
              {!isCollaborator && (
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverBusy}
                  className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <ImagePlus className="size-5" /> {coverBusy ? "Envoi…" : "Pochette"}
                </button>
              )}
              {!isCollaborator && !isSmart && (
                <>
                  <button
                    onClick={() => sharePlaylist(id, !playlist.shared)}
                    className={cn("flex items-center gap-2 text-[13px] font-bold transition-colors", playlist.shared ? "text-primary hover:text-foreground" : "text-muted-foreground hover:text-foreground")}
                    title={playlist.shared ? "Partage activé — cliquez pour révoquer" : "Partager pour collaborer en famille"}
                  >
                    <Share2 className="size-5" /> {playlist.shared ? "Partagée" : "Partager"}
                  </button>
                  {playlist.shared && (
                    <button
                      onClick={() => { const u = window.prompt("Inviter un collaborateur (nom d'utilisateur) :"); if (u && u.trim()) void addPlaylistCollaborator(id, u.trim()); }}
                      className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                      title="Inviter un collaborateur par nom d'utilisateur"
                    >
                      <Users className="size-5" /> Inviter
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => exportPlaylistM3U(playlist.name, tracks)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                title="Exporter en M3U (lisible par VLC, foobar2000…)"
              >
                <Download className="size-5" /> M3U
              </button>
              <button
                onClick={() => exportPlaylistJSON(playlist.name, tracks)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                title="Exporter en JSON (réimport exact sur Auralis)"
              >
                <Download className="size-5" /> JSON
              </button>
              {!isCollaborator && (
                <button
                  onClick={deleteCurrentPlaylist}
                  className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-5" /> Supprimer
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        {tracks.length > 0 ? (
          <>
            <TrackListHeader />
            <VirtualList items={tracks} itemKey={(t) => t.trackhash} estimateHeight={56} gap={2}>
              {(track, index) => (
                <div className="group/playlist flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <TrackRow track={track} index={index} list={tracks} />
                  </div>
                  {isCustom && !isSmart && !isCollaborator && (
                    <div className="flex shrink-0 flex-col transition-opacity duration-200 lg:opacity-0 lg:group-hover/playlist:opacity-100 lg:focus-within:opacity-100">
                      <button
                        onClick={() => reorderInPlaylist(id, index, index - 1)}
                        disabled={index === 0}
                        aria-label={`Monter ${track.title}`}
                        className="grid h-5 w-9 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        onClick={() => reorderInPlaylist(id, index, index + 1)}
                        disabled={index === tracks.length - 1}
                        aria-label={`Descendre ${track.title}`}
                        className="grid h-5 w-9 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  )}
                  {isCustom && !isSmart && (
                    // One in-flow affordance (no absolute overlay over the row's own
                    // like/menu controls): always reachable on touch, hover-revealed on
                    // desktop while still reserving its slot so nothing overlaps.
                    <button
                      onClick={() => removeFromPlaylist(id, track.trackhash)}
                      aria-label={`Retirer ${track.title}`}
                      className="tap-press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-destructive/20 bg-destructive/10 text-destructive transition-opacity duration-200 hover:bg-destructive/20 lg:h-9 lg:w-9 lg:opacity-0 lg:group-hover/playlist:opacity-100 lg:focus-visible:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              )}
            </VirtualList>
          </>
        ) : (
          <div className="matte-panel rounded-lg p-8 text-center">
            <ListMusic className="mx-auto mb-3 size-8 text-muted-foreground/45" />
            <p className="text-[13px] font-bold text-foreground">
              Playlist vide
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {isSmart
                ? "Aucun titre ne correspond aux règles de cette smart playlist pour le moment."
                : "Ajoute des titres depuis le menu contextuel d’un morceau."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsView() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const repeat = usePlayer((s) => s.repeat);
  const shuffle = usePlayer((s) => s.shuffle);
  const sleepTimer = usePlayer((s) => s.sleepTimer);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const autoplay = usePlayer((s) => s.autoplay);
  const toggleAutoplay = usePlayer((s) => s.toggleAutoplay);
  const normalization = usePlayer((s) => s.normalization);
  const setNormalization = usePlayer((s) => s.setNormalization);
  const crossfade = usePlayer((s) => s.crossfade);
  const setCrossfade = usePlayer((s) => s.setCrossfade);
  const startSleepTimer = usePlayer((s) => s.startSleepTimer);
  const cancelSleepTimer = usePlayer((s) => s.cancelSleepTimer);
  const theme = usePlayer((s) => s.theme);
  const setTheme = usePlayer((s) => s.setTheme);
  const rightPanelOpen = usePlayer((s) => s.rightPanelOpen);
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel);
  const locale = usePlayer((s) => s.locale);
  const setLocale = usePlayer((s) => s.setLocale);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const favorites = usePlayer((s) => s.favorites);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const playCounts = usePlayer((s) => s.playCounts);
  const resetServerStats = usePlayer((s) => s.resetServerStats);
  const notify = usePlayer((s) => s.notify);
  const tracks = useLibraryStore((state) => state.tracks);
  const albums = useLibraryStore((state) => state.albums);
  const artists = useLibraryStore((state) => state.artists);
  const root = useLibraryStore((state) => state.root);
  const status = useLibraryStore((state) => state.status);
  const error = useLibraryStore((state) => state.error);
  const scannedAt = useLibraryStore((state) => state.scannedAt);
  const rescan = useLibraryStore((state) => state.rescan);
  const load = useLibraryStore((state) => state.load);
  const scanProgress = useLibraryStore((state) => state.scan);
  const [section, setSection] = useState<SettingsSection>("playback");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tracksWithLyrics = tracks.filter(
    (track) => (track.lyrics?.length ?? 0) > 0,
  ).length;
  const totalDuration = tracks.reduce(
    (sum, track) => sum + (track.duration || 0),
    0,
  );
  const totalPlays = Object.values(playCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const exportStorage = () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? "{}";
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auralis-local-state-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Données locales exportées");
  };

  const importStorage = (file?: File) => {
    if (!file || typeof window === "undefined") return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "{}");
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object")
          throw new Error("JSON invalide");
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        window.location.reload();
      } catch {
        notify("Import refusé : fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  };

  const clearStorage = () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(
      "Effacer favoris, playlists, historique, volume et thème locaux ?",
    );
    if (!ok) return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  // Server-side: wipe play counts / recents / streak (favourites + playlists kept).
  const resetStats = () => {
    if (typeof window === "undefined") return;
    if (!window.confirm("Réinitialiser ton historique d'écoute (compteurs, récents, série) ? Tes favoris et playlists sont conservés.")) return;
    resetServerStats();
    void useStats.getState().fetchStats();
  };

  // Repoint the music library at a host-chosen folder. On the desktop app a native
  // folder picker is used; on the web a path prompt. The server persists it and
  // rescans, then we reload the library so the new tracks appear immediately.
  const changeMusicDir = async () => {
    const desktop = (window as unknown as { auralisDesktop?: { pickFolder?: () => Promise<string | null> } }).auralisDesktop;
    let dir: string | null = null;
    if (desktop?.pickFolder) {
      dir = await desktop.pickFolder();
    } else if (typeof window !== "undefined") {
      dir = window.prompt("Chemin du dossier de musique à scanner :", root ?? "");
    }
    if (!dir) return;
    try {
      await api.post("/api/library/source", { dir });
      notify("Dossier de musique mis à jour — indexation…");
      await load();
    } catch {
      notify("Dossier invalide ou inaccessible");
    }
  };

  // Desktop only: forget the saved source (URL vs local folder) and relaunch into
  // the first-run chooser. Lets the user switch between a remote server and local.
  const desktopBridge = (typeof window !== "undefined"
    ? (window as unknown as { auralisDesktop?: { reconfigure?: () => void } }).auralisDesktop
    : undefined);
  const reconfigureSource = () => {
    if (!desktopBridge?.reconfigure) return;
    if (!window.confirm("Changer la source d'Auralis (URL d'un serveur distant ou dossier local) ? L'application va redémarrer.")) return;
    desktopBridge.reconfigure();
  };

  const settingsSections: {
    id: SettingsSection;
    label: string;
    detail: string;
    icon: LucideIcon;
  }[] = [
    {
      id: "playback",
      label: "Lecture",
      detail: "Volume, shuffle, repeat, sleep timer",
      icon: Volume2,
    },
    {
      id: "library",
      label: "Bibliothèque",
      detail: "Scan local et index courant",
      icon: FolderOpen,
    },
    {
      id: "lyrics",
      label: "Paroles",
      detail: "État réel des fichiers .lrc",
      icon: FileText,
    },
    {
      id: "appearance",
      label: "Interface",
      detail: "Accent et panneau de lecture",
      icon: Palette,
    },
    {
      id: "account",
      label: "Compte",
      detail: "Mot de passe admin, déconnexion",
      icon: Lock,
    },
    {
      id: "data",
      label: "Données locales",
      detail: "Export, import, reset",
      icon: HardDrive,
    },
    {
      id: "about",
      label: "À propos",
      detail: "Version et contrat produit",
      icon: Info,
    },
  ];

  const playbackRows: SettingsRow[] = [
    {
      label: "Volume",
      value: `${Math.round(volume * 100)} %`,
      type: "action",
      onAction: () => setVolume(volume >= 1 ? 0.5 : Math.min(1, volume + 0.1)),
    },
    {
      label: "Muet",
      value: muted ? "Activé" : "Désactivé",
      type: "toggle",
      active: muted,
      onAction: toggleMute,
    },
    {
      label: "Shuffle",
      value: shuffle ? "Activé" : "Désactivé",
      type: "toggle",
      active: shuffle,
      onAction: toggleShuffle,
    },
    { label: "Repeat", value: repeat, type: "action", onAction: cycleRepeat },
    {
      label: "Lecture continue",
      value: autoplay ? "Activée" : "Désactivée",
      type: "toggle",
      active: autoplay,
      onAction: toggleAutoplay,
    },
    {
      label: "Normalisation du volume",
      value: normalization === "off" ? "Désactivée" : normalization === "album" ? "Par album" : "Par titre",
      type: "action",
      onAction: () => setNormalization(normalization === "off" ? "track" : normalization === "track" ? "album" : "off"),
    },
    {
      label: "Fondu enchaîné (entrée)",
      value: crossfade > 0 ? `${crossfade} s` : "Désactivé",
      type: "action",
      onAction: () => setCrossfade(crossfade >= 12 ? 0 : crossfade === 0 ? 3 : crossfade === 3 ? 6 : 12),
    },
    sleepTimer.active
      ? {
          label: "Sleep timer",
          value: "Annuler",
          type: "action",
          onAction: cancelSleepTimer,
          tone: "warning",
        }
      : {
          label: "Sleep timer",
          value: "30 min",
          type: "action",
          onAction: () => startSleepTimer(30),
        },
  ];

  const libraryRows: SettingsRow[] = [
    {
      label: "Statut scan",
      value:
        status === "loading"
          ? "Scan en cours"
          : status === "ready"
            ? "Prêt"
            : status === "error"
              ? "Erreur"
              : "En attente",
      type: "text",
      tone:
        status === "ready"
          ? "success"
          : status === "error"
            ? "danger"
            : "warning",
    },
    {
      label: "Dossier source",
      value: root ?? "AURALIS_MUSIC_DIR ou ~/Music",
      type: "text",
    },
    {
      label: "Changer le dossier",
      value: "Parcourir…",
      type: "action",
      onAction: () => void changeMusicDir(),
    },
    { label: "Titres indexés", value: String(tracks.length), type: "text" },
    { label: "Albums", value: String(albums.length), type: "text" },
    { label: "Artistes", value: String(artists.length), type: "text" },
    {
      label: "Durée totale",
      value: formatLongDuration(totalDuration),
      type: "text",
    },
    {
      label: "Dernier scan",
      value: scannedAt ? new Date(scannedAt).toLocaleString() : "Jamais",
      type: "text",
    },
    {
      label: "Relancer le scan",
      value: scanProgress?.status === "scanning"
        ? `Scan… ${scanProgress.processed}/${scanProgress.total || "?"}`
        : status === "loading" ? "Scan…" : "Scanner",
      type: "action",
      onAction: () => void rescan(),
    },
    {
      label: "Analyse des humeurs",
      value: scanProgress?.analyzing
        ? `Analyse… ${scanProgress.analyzed ?? 0}/${scanProgress.analyzeTotal ?? "?"}`
        : "Classer par humeur",
      type: "action",
      onAction: () => { void api.post("/api/library/analyze", {}); },
    },
    ...(desktopBridge?.reconfigure
      ? [{
          label: "Changer la source",
          value: "URL ou dossier…",
          type: "action" as const,
          onAction: reconfigureSource,
        }]
      : []),
  ];

  const lyricsRows: SettingsRow[] = [
    {
      label: "Titres avec paroles",
      value: `${tracksWithLyrics} / ${tracks.length}`,
      type: "text",
      tone: tracksWithLyrics > 0 ? "success" : "warning",
    },
    { label: "Source supportée", value: "Fichier .lrc sidecar", type: "text" },
    {
      label: "Affichage",
      value: tracksWithLyrics > 0 ? "Activé par titre" : "Masqué si vide",
      type: "text",
    },
    { label: "Convention", value: "song.mp3 + song.lrc", type: "text" },
  ];

  const dataRows: SettingsRow[] = [
    { label: "Favoris", value: String(favorites.size), type: "text" },
    {
      label: "Playlists locales",
      value: String(customPlaylists.length),
      type: "text",
    },
    {
      label: "Historique récent",
      value: String(recentTrackhashes.length),
      type: "text",
    },
    { label: "Écoutes enregistrées", value: String(totalPlays), type: "text" },
    {
      label: "Exporter",
      value: "JSON",
      type: "action",
      onAction: exportStorage,
    },
    {
      label: "Importer",
      value: "JSON",
      type: "action",
      onAction: () => fileInputRef.current?.click(),
    },
    {
      label: "Réinitialiser l'écoute",
      value: "Effacer",
      type: "action",
      onAction: resetStats,
      tone: "danger",
    },
    {
      label: "Réinitialiser",
      value: "Effacer",
      type: "action",
      onAction: clearStorage,
      tone: "danger",
    },
  ];

  const aboutRows: SettingsRow[] = [
    { label: "Version", value: `Auralis ${brand.version}`, type: "text" },
    { label: "Mode", value: "Lecteur local personnel", type: "text" },
    { label: "Bibliothèque", value: plural(tracks.length, "titre"), type: "text" },
    { label: "Contact", value: CONTACT_EMAIL, type: "text" },
    {
      label: "Code source",
      value: "GitHub",
      type: "action",
      onAction: () => window.open(PROJECT_REPO, "_blank", "noopener,noreferrer"),
    },
    {
      label: "Soutenir le projet",
      value: "Faire un don",
      type: "action",
      onAction: openDonate,
    },
  ];

  const activeSection = settingsSections.find((item) => item.id === section);

  return (
    <div className="fade-up px-4 py-5 lg:px-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          importStorage(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      <div className="mb-6">
        <h1 className="text-[30px] font-black tracking-tight text-foreground">
          Réglages
        </h1>
        {error && (
          <p className="mt-2 max-w-2xl text-[12px] font-bold text-amber">
            {error}
          </p>
        )}
      </div>

      {/* Mobile / tablet: horizontally scrollable section chips */}
      <div className="-mx-4 mb-4 xl:hidden">
        <div className="snap-x flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {settingsSections.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                aria-pressed={isActive}
                className={cn(
                  "tap-press flex h-11 shrink-0 snap-start items-center gap-2 rounded-full border border-transparent px-4 text-[13px] font-bold transition-all duration-200",
                  isActive
                    ? "bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "bg-white/5 text-muted-foreground hover:bg-white/[0.07]",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary-soft" : "text-muted-foreground",
                  )}
                />
                {item.label}
              </button>
            );
          })}
        </div>
        {activeSection && (
          <p className="mt-2 px-1 text-[11.5px] text-muted-foreground/75">
            {activeSection.detail}
          </p>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="matte-panel hidden rounded-lg p-3 xl:sticky xl:top-5 xl:block xl:self-start">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/75">
            Sections
          </p>
          <div className="space-y-1">
            {settingsSections.map((item) => (
              <SettingsNavItem
                key={item.id}
                {...item}
                active={section === item.id}
                onClick={() => setSection(item.id)}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          {section === "appearance" && (
            <>
              <ThemeGallery theme={theme} setTheme={setTheme} />
              <SettingsCard
                title="Interface"
                rows={[
                  {
                    label: "Langue",
                    value: locale === "en" ? "English" : "Français",
                    type: "action",
                    onAction: () => setLocale(locale === "fr" ? "en" : "fr"),
                  },
                  {
                    label: "Panneau de lecture",
                    value: rightPanelOpen ? "Visible" : "Masqué",
                    type: "toggle",
                    active: rightPanelOpen,
                    onAction: toggleRightPanel,
                  },
                ]}
              />
            </>
          )}

          {section === "playback" && (
            <SettingsCard title="Lecture" rows={playbackRows} />
          )}
          {section === "library" && (
            <SettingsCard title="Bibliothèque locale" rows={libraryRows} />
          )}
          {section === "lyrics" && (
            <SettingsCard title="Paroles" rows={lyricsRows} />
          )}
          {section === "account" && <AccountSettings />}
          {section === "data" && (
            <SettingsCard title="Données locales" rows={dataRows} />
          )}
          {section === "about" && (
            <>
              <div className="matte-panel rounded-lg p-5">
                <div className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-soft">
                    <Heart className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-black leading-tight text-foreground">
                      Soutenir Auralis
                    </h3>
                    <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
                      Gratuit, sans pub et sans pistage. Un don aide à couvrir le
                      développement et la maintenance — merci&nbsp;!
                    </p>
                    <DonateButton className="mt-3" />
                  </div>
                </div>
              </div>
              <SettingsCard title="À propos" rows={aboutRows} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SettingsNavItem({
  label,
  detail,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-200",
        active
          ? "bg-white/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary-soft" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold">{label}</span>
        <span className="block truncate text-[10.5px] opacity-70">
          {detail}
        </span>
      </span>
    </button>
  );
}

function SettingsCard({ title, rows }: { title: string; rows: SettingsRow[] }) {
  return (
    <div className="matte-panel rounded-lg p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        {title}
      </p>
      <div className="space-y-1">
        {rows.map((row) => {
          const valueClass = cn(
            "text-[12.5px]",
            row.tone === "success"
              ? "text-emerald font-bold"
              : row.tone === "danger"
                ? "text-destructive font-bold"
                : row.tone === "warning"
                  ? "text-amber font-bold"
                  : "text-muted-foreground",
          );
          return (
            <div
              key={row.label}
              className="flex min-h-[44px] items-center justify-between gap-4 border-b border-[var(--line)] py-2 last:border-0 lg:min-h-0"
            >
              <span className="min-w-0 text-[13px] text-foreground/90">
                {row.label}
              </span>
              {row.type === "toggle" ? (
                <button
                  onClick={row.onAction}
                  className={cn(
                    "tap-press flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-all duration-300 lg:h-5 lg:w-9",
                    row.active
                      ? "justify-end bg-primary"
                      : "justify-start bg-white/10",
                  )}
                  aria-label={row.label}
                  aria-pressed={row.active}
                >
                  <span className="size-6 rounded-full bg-white shadow-sm lg:size-4" />
                </button>
              ) : row.type === "action" && row.onAction ? (
                <button
                  onClick={row.onAction}
                  className={cn(
                    "tap-press flex min-h-[40px] shrink-0 items-center rounded-full border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-4 text-[13px] font-bold transition-colors duration-200 lg:min-h-0 lg:px-3 lg:py-1 lg:text-[12px]",
                    row.tone === "danger"
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "bg-white/5 text-foreground hover:bg-white/10",
                  )}
                >
                  {row.value}
                </button>
              ) : (
                <span className={valueClass}>{row.value}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Theme gallery (appearance settings) -----------------------------------
function ThemeGallery({ theme, setTheme }: { theme: string; setTheme: (id: string) => void }) {
  const current = THEMES[theme] ?? THEME_LIST[0];
  return (
    <div className="matte-panel rounded-lg p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--brass)]">
            Thème
          </p>
          <h2 className="mt-0.5 text-[18px] font-black leading-tight text-foreground">
            {current.label}
          </h2>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
            {current.blurb}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-transparent bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-3 py-1 text-[10.5px] font-bold text-muted-foreground">
          {THEME_LIST.length} thèmes
        </span>
      </div>

      <div className="space-y-5">
        {THEME_GROUPS.map((group) => {
          const themes = THEME_LIST.filter((t) => t.group === group.id);
          if (themes.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/65">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {themes.map((t) => (
                  <ThemePreview
                    key={t.id}
                    theme={t}
                    active={t.id === theme}
                    onPick={() => setTheme(t.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThemePreview({ theme, active, onPick }: { theme: Theme; active: boolean; onPick: () => void }) {
  const glassy = theme.group !== "classic";
  const [c0, c1, c2] = theme.swatch;
  const primary = theme.vars.primary;
  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      aria-label={theme.label}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl border border-transparent p-2 text-left transition-all duration-200",
        active
          ? "bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          : "hover:bg-white/[0.04]",
      )}
    >
      <div
        className="relative h-16 w-full overflow-hidden rounded-lg lg:h-[72px]"
        style={{
          background: `radial-gradient(120% 90% at 24% 18%, ${c1}66, transparent 55%), linear-gradient(150deg, ${c0}, ${c2})`,
        }}
      >
        {/* signal dot — the theme's primary action colour */}
        <span
          className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 rounded-full ring-1 ring-black/30"
          style={{ background: primary }}
        />
        {active && (
          <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-white text-black">
            <CheckCircle2 className="size-3.5" />
          </span>
        )}
        {glassy && (
          <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black/45 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.04em] text-white/90">
            Verre
          </span>
        )}
      </div>
      <span
        className={cn(
          "truncate px-0.5 text-[11.5px] font-bold",
          active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {theme.label}
      </span>
    </button>
  );
}

function EmptyDetail({ label, loading = false }: { label: string; loading?: boolean }) {
  // While the library is still hydrating, a deep-linked entity isn't "introuvable"
  // yet — it just hasn't loaded. Render a calm blank area (no error glyph, no
  // spinner) so the real content simply appears, instead of flashing an error.
  if (loading) return <div className="h-full min-h-[60vh]" aria-hidden />;
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
        <Disc3 className="size-7 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
    </div>
  );
}

function AccountSettings() {
  const notify = usePlayer((state) => state.notify);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    if (busy) return;
    if (!current || !next) return notify("Remplis les champs");
    if (next.length < 6) return notify("Le nouveau mot de passe doit faire au moins 6 caractères");
    if (next !== confirm) return notify("La confirmation ne correspond pas");
    setBusy(true);
    try {
      const res = await fetch(api.url("/api/auth/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) notify(data.error ?? "Échec du changement de mot de passe");
      else {
        // Token clients (Android) must adopt the re-issued token — the change just
        // invalidated the old one. Cookie clients (web/desktop) update transparently.
        if (data.token && api.token()) api.setToken(data.token);
        notify("Mot de passe mis à jour");
        setCurrent(""); setNext(""); setConfirm("");
      }
    } catch {
      notify("Serveur injoignable");
    }
    setBusy(false);
  };

  const logout = async () => {
    try { await fetch(api.url("/api/auth/logout"), { method: "POST" }); } catch { /* reload anyway */ }
    api.setToken(""); // drop the persisted token so logout actually sticks
    window.location.reload();
  };

  const inputClass = "h-12 w-full rounded-xl border border-transparent bg-[var(--panel-2)] px-4 text-[16px] text-foreground outline-none transition-all duration-200 focus:bg-[var(--panel-3)] focus:ring-2 focus:ring-white/10 lg:h-auto lg:py-2.5 lg:text-[14px]";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-[14px] font-black text-foreground">Mot de passe admin</h3>
        <p className="mb-4 text-[12px] text-muted-foreground/70">
          Le mot de passe initial est généré aléatoirement au premier démarrage (écrit dans
          {" "}<code className="rounded bg-[var(--panel-2)] px-1">INITIAL_ADMIN_PASSWORD.txt</code> du dossier de données),
          ou défini via <code className="rounded bg-[var(--panel-2)] px-1">AURALIS_ADMIN_PASSWORD</code>. Change-le ici pour le personnaliser.
        </p>
        <div className="space-y-2.5 lg:max-w-sm">
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Mot de passe actuel" className={inputClass} />
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Nouveau mot de passe" className={inputClass} />
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirmer le nouveau" className={inputClass} />
          <button
            onClick={changePassword}
            disabled={busy}
            className="signal-button tap-press mt-1 h-12 w-full rounded-full px-5 text-[14px] font-bold transition-colors duration-200 disabled:opacity-40 lg:h-auto lg:w-auto lg:py-2.5 lg:text-[13px]"
          >
            {busy ? "Mise à jour…" : "Changer le mot de passe"}
          </button>
        </div>
      </div>

      <AccountManager />

      <div className="border-t border-[var(--line)] pt-5">
        <button
          onClick={logout}
          className="ghost-button tap-press flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:h-auto lg:w-auto lg:justify-start lg:py-2.5 lg:text-[13px]"
        >
          <LogOut className="size-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

interface ManagedUser {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: number;
}

/** Admin-only account management. Renders nothing for non-admins (403 from the API). */
function AccountManager() {
  const notify = usePlayer((state) => state.notify);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [me, setMe] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(api.url("/api/auth/users"), { cache: "no-store", headers: api.headers() });
      if (!res.ok) { setIsAdmin(false); return; }
      const data = (await res.json()) as { users: ManagedUser[]; me: number };
      setUsers(data.users);
      setMe(data.me);
      setIsAdmin(true);
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || password.length < 6) return notify("Identifiant requis et mot de passe ≥ 6 caractères");
    setBusy(true);
    try {
      const res = await fetch(api.url("/api/auth/users"), {
        method: "POST",
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username: name.trim(), password, isAdmin: makeAdmin }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) notify(data.error ?? "Création impossible");
      else {
        notify(`Compte « ${name.trim().toLowerCase()} » créé`);
        setName(""); setPassword(""); setMakeAdmin(false);
        void load();
      }
    } catch {
      notify("Serveur injoignable");
    }
    setBusy(false);
  };

  const remove = async (u: ManagedUser) => {
    if (!window.confirm(`Supprimer le compte « ${u.username} » et toutes ses données ?`)) return;
    try {
      const res = await fetch(api.url(`/api/auth/users?id=${u.id}`), { method: "DELETE", headers: api.headers() });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) notify(data.error ?? "Suppression impossible");
      else { notify("Compte supprimé"); void load(); }
    } catch {
      notify("Serveur injoignable");
    }
  };

  const resetPassword = async (u: ManagedUser) => {
    const pw = window.prompt(`Nouveau mot de passe pour « ${u.username} » (≥ 6 caractères)`);
    if (pw === null) return;
    if (pw.length < 6) return notify("Le mot de passe doit faire au moins 6 caractères");
    try {
      const res = await fetch(api.url("/api/auth/users"), {
        method: "PUT",
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: u.id, password: pw }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) notify(data.error ?? "Échec");
      else {
        // Self-reset re-issues the session (token clients must adopt it).
        if (data.token && api.token()) api.setToken(data.token);
        notify("Mot de passe réinitialisé");
      }
    } catch {
      notify("Serveur injoignable");
    }
  };

  if (!isAdmin) return null;

  const inputClass = "h-12 w-full rounded-xl border border-transparent bg-[var(--panel-2)] px-4 text-[16px] text-foreground outline-none transition-all duration-200 focus:bg-[var(--panel-3)] focus:ring-2 focus:ring-white/10 lg:h-auto lg:py-2.5 lg:text-[14px]";

  return (
    <div className="border-t border-[var(--line)] pt-5">
      <h3 className="mb-1 flex items-center gap-2 text-[14px] font-black text-foreground">
        <ShieldCheck className="size-4 text-primary-soft" /> Comptes
      </h3>
      <p className="mb-4 text-[12px] text-muted-foreground/70">
        Chaque compte a ses propres favoris, playlists et historique.
      </p>

      <div className="mb-4 space-y-1.5">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex items-center gap-2 rounded-xl border border-transparent bg-[var(--panel-2)] px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground">
              {u.username}
              {u.isAdmin && <span className="ml-2 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-primary">Admin</span>}
              {u.id === me && <span className="ml-2 text-[11px] font-medium text-muted-foreground/60">(vous)</span>}
            </span>
            <button onClick={() => resetPassword(u)} className="ghost-button shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors duration-200 hover:bg-white/10" aria-label="Réinitialiser le mot de passe">
              Mot de passe
            </button>
            {u.id !== me && (
              <button onClick={() => remove(u)} className="tap-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors duration-200 hover:bg-destructive/15 hover:text-[var(--destructive)]" aria-label="Supprimer le compte">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={create} className="space-y-2.5 lg:max-w-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Identifiant (ex. famille)" autoCapitalize="off" autoCorrect="off" autoComplete="off" className={inputClass} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (≥ 6 caractères)" autoComplete="new-password" className={inputClass} />
        <label className="flex items-center gap-2 px-1 text-[13px] font-semibold text-muted-foreground">
          <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Administrateur (peut gérer les comptes)
        </label>
        <button type="submit" disabled={busy} className="signal-button tap-press flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors duration-200 disabled:opacity-40 lg:h-auto lg:w-auto lg:py-2.5 lg:text-[13px]">
          <UserPlus className="size-4" /> {busy ? "Création…" : "Créer un compte"}
        </button>
      </form>
    </div>
  );
}
