"use client";

import { useMemo } from "react";
import { Play, Zap, Flame, Sun, Headphones, Moon, CloudRain, Music2, Route, type LucideIcon } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { MOODS, groupByMood } from "@/lib/auralis/mood";

// Mood-trajectory radios: a set that GLIDES through feeling-space along a named arc
// (server engine, /api/recommend?path=). Irreproducible by a catalogue-only clone —
// it needs Auralis's real per-track arousal/valence.
const TRAJECTORIES: { id: string; label: string; blurb: string; colors: [string, string]; icon: LucideIcon }[] = [
  { id: "winddown", label: "Endormissement", blurb: "L'énergie redescend", colors: ["#1e3a8a", "#0ea5e9"], icon: Moon },
  { id: "warmup", label: "Montée en énergie", blurb: "On accélère", colors: ["#f97316", "#ef4444"], icon: Flame },
  { id: "uplift", label: "Remonter le moral", blurb: "Vers la lumière", colors: ["#f59e0b", "#fde047"], icon: Sun },
  { id: "focusflow", label: "Flow concentration", blurb: "Reste dans la zone", colors: ["#0d9488", "#10b981"], icon: Headphones },
];

const MOOD_ICON: Record<string, LucideIcon> = {
  energetic: Zap,
  party: Flame,
  happy: Sun,
  focus: Headphones,
  chill: Moon,
  melancholy: CloudRain,
};

/**
 * "Comment vous sentez-vous ?" — one gradient card per mood that has enough
 * tracks, each shuffling a mix of that mood. Mirrors the genre-mix card motif.
 * Renders nothing if the library has no genre-tagged tracks to bucket.
 */
export function MoodMixes({ title = "Selon votre humeur" }: { title?: string }) {
  const tracks = useLibraryStore((s) => s.tracks);
  const playList = usePlayer((s) => s.playList);
  const startTrajectory = usePlayer((s) => s.startTrajectory);

  const moods = useMemo(() => {
    const byMood = groupByMood(tracks);
    return MOODS.map((m) => ({ mood: m, tracks: byMood.get(m.id) ?? [] }))
      .filter((m) => m.tracks.length >= 5);
  }, [tracks]);

  if (moods.length === 0) return null;

  return (
    <>
    <div className="mb-7 lg:mb-8">
      <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Voyages sonores</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {TRAJECTORIES.map((tr) => {
          const Icon = tr.icon;
          return (
            <button
              key={tr.id}
              onClick={() => void startTrajectory(tr.id, tr.label)}
              aria-label={`Démarrer : ${tr.label}`}
              className="group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left"
              style={{ background: `linear-gradient(150deg, ${tr.colors[0]}, ${tr.colors[1]})` }}
            >
              <Icon className="size-7 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" />
              <span className="mt-2 block max-w-[85%] text-[16px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">{tr.label}</span>
              <span className="mt-0.5 block text-[12px] font-semibold text-white/80">{tr.blurb}</span>
              <span className="signal-button absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Route className="size-5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>

    <div className="mb-7 lg:mb-8">
      <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {moods.map(({ mood, tracks: mt }) => {
          const Icon = MOOD_ICON[mood.id] ?? Music2;
          return (
          <button
            key={mood.id}
            onClick={() => playList(shuffleArray(mt), 0)}
            aria-label={`Lire un mix ${mood.label}`}
            className="group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left"
            style={{ background: `linear-gradient(150deg, ${mood.colors[0]}, ${mood.colors[1]})` }}
          >
            <Icon className="size-7 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]" />
            <span className="mt-2 block max-w-[80%] text-[18px] font-bold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">{mood.label}</span>
            <span className="mt-0.5 block text-[12px] font-semibold text-white/80">{mood.blurb}</span>
            {/* Play FAB fades in on hover — the recognisable Spotify card affordance. */}
            <span className="signal-button absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Play className="size-5 fill-current" />
            </span>
          </button>
          );
        })}
      </div>
    </div>
    </>
  );
}
