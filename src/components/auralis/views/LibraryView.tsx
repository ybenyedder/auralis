"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Music2, Disc3, UserRound, ListMusic, ArrowDownUp, LayoutGrid, List, History, FolderTree, BarChart3, Settings, ChevronRight, Plus, Heart, Search, X, Upload, SlidersHorizontal, Link2, Loader2 } from "lucide-react";
import { parsePlaylistFile, matchLibraryTracks } from "@/lib/auralis/playlistIO";
import { api } from "@/lib/auralis/api";
import { SMART_PRESETS } from "@/lib/auralis/smartlist";
import { usePlayer } from "@/store/player";
import { useLibraryStore, artistPlayTotals } from "@/store/library";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard, PlaylistTile } from "../Cards";
import { VirtualList, VirtualGrid } from "../Virtualized";
import { cn, compareNames, foldAccents } from "@/lib/utils";
import { paletteForName, plural, trackTitle } from "@/lib/auralis/brand";
import { moodById } from "@/lib/auralis/mood";
import { useT } from "@/lib/auralis/i18n";
import { usePullToRefresh } from "@/lib/auralis/usePullToRefresh";
import { SkeletonGrid, SkeletonRows } from "../Skeletons";
import { EmptyState } from "../EmptyState";
import type { Album, Artist, Track } from "@/lib/auralis/types";

type Tab = "tracks" | "likes" | "albums" | "artists" | "playlists";

type SortMode = "az" | "za" | "year" | "plays" | "added";

// Every tab's actual sort implementation supports a different subset of
// SortMode (albums have no per-item "added"/"plays", artists have no "year"/
// "added", playlists have none of those) — the <select> below only offers
// what a tab really implements, so a chosen option never silently no-ops
// back to alphabetical.
const SORT_OPTIONS: Record<Tab, { value: SortMode; labelKey: string }[]> = {
  albums: [
    { value: "az", labelKey: "library.sortAZ" },
    { value: "za", labelKey: "library.sortZA" },
    { value: "year", labelKey: "library.sortRecent" },
  ],
  artists: [
    { value: "az", labelKey: "library.sortAZ" },
    { value: "za", labelKey: "library.sortZA" },
    { value: "plays", labelKey: "library.sortPlays" },
  ],
  tracks: [
    { value: "az", labelKey: "library.sortAZ" },
    { value: "za", labelKey: "library.sortZA" },
    { value: "year", labelKey: "library.sortRecent" },
    { value: "plays", labelKey: "library.sortPlays" },
    { value: "added", labelKey: "library.sortAdded" },
  ],
  likes: [
    { value: "az", labelKey: "library.sortAZ" },
    { value: "za", labelKey: "library.sortZA" },
    { value: "year", labelKey: "library.sortRecent" },
    { value: "plays", labelKey: "library.sortPlays" },
    { value: "added", labelKey: "library.sortAdded" },
  ],
  playlists: [
    { value: "az", labelKey: "library.sortAZ" },
    { value: "za", labelKey: "library.sortZA" },
  ],
};

