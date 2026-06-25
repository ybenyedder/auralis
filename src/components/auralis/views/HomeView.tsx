"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, TrendingUp, Flame, Sparkles, RotateCcw, Clock3, Settings, Compass } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { useStats } from "@/store/stats";
import { SectionHeader } from "../SectionHeader";
import { TrackRow } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";
import { Artwork } from "../Artwork";
import { coverVars, trackArtist, trackTitle } from "@/lib/auralis/brand";

/** Deterministic per-day shuffle (LCG) so the "Mix du jour" is stable across a
 *  day and reshuffles at midnight — no Math.random, so SSR and reloads agree. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed || 1) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function HomeView() {
  const playList = usePlayer((s) => s.playList);
  const navigate = usePlayer((s) => s.navigate);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const playCounts = usePlayer((s) => s.playCounts);
  const recentTrackhashes = usePlayer((s) => s.recentTrackhashes);
  const favorites = usePlayer((s) => s.favorites);
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const error = useLibraryStore((s) => s.error);

  const streak = useStats((s) => s.streak);
  const weekPlays = useStats((s) => s.weekPlays);
  const statsLoaded = useStats((s) => s.loaded);
  const fetchStats = useStats((s) => s.fetchStats);
  useEffect(() => {
    if (!statsLoaded) void fetchStats();
  }, [statsLoaded, fetchStats]);

  // Read the wall clock once after mount (never during render — that's impure and
  // would also risk an SSR/CSR mismatch). Drives the daily-mix seed + the greeting.
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

  // Daily Mix: a stable-for-the-day shuffle drawn from what you actually like /
  // play, falling back to the whole library on a fresh account.
  const dailyMix = useMemo(() => {
    const liked = tracks.filter((t) => favorites.has(t.trackhash) || (playCounts[t.trackhash] ?? 0) > 0);
    const pool = liked.length >= 8 ? liked : tracks;
    const daySeed = now != null ? Math.floor(now / 86_400_000) : 0;
    return seededShuffle(pool, daySeed).slice(0, 30);
  }, [tracks, favorites, playCounts, now]);

  // Rediscover: favourited but not played recently — pull people back to old loves.
  const rediscover = useMemo(() => {
    const recentSet = new Set(recentTrackhashes.slice(0, 30));
    return tracks.filter((t) => favorites.has(t.trackhash) && !recentSet.has(t.trackhash)).slice(0, 6);
  }, [tracks, favorites, recentTrackhashes]);

  // Discover: tracks you own but have never played — surfaces forgotten music.
  // Daily-seeded so the picks rotate, and only when there's a real backlog.
  const neverPlayed = useMemo(() => {
    if (now == null) return [];
    const unplayed = tracks.filter((t) => (playCounts[t.trackhash] ?? t.playcount ?? 0) === 0);
    if (unplayed.length < 4) return [];
    return seededShuffle(unplayed, (Math.floor(now / 86_400_000) ^ 0x9e3779b1) >>> 0).slice(0, 6);
  }, [tracks, playCounts, now]);

  // Recently added: files indexed in the last ~30 days, newest first. On a fresh
  // scan everything qualifies (shows your newest tracks); on an established library
  // it surfaces only genuinely new additions.
  const recentlyAdded = useMemo(() => {
    if (now == null) return [];
    const cutoff = now - 30 * 86_400_000;
    return [...tracks]
      .filter((t) => (t.addedAt ?? 0) >= cutoff)
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .slice(0, 6);
  }, [tracks, now]);

  const featuredAlbums = albums.slice(0, 6);
  const featuredArtists = artists.slice(0, 6);
  const topTracks = useMemo(
    () => [...tracks].sort((a, b) => (playCounts[b.trackhash] ?? b.playcount ?? 0) - (playCounts[a.trackhash] ?? a.playcount ?? 0)).slice(0, 5),
    [tracks, playCounts],
  );
  const leadTrack = currentTrack ?? recent[0] ?? tracks[0];
  const mixLead = dailyMix[0];

  const greeting = (() => {
    if (now == null) return "Bienvenue";
    const h = new Date(now).getHours();
    if (h < 6) return "Bonne nuit";
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  })();

  return (
    <div className="fade-up space-y-6 px-4 py-4 lg:space-y-8 lg:px-6 lg:py-6">
      <section className="hero-cover grid gap-4 rounded-[18px] border border-[var(--line)] px-4 py-5 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] lg:gap-5 lg:px-6 lg:py-7" style={coverVars(leadTrack?.color)}>
        <div className="flex min-w-0 items-end gap-4 lg:gap-6">
          <Artwork
            title={leadTrack?.title}
            trackhash={leadTrack?.trackhash}
            size={128}
            rounded={13}
            colors={leadTrack?.color}
            image={leadTrack?.image}
            className="hidden shadow-[0_20px_44px_-26px_rgba(0,0,0,0.95)] sm:block"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brass)]">
                {currentTrack ? "En lecture" : greeting}
              </p>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10.5px] font-black text-primary-soft">
                  <Flame className="size-3" /> {streak} jour{streak > 1 ? "s" : ""} d’affilée
                </span>
              )}
              {weekPlays > 0 && (
                <span className="text-[10.5px] font-bold text-muted-foreground/70">{weekPlays} écoutes cette semaine</span>
              )}
            </div>
            <h1 className="mt-2 max-w-3xl text-[26px] font-black leading-[1.02] tracking-tight text-foreground lg:text-[clamp(30px,5vw,58px)] lg:leading-[0.92]">
              {leadTrack ? trackTitle(leadTrack) : "Aucune musique indexée"}
            </h1>
            <p className="mt-2 truncate text-[13px] font-semibold text-muted-foreground lg:mt-3 lg:text-[14px]">{leadTrack ? trackArtist(leadTrack) : "Configure AURALIS_MUSIC_DIR puis relance le scan"}</p>
            {error && <p className="mt-2 max-w-xl text-[12px] text-amber">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2 lg:mt-5">
              {tracks.length === 0 ? (
                <button
                  onClick={() => navigate("settings")}
                  className="signal-button tap-press flex h-11 items-center gap-2 rounded-[11px] px-5 text-[13px] font-black lg:h-auto lg:px-4 lg:py-2 lg:text-[12px]"
                >
                  <Settings className="size-4" />
                  Configurer la bibliothèque
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const queue = recent.length ? recent : dailyMix.length ? dailyMix : tracks.slice(0, 30);
                      if (queue.length) playList(queue, leadTrack ? Math.max(0, queue.findIndex((t) => t.trackhash === leadTrack.trackhash)) : 0);
                    }}
                    className="signal-button tap-press flex h-11 items-center gap-2 rounded-[11px] px-5 text-[13px] font-black lg:h-auto lg:px-4 lg:py-2 lg:text-[12px]"
                  >
                    <Play className="size-4 fill-current" />
                    Lire
                  </button>
                  <button onClick={() => navigate("library")} className="ghost-button tap-press flex h-11 items-center rounded-[11px] px-5 text-[13px] font-black lg:h-auto lg:px-4 lg:py-2 lg:text-[12px]">
                    Bibliothèque
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {dailyMix.length > 0 && (
        <section>
          <SectionHeader title="Mix du jour" eyebrow="Rien que pour toi" icon={<Sparkles className="size-4 text-primary-soft" />} />
          <div className="mt-3 grid gap-3 lg:grid-cols-[300px_1fr] lg:gap-5">
            <button
              onClick={() => playList(dailyMix, 0)}
              className="hero-cover card-lift group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-[16px] border border-[var(--line)] p-4 text-left"
              style={coverVars(mixLead?.color)}
              aria-label="Lire le mix du jour"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brass)]">
                  {now != null ? new Date(now).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : ""}
                </span>
                <Sparkles className="size-4 text-primary-soft" />
              </div>
              <div>
                <p className="text-[22px] font-black leading-none tracking-tight text-foreground">Mix du jour</p>
                <p className="mt-1.5 text-[12px] text-muted-foreground">{dailyMix.length} titres · renouvelé chaque jour</p>
              </div>
              <span className="signal-button tap-press inline-flex w-fit items-center gap-2 rounded-[11px] px-4 py-2 text-[12px] font-black">
                <Play className="size-4 fill-current" /> Lire le mix
              </span>
            </button>
            <div className="space-y-px">
              {dailyMix.slice(0, 5).map((track, index) => (
                <TrackRow key={track.trackhash} track={track} index={index} list={dailyMix} showAlbum />
              ))}
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <SectionHeader title="Reprendre l’écoute" eyebrow="Récemment" action="Historique" onAction={() => navigate("recents")} />
          <div className="mt-3 space-y-px">
            {recent.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={recent} showAlbum />
            ))}
          </div>
        </section>
      )}

      {recentlyAdded.length > 0 && (
        <section>
          <SectionHeader title="Récemment ajoutés" eyebrow="Nouveautés" icon={<Clock3 className="size-4 text-primary-soft" />} action="Lire" onAction={() => playList(recentlyAdded, 0)} />
          <div className="mt-3 space-y-px">
            {recentlyAdded.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={recentlyAdded} showAlbum />
            ))}
          </div>
        </section>
      )}

      {rediscover.length > 0 && (
        <section>
          <SectionHeader title="À redécouvrir" eyebrow="Tes favoris oubliés" icon={<RotateCcw className="size-4 text-primary-soft" />} action="Favoris" onAction={() => navigate("favorites")} />
          <div className="mt-3 space-y-px">
            {rediscover.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={rediscover} showAlbum />
            ))}
          </div>
        </section>
      )}

      {neverPlayed.length > 0 && (
        <section>
          <SectionHeader title="Découvertes" eyebrow="Jamais écouté" icon={<Compass className="size-4 text-primary-soft" />} action="Lire" onAction={() => playList(neverPlayed, 0)} />
          <div className="mt-3 space-y-px">
            {neverPlayed.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={neverPlayed} showAlbum />
            ))}
          </div>
        </section>
      )}

      {featuredAlbums.length > 0 && (
        <section>
          <SectionHeader title="Albums" eyebrow="Classement artiste" action="Tout voir" onAction={() => navigate("library")} />
          <div className="snap-x -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0">
            {featuredAlbums.map((album) => (
              <div key={album.albumhash} className="w-[150px] shrink-0 lg:w-auto lg:shrink">
                <AlbumCard album={album} />
              </div>
            ))}
          </div>
        </section>
      )}

      {topTracks.length > 0 && (
        <section>
          <SectionHeader title="Titres forts" eyebrow="Les plus écoutés" icon={<TrendingUp className="size-4 text-primary-soft" />} />
          <div className="mt-3 space-y-px">
            {topTracks.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={topTracks} />
            ))}
          </div>
        </section>
      )}

      {featuredArtists.length > 0 && (
        <section>
          <SectionHeader title="Artistes" eyebrow="Bibliothèque" action="Tout voir" onAction={() => navigate("library")} />
          <div className="snap-x -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0">
            {featuredArtists.map((artist) => (
              <div key={artist.artisthash} className="w-[150px] shrink-0 lg:w-auto lg:shrink">
                <ArtistCard artist={artist} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
