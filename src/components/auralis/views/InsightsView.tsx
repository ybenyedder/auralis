"use client";

import { useEffect, useMemo, type ComponentType } from "react";
import { TrendingUp, Clock3, Disc3, UserRound, Headphones, Flame } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { useStats } from "@/store/stats";
import { formatCount, formatLongDuration } from "@/lib/auralis/brand";
import { SectionHeader } from "../SectionHeader";
import { cn } from "@/lib/utils";

export function InsightsView() {
  const tracks = useLibraryStore((s) => s.tracks);
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const playCounts = usePlayer((state) => state.playCounts);
  const streak = useStats((s) => s.streak);
  const weekPlays = useStats((s) => s.weekPlays);
  const todayPlays = useStats((s) => s.todayPlays);
  const playsByDay = useStats((s) => s.playsByDay);
  const weekListeningSeconds = useStats((s) => s.weekListeningSeconds);
  const statsLoaded = useStats((s) => s.loaded);
  const fetchStats = useStats((s) => s.fetchStats);
  useEffect(() => {
    if (!statsLoaded) void fetchStats();
  }, [statsLoaded, fetchStats]);
  const tracksWithCounts = useMemo(
    () => tracks.map((track) => ({ ...track, playcount: playCounts[track.trackhash] ?? track.playcount ?? 0 })),
    [tracks, playCounts],
  );

  const artistTrackData = useMemo(
    () => [...artists].sort((a, b) => (b.trackcount || 0) - (a.trackcount || 0)).slice(0, 8),
    [artists],
  );

  // Personalised: YOUR most-played artists (by your play counts, not catalogue size).
  const topPlayedArtists = useMemo(() => {
    const byArtist = new Map<string, { name: string; plays: number }>();
    for (const t of tracks) {
      const plays = playCounts[t.trackhash] ?? t.playcount ?? 0;
      if (plays <= 0) continue;
      for (const a of t.artists ?? []) {
        if (!a.artisthash) continue;
        const cur = byArtist.get(a.artisthash) ?? { name: a.name, plays: 0 };
        cur.plays += plays;
        byArtist.set(a.artisthash, cur);
      }
    }
    return [...byArtist.entries()]
      .map(([id, v]) => ({ id, label: v.name, value: v.plays }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [tracks, playCounts]);

  const genreData = useMemo(() => {
    const map = new Map<string, number>();
    tracksWithCounts.forEach((track) => {
      const genre = track.genre || "Non tagué";
      map.set(genre, (map.get(genre) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [tracksWithCounts]);

  const albumData = useMemo(
    () => [...albums].sort((a, b) => (b.trackcount || 0) - (a.trackcount || 0)).slice(0, 8),
    [albums],
  );

  const totalPlays = tracksWithCounts.reduce((sum, track) => sum + (track.playcount || 0), 0);
  const totalDuration = tracksWithCounts.reduce((sum, track) => sum + (track.duration || 0), 0);

  const kpis: { label: string; value: string; icon: ComponentType<{ className?: string }> }[] = [
    { label: "Écoutes locales", value: formatCount(totalPlays), icon: Headphones },
    { label: "Durée indexée", value: formatLongDuration(totalDuration), icon: Clock3 },
    { label: "Albums", value: String(albums.length), icon: Disc3 },
    { label: "Artistes", value: String(artists.length), icon: UserRound },
  ];

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brass)]">Analyse</p>
        <h1 className="flex items-center gap-2 text-[28px] font-black tracking-tight text-foreground">
          <TrendingUp className="size-6 text-primary-soft" /> Insights
        </h1>
        <p className="mt-1 max-w-2xl text-[12.5px] text-muted-foreground">
          Ces métriques viennent uniquement de la bibliothèque locale indexée. Aucun chiffre de tendance artificiel n’est généré.
        </p>
      </div>

      <WeeklyRecap streak={streak} weekPlays={weekPlays} todayPlays={todayPlays} playsByDay={playsByDay} weekListeningSeconds={weekListeningSeconds} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="matte-panel relative overflow-hidden rounded-[13px] p-4">
              <span className="absolute inset-x-0 top-0 h-1 bg-primary" />
              <div className="relative flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-primary/15 text-primary-soft">
                  <Icon className="size-4" />
                </span>
                <p className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/80">{kpi.label}</p>
              </div>
              <p className="relative mt-3 break-words text-[20px] font-black leading-tight tracking-tight text-foreground tabular-nums lg:text-[22px]">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {totalPlays === 0 && (
        <div className="matte-panel mb-5 rounded-[13px] border-amber/20 p-4 text-[12.5px] text-muted-foreground">
          Les compteurs d’écoute démarrent à zéro : aucune statistique artificielle n’est injectée. Ils augmentent uniquement lorsque tu lances réellement des titres dans cette instance locale.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {topPlayedArtists.length > 0 && (
          <MetricPanel title="Tes artistes les plus écoutés" eyebrow="Tes écoutes">
            <BarList rows={topPlayedArtists} />
          </MetricPanel>
        )}

        <MetricPanel title="Titres par artiste" eyebrow="Index local">
          <BarList
            rows={artistTrackData.map((artist) => ({ id: artist.artisthash, label: artist.name, value: artist.trackcount || 0 }))}
          />
        </MetricPanel>

        <MetricPanel title="Genres" eyebrow="Tags présents">
          <BarList rows={genreData.map((genre) => ({ id: genre.name, label: genre.name, value: genre.value }))} />
        </MetricPanel>

        <div className="matte-panel rounded-[13px] p-4 lg:col-span-2">
          <SectionHeader title="Albums les plus volumineux" eyebrow="Nombre de titres" />
          <BarList
            rows={albumData.map((album) => ({
              id: album.albumhash,
              label: `${album.title}${album.albumartists[0]?.name ? ` · ${album.albumartists[0].name}` : ""}`,
              value: album.trackcount || 0,
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function WeeklyRecap({ streak, weekPlays, todayPlays, playsByDay, weekListeningSeconds }: {
  streak: number; weekPlays: number; todayPlays: number; playsByDay: { day: string; count: number }[]; weekListeningSeconds: number;
}) {
  const max = Math.max(1, ...playsByDay.map((d) => d.count));
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,240px)_1fr]">
      <div className="matte-panel flex items-center gap-3 rounded-[13px] p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-[13px] bg-primary/15 text-primary-soft">
          <Flame className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-[26px] font-black leading-none tracking-tight text-foreground tabular-nums">{streak}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
            {streak > 0 ? `jour${streak > 1 ? "s" : ""} d’affilée` : "Commence ta série"}
          </p>
        </div>
      </div>
      <div className="matte-panel rounded-[13px] p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/80">7 derniers jours</p>
          <p className="text-[12px] text-muted-foreground">
            <span className="font-black tabular-nums text-foreground">{weekPlays}</span> écoutes ·{" "}
            {weekListeningSeconds > 0 && (<><span className="font-black tabular-nums text-foreground">{formatLongDuration(weekListeningSeconds)}</span> ·{" "}</>)}
            <span className="font-black tabular-nums text-foreground">{todayPlays}</span> aujourd’hui
          </p>
        </div>
        <div className="flex h-16 items-end gap-1.5">
          {(playsByDay.length ? playsByDay : Array.from({ length: 7 }, (_, i) => ({ day: String(i), count: 0 }))).map((d, i, arr) => {
            const h = Math.max(6, (d.count / max) * 100);
            const isToday = i === arr.length - 1;
            return (
              <div key={d.day} className="flex flex-1 items-end" title={`${d.count} écoutes`}>
                <div className={cn("w-full rounded-[3px]", isToday ? "bg-primary" : "bg-primary/35")} style={{ height: `${h}%` }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="matte-panel rounded-[13px] p-4">
      <SectionHeader title={title} eyebrow={eyebrow} />
      {children}
    </div>
  );
}

function BarList({ rows }: { rows: { id: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) {
    return <div className="rounded-[11px] border border-dashed border-[var(--line)] p-6 text-center text-[12px] text-muted-foreground">Aucune donnée disponible.</div>;
  }

  return (
    <div className="space-y-3 lg:space-y-2">
      {rows.map((row, index) => {
        const percent = Math.max(4, (row.value / max) * 100);
        return (
          <div key={row.id}>
            <div className="flex items-center gap-2 text-[13px] lg:text-[12px]">
              <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground/70">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground/90 lg:text-foreground">{row.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{row.value}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-[2px] bg-white/[0.06] lg:mt-1 lg:h-1.5">
              <div className="h-full rounded-[2px] bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
