"use client";

import { useMemo } from "react";
import { Play } from "lucide-react";
import { usePlayer, shuffleArray } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { MOODS, groupByMood } from "@/lib/auralis/mood";

/**
 * "Comment vous sentez-vous ?" — one gradient card per mood that has enough
 * tracks, each shuffling a mix of that mood. Mirrors the genre-mix card motif.
 * Renders nothing if the library has no genre-tagged tracks to bucket.
 */
export function MoodMixes({ title = "Selon votre humeur" }: { title?: string }) {
  const tracks = useLibraryStore((s) => s.tracks);
  const playList = usePlayer((s) => s.playList);

  const moods = useMemo(() => {
    const byMood = groupByMood(tracks);
    return MOODS.map((m) => ({ mood: m, tracks: byMood.get(m.id) ?? [] }))
      .filter((m) => m.tracks.length >= 5);
  }, [tracks]);

  if (moods.length === 0) return null;

  return (
    <div className="mb-7 lg:mb-8">
      <h2 className="mb-4 text-[20px] font-black tracking-tight text-foreground lg:text-[24px]">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {moods.map(({ mood, tracks: mt }) => (
          <button
            key={mood.id}
            onClick={() => playList(shuffleArray(mt), 0)}
            aria-label={`Lire un mix ${mood.label}`}
            className="group relative aspect-[1.1] overflow-hidden rounded-lg p-4 text-left transition-transform duration-200 hover:scale-[1.02]"
            style={{ background: `linear-gradient(150deg, ${mood.colors[0]}, ${mood.colors[1]})` }}
          >
            <span className="block text-[26px] leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">{mood.emoji}</span>
            <span className="mt-2 block max-w-[80%] text-[18px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">{mood.label}</span>
            <span className="mt-0.5 block text-[12px] font-semibold text-white/80">{mood.blurb}</span>
            {/* Play FAB slides up on hover — the recognisable Spotify card affordance. */}
            <span className="absolute bottom-3 right-3 grid h-11 w-11 translate-y-2 place-items-center rounded-full bg-black/30 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
              <Play className="size-5 fill-white text-white" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
