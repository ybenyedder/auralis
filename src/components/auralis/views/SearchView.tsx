"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { Search, X, Play, Loader2, Clock, Trash2, Download, Check, AlertCircle } from "lucide-react";
import { usePlayer } from "@/store/player";
import { shuffleArray } from "@/store/slices/helpers";
import { useLibraryStore, artistPlayTotals } from "@/store/library";
import { api } from "@/lib/auralis/api";
import { paletteForName, trackArtist, trackTitle, formatDuration } from "@/lib/auralis/brand";
import { useT } from "@/lib/auralis/i18n";
import { cn, foldAccents } from "@/lib/utils";
import type { Track } from "@/lib/auralis/types";
import { SectionHeader } from "../SectionHeader";
import { TrackRow, TrackListHeader } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";
import { Artwork } from "../Artwork";
import { VirtualList } from "../Virtualized";
import { SkeletonCategoryGrid } from "../Skeletons";

type ResultTab = "all" | "songs" | "albums" | "artists";

// Online (downloadable) results + download jobs — mirrors the server's
// downloader.ts shapes without importing the server module (client-safe).
interface OnlineResult {
  videoId: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string | null;
  url: string;
}
type DownloadJobStatus = "queued" | "resolving" | "downloading" | "scanning" | "done" | "error";
interface DownloadJobView {
  id: string;
  status: DownloadJobStatus;
  progress: number;
  trackhash: string | null;
  error: string | null;
}

const RECENT_KEY = "auralis.recentSearches";
const MAX_RECENT = 8;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/**
 * "Rechercher" — the Search root tab. A DEDICATED search experience: big title,
 * sticky search field, recent queries, then ranked results. It replaces the old
 * behaviour where "Parcourir" and "Rechercher" both rendered the same view —
 * the root cause of the "I'm on Library but it says Search" confusion.
 */
