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
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { shuffleArray } from "@/store/slices/helpers";
import { useStats } from "@/store/stats";
import { type Mode } from "@/lib/auralis/themes";
import { api } from "@/lib/auralis/api";
import { useT } from "@/lib/auralis/i18n";
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
import { SkeletonDetailHero } from "../Skeletons";
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
import { EqualizerCard } from "../EqualizerCard";
import { exportPlaylistM3U, exportPlaylistJSON } from "@/lib/auralis/playlistIO";
import { evaluateSmartList } from "@/lib/auralis/smartlist";
import { Heart, Smartphone } from "lucide-react";
import {
  hasInstallPrompt,
  isIOSBrowser,
  isStandaloneDisplay,
  subscribeInstallAvailability,
  triggerInstallPrompt,
} from "@/lib/auralis/install";

const STORAGE_KEY = "auralis.vault.v1";

type SettingsSection =
  | "appearance"
  | "playback"
  | "equalizer"
  | "library"
  | "lyrics"
  | "app"
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
  const t = useT();
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

  if (!album) return <EmptyDetail label={t("detail.albumNotFound")} loading={status !== "ready"} />;

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
              {t("mobile.album")}
            </p>
            <h1 className="mt-1 text-[clamp(24px,7vw,32px)] font-black leading-tight tracking-tight text-foreground lg:text-[clamp(30px,4.5vw,56px)] lg:leading-none">
              {album.title}
            </h1>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {albumArtist(album)} · {album.year ?? t("common.unknownYear")} ·{" "}
              {t("common.tracksCount", undefined, { count: albumTracks.length })} · {formatLongDuration(totalDuration)}
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
            aria-label={isPlayingThis ? t("player.pause") : t("detail.playAlbum")}
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
            aria-label={t("detail.shuffleAlbum")}
          >
            <Shuffle className="size-6" />
          </button>
          <button
            onClick={() => albumTracks[0] && void startRadio(albumTracks[0].trackhash, albumTracks[0])}
            disabled={albumTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label={t("common.radio")}
            title={t("common.radio")}
          >
            <Radio className="size-6" />
          </button>
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        <TrackListHeader />
        <VirtualList items={albumTracks} itemKey={(t, i) => `${t.trackhash}-${i}`} estimateHeight={56} gap={2}>
          {(track, index) => (
            <TrackRow track={track} index={index} list={albumTracks} showAlbum={false} />
          )}
        </VirtualList>

        {otherAlbums.length > 0 && (
          <div className="mt-8">
            <SectionHeader
              title={t("detail.moreByArtist", undefined, { artist: album.albumartists[0]?.name ?? t("detail.thisArtist") })}
              eyebrow={t("detail.discography")}
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
  const t = useT();
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

  if (!artist) return <EmptyDetail label={t("detail.artistNotFound")} loading={status !== "ready"} round />;
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
              {t("common.artistLabel")}
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
              {/* Key exists in both dicts — no need for a hardcoded FR fallback. */}
              {artistPlays > 0 ? `${t("common.playsCount", undefined, { count: formatCount(artistPlays) })} · ` : ""}
              {plural(artist.albumcount ?? artistAlbums.length, "album")} ·{" "}
              {t("common.tracksCount", undefined, { count: artist.trackcount ?? artistTracks.length })}
              {artist.genres?.length ? ` · ${artist.genres.join(", ")}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-5">
          <button
            onClick={() => topTracks.length && playList(topTracks, 0)}
            disabled={topTracks.length === 0}
            aria-label={t("detail.playArtist")}
            className="signal-button grid h-14 w-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
          >
            <Play className="size-6 fill-current ml-0.5" />
          </button>
          <button
            onClick={() => artistTracks.length && playList(shuffleArray(artistTracks), 0)}
            disabled={topTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label={t("detail.shuffleArtist")}
          >
            <Shuffle className="size-6" />
          </button>
          <button
            onClick={() => { const seed = topTracks[0] ?? artistTracks[0]; if (seed) void startRadio(seed.trackhash, seed); }}
            disabled={artistTracks.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            aria-label={t("detail.startArtistRadio")}
            title={t("common.radio")}
          >
            <Radio className="size-6" />
          </button>
        </div>
      </section>

      <div className="px-4 py-5 lg:px-6">
        <SectionHeader title={t("detail.popular")} eyebrow={t("detail.songs")} />
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
          title={t("detail.discography")}
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
  const t = useT();
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

  if (!playlist) return <EmptyDetail label={t("detail.playlistNotFound")} loading={isCustom ? false : status !== "ready"} />;

  const colors = playlist.color ?? paletteForName(playlist.name);
  // A user-set cover always wins; otherwise fall back to the first track with art.
  const coverImage = playlist.image ?? tracks.find((track) => track.image)?.image;

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const MAX_BYTES = 8 * 1024 * 1024;
    if (file.size > MAX_BYTES) { window.alert(t("detail.imageTooHeavy")); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setCoverBusy(true);
      void setPlaylistCover(id, String(reader.result)).finally(() => setCoverBusy(false));
    };
    reader.onerror = () => window.alert(t("detail.imageUnreadable"));
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
    const ok = window.confirm(t("detail.confirmDelete", undefined, { name: playlist.name }));
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
                  aria-label={t("detail.changeCover")}
                  title={t("detail.changeCover")}
                  className="absolute inset-0 grid place-items-center rounded-lg bg-black/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100 disabled:opacity-100"
                >
                  <span className="flex flex-col items-center gap-1.5 text-white">
                    <ImagePlus className="size-7" />
                    <span className="text-[11px] font-semibold">{coverBusy ? t("detail.uploading") : t("detail.changeCover")}</span>
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
                ? t("detail.collabBadge", undefined, { owner: playlist.owner ?? t("detail.someone") })
                : isSmart
                  ? t("detail.smartBadge")
                  : playlist.shared
                    ? t("detail.sharedBadge")
                    : isCustom
                      ? t("detail.localBadge")
                      : t("detail.catalogBadge")}
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
              {t("common.tracksCount", undefined, { count: tracks.length })} · {formatLongDuration(totalDuration)}
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
            aria-label={isPlayingThis ? t("player.pause") : t("detail.playPlaylist")}
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
                  <PencilLine className="size-5" /> {t("detail.rename")}
                </button>
              )}
              {!isCollaborator && (
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={coverBusy}
                  className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <ImagePlus className="size-5" /> {coverBusy ? t("detail.uploading") : t("detail.coverBtn")}
                </button>
              )}
              {!isCollaborator && !isSmart && (
                <>
                  <button
                    onClick={() => sharePlaylist(id, !playlist.shared)}
                    className={cn("flex items-center gap-2 text-[13px] font-bold transition-colors", playlist.shared ? "text-primary hover:text-foreground" : "text-muted-foreground hover:text-foreground")}
                    title={playlist.shared ? t("detail.sharedOn") : t("detail.shareHint")}
                  >
                    <Share2 className="size-5" /> {playlist.shared ? t("detail.shared") : t("ctx.share")}
                  </button>
                  {playlist.shared && (
                    <button
                      onClick={() => { const u = window.prompt(t("detail.invitePrompt")); if (u && u.trim()) void addPlaylistCollaborator(id, u.trim()); }}
                      className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                      title={t("detail.inviteTitle")}
                    >
                      <Users className="size-5" /> {t("detail.invite")}
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => exportPlaylistM3U(playlist.name, tracks)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                title={t("detail.exportM3U")}
              >
                <Download className="size-5" /> M3U
              </button>
              <button
                onClick={() => exportPlaylistJSON(playlist.name, tracks)}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                title={t("detail.exportJSON")}
              >
                <Download className="size-5" /> JSON
              </button>
              {!isCollaborator && (
                <button
                  onClick={deleteCurrentPlaylist}
                  className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-5" /> {t("detail.delete")}
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
            <VirtualList items={tracks} itemKey={(t, i) => `${t.trackhash}-${i}`} estimateHeight={56} gap={2}>
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
                        aria-label={t("detail.moveUp", undefined, { title: track.title })}
                        className="grid h-5 w-9 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        onClick={() => reorderInPlaylist(id, index, index + 1)}
                        disabled={index === tracks.length - 1}
                        aria-label={t("detail.moveDown", undefined, { title: track.title })}
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
                      aria-label={t("detail.removeTrack", undefined, { title: track.title })}
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
              {t("detail.emptyPlaylist")}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {isSmart
                ? t("detail.smartEmpty")
                : t("detail.addFromMenu")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsView() {
  const t = useT();
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
  const mode = usePlayer((s) => s.mode);
  const setMode = usePlayer((s) => s.setMode);
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

  // Surface an inaccessible music directory (unmounted volume / bad AURALIS_MUSIC_DIR):
  // the server logs "library will scan as empty" at boot, but that's invisible in the
  // UI, so /api/health exposes musicDir:boolean and we show a banner row when it's false.
  const [musicDirOk, setMusicDirOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void api
      .get<{ musicDir?: boolean }>("/api/health")
      .then((h) => { if (alive) setMusicDirOk(h.musicDir !== false); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // PWA install state: reactivity comes from the module store the registrar
  // feeds (beforeinstallprompt / appinstalled), so the row flips to the native
  // "Installer" affordance the moment the browser offers it. Lazy initialisers
  // are client-safe: this view is dynamically imported with ssr:false.
  const [installAvailable, setInstallAvailable] = useState(hasInstallPrompt);
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  useEffect(
    () =>
      subscribeInstallAvailability(() => {
        setInstallAvailable(hasInstallPrompt());
        setStandalone(isStandaloneDisplay());
      }),
    [],
  );

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
    notify(t("toast.localDataExported"));
  };

  const importStorage = (file?: File) => {
    if (!file || typeof window === "undefined") return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "{}");
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object")
          // Internal guard only: the catch below swaps this for the translated
          // "invalid import" toast — the message itself is never displayed.
          throw new Error("Invalid JSON");
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        window.location.reload();
      } catch {
        notify(t("toast.importRejected"));
      }
    };
    reader.readAsText(file);
  };

  const clearStorage = () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm(t("settings.confirmClear"));
    if (!ok) return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  // Server-side: wipe play counts / recents / streak (favourites + playlists kept).
  const resetStats = () => {
    if (typeof window === "undefined") return;
    if (!window.confirm(t("settings.confirmResetStats"))) return;
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
      dir = window.prompt(t("settings.promptMusicDir"), root ?? "");
    }
    if (!dir) return;
    try {
      await api.post("/api/library/source", { dir });
      notify(t("toast.musicDirUpdated"));
      await load();
    } catch {
      notify(t("toast.invalidDir"));
    }
  };

  // Desktop only: forget the saved source (URL vs local folder) and relaunch into
  // the first-run chooser. Lets the user switch between a remote server and local.
  const desktopBridge = (typeof window !== "undefined"
    ? (window as unknown as { auralisDesktop?: { reconfigure?: () => void } }).auralisDesktop
    : undefined);
  const reconfigureSource = () => {
    if (!desktopBridge?.reconfigure) return;
    if (!window.confirm(t("settings.confirmReconfigure"))) return;
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
      label: t("settings.section.playback"),
      detail: t("settings.section.playback.detail"),
      icon: Volume2,
    },
    {
      id: "equalizer",
      label: t("settings.section.equalizer"),
      detail: t("settings.section.equalizer.detail"),
      icon: SlidersHorizontal,
    },
    {
      id: "library",
      label: t("settings.section.library"),
      detail: t("settings.section.library.detail"),
      icon: FolderOpen,
    },
    {
      id: "lyrics",
      label: t("settings.section.lyrics"),
      detail: t("settings.section.lyrics.detail"),
      icon: FileText,
    },
    {
      id: "appearance",
      label: t("settings.section.appearance"),
      detail: t("settings.section.appearance.detail"),
      icon: Palette,
    },
    {
      id: "app",
      label: t("settings.section.app"),
      detail: t("settings.section.app.detail"),
      icon: Smartphone,
    },
    {
      id: "account",
      label: t("settings.section.account"),
      detail: t("settings.section.account.detail"),
      icon: Lock,
    },
    {
      id: "data",
      label: t("settings.section.data"),
      detail: t("settings.section.data.detail"),
      icon: HardDrive,
    },
    {
      id: "about",
      label: t("settings.section.about"),
      detail: t("settings.section.about.detail"),
      icon: Info,
    },
  ];

  const playbackRows: SettingsRow[] = [
    {
      label: t("settings.volume"),
      value: `${Math.round(volume * 100)} %`,
      type: "action",
      onAction: () => setVolume(volume >= 1 ? 0.5 : Math.min(1, volume + 0.1)),
    },
    {
      label: t("settings.mute"),
      value: "",
      type: "toggle",
      active: muted,
      onAction: toggleMute,
    },
    {
      label: t("common.shuffle"),
      value: "",
      type: "toggle",
      active: shuffle,
      onAction: toggleShuffle,
    },
    { label: t("settings.repeat"), value: t("settings.repeat." + repeat), type: "action", onAction: cycleRepeat },
    {
      label: t("settings.autoplay"),
      value: "",
      type: "toggle",
      active: autoplay,
      onAction: toggleAutoplay,
    },
    {
      label: t("settings.normalization"),
      value: normalization === "off" ? t("settings.normalization.off") : normalization === "album" ? t("settings.normalization.album") : t("settings.normalization.track"),
      type: "action",
      onAction: () => setNormalization(normalization === "off" ? "track" : normalization === "track" ? "album" : "off"),
    },
    {
      label: t("settings.crossfadeIn"),
      value: crossfade > 0 ? t("settings.secondsShort", undefined, { n: crossfade }) : t("settings.crossfade.off"),
      type: "action",
      onAction: () => setCrossfade(crossfade >= 12 ? 0 : crossfade === 0 ? 3 : crossfade === 3 ? 6 : 12),
    },
    sleepTimer.active
      ? {
          label: t("settings.sleepTimer"),
          value: t("common.cancel"),
          type: "action",
          onAction: cancelSleepTimer,
          tone: "warning",
        }
      : {
          label: t("settings.sleepTimer"),
          value: t("settings.sleepTimer.30"),
          type: "action",
          onAction: () => startSleepTimer(30),
        },
  ];

  const libraryRows: SettingsRow[] = [
    ...(musicDirOk === false
      ? [{
          label: t("settings.musicDir"),
          value: t("settings.musicDirMissing"),
          type: "text" as const,
          tone: "danger" as const,
        }]
      : []),
    {
      label: t("settings.scanStatus"),
      value:
        status === "loading"
          ? t("settings.scanStatus.scanning")
          : status === "ready"
            ? t("settings.scanStatus.ready")
            : status === "error"
              ? t("settings.scanStatus.error")
              : t("settings.scanStatus.idle"),
      type: "text",
      tone:
        status === "ready"
          ? "success"
          : status === "error"
            ? "danger"
            : "warning",
    },
    {
      label: t("settings.sourceDir"),
      value: root ?? t("settings.sourceDirDefault"),
      type: "text",
    },
    {
      label: t("settings.changeDir"),
      value: t("settings.browse"),
      type: "action",
      onAction: () => void changeMusicDir(),
    },
    { label: t("settings.indexedTracks"), value: String(tracks.length), type: "text" },
    { label: t("settings.albumsCount"), value: String(albums.length), type: "text" },
    { label: t("settings.artistsCount"), value: String(artists.length), type: "text" },
    {
      label: t("settings.totalDuration"),
      value: formatLongDuration(totalDuration),
      type: "text",
    },
    {
      label: t("settings.lastScan"),
      value: scannedAt ? new Date(scannedAt).toLocaleString() : t("settings.never"),
      type: "text",
    },
    {
      label: t("settings.rescan"),
      value: scanProgress?.status === "scanning"
        ? t("settings.scanProgress", undefined, { done: scanProgress.processed, total: scanProgress.total || "?" })
        : status === "loading" ? t("settings.scanning") : t("settings.scan"),
      type: "action",
      onAction: () => void rescan(),
    },
    {
      label: t("settings.moodAnalysis"),
      value: scanProgress?.analyzing
        ? t("settings.analyzing", undefined, { done: scanProgress.analyzed ?? 0, total: scanProgress.analyzeTotal ?? "?" })
        : t("settings.analyze"),
      type: "action",
      onAction: () => { void api.post("/api/library/analyze", {}); },
    },
    ...(desktopBridge?.reconfigure
      ? [{
          label: t("settings.changeSource"),
          value: t("settings.urlOrFolder"),
          type: "action" as const,
          onAction: reconfigureSource,
        }]
      : []),
  ];

  const lyricsRows: SettingsRow[] = [
    {
      label: t("settings.tracksWithLyrics"),
      value: `${tracksWithLyrics} / ${tracks.length}`,
      type: "text",
      tone: tracksWithLyrics > 0 ? "success" : "warning",
    },
    { label: t("settings.supportedSource"), value: t("settings.lrcSidecar"), type: "text" },
    {
      label: t("settings.display"),
      value: tracksWithLyrics > 0 ? t("settings.lyricsPerTrack") : t("settings.lyricsHiddenIfEmpty"),
      type: "text",
    },
    { label: t("settings.convention"), value: "song.mp3 + song.lrc", type: "text" },
  ];

  const dataRows: SettingsRow[] = [
    { label: t("settings.favorites"), value: String(favorites.size), type: "text" },
    {
      label: t("settings.localPlaylists"),
      value: String(customPlaylists.length),
      type: "text",
    },
    {
      label: t("settings.recentHistory"),
      value: String(recentTrackhashes.length),
      type: "text",
    },
    { label: t("settings.savedPlays"), value: String(totalPlays), type: "text" },
    {
      label: t("settings.export"),
      value: "JSON",
      type: "action",
      onAction: exportStorage,
    },
    {
      label: t("settings.import"),
      value: "JSON",
      type: "action",
      onAction: () => fileInputRef.current?.click(),
    },
    {
      label: t("settings.resetListening"),
      value: t("settings.erase"),
      type: "action",
      onAction: resetStats,
      tone: "danger",
    },
    {
      label: t("settings.reset"),
      value: t("settings.erase"),
      type: "action",
      onAction: clearStorage,
      tone: "danger",
    },
  ];

  const appRows: SettingsRow[] = [
    {
      label: t("settings.displayMode"),
      value: standalone ? t("settings.appInstalled") : t("settings.browser"),
      type: "text",
      ...(standalone ? { tone: "success" as const } : {}),
    },
    installAvailable
      ? {
          label: t("settings.installApp"),
          value: t("settings.install"),
          type: "action",
          onAction: () => {
            void triggerInstallPrompt();
          },
        }
      : standalone
        ? { label: t("settings.update"), value: t("settings.autoUpdate"), type: "text" }
        : isIOSBrowser()
          ? { label: t("settings.iosInstall"), value: t("settings.iosInstallHint"), type: "text" }
          : { label: t("settings.installGeneric"), value: t("settings.installGenericHint"), type: "text" },
    { label: t("settings.offlineRow"), value: t("settings.offlineHint"), type: "text" },
  ];

  const aboutRows: SettingsRow[] = [
    { label: t("settings.version"), value: `Auralis ${brand.version}`, type: "text" },
    { label: t("settings.mode"), value: t("settings.localPlayer"), type: "text" },
    { label: t("settings.section.library"), value: t("common.tracksCount", undefined, { count: tracks.length }), type: "text" },
    { label: t("settings.contact"), value: CONTACT_EMAIL, type: "text" },
    {
      label: t("settings.sourceCode"),
      value: "GitHub",
      type: "action",
      onAction: () => window.open(PROJECT_REPO, "_blank", "noopener,noreferrer"),
    },
    {
      label: t("settings.supportProject"),
      value: t("settings.donate"),
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
          {t("settings.title")}
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
                  "tap-press flex h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-all duration-200",
                  isActive
                    ? "border-white/10 bg-[var(--surface-3)] text-foreground shadow-[0_4px_20px_-8px_rgba(0,0,0,0.55)]"
                    : "border-transparent bg-[var(--surface-2)] text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors duration-200",
                    isActive ? "text-primary-soft" : "text-muted-foreground",
                  )}
                />
                {item.label}
                {isActive && (
                  <span className="size-1.5 rounded-full bg-[var(--primary)]" aria-hidden />
                )}
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
            {t("settings.sections")}
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
              <ModeSelector mode={mode} setMode={setMode} />
              <LanguageSelector locale={locale} setLocale={setLocale} />
              <SettingsCard
                title={t("settings.interface")}
                rows={[
                  {
                    label: t("settings.nowPlayingPanel"),
                    value: rightPanelOpen ? t("settings.visible") : t("settings.hidden"),
                    type: "toggle",
                    active: rightPanelOpen,
                    onAction: toggleRightPanel,
                  },
                ]}
              />
            </>
          )}

          {section === "playback" && (
            <SettingsCard title={t("settings.playback")} rows={playbackRows} />
          )}
          {section === "equalizer" && <EqualizerCard />}
          {section === "library" && (
            <SettingsCard title={t("settings.library")} rows={libraryRows} />
          )}
          {section === "lyrics" && (
            <SettingsCard title={t("settings.section.lyrics")} rows={lyricsRows} />
          )}
          {section === "app" && (
            <SettingsCard title={t("settings.section.app")} rows={appRows} />
          )}
          {section === "account" && <AccountSettings />}
          {section === "data" && (
            <SettingsCard title={t("settings.section.data")} rows={dataRows} />
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
                      {t("settings.supportTitle")}
                    </h3>
                    <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
                      {t("settings.supportText")}
                    </p>
                    <DonateButton className="mt-3" />
                  </div>
                </div>
              </div>
              <SettingsCard title={t("settings.section.about")} rows={aboutRows} />
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
        "group/navitem relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-200",
        active
          ? "bg-white/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {/* Active accent rail — a 2px primary bar hugging the left edge, the
          same affordance the mobile chips carry as their dot. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-[var(--primary)] transition-all duration-200",
          active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0",
        )}
      />
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors duration-200",
          active ? "text-primary-soft" : "text-muted-foreground group-hover/navitem:text-foreground",
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
          // Text values render as subtle pills (Apple-Settings-like chrome):
          // neutral values sit on a faint surface, tone values get a matching tint
          // + a soft dot so status reads at a glance even without reading the text.
          const pillClass = cn(
            "inline-flex max-w-[55%] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums",
            row.tone === "success"
              ? "bg-emerald/12 text-emerald"
              : row.tone === "danger"
                ? "bg-destructive/12 text-destructive"
                : row.tone === "warning"
                  ? "bg-amber/12 text-amber"
                  : "bg-white/[0.05] text-muted-foreground font-semibold",
          );
          return (
            <div
              key={row.label}
              className="group/row flex min-h-[44px] items-center justify-between gap-4 border-b border-[var(--line)] py-2 transition-colors duration-200 last:border-0 hover:bg-white/[0.015] lg:min-h-0"
            >
              <span className="min-w-0 text-[13px] text-foreground/90 transition-colors duration-200 group-hover/row:text-foreground">
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
                    "tap-press flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-4 text-[13px] font-bold transition-colors duration-200 active:scale-[0.98] lg:min-h-0 lg:px-3 lg:py-1 lg:text-[12px]",
                    row.tone === "danger"
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "bg-white/5 text-foreground hover:bg-white/10",
                  )}
                >
                  {row.tone === "warning" && <span className="size-1.5 rounded-full bg-amber" aria-hidden />}
                  {row.tone === "danger" && <span className="size-1.5 rounded-full bg-destructive" aria-hidden />}
                  {row.value}
                </button>
              ) : (
                <span className={pillClass}>
                  {(row.tone === "success" || row.tone === "warning" || row.tone === "danger") && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-current"
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{row.value}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Appearance mode selector (dark / light / auto) ------------------------
function ModeSelector({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const t = useT();
  const options: { id: Mode; label: string; hint: string }[] = [
    { id: "dark", label: t("settings.mode.dark"), hint: t("settings.mode.dark.hint") },
    { id: "light", label: t("settings.mode.light"), hint: t("settings.mode.light.hint") },
    { id: "auto", label: t("settings.mode.auto"), hint: t("settings.mode.auto.hint") },
  ];
  return (
    <div className="matte-panel rounded-lg p-4">
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("settings.appearance")}
        </p>
        <h2 className="mt-0.5 text-[18px] font-black leading-tight text-foreground">
          {options.find((o) => o.id === mode)?.label ?? t("settings.mode.dark")}
        </h2>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          {t("settings.appearanceText")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {options.map((o) => {
          const active = o.id === mode;
          return (
            <button
              key={o.id}
              onClick={() => setMode(o.id)}
              aria-pressed={active}
              className={cn(
                "group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-200",
                active
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                  : "border-transparent bg-white/[0.04] hover:bg-white/[0.07]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-foreground">{o.label}</span>
                {active && (
                  <span className="grid size-4 place-items-center rounded-full bg-[var(--primary)] text-white">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-relaxed text-muted-foreground">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Language selector (FR / EN segmented control) ------------------------
// Surfaced as its own card above the Interface settings so an international
// user opening Settings for the first time finds the language switch
// immediately — instead of hunting through a single action row.
function LanguageSelector({ locale, setLocale }: { locale: "fr" | "en"; setLocale: (l: "fr" | "en") => void }) {
  const t = useT();
  // "Français"/"English" stay literal on purpose: language autonyms are proper
  // names rendered in their own language in every locale (same convention as
  // the LOCALES catalogue in messages.ts).
  const options: { id: "fr" | "en"; label: string; hint: string }[] = [
    { id: "fr", label: "Français", hint: t("settings.language.fr.hint") },
    { id: "en", label: "English", hint: t("settings.language.en.hint") },
  ];
  return (
    <div className="matte-panel rounded-lg p-4">
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("settings.language")}
        </p>
        <h2 className="mt-0.5 text-[18px] font-black leading-tight text-foreground">
          {options.find((o) => o.id === locale)?.label ?? "Français"}
        </h2>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
          {t("settings.languageHint")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {options.map((o) => {
          const active = o.id === locale;
          return (
            <button
              key={o.id}
              onClick={() => setLocale(o.id)}
              aria-pressed={active}
              className={cn(
                "group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all duration-200",
                active
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                  : "border-transparent bg-white/[0.04] hover:bg-white/[0.07]",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-foreground">{o.label}</span>
                {active && (
                  <span className="grid size-4 place-items-center rounded-full bg-[var(--primary)] text-white">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-relaxed text-muted-foreground">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyDetail({ label, loading = false, round = false }: { label: string; loading?: boolean; round?: boolean }) {
  // yet — it just hasn't loaded. Render a hero+tracklist skeleton (round art for an
  // artist) so the page reads as loading instead of flashing an error or a blank gap.
  if (loading) return <SkeletonDetailHero round={round} />;
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
  const t = useT();
  const notify = usePlayer((state) => state.notify);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const changePassword = async () => {
    if (busy) return;
    if (!current || !next) return notify(t("toast.fillFields"));
    if (next.length < 6) return notify(t("toast.passwordTooShort"));
    if (next !== confirm) return notify(t("toast.passwordMismatch"));
    setBusy(true);
    try {
      const res = await fetch(api.url("/api/auth/password"), {
        method: "POST",
        // Bearer header (not a URL token) so token-only clients (Android) still
        // authenticate now that api.url() no longer appends ?token=.
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) notify(data.error ?? t("toast.passwordChangeFailed"));
      else {
        // Token clients (Android) must adopt the re-issued token — the change just
        // invalidated the old one. Cookie clients (web/desktop) update transparently.
        if (data.token && api.token()) api.setToken(data.token);
        notify(t("toast.passwordChanged"));
        setCurrent(""); setNext(""); setConfirm("");
      }
    } catch {
      notify(t("toast.serverUnreachable"));
    }
    setBusy(false);
  };

  const logout = async () => {
    // Bearer header so the server revokes the persisted token too (the logout
    // route revokes every presented credential) — api.url() no longer carries it.
    try { await fetch(api.url("/api/auth/logout"), { method: "POST", headers: api.headers() }); } catch { /* reload anyway */ }
    api.setToken(""); // drop the persisted token so logout actually sticks
    window.location.reload();
  };

  const inputClass = "h-12 w-full rounded-xl border border-transparent bg-[var(--panel-2)] px-4 text-[16px] text-foreground outline-none transition-all duration-200 focus:bg-[var(--panel-3)] focus:ring-2 focus:ring-white/10 lg:h-auto lg:py-2.5 lg:text-[14px]";

  // Translated help text, split on the two tokens so they keep their <code> chips.
  const adminHelp = t("settings.adminPasswordHelp", undefined, {
    file: "INITIAL_ADMIN_PASSWORD.txt",
    env: "AURALIS_ADMIN_PASSWORD",
  }).split(/INITIAL_ADMIN_PASSWORD\.txt|AURALIS_ADMIN_PASSWORD/);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 text-[14px] font-black text-foreground">{t("settings.adminPassword")}</h3>
        <p className="mb-4 text-[12px] text-muted-foreground/70">
          {adminHelp[0]}
          <code className="rounded bg-[var(--panel-2)] px-1">INITIAL_ADMIN_PASSWORD.txt</code>
          {adminHelp[1]}
          <code className="rounded bg-[var(--panel-2)] px-1">AURALIS_ADMIN_PASSWORD</code>
          {adminHelp[2]}
        </p>
        <div className="space-y-2.5 lg:max-w-sm">
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder={t("settings.currentPassword")} className={inputClass} />
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t("settings.newPassword")} className={inputClass} />
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t("settings.confirmPassword")} className={inputClass} />
          <button
            onClick={changePassword}
            disabled={busy}
            className="signal-button tap-press mt-1 h-12 w-full rounded-full px-5 text-[14px] font-bold transition-colors duration-200 disabled:opacity-40 lg:h-auto lg:w-auto lg:py-2.5 lg:text-[13px]"
          >
            {busy ? t("settings.updating") : t("settings.changePassword")}
          </button>
        </div>
      </div>

      <AccountManager />

      <div className="border-t border-[var(--line)] pt-5">
        <button
          onClick={logout}
          className="ghost-button tap-press flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:h-auto lg:w-auto lg:justify-start lg:py-2.5 lg:text-[13px]"
        >
          <LogOut className="size-4" /> {t("settings.signOut")}
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
  const t = useT();
  const notify = usePlayer((state) => state.notify);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [me, setMe] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const load = async (alive: () => boolean = () => true) => {
    try {
      const res = await fetch(api.url("/api/auth/users"), { cache: "no-store", headers: api.headers() });
      if (!res.ok) { if (alive()) setIsAdmin(false); return; }
      const data = (await res.json()) as { users: ManagedUser[]; me: number };
      if (!alive()) return; // unmounted mid-request — don't set state on a dead view
      setUsers(data.users);
      setMe(data.me);
      setIsAdmin(true);
    } catch {
      if (alive()) setIsAdmin(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the setStates run after `await`, never synchronously in the effect body
    void load(() => alive);
    return () => { alive = false; };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || password.length < 6) return notify(t("toast.userCreateReqs"));
    setBusy(true);
    try {
      const res = await fetch(api.url("/api/auth/users"), {
        method: "POST",
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ username: name.trim(), password, isAdmin: makeAdmin }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) notify(data.error ?? t("toast.userCreateFailed"));
      else {
        notify(t("toast.userCreated", undefined, { name: name.trim().toLowerCase() }));
        setName(""); setPassword(""); setMakeAdmin(false);
        void load();
      }
    } catch {
      notify(t("toast.serverUnreachable"));
    }
    setBusy(false);
  };

  const remove = async (u: ManagedUser) => {
    if (!window.confirm(t("settings.confirmDeleteUser", undefined, { name: u.username }))) return;
    try {
      const res = await fetch(api.url(`/api/auth/users?id=${u.id}`), { method: "DELETE", headers: api.headers() });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) notify(data.error ?? t("toast.userDeleteFailed"));
      else { notify(t("toast.userDeleted")); void load(); }
    } catch {
      notify(t("toast.serverUnreachable"));
    }
  };

  const resetPassword = async (u: ManagedUser) => {
    const pw = window.prompt(t("settings.promptUserPassword", undefined, { name: u.username }));
    if (pw === null) return;
    if (pw.length < 6) return notify(t("toast.passwordTooShortShort"));
    try {
      const res = await fetch(api.url("/api/auth/users"), {
        method: "PUT",
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: u.id, password: pw }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok) notify(data.error ?? t("toast.resetFailed"));
      else {
        // Self-reset re-issues the session (token clients must adopt it).
        if (data.token && api.token()) api.setToken(data.token);
        notify(t("toast.passwordReset"));
      }
    } catch {
      notify(t("toast.serverUnreachable"));
    }
  };

  const downloadBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const res = await fetch(api.url("/api/backup"), { method: "POST", headers: api.headers() });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        notify(data.error ?? t("toast.backupFailed"));
        return;
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "");
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = match?.[1] ?? "auralis-backup.db";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(t("toast.backupDownloaded"));
    } catch {
      notify(t("toast.serverUnreachable"));
    }
    setBackupBusy(false);
  };

  if (!isAdmin) return null;

  const inputClass = "h-12 w-full rounded-xl border border-transparent bg-[var(--panel-2)] px-4 text-[16px] text-foreground outline-none transition-all duration-200 focus:bg-[var(--panel-3)] focus:ring-2 focus:ring-white/10 lg:h-auto lg:py-2.5 lg:text-[14px]";

  return (
    <div className="border-t border-[var(--line)] pt-5">
      <h3 className="mb-1 flex items-center gap-2 text-[14px] font-black text-foreground">
        <ShieldCheck className="size-4 text-primary-soft" /> {t("settings.accounts")}
      </h3>
      <p className="mb-4 text-[12px] text-muted-foreground/70">
        {t("settings.accountsHelp")}
      </p>

      <div className="mb-4 space-y-1.5">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex items-center gap-2 rounded-xl border border-transparent bg-[var(--panel-2)] px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-foreground">
              {u.username}
              {u.isAdmin && <span className="ml-2 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-primary">Admin</span>}
              {u.id === me && <span className="ml-2 text-[11px] font-medium text-muted-foreground/60">{t("settings.you")}</span>}
            </span>
            <button onClick={() => resetPassword(u)} className="ghost-button shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors duration-200 hover:bg-white/10" aria-label={t("settings.resetPasswordAria")}>
              {t("settings.password")}
            </button>
            {u.id !== me && (
              <button onClick={() => remove(u)} className="tap-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors duration-200 hover:bg-destructive/15 hover:text-[var(--destructive)]" aria-label={t("settings.deleteAccountAria")}>
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={create} className="space-y-2.5 lg:max-w-sm">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.usernamePlaceholder")} autoCapitalize="off" autoCorrect="off" autoComplete="off" className={inputClass} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("settings.accountPasswordPlaceholder")} autoComplete="new-password" className={inputClass} />
        <label className="flex items-center gap-2 px-1 text-[13px] font-semibold text-muted-foreground">
          <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          {t("settings.adminCheckbox")}
        </label>
        <button type="submit" disabled={busy} className="signal-button tap-press flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors duration-200 disabled:opacity-40 lg:h-auto lg:w-auto lg:py-2.5 lg:text-[13px]">
          <UserPlus className="size-4" /> {busy ? t("settings.creating") : t("settings.createAccount")}
        </button>
      </form>

      <div className="mt-6 border-t border-[var(--line)] pt-5">
        <h3 className="mb-1 flex items-center gap-2 text-[14px] font-black text-foreground">
          <HardDrive className="size-4 text-primary-soft" /> {t("settings.backup")}
        </h3>
        <p className="mb-4 text-[12px] text-muted-foreground/70">
          {t("settings.backupHelp")}
        </p>
        <button
          onClick={downloadBackup}
          disabled={backupBusy}
          className="ghost-button tap-press flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors duration-200 disabled:opacity-40 lg:h-auto lg:w-auto lg:justify-start lg:py-2.5 lg:text-[13px]"
        >
          <Download className="size-4" /> {backupBusy ? t("settings.preparing") : t("settings.downloadBackup")}
        </button>
      </div>
    </div>
  );
}
