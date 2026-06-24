"use client";

import { useMemo, type ComponentType } from "react";
import { Clock3, Disc3, Library, Play, TrendingUp, UserRound } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore, tracksForHashesFrom } from "@/store/library";
import { SectionHeader } from "../SectionHeader";
import { TrackRow } from "../TrackRow";
import { AlbumCard, ArtistCard } from "../Cards";
import { Artwork } from "../Artwork";
import { coverVars, formatLongDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";

export function HomeView() {
  const { playList, navigate, currentTrack, playCounts, recentTrackhashes } = usePlayer();
  const { tracks, albums, artists, error } = useLibraryStore();

  const curated = useMemo(() => tracks.slice(0, 12), [tracks]);
  // Real listening history (falls back to the first tracks on a fresh library).
  const recent = useMemo(() => {
    const hist = tracksForHashesFrom(tracks, recentTrackhashes).slice(0, 6);
    return hist.length ? hist : tracks.slice(0, 6);
  }, [tracks, recentTrackhashes]);
  const featuredAlbums = albums.slice(0, 6);
  const featuredArtists = artists.slice(0, 6);
  const topTracks = useMemo(
    () => [...tracks].sort((a, b) => (playCounts[b.trackhash] ?? b.playcount ?? 0) - (playCounts[a.trackhash] ?? a.playcount ?? 0)).slice(0, 5),
    [tracks, playCounts],
  );
  const leadTrack = currentTrack ?? tracks[0];
  const totalDuration = useMemo(() => tracks.reduce((sum, track) => sum + (track.duration || 0), 0), [tracks]);

  return (
    <div className="fade-up space-y-6 px-4 py-4 lg:space-y-8 lg:px-6 lg:py-6">
      <section className="hero-cover grid gap-4 rounded-[18px] border border-[var(--line)] px-4 py-5 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)] lg:gap-5 lg:px-6 lg:py-6 lg:grid-cols-[minmax(0,1fr)_360px]" style={coverVars(leadTrack?.color)}>
        <div className="flex min-w-0 gap-4">
          <Artwork
            title={leadTrack?.title}
            trackhash={leadTrack?.trackhash}
            size={128}
            rounded={11}
            colors={leadTrack?.color}
            image={leadTrack?.image}
            className="hidden sm:block"
          />
          <div className="min-w-0 self-end">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--brass)]">
              Bibliothèque locale
            </p>
            <h1 className="mt-2 max-w-3xl text-[26px] font-black leading-[1.02] tracking-tight text-foreground lg:text-[clamp(30px,5vw,58px)] lg:leading-[0.92]">
              {leadTrack ? trackTitle(leadTrack) : "Aucune musique indexée"}
            </h1>
            <p className="mt-2 truncate text-[13px] font-semibold text-muted-foreground lg:mt-3 lg:text-[14px]">{leadTrack ? trackArtist(leadTrack) : "Configure AURALIS_MUSIC_DIR puis relance le scan"}</p>
            {error && <p className="mt-2 max-w-xl text-[12px] text-amber">{error}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2 lg:mt-5">
              <button
                onClick={() => curated.length && playList(curated, leadTrack ? Math.max(0, curated.findIndex((track) => track.trackhash === leadTrack.trackhash)) : 0)}
                disabled={curated.length === 0}
                className="signal-button tap-press flex h-11 items-center gap-2 rounded-[11px] px-5 text-[13px] font-black disabled:opacity-40 lg:h-auto lg:px-4 lg:py-2 lg:text-[12px]"
              >
                <Play className="size-4 fill-current" />
                Lire
              </button>
              <button onClick={() => navigate("library")} className="ghost-button tap-press flex h-11 items-center rounded-[11px] px-5 text-[13px] font-black lg:h-auto lg:px-4 lg:py-2 lg:text-[12px]">
                Bibliothèque
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 self-end">
          <HomeMetric icon={Library} label="Titres" value={tracks.length} />
          <HomeMetric icon={Disc3} label="Albums" value={albums.length} />
          <HomeMetric icon={UserRound} label="Artistes" value={artists.length} />
          <HomeMetric icon={Clock3} label="Durée" value={formatLongDuration(totalDuration)} />
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <SectionHeader title="Écouté récemment" eyebrow="Reprendre" action="Historique" onAction={() => navigate("recents")} />
          <div className="mt-3 space-y-px">
            {recent.map((track, index) => (
              <TrackRow key={track.trackhash} track={track} index={index} list={recent} showAlbum />
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

function HomeMetric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <div className="matte-panel min-w-0 rounded-[13px] p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-muted-foreground/70">
        <span className="truncate text-[10px] font-black uppercase tracking-[0.14em]">{label}</span>
        <Icon className="size-3.5 shrink-0" />
      </div>
      <p className="truncate text-[18px] font-black tracking-tight text-foreground lg:text-[20px]">{value}</p>
    </div>
  );
}
