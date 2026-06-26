"use client";

// Monthly mood recap — "your month in feelings". A Wrapped-style hero for the
// dominant mood of a month, its distribution, the standout tracks/artists, and a
// generated narrative. Driven by the server engine via useRecap; the period
// selector lets the user walk back through earlier months.

import { useEffect } from "react";
import { CalendarRange, Music2, UserRound } from "lucide-react";
import { useRecap, monthLabelFr } from "@/store/reco";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { moodById } from "@/lib/auralis/mood";
import { trackTitle, trackArtist, formatLongDuration } from "@/lib/auralis/brand";
import type { Track } from "@/lib/auralis/types";
import type { RecapTrackRef } from "@/lib/auralis/reco";
import { Artwork } from "./Artwork";
import { cn } from "@/lib/utils";

export function MoodRecapPanel() {
  const months = useRecap((s) => s.months);
  const recap = useRecap((s) => s.recap);
  const loaded = useRecap((s) => s.loaded);
  const selectedMonth = useRecap((s) => s.selectedMonth);
  const fetchRecap = useRecap((s) => s.fetchRecap);

  useEffect(() => {
    if (!loaded) void fetchRecap();
  }, [loaded, fetchRecap]);

  // Nothing listened ever → don't show the panel at all.
  if (loaded && months.length === 0) return null;

  const dominant = recap?.dominantMood ? moodById(recap.dominantMood) : null;
  const colors = dominant?.colors ?? ["#3b3b54", "#23233a"];

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-5 text-primary-soft" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--brass)]">Bilan d’humeur</p>
            <h2 className="text-[20px] font-black tracking-tight text-foreground">Ton mois en émotions</h2>
          </div>
        </div>
        {months.length > 0 && (
          <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1">
            {months.slice(0, 12).map((m) => (
              <button
                key={m}
                onClick={() => void fetchRecap(m)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  m === selectedMonth
                    ? "bg-primary text-white"
                    : "matte-panel text-muted-foreground hover:text-foreground",
                )}
              >
                {monthLabelFr(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {recap && recap.totalPlays > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Dominant-mood hero */}
          <div
            className="relative overflow-hidden rounded-2xl p-5 shadow-xl"
            style={{ background: `linear-gradient(150deg, ${colors[0]}, ${colors[1]})` }}
          >
            <div className="absolute inset-0 bg-black/25" aria-hidden />
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="grid size-14 place-items-center rounded-2xl bg-white/15" aria-hidden>
                  <Music2 className="size-7 text-white" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/75">
                    {recap.label}{recap.inProgress ? " · en cours" : ""}
                  </p>
                  <p className="text-[26px] font-black capitalize leading-tight tracking-tight text-white">
                    {recap.moodWord ?? dominant?.label ?? "—"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13.5px] leading-relaxed text-white/90">{recap.narrative}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-white/85">
                <Stat value={String(recap.totalPlays)} label="écoutes" />
                <Stat value={formatLongDuration(recap.listeningSeconds)} label="d’écoute" />
                <Stat value={String(recap.distinctTracks)} label="titres uniques" />
              </div>
            </div>
          </div>

          {/* Mood distribution + standouts */}
          <div className="flex flex-col gap-4">
            <div className="matte-panel rounded-2xl p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">Palette d’humeurs</p>
              <div className="space-y-2.5">
                {recap.moods.slice(0, 6).map((ms) => {
                  const m = moodById(ms.mood);
                  return (
                    <div key={ms.mood}>
                      <div className="flex items-center gap-2 text-[12.5px]">
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: (m?.colors ?? colors)[0] }} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-foreground/90">{m?.label ?? ms.mood}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(ms.share * 100)}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-xs bg-[var(--panel-2)]">
                        <div
                          className="h-full rounded-xs"
                          style={{ width: `${Math.max(3, ms.share * 100)}%`, background: (m?.colors ?? colors)[0] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TopTracks />
              <TopArtists />
            </div>
          </div>
        </div>
      ) : (
        <div className="matte-panel rounded-2xl p-5 text-[13px] text-muted-foreground">
          {recap?.narrative ?? "Lance quelques titres ce mois-ci pour révéler ton humeur."}
        </div>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[18px] font-black tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-white/70">{label}</span>
    </span>
  );
}

function TopTracks() {
  const recap = useRecap((s) => s.recap);
  const tracks = useLibraryStore((s) => s.tracks);
  const playList = usePlayer((s) => s.playList);
  const refs = recap?.topTracks ?? [];
  const resolved = refs
    .map((r): { ref: RecapTrackRef; track: Track } | null => {
      const track = tracks.find((t) => t.trackhash === r.trackhash);
      return track ? { ref: r, track } : null;
    })
    .filter((x): x is { ref: RecapTrackRef; track: Track } => x !== null);
  if (resolved.length === 0) return null;
  const list = resolved.map((x) => x.track);

  return (
    <div className="matte-panel rounded-2xl p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        <Music2 className="size-3.5" /> Titres du mois
      </p>
      <div className="space-y-1.5">
        {resolved.map(({ ref, track }, i) => (
          <button
            key={ref.trackhash}
            onClick={() => playList(list, i)}
            className="tap-press flex w-full items-center gap-2.5 rounded-md p-1 text-left hover:bg-white/[0.04]"
          >
            <span className="w-3 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">{i + 1}</span>
            <Artwork title={track.title} trackhash={track.trackhash} image={track.image} colors={track.color} size={32} rounded={6} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-foreground/90">{trackTitle(track)}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{trackArtist(track)}</span>
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ref.plays}×</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopArtists() {
  const recap = useRecap((s) => s.recap);
  const navigate = usePlayer((s) => s.navigate);
  const artists = recap?.topArtists ?? [];
  if (artists.length === 0) return null;
  const max = Math.max(1, ...artists.map((a) => a.plays));

  return (
    <div className="matte-panel rounded-2xl p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        <UserRound className="size-3.5" /> Artistes du mois
      </p>
      <div className="space-y-2">
        {artists.map((a, i) => (
          <button
            key={a.artisthash}
            onClick={() => navigate("artist", a.artisthash)}
            className="block w-full text-left"
          >
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="w-3 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground/90 hover:text-foreground">{a.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{a.plays}×</span>
            </div>
            <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-xs bg-[var(--panel-2)]">
              <div className="h-full rounded-xs bg-primary" style={{ width: `${Math.max(4, (a.plays / max) * 100)}%` }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