export function SearchView() {
  const t = useT();
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const notify = usePlayer((s) => s.notify);
  const playCounts = usePlayer((s) => s.playCounts);
  const tracks = useLibraryStore((s) => s.tracks);
  const trackIndex = useLibraryStore((s) => s.trackIndex);
  const albums = useLibraryStore((s) => s.albums);
  const rawArtists = useLibraryStore((s) => s.artists);
  const status = useLibraryStore((s) => s.status);
  const query = searchQuery.trim().toLowerCase();
  const deferredQuery = useDeferredValue(query);
  const [tab, setTab] = useState<ResultTab>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load persisted recent queries once on mount (after hydration — localStorage
  // isn't available during SSR, so a lazy useState initializer would mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent());
  }, []);

  // Persist a query into the recent list (deduped, newest first, capped).
  const pushRecent = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((v) => v !== trimmed)].slice(0, MAX_RECENT);
      try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* unavailable */ }
      return next;
    });
  };

  const clearRecent = () => {
    setRecent([]);
    try { window.localStorage.removeItem(RECENT_KEY); } catch { /* unavailable */ }
  };

  // The shared catalogue is user-independent (artist.playcount is always 0); derive
  // the per-user play total client-side so cards show "N écoutes", like the other views.
  const artists = useMemo(() => {
    const tally = artistPlayTotals(tracks, playCounts);
    return rawArtists.map((a) => ({ ...a, playcount: tally.get(a.artisthash) ?? 0 }));
  }, [rawArtists, tracks, playCounts]);

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
          setServerTracks(res.tracks.map((tr) => idx.get(tr.trackhash) ?? tr));
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

  // Record the query as a recent search once it's cleared or navigated away from —
  // debounce a "commit" so every keystroke doesn't spam the list: commit after 1.2s
  // of dwell on a non-empty query.
  useEffect(() => {
    if (!deferredQuery) return;
    const id = setTimeout(() => pushRecent(deferredQuery), 1200);
    return () => clearTimeout(id);
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
    const seen = new Set(serverTracks.map((tr) => tr.trackhash));
    return [...serverTracks, ...client.filter((tr) => !seen.has(tr.trackhash))];
  }, [serverTracks, results]);

  // ---- online results ("not in the library? download it") ------------------
  // Only asked for when the local search is starving (< 5 track hits): the
  // server then runs a yt-dlp YouTube search and offers downloadable results.
  const [online, setOnline] = useState<{ enabled: boolean; results: OnlineResult[]; error?: string } | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  useEffect(() => {
    if (!deferredQuery || deferredQuery.length < 2 || trackResults.length >= 5) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOnline(null);
      setOnlineLoading(false);
      return;
    }
    let cancelled = false;
    setOnlineLoading(true);
    const id = setTimeout(() => {
      void api
        .get<{ online?: { enabled: boolean; results: OnlineResult[]; error?: string } }>(
          `/api/search?q=${encodeURIComponent(deferredQuery)}&online=1&limit=8`,
        )
        .then((res) => {
          if (cancelled) return;
          setOnline(res.online ?? null);
          setOnlineLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setOnline(null);
          setOnlineLoading(false);
        });
    }, 550);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [deferredQuery, trackResults.length]);

  // Active/recent download jobs keyed by videoId — drives each row's button state.
  const [jobs, setJobs] = useState<Record<string, DownloadJobView>>({});
  const pollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const timer of pollTimers.current) clearTimeout(timer);
      pollTimers.current = [];
    },
    [],
  );

  const patchJob = (videoId: string, patch: Partial<DownloadJobView>) =>
    setJobs((prev) => {
      const cur = prev[videoId] ?? { id: "", status: "queued" as DownloadJobStatus, progress: 0, trackhash: null, error: null };
      return { ...prev, [videoId]: { ...cur, ...patch } };
    });

  // A finished download hands back a trackhash; the scan SSE reloads the library,
  // and once the track materialises it starts playing on its own.
  const [autoPlayHash, setAutoPlayHash] = useState<string | null>(null);
  useEffect(() => {
    if (!autoPlayHash) return;
    const track = trackIndex.get(autoPlayHash);
    if (!track) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoPlayHash(null);
    playList([track], 0);
  }, [autoPlayHash, trackIndex, playList]);

  const pollJob = (videoId: string, jobId: string, attempt = 0) => {
    const timer = setTimeout(() => {
      void api
        .get<{ job: DownloadJobView }>(`/api/download?job=${encodeURIComponent(jobId)}`)
        .then((res) => {
          const job = res.job;
          if (!job) return;
          patchJob(videoId, job);
          if (job.status === "done") {
            if (job.trackhash) {
              // Track already indexed (fast scan)? Play now; otherwise wait for
              // the SSE-driven library reload to surface it (autoPlayHash effect).
              const track = useLibraryStore.getState().trackIndex.get(job.trackhash);
              if (track) playList([track], 0);
              else setAutoPlayHash(job.trackhash);
              notify(t("search.downloadDone", "Ajouté à la bibliothèque — lecture"), { tone: "success" });
            }
          } else if (job.status === "error") {
            notify(job.error || t("search.downloadFailed", "Échec du téléchargement"), { tone: "error" });
          } else if (attempt < 600) {
            pollJob(videoId, jobId, attempt + 1);
          }
        })
        .catch(() => {
          if (attempt < 600) pollJob(videoId, jobId, attempt + 1);
        });
    }, 1200);
    pollTimers.current.push(timer);
  };

  const startDownload = (result: OnlineResult) => {
    patchJob(result.videoId, { status: "queued", progress: 0, error: null });
    void api
      .post<{ ok: boolean; job?: { id: string }; error?: string }>("/api/download", {
        query: searchQuery || result.title,
        videoId: result.videoId,
        title: result.title,
      })
      .then((res) => {
        if (!res?.ok || !res.job) throw new Error(res?.error || "no job");
        pollJob(result.videoId, res.job.id);
      })
      .catch((err: unknown) => {
        patchJob(result.videoId, { status: "error", error: err instanceof Error ? err.message : "error" });
        notify(t("search.downloadFailed", "Échec du téléchargement"), { tone: "error" });
      });
  };

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

  const placeholder = t("search.placeholder", "Que souhaitez-vous écouter ?");

  // The downloadable section appears whenever the local library can't answer the
  // query well — empty results OR fewer than 5 track hits — and the server has
  // yt-dlp (or we're still asking it).
  const onlineVisible =
    !!deferredQuery &&
    deferredQuery.length >= 2 &&
    trackResults.length < 5 &&
    (onlineLoading || (!!online?.enabled && online.results.length > 0));
  const onlineSection = onlineVisible ? (
    <OnlineSection
      results={online?.results ?? []}
      jobs={jobs}
      loading={onlineLoading}
      onStart={startDownload}
      t={t}
    />
  ) : null;

  const searchBar = (sticky: boolean) => (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-5 py-3 bg-[var(--panel-2)] border border-transparent hover:bg-[var(--panel-3)] hover:border-[var(--panel-3)] focus-within:border-white transition-all h-12 max-w-[420px]",
      )}
    >
      <Search className="size-5 shrink-0 text-[var(--text-muted)]" />
      <input
        ref={sticky ? inputRef : undefined}
        type="search"
        aria-label={placeholder}
        value={searchQuery}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={placeholder}
        className="min-h-[28px] w-full bg-transparent text-[14px] font-medium text-foreground placeholder:text-[var(--text-muted)] outline-none"
      />
      {sticky && searching && query && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--text-muted)]" aria-label="Recherche en cours" />}
      {sticky && searchQuery && (
        <button
          onClick={() => {
            setSearch("");
            inputRef.current?.focus();
          }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/10 hover:text-foreground lg:h-8 lg:w-8"
          aria-label={t("mobile.close", "Fermer")}
        >
          <X className="size-4 lg:size-3.5" />
        </button>
      )}
    </div>
  );

  if (!query) {
    const loading = (status === "idle" || status === "loading") && albums.length === 0 && artists.length === 0;
    return (
      <div className="fade-up px-4 pb-6 pt-3 lg:px-6 lg:pt-5">
        {/* iOS Large Title */}
        <h1 className="mb-4 text-[28px] font-black tracking-tight text-foreground lg:text-[34px]">
          {t("search.title", "Rechercher")}
        </h1>

        <div className="safe-px sticky top-0 z-10 -mx-4 mb-5 glass border-b-0 px-4 pt-3 md:hidden">
          {searchBar(false)}
        </div>

        {/* Recent queries — quick relaunch of a previous search. */}
        {recent.length > 0 && (
          <section className="mb-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">
                {t("mobile.recentSearches", "Recherches récentes")}
              </h2>
              <button
                onClick={clearRecent}
                className="tap-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
                aria-label={t("mobile.clearSearches", "Effacer l'historique")}
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">{t("mobile.clearSearches", "Effacer l'historique")}</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((q) => (
                <button
                  key={q}
                  onClick={() => setSearch(q)}
                  className="tap-press flex items-center gap-2 rounded-full bg-[var(--panel-2)] px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-[var(--panel-3)]"
                >
                  <Clock className="size-3.5 text-muted-foreground" />
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Cold start skeleton. */}
        {loading && (
          <div>
            <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">
              {t("search.browseAll", "Parcourir tout")}
            </h2>
            <SkeletonCategoryGrid />
          </div>
        )}

        {/* Suggested genres — quick shuffle entry points. */}
        {!loading && (
          <GenreSuggestions onPlay={(list) => playList(shuffleArray(list), 0)} t={t} />
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
    { id: "all", label: t("search.all", "Tout") },
    { id: "songs", label: t("search.songs", "Titres") },
    { id: "albums", label: t("search.albums", "Albums") },
    { id: "artists", label: t("search.artists", "Artistes") },
  ];

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="safe-px sticky top-0 z-10 -mx-4 mb-4 glass border-b-0 px-4 lg:static lg:mx-0 lg:mb-5 lg:!bg-transparent lg:!backdrop-filter-none lg:px-0 pt-4">
        {searchBar(true)}
      </div>

      {!empty && (
        <div className="mb-6 flex items-center gap-2 overflow-x-auto scroll-hidden">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-colors",
                tab === tb.id ? "bg-white text-black" : "bg-[var(--panel-2)] text-foreground hover:bg-[var(--panel-3)]",
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>
      )}

      {empty || emptyForTab ? (
        <div className="space-y-8">
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center lg:py-12">
            <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
              <Search className="size-7 text-muted-foreground/60" />
            </div>
            <p className="text-[14px] font-bold text-muted-foreground">
              {emptyForTab
                ? t("search.noResultsIn", `Aucun résultat dans "${TABS.find((tb) => tb.id === tab)?.label}" pour “${searchQuery}”`, {
                    tab: TABS.find((tb) => tb.id === tab)?.label ?? "",
                    query: searchQuery,
                  })
                : t("search.noResults", `Aucun résultat pour “${searchQuery}”`, { query: searchQuery })}
            </p>
          </div>
          {onlineSection}
        </div>
      ) : (
        results && (
          <div className="space-y-8">
            {/* Top hit + first few songs, like Spotify's two-column header. */}
            {tab === "all" && best && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <SectionHeader title={t("search.bestResult", "Meilleur résultat")} />
                  <BestResult best={best} trackResults={trackResults} playList={playList} navigate={navigate} />
                </section>
                {trackResults.length > 0 && (
                  <section className="min-w-0">
                    <SectionHeader title={t("search.songs", "Titres")} />
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
                <SectionHeader title={t("search.artists", "Artistes")} eyebrow={`${results.artists.length}`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.artists.slice(0, tab === "artists" ? 48 : 12).map((artist) => (
                    <ArtistCard key={artist.artisthash} artist={artist} />
                  ))}
                </div>
              </section>
            )}

            {(tab === "all" || tab === "albums") && results.albums.length > 0 && (
              <section>
                <SectionHeader title={t("search.albums", "Albums")} eyebrow={`${results.albums.length}`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {results.albums.slice(0, tab === "albums" ? 48 : 12).map((album) => (
                    <AlbumCard key={album.albumhash} album={album} />
                  ))}
                </div>
              </section>
            )}

            {tab === "songs" && trackResults.length > 0 && (
              <section>
                <SectionHeader title={t("search.songs", "Titres")} eyebrow={`${trackResults.length}`} />
                <TrackListHeader />
                <VirtualList items={trackResults} itemKey={(tr) => tr.trackhash} estimateHeight={56} gap={2}>
                  {(track, index) => <TrackRow track={track} index={index} list={trackResults} />}
                </VirtualList>
              </section>
            )}

            {onlineSection}
          </div>
        )
      )}
    </div>
  );
}

/** Downloadable online results — the "search something you don't own" shelf.
 *  Each row fetches the track onto the SERVER via yt-dlp; the library scan then
 *  makes it a normal track (and it starts playing once imported). */
function OnlineSection({
  results,
  jobs,
  loading,
  onStart,
  t,
}: {
  results: OnlineResult[];
  jobs: Record<string, DownloadJobView>;
  loading: boolean;
  onStart: (result: OnlineResult) => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("search.online", "Trouver ailleurs")}>
      <SectionHeader title={t("search.online", "Trouver ailleurs")} eyebrow={loading ? undefined : `${results.length}`} />
      <p className="mb-3 text-[12px] font-medium text-muted-foreground">
        {t("search.onlineHint", "Pas dans ta bibliothèque — télécharge-le sur le serveur")}
      </p>
      {loading && (
        <div className="flex items-center gap-2 px-1 py-4 text-[13px] font-semibold text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("search.onlineSearching", "Recherche en ligne…")}
        </div>
      )}
      {!loading && results.length === 0 && (
        <p className="px-1 py-4 text-[13px] font-semibold text-muted-foreground">
          {t("search.onlineUnavailable", "Téléchargement indisponible : yt-dlp manque sur le serveur")}
        </p>
      )}
      <div className="flex flex-col gap-2">
        {results.map((result) => (
          <OnlineRow key={result.videoId} result={result} job={jobs[result.videoId]} onStart={onStart} t={t} />
        ))}
      </div>
    </section>
  );
}

function OnlineRow({
  result,
  job,
  onStart,
  t,
}: {
  result: OnlineResult;
  job?: DownloadJobView;
  onStart: (result: OnlineResult) => void;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
}) {
  const status = job?.status;
  const busy = status === "queued" || status === "resolving" || status === "downloading" || status === "scanning";
  const label =
    status === "queued" || status === "resolving"
      ? t("search.downloadQueued", "En file")
      : status === "downloading"
        ? t("search.downloadRunning", "{progress} %", { progress: job?.progress ?? 0 })
        : status === "scanning"
          ? t("search.downloadScanning", "Ajout à la bibliothèque…")
          : status === "done"
            ? t("search.downloaded", "Ajouté")
            : status === "error"
              ? t("search.downloadFailed", "Échec — réessayer")
              : t("search.download", "Télécharger");

  return (
    <div className="matte-panel flex items-center gap-3 rounded-lg p-2 pr-3">
      {result.thumbnail ? (
        // YouTube thumbnail — remote, lazy, never blocks the row.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-14 w-14 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[var(--surface-2)]">
          <Download className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-foreground">{result.title}</p>
        <p className="truncate text-[12px] font-semibold text-muted-foreground">
          {result.uploader} · {formatDuration(result.duration)}
        </p>
        {status === "downloading" && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent,var(--foreground))]"
              style={{ width: `${Math.max(3, job?.progress ?? 0)}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={() => !busy && status !== "done" && onStart(result)}
        disabled={busy || status === "done"}
        aria-label={`${label} — ${result.title}`}
        className={cn(
          "tap-press flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[12px] font-bold transition-colors lg:h-9",
          status === "done"
            ? "bg-[var(--surface-2)] text-muted-foreground"
            : status === "error"
              ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
              : busy
                ? "bg-[var(--surface-2)] text-muted-foreground"
                : "bg-foreground text-background hover:opacity-90",
        )}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {status === "done" && <Check className="size-4" />}
        {status === "error" && <AlertCircle className="size-4" />}
        <span>{label}</span>
      </button>
    </div>
  );
}

/** Compact genre chips shown on the idle search screen — tapping one shuffles
 * that genre, exactly like picking a recent query but for discovery. */
function GenreSuggestions({
  onPlay,
  t,
}: {
  onPlay: (list: Track[]) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const tracks = useLibraryStore((s) => s.tracks);
  const genres = useMemo(() => {
    const byGenre = new Map<string, Track[]>();
    for (const tr of tracks) {
      if (!tr.genre) continue;
      const arr = byGenre.get(tr.genre) ?? [];
      arr.push(tr);
      byGenre.set(tr.genre, arr);
    }
    return [...byGenre.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  }, [tracks]);

  if (genres.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">
        {t("search.browseAll", "Parcourir tout")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {genres.map(([genre, list]) => {
          const [c0] = paletteForName(genre);
          return (
            <button
              key={genre}
              onClick={() => onPlay(list)}
              className="tap-press rounded-full px-4 py-2 text-[13px] font-bold text-white shadow-sm"
              style={{ background: c0 }}
              aria-label={`${t("common.play", "Lire")} — ${genre}`}
            >
              {genre}
            </button>
          );
        })}
      </div>
    </section>
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
