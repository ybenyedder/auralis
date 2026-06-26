"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Settings, Heart, Music2 } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { useStats } from "@/store/stats";
import { useReco } from "@/store/reco";
import { SectionHeader } from "../SectionHeader";
import { AlbumCard, ArtistCard } from "../Cards";
import { Artwork } from "../Artwork";
import { trackTitle, trackArtist } from "@/lib/auralis/brand";
import { moodForTrack, moodById } from "@/lib/auralis/mood";

export function HomeView() {
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const playCounts = usePlayer((s) => s.playCounts);
  const favorites = usePlayer((s) => s.favorites);
  const dislikes = usePlayer((s) => s.dislikes);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const error = useLibraryStore((s) => s.error);

  const statsLoaded = useStats((s) => s.loaded);
  const fetchStats = useStats((s) => s.fetchStats);
  useEffect(() => {
    if (!statsLoaded) void fetchStats();
  }, [statsLoaded, fetchStats]);

  // Personalised recommendations from the server taste engine.
  const recoForYou = useReco((s) => s.forYou);
  const recoScores = useReco((s) => s.scores);
  const recoProfile = useReco((s) => s.profile);
  const recoLoaded = useReco((s) => s.loaded);
  const fetchForYou = useReco((s) => s.fetchForYou);
  useEffect(() => {
    if (!recoLoaded) void fetchForYou();
  }, [recoLoaded, fetchForYou]);

  // "Fait pour vous" — the top of the engine's ranked mix, resolved against the
  // in-memory library. Skipped / disliked tracks never reach here (the server
  // scores them down / excludes them), so feedback visibly reshapes this shelf.
  const forYou = useMemo(() => {
    const ranked = tracksForHashesFrom(tracks, recoForYou.map((r) => r.trackhash));
    return ranked.filter((t) => !dislikes.has(t.trackhash)).slice(0, 12);
  }, [tracks, recoForYou, dislikes]);

  // Read the wall clock once after mount (never during render — that's impure and
  // would also risk an SSR/CSR mismatch). Drives the greeting.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  // Real listening history (no fake fill — an empty history shows no shelf).
  const recent = useMemo(
    () => tracksForHashesFrom(tracks, recentTrackhashes).slice(0, 6),
    [tracks, recentTrackhashes],
  );

  const featuredAlbums = albums.slice(0, 6);
  // "Préférés" must reflect what the user ACTUALLY listens to. Artist.playcount from
  // the library snapshot is always 0 (a per-file field we don't populate), so ranking
  // on it is a no-op (arbitrary alphabetical order, every card "0 écoutes"). Instead
  // tally the user's real per-track plays onto each artist, rank by that, and override
  // each card's displayed count with the derived total so the shelf is truthful.
  const featuredArtists = useMemo(() => {
    const tally = new Map<string, number>();
    for (const t of tracks) {
      const c = playCounts[t.trackhash] ?? 0;
      if (!c) continue;
      for (const a of t.artists ?? []) {
        if (a.artisthash) tally.set(a.artisthash, (tally.get(a.artisthash) ?? 0) + c);
      }
    }
    return [...artists]
      .map((a) => ({ ...a, playcount: tally.get(a.artisthash) ?? 0 }))
      .sort((a, b) => b.playcount - a.playcount)
      .slice(0, 6);
  }, [artists, tracks, playCounts]);

  // Mood-based recommendations: infer the mood the user listens to most (by real
  // play counts; fall back to the biggest mood bucket for a fresh library), then
  // surface tracks from that mood they've played least — discovery within the
  // vibe they already love. Purely derived from genre → mood, no audio analysis.
  const moodRecs = useMemo(() => {
    if (tracks.length === 0) return null;
    const byMood = new Map<string, typeof tracks>();
    const plays = new Map<string, number>();
    for (const t of tracks) {
      if (dislikes.has(t.trackhash)) continue; // never resurface rejected tracks
      const id = moodForTrack(t);
      if (!id) continue;
      const arr = byMood.get(id);
      if (arr) arr.push(t); else byMood.set(id, [t]);
      const c = playCounts[t.trackhash] ?? 0;
      if (c) plays.set(id, (plays.get(id) ?? 0) + c);
    }
    if (byMood.size === 0) return null;

    // Prefer the engine's learned mood affinity (it folds in skips / likes / recency);
    // fall back to raw play tallies, then the biggest bucket for a fresh library.
    let topId: string | null = null;
    const affinity = recoProfile?.moods?.find((m) => m.weight > 0 && byMood.has(m.mood));
    if (affinity) {
      topId = affinity.mood;
    } else {
      let best = -1;
      const ranking = plays.size > 0 ? plays : new Map([...byMood].map(([id, a]) => [id, a.length]));
      for (const [id, score] of ranking) {
        if (score > best) { best = score; topId = id; }
      }
    }
    if (!topId) return null;
    const mood = moodById(topId);
    if (!mood) return null;

    const pool = byMood.get(topId) ?? [];
    if (pool.length < 4) return null;
    // Rank by taste score when we have one (loved tracks rise, low-affinity sink);
    // else least-played-first for discovery. A light shuffle of the top slice keeps
    // the shelf fresh between visits.
    const hasScores = recoScores.size > 0;
    const ranked = [...pool].sort((a, b) =>
      hasScores
        ? (recoScores.get(b.trackhash) ?? 0) - (recoScores.get(a.trackhash) ?? 0)
        : (playCounts[a.trackhash] ?? 0) - (playCounts[b.trackhash] ?? 0),
    );
    const recs = shuffleArray(ranked.slice(0, hasScores ? 16 : 40)).slice(0, 8);
    return { mood, recs };
  }, [tracks, playCounts, dislikes, recoProfile, recoScores]);

  // Spotify "quick access" grid: the row of horizontal cards under the greeting.
  // Liked Songs first (the iconic purple tile), then your recently played tracks.
  const quickTiles = useMemo(() => {
    const tiles: {
      key: string; title: string; image?: string; colors?: [string, string, string];
      liked?: boolean; onPlay: () => void; onOpen: () => void;
    }[] = [];
    if (favorites.size > 0) {
      const favTracks = tracks.filter((t) => favorites.has(t.trackhash));
      tiles.push({
        key: "liked", title: "Titres likés", liked: true,
        onPlay: () => { if (favTracks.length) playList(favTracks, 0); },
        onOpen: () => navigate("favorites"),
      });
    }
    recent.forEach((t, i) => tiles.push({
      key: t.trackhash, title: trackTitle(t), image: t.image, colors: t.color,
      onPlay: () => playList(recent, i),
      onOpen: () => playList(recent, i),
    }));
    return tiles.slice(0, 8);
  }, [favorites, tracks, recent, playList, navigate]);

  const greeting = (() => {
    if (now == null) return "Bienvenue";
    const h = new Date(now).getHours();
    if (h < 6) return "Bonne nuit";
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  })();

  return (
    <div className="relative fade-up min-h-full pb-8">
      {/* Spotify Home Gradient */}
      <div 
        className="absolute inset-0 h-[332px] pointer-events-none opacity-40 z-0 transition-colors duration-1000" 
        style={{ background: "linear-gradient(to bottom, #535353, transparent)" }} 
      />
      
      <div className="relative z-10 px-4 py-4 lg:px-6 lg:py-6 space-y-8 lg:space-y-10">
        {/* Spotify-style greeting + quick-access grid */}
        <section>
          <h1 className="text-[24px] font-bold tracking-tight text-white lg:text-[32px] mb-4">{greeting}</h1>
          {error && <p className="mt-2 max-w-xl text-[12px] font-medium text-[var(--text-muted)]">{error}</p>}

          {tracks.length === 0 ? (
            <button
              onClick={() => navigate("settings")}
              className="signal-button mt-4 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold"
            >
              <Settings className="size-4" />
              Configurer la bibliothèque
            </button>
          ) : quickTiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {quickTiles.map(({ key, ...rest }) => (
                <QuickTile key={key} {...rest} />
              ))}
            </div>
          ) : null}
        </section>

        {forYou.length >= 4 && (
          <section>
            <div className="mb-1 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recommandé pour vous</p>
                <h2 className="truncate text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Fait pour vous</h2>
              </div>
              <button
                onClick={() => playList(forYou, 0)}
                className="signal-button hidden shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold sm:inline-flex"
              >
                <Play className="size-4 fill-current" />
                Lire
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {forYou.map((t, i) => (
                <QuickTile
                  key={t.trackhash}
                  title={trackTitle(t)}
                  subtitle={trackArtist(t)}
                  image={t.image}
                  colors={t.color}
                  onPlay={() => playList(forYou, i)}
                  onOpen={() => playList(forYou, i)}
                />
              ))}
            </div>
          </section>
        )}

        {moodRecs && (
          <section>
            <div className="mb-1 flex items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-lg"
                  style={{ background: `linear-gradient(150deg, ${moodRecs.mood.colors[0]}, ${moodRecs.mood.colors[1]})` }}
                  aria-hidden
                >
                  <Music2 className="size-6 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Pour votre humeur</p>
                  <h2 className="truncate text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{moodRecs.mood.label}</h2>
                </div>
              </div>
              <button
                onClick={() => playList(moodRecs.recs, 0)}
                className="signal-button hidden shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold sm:inline-flex"
              >
                <Play className="size-4 fill-current" />
                Lire
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {moodRecs.recs.map((t, i) => (
                <QuickTile
                  key={t.trackhash}
                  title={trackTitle(t)}
                  subtitle={trackArtist(t)}
                  image={t.image}
                  colors={t.color}
                  onPlay={() => playList(moodRecs.recs, i)}
                  onOpen={() => playList(moodRecs.recs, i)}
                />
              ))}
            </div>
          </section>
        )}

        {featuredAlbums.length > 0 && (
          <section>
            <SectionHeader title="Albums de votre bibliothèque" />
            <div className="snap-x -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
              {featuredAlbums.map((album) => (
                <div key={album.albumhash} className="w-[160px] shrink-0 lg:w-auto lg:shrink">
                  <AlbumCard album={album} />
                </div>
              ))}
            </div>
          </section>
        )}

        {featuredArtists.length > 0 && (
          <section>
            <SectionHeader title="Vos artistes préférés" />
            <div className="snap-x -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
              {featuredArtists.map((artist) => (
                <div key={artist.artisthash} className="w-[160px] shrink-0 lg:w-auto lg:shrink">
                  <ArtistCard artist={artist} />
                </div>
              ))}
            </div>
          </section>
        )}

        {albums.length > 6 && (
          <section>
            <SectionHeader title="Plus d'albums" />
            <div className="snap-x -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
              {albums.slice(6, 12).map((album) => (
                <div key={album.albumhash} className="w-[160px] shrink-0 lg:w-auto lg:shrink">
                  <AlbumCard album={album} />
                </div>
              ))}
            </div>
          </section>
        )}

        {albums.length > 12 && (
          <section>
            <SectionHeader title="Albums recommandés" />
            <div className="snap-x -mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
              {albums.slice(12, 18).map((album) => (
                <div key={album.albumhash} className="w-[160px] shrink-0 lg:w-auto lg:shrink">
                  <AlbumCard album={album} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Spotify "quick access" card: a squat horizontal tile (art flush-left, bold
 *  title) that lightens on hover and reveals a green circular play FAB sliding up
 *  from the bottom-right — the home screen's most recognisable element. */
function QuickTile({
  title, subtitle, image, colors, liked, onPlay, onOpen,
}: {
  title: string;
  subtitle?: string;
  image?: string;
  colors?: [string, string, string];
  liked?: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="group relative flex h-[64px] cursor-pointer items-center gap-3 overflow-hidden rounded-xs bg-[var(--panel-2)] transition-colors duration-200 hover:bg-[var(--panel-3)]"
    >
      {liked ? (
        <span
          className="grid h-full w-[64px] shrink-0 place-items-center"
          style={{ background: "linear-gradient(135deg, #450af5, #8e8ee5 60%, #c4b9e8)" }}
        >
          <Heart className="size-6 fill-white text-white" />
        </span>
      ) : (
        <Artwork
          title={title}
          image={image}
          colors={colors}
          size={64}
          rounded={0}
          className="h-full w-[64px]"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col pr-2">
        <span className="truncate text-[14px] font-bold text-white">{title}</span>
        {subtitle && <span className="truncate text-[12px] font-medium text-[var(--text-muted)]">{subtitle}</span>}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onPlay(); }}
        aria-label={`Lire ${title}`}
        className="signal-button glow-primary mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-full opacity-0 transition-all duration-200 group-hover:opacity-100"
      >
        <Play className="size-4 fill-current ml-0.5" />
      </button>
    </div>
  );
}