export function LibraryView() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("albums");
  const [sort, setSort] = useState<SortMode>("az");
  // Switching tabs while a mode from the previous tab's option set is active
  // (e.g. "Plus joués" on Artists, then Albums) would otherwise leave the
  // dropdown showing a mode Albums doesn't implement — same silent no-op bug,
  // just carried across tabs. Falls back to "az", which every tab supports.
  const changeTab = (next: Tab) => {
    setTab(next);
    if (!SORT_OPTIONS[next].some((o) => o.value === sort)) setSort("az");
  };
  const [grid, setGrid] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");
  const [chips, setChips] = useState<Set<string>>(() => new Set());
  const [smartOpen, setSmartOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const playCounts = usePlayer((s) => s.playCounts);
  const favorites = usePlayer((s) => s.favorites);
  const navigate = usePlayer((s) => s.navigate);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const createSmartPlaylist = usePlayer((s) => s.createSmartPlaylist);
  const importPlaylist = usePlayer((s) => s.importPlaylist);
  const notify = usePlayer((s) => s.notify);
  const importRef = useRef<HTMLInputElement>(null);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const playlists = useLibraryStore((s) => s.playlists);
  const status = useLibraryStore((s) => s.status);
  const allPlaylists = useMemo(() => [...customPlaylists, ...playlists], [customPlaylists, playlists]);
  // Playlists have no per-item play count or "added" date to sort by (see
  // SORT_OPTIONS), just the universal az/za every tab supports.
  const sortedPlaylists = useMemo(() => {
    const next = [...allPlaylists];
    if (sort === "za") next.sort((a, b) => compareNames(b.name, a.name));
    else next.sort((a, b) => compareNames(a.name, b.name));
    return next;
  }, [allPlaylists, sort]);
  // Cold-start: the snapshot is still loading and nothing is in yet → show shimmer
  // skeletons rather than a blank stage or a premature "empty" message.
  const loading = status === "loading" && tracks.length === 0;

  // Reset the shared scroller to the top whenever the visible list is swapped out
  // (tab switch) or narrowed (text filter / facet chips). Without this the <main>
  // keeps its old scrollTop while a new — often much shorter — list mounts, landing
  // the user in blank space past the end. Sort changes deliberately preserve the
  // position (same list, reordered), so `sort` is intentionally not a dependency.
  // The reset is deferred one animation frame: the new list mounts on this tick,
  // and the virtualised window measures against the PREVIOUS scroll position — so
  // resetting synchronously would briefly compute a window from stale geometry,
  // producing the blank slice that (combined with a row throw) used to crash the
  // tab. Flushing after paint lets the new list mount and the window re-measure
  // against a zeroed scrollTop.
  useEffect(() => {
    const el = document.getElementById("main-content");
    if (!el) return;
    const id = requestAnimationFrame(() => el.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(id);
  }, [tab, filter, chips]);

  // Accent-folded text filter + facet chips (genre / mood / lossless), applied
  // BEFORE the sort so a large library narrows to "high-energy lossless jazz" — a
  // slice Spotify can't offer transparently. 100% client: the snapshot already
  // carries mood / energy / lossless / genre / addedAt.
  const q = foldAccents(filter.trim());
  const facets = useMemo(() => {
    const genreCount = new Map<string, number>();
    const moods = new Set<string>();
    let hasLossless = false;
    for (const t of tracks) {
      if (t.genre) genreCount.set(t.genre, (genreCount.get(t.genre) ?? 0) + 1);
      if (t.mood) moods.add(t.mood);
      if (t.lossless) hasLossless = true;
    }
    const genres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g]) => g);
    return { genres, moods: [...moods].slice(0, 6), hasLossless };
  }, [tracks]);

  const trackMatches = (t: Track) => {
    if (q && !(foldAccents(t.title).includes(q) || foldAccents(t.artist || "").includes(q) || foldAccents(t.album || "").includes(q))) return false;
    for (const chip of chips) {
      if (chip === "lossless") { if (!t.lossless) return false; }
      else if (chip.startsWith("genre:")) { if (t.genre !== chip.slice(6)) return false; }
      else if (chip.startsWith("mood:")) { if (t.mood !== chip.slice(5)) return false; }
    }
    return true;
  };
  const albumMatches = (a: Album) => !q || foldAccents(a.title).includes(q) || a.albumartists.some((ar) => foldAccents(ar.name).includes(q));
  const toggleChip = (key: string) =>
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onImportFile = async (file?: File) => {
    if (!file) return;
    try {
      const res = await parsePlaylistFile(file, tracks);
      if (res.hashes.length === 0) {
        notify(t("library.linkNoTracks", "Aucun titre trouvé dans ce lien"), { tone: "error" });
        return;
      }
      const id = importPlaylist(res.name, res.hashes);
      if (res.matched < res.total) notify(`${res.matched}/${res.total} ${t("library.tabTracks", "Titres").toLowerCase()}`, { tone: "info" });
      navigate("playlist", id);
    } catch {
      notify(t("library.invalidFile", "Fichier de playlist invalide"), { tone: "error" });
    }
  };

  // Paste a Spotify / Deezer / Apple Music / YouTube playlist (or album) link: the
  // server resolves it to a plain tracklist, we match those titles against THIS
  // library, then create the playlist — same shape as a file import, URL as source.
  const onImportUrl = async () => {
    const url = linkUrl.trim();
    if (!url || linkBusy) return;
    setLinkBusy(true);
    try {
      // A single direct fetch (not api.post) so we can read the server's French
      // error message on a non-2xx without re-issuing the outbound import.
      const r = await fetch(api.url("/api/playlist/import"), {
        method: "POST",
        headers: api.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; name?: string; tracks?: { title: string; artist?: string; album?: string }[] };
      if (!r.ok) {
        notify(data.error || t("library.linkImportFailed", "Impossible d'importer ce lien"), { tone: "error" });
        return;
      }
      const entries = data.tracks ?? [];
      if (entries.length === 0) {
        notify(t("library.linkNoTracks", "Aucun titre trouvé dans ce lien"), { tone: "error" });
        return;
      }
      const res = matchLibraryTracks(entries, tracks);
      if (res.hashes.length === 0) {
        notify(t("library.linkNoTracks", "Aucun titre trouvé dans ce lien"), { tone: "error" });
        return;
      }
      const id = importPlaylist(data.name?.trim() || t("library.importedName", "Playlist importée"), res.hashes);
      if (res.matched < res.total) {
        notify(`${res.matched}/${res.total}`, { tone: "info" });
      }
      setLinkUrl("");
      setLinkOpen(false);
      navigate("playlist", id);
    } catch {
      notify(t("library.linkImportFailed", "Impossible d'importer ce lien"), { tone: "error" });
    } finally {
      setLinkBusy(false);
    }
  };

  const sortedAlbums = useMemo(() => {
    const next = albums.filter(albumMatches);
    if (sort === "za") next.sort((a, b) => compareNames(b.title, a.title));
    else if (sort === "year") next.sort((a, b) => (b.year || 0) - (a.year || 0));
    else next.sort((a, b) => compareNames(a.title, b.title));
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums, sort, q]);

  const playsKey = sort === "plays" ? playCounts : null;
  const sortedTracks = useMemo(() => {
    const next = tracks.filter(trackMatches);
    if (sort === "za") next.sort((a, b) => compareNames(b.title, a.title));
    else if (sort === "year") next.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === "plays") next.sort((a, b) => (playCounts[b.trackhash] ?? 0) - (playCounts[a.trackhash] ?? 0));
    else if (sort === "added") next.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    else next.sort((a, b) => compareNames(a.title, b.title));
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, tracks, playsKey, q, chips]);

  // Liked titles, surfaced directly inside the Library so the user's favourites are
  // always one tab away (driven by the live favorites set, never the stale per-track
  // flag). Re-sorted with the same control as the other tabs.
  const likedTracks = useMemo(() => {
    const liked = tracks.filter((t) => favorites.has(t.trackhash) && trackMatches(t));
    if (sort === "za") liked.sort((a, b) => compareNames(trackTitle(b), trackTitle(a)));
    else if (sort === "year") liked.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === "plays") liked.sort((a, b) => (playCounts[b.trackhash] ?? 0) - (playCounts[a.trackhash] ?? 0));
    else if (sort === "added") liked.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    else liked.sort((a, b) => compareNames(trackTitle(a), trackTitle(b)));
    return liked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, favorites, sort, playsKey, q, chips]);

  // Per-user play totals per artist (the catalogue carries none); feeds both the
  // displayed "N écoutes" on each card and the "most played" sort.
  const artistPlays = artistPlayTotals(tracks, playCounts);
  const sortedArtists = useMemo(() => {
    const base = q ? artists.filter((a) => foldAccents(a.name).includes(q) || a.genres?.some((g) => foldAccents(g).includes(q))) : artists;
    const next = base.map((a) => ({ ...a, playcount: artistPlays.get(a.artisthash) ?? 0 }));
    if (sort === "za") next.sort((a, b) => compareNames(b.name, a.name));
    else if (sort === "plays") next.sort((a, b) => b.playcount - a.playcount);
    else next.sort((a, b) => compareNames(a.name, b.name));
    return next;
  }, [artists, sort, artistPlays, q]);

  const tabs: { id: Tab; labelKey: string; icon: ComponentType<{ className?: string }>; count: number }[] = [
    { id: "albums", labelKey: "library.tabAlbums", icon: Disc3, count: albums.length },
    { id: "artists", labelKey: "library.tabArtists", icon: UserRound, count: artists.length },
    { id: "tracks", labelKey: "library.tabTracks", icon: Music2, count: tracks.length },
    { id: "likes", labelKey: "library.tabLikes", icon: Heart, count: favorites.size },
    { id: "playlists", labelKey: "library.tabPlaylists", icon: ListMusic, count: allPlaylists.length },
  ];

  // Pull-to-refresh: a finger pulling down at the top of the Library triggers
  // an incremental rescan — a native-feeling "refresh my library" gesture for
  // the most-used mobile screen. Touch-only (the hook itself short-circuits on
  // fine-pointer devices), and the indicator stays out of the way until the
  // user actively pulls.
  const load = useLibraryStore((state) => state.load);
  const rescan = useLibraryStore((state) => state.rescan);
  const { pull, refreshing } = usePullToRefresh({
    onRefresh: async () => { await rescan(); await load(); },
    scrollSelector: "#main-content",
  });
  // Pull indicator: a circular spinner that grows with the pull and spins while
  // refreshing. The wrapper sits absolutely above the view content so it never
  // adds layout shift.
  const pullPct = Math.min(1, pull / 64);

  return (
    <div className="fade-up px-4 py-5 lg:px-6">
      {/* Pull-to-refresh indicator — anchored to the top of the library view,
          translates down with the gesture so it reads as a continuation of the
          finger pull, and spins while the rescan runs. */ }
      {(pull > 0 || refreshing) && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
          style={{ transform: `translateY(${pull - 28}px)`, transition: pull === 0 ? "transform 0.2s ease" : "none" }}
        >
          <div
            className={cn(
              "grid size-7 place-items-center rounded-full bg-[var(--panel-2)] shadow-[0_4px_12px_rgba(0,0,0,0.3)] ring-1 ring-white/[0.04]",
              refreshing && "animate-spin",
            )}
            style={{ opacity: refreshing ? 1 : 0.4 + pullPct * 0.6 }}
          >
            <Loader2 className={cn("size-4 text-primary", !refreshing && "transition-transform")} style={{ transform: refreshing ? undefined : `rotate(${pullPct * 270}deg)` }} />
          </div>
        </div>
      )}
      {/* Mobile-first header: the large iOS-style title owns its own row and the
          sort + view controls drop onto a compact 40px toolbar row beneath it (they
          used to wrap beside the title and squeeze it mid-line on narrow screens).
          At lg the original side-by-side layout is restored verbatim. */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
            {t("library.eyebrowInsights", "Analyse")}
          </p>
          <h1 className="text-[28px] font-black tracking-tight text-foreground">{t("library.title", "Bibliothèque")}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {status === "loading" && tracks.length === 0 ? t("folders.scanInProgress", "Scan en cours…") : t("common.tracksCount", "{count} titres", { count: tracks.length })}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {/* The sort pill stretches to fill the toolbar row on mobile so the whole
              pill is a tap target (the chevron rides its right edge); desktop keeps
              the old natural-width inline pill. */}
          <div className="matte-panel flex h-10 min-w-0 flex-1 items-center gap-1 rounded-full px-3 lg:h-auto lg:flex-none lg:p-1.5 lg:px-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-9 w-full min-w-0 cursor-pointer bg-transparent px-2 text-[13px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground lg:h-auto lg:w-auto lg:py-1 lg:text-[11.5px]"
              aria-label={t("library.sort", "Trier")}
            >
              {SORT_OPTIONS[tab].map((o) => (
                <option key={o.value} value={o.value} className="bg-[var(--panel-2)]">{t(o.labelKey, o.value)}</option>
              ))}
            </select>
            <ArrowDownUp className="size-3 text-muted-foreground/70" />
          </div>
          {(tab === "albums" || tab === "artists") && (
            <div className="matte-panel flex items-center gap-0.5 rounded-full p-1 lg:p-1">
              <button
                onClick={() => setGrid(true)}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-200 lg:h-7 lg:w-7", grid ? "bg-[var(--surface-3)] text-foreground shadow-sm" : "text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground")}
                aria-label={t("library.gridView", "Vue grille")}
              >
                <LayoutGrid className="size-4 lg:size-3.5" />
              </button>
              <button
                onClick={() => setGrid(false)}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-200 lg:h-7 lg:w-7", !grid ? "bg-[var(--surface-3)] text-foreground shadow-sm" : "text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground")}
                aria-label={t("library.listView", "Vue liste")}
              >
                <List className="size-4 lg:size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* On mobile the tabs share the row width equally (flex-1) so none gets pushed
          off-screen behind a hidden horizontal scroll, and the active tab carries a
          dock-style rounded pill wash instead of the underline; on desktop they
          revert to natural-width tabs with the classic underline. */}
      <div className="mb-5 flex items-center gap-0.5 border-b border-[var(--line)] lg:gap-1 lg:overflow-visible">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              className={cn(
                "relative flex h-11 flex-1 items-center justify-center gap-1.5 px-1 text-[12px] font-bold transition-colors lg:h-auto lg:flex-none lg:justify-start lg:gap-2 lg:px-3 lg:py-2 lg:text-[12.5px]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Dock-style pill wash behind the active tab (mobile only). It must
                  precede the content in the DOM and the content must stay positioned,
                  so the icon/label paint above the absolutely-placed pill. */}
              {active && <span aria-hidden className="absolute inset-x-1.5 inset-y-1 rounded-full bg-[var(--surface-3)] lg:hidden" />}
              <Icon className={cn("relative size-3.5 shrink-0", item.id === "likes" && active && "fill-primary text-primary")} />
              <span className="relative truncate">{t(item.labelKey, item.id)}</span>
              <span className="relative hidden rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground sm:inline-block">{item.count}</span>
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-primary hidden lg:block" />}
            </button>
          );
        })}
      </div>

      {/* Instant filter + facet chips (chips only apply to the track tabs). */}
      {tab !== "playlists" && (
        <div className="mb-4 space-y-3">
          {/* Full-width filter field on mobile (the old 360px cap left dead space on
              phones ≥ 360 CSS px); sm+ keeps the original compact width. */}
          <div className="flex h-10 w-full items-center gap-2 rounded-full border border-transparent bg-[var(--surface-2)] px-4 transition-colors focus-within:border-[var(--line-strong)] sm:max-w-[360px]">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("library.filterPlaceholder", "Filtrer la bibliothèque")}
              aria-label={t("library.filterPlaceholder", "Filtrer la bibliothèque")}
              className="w-full bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
            {filter && (
              <button onClick={() => setFilter("")} aria-label={t("library.clearFilter", "Effacer le filtre")} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {(tab === "tracks" || tab === "likes") && (facets.genres.length > 0 || facets.moods.length > 0 || facets.hasLossless) && (
            <div className="flex flex-wrap gap-2">
              {facets.hasLossless && <FilterChip label="Lossless" active={chips.has("lossless")} onClick={() => toggleChip("lossless")} />}
              {facets.moods.map((m) => (
                <FilterChip key={`mood:${m}`} label={t(`mood.${m}`, moodById(m)?.label ?? m)} active={chips.has(`mood:${m}`)} onClick={() => toggleChip(`mood:${m}`)} />
              ))}
              {facets.genres.map((g) => (
                <FilterChip key={`genre:${g}`} label={g} active={chips.has(`genre:${g}`)} onClick={() => toggleChip(`genre:${g}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "albums" && (loading ? (
        <SkeletonGrid />
      ) : grid ? (
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

      {tab === "artists" && (loading ? (
        <SkeletonGrid />
      ) : grid ? (
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
          {loading ? (
            <SkeletonRows />
          ) : sortedTracks.length === 0 ? (
            <EmptyState
              icon={Music2}
              title={tracks.length === 0 ? t("library.emptyNoTracks", "Aucun titre indexé") : t("library.emptyNoResults", "Aucun résultat")}
              hint={tracks.length === 0 ? t("library.emptyNoTracks", "Aucun titre indexé") : t("library.emptyNoResults", "Aucun résultat")}
            />
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
          {loading ? (
            <SkeletonRows />
          ) : likedTracks.length === 0 ? (
            <EmptyState icon={Heart} title={t("library.emptyNoLikes", "Aucun titre aimé")} hint={t("library.emptyNoLikesHint", "Touche le cœur sur un titre pour le retrouver ici.")} />
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
              // Mobile: the input and its two action pills stack (a single row
              // squeezed the input to ~120px beside two shrink-0 buttons); from sm
              // up the original one-line pill row is restored untouched.
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
                className="matte-panel flex flex-col gap-2 rounded-2xl p-2 transition-all duration-200 focus-within:ring-2 focus-within:ring-white/10 sm:min-w-0 sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t("library.newPlaylistName", "Nom de la playlist")}
                  className="min-h-[40px] w-full bg-transparent px-4 text-[15px] text-foreground outline-none lg:text-[14px]"
                />
                {/* sm:contents dissolves the wrapper so desktop markup is exactly
                    the old flat input + two buttons inside the pill. */}
                <div className="flex items-center justify-end gap-2 sm:contents">
                  <button type="submit" disabled={!newName.trim()} className="signal-button shrink-0 rounded-full px-5 py-2.5 text-[13px] font-bold transition-colors duration-200 disabled:opacity-40">
                    {t("common.save", "Enregistrer")}
                  </button>
                  <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="ghost-button shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors duration-200">
                    {t("common.cancel", "Annuler")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCreating(true)}
                    className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:min-h-0 lg:py-2.5"
                  >
                    <Plus className="size-4" /> {t("ctx.newPlaylist", "Nouvelle playlist")}
                  </button>
                  <button
                    onClick={() => setSmartOpen((v) => !v)}
                    aria-pressed={smartOpen}
                    className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:min-h-0 lg:py-2.5"
                    title="Smart"
                  >
                    <SlidersHorizontal className="size-4" /> Smart
                  </button>
                  <button
                    onClick={() => importRef.current?.click()}
                    className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:min-h-0 lg:py-2.5"
                    title={t("library.import", "Importer")}
                  >
                    <Upload className="size-4" /> {t("library.import", "Importer")}
                  </button>
                  <button
                    onClick={() => setLinkOpen((v) => !v)}
                    aria-pressed={linkOpen}
                    className="ghost-button inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[13px] font-bold transition-colors duration-200 hover:bg-white/[0.04] lg:min-h-0 lg:py-2.5"
                    title={t("library.linkPlaceholder", "Lien Spotify, Deezer, Apple Music ou YouTube…")}
                  >
                    <Link2 className="size-4" /> {t("library.linkPlaceholder", "Lien Spotify, Deezer, Apple Music ou YouTube…")}
                  </button>
                  <input
                    ref={importRef}
                    type="file"
                    accept=".m3u,.m3u8,.json,audio/x-mpegurl,application/json"
                    className="hidden"
                    onChange={(e) => { void onImportFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
                  />
                </div>
                {linkOpen && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void onImportUrl(); }}
                    className="matte-panel flex items-center gap-2 rounded-full p-1.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-white/10"
                  >
                    <Link2 className="ml-2 size-4 shrink-0 text-muted-foreground" />
                    <input
                      autoFocus
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      type="url"
                      inputMode="url"
                      placeholder={t("library.linkPlaceholder", "Lien Spotify, Deezer, Apple Music ou YouTube…")}
                      className="min-h-[40px] w-full bg-transparent px-2 text-[15px] text-foreground outline-none lg:text-[14px]"
                    />
                    <button
                      type="submit"
                      disabled={!linkUrl.trim() || linkBusy}
                      className="signal-button inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-bold transition-colors duration-200 disabled:opacity-40"
                    >
                      {linkBusy ? <><Loader2 className="size-4 animate-spin" /> {t("library.importing", "Import…")}</> : t("library.import", "Importer")}
                    </button>
                  </form>
                )}
                {smartOpen && (
                  <div className="flex flex-wrap gap-2">
                    {SMART_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { const id = createSmartPlaylist(p.config); setSmartOpen(false); navigate("playlist", id); }}
                        className="rounded-full bg-[var(--panel-2)] px-3 py-1.5 text-[12px] font-bold text-foreground transition-colors hover:bg-[var(--panel-3)]"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {loading ? (
            <SkeletonGrid />
          ) : sortedPlaylists.length > 0 ? (
            <VirtualGrid
              items={sortedPlaylists}
              itemKey={(p) => p.id}
              minItemWidth={160}
              gap={8}
              estimateRowHeight={232}
            >
              {(playlist) => <PlaylistTile playlist={playlist} />}
            </VirtualGrid>
          ) : (
            <div className="matte-panel rounded-lg p-8 text-center text-[13px] font-bold text-muted-foreground">
              {t("library.emptyNoResults", "Aucun résultat")}
            </div>
          )}
        </div>
      )}

      <div className="mt-7 md:hidden">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">
          {t("library.eyebrowHistory", "Historique")}
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
                <span className="flex-1 text-[14px] font-bold text-foreground">{t(link.labelKey, link.view)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
        active ? "bg-white text-black" : "bg-[var(--panel-2)] text-muted-foreground hover:bg-[var(--panel-3)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

const moreLinks: { view: "recents" | "folders" | "insights" | "settings"; labelKey: string; icon: ComponentType<{ className?: string }> }[] = [
  { view: "recents", labelKey: "library.eyebrowHistory", icon: History },
  { view: "folders", labelKey: "library.eyebrowFolders", icon: FolderTree },
  { view: "insights", labelKey: "library.eyebrowInsights", icon: BarChart3 },
  { view: "settings", labelKey: "library.eyebrowSettings", icon: Settings },
];

function AlbumListRow({ album, index }: { album: Album; index: number }) {
  const t = useT();
  const navigate = usePlayer((s) => s.navigate);
  return (
    <button
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-all hover:bg-[var(--surface-2)] focus-auralis active:scale-[0.99]"
      onClick={() => navigate("album", album.albumhash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-md border border-[var(--line)]" style={{ background: (album.color ?? paletteForName(album.albumhash))[0] }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{album.title}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{album.albumartists[0]?.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {album.year && <span>{album.year}</span>}
        <span className="tabular-nums">{t("common.tracksCount", "{count} titres", { count: album.trackcount ?? 0 })}</span>
      </div>
    </button>
  );
}

function ArtistListRow({ artist, index }: { artist: Artist; index: number }) {
  const t = useT();
  const navigate = usePlayer((s) => s.navigate);
  const colors = paletteForName(artist.name);
  return (
    <button
      className="track-row group grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-all hover:bg-[var(--surface-2)] focus-auralis active:scale-[0.99]"
      onClick={() => navigate("artist", artist.artisthash)}
    >
      <span className="text-center text-[12px] tabular-nums text-muted-foreground">{index + 1}</span>
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-10 shrink-0 rounded-full" style={{ background: colors[0] }} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-foreground">{artist.name}</p>
          <p className="mt-0.5 truncate text-[11.5px] leading-tight text-muted-foreground">{artist.genres?.join(", ") || t("common.localArtist", "Artiste local")}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{plural(artist.albumcount ?? 0, "album")}</span>
        <span className="tabular-nums">{plural(artist.trackcount ?? 0, "titre")}</span>
      </div>
    </button>
  );
}
