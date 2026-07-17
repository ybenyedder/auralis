"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Compass } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore, tracksFromIndex } from "@/store/library";
import { useReco, fetchDiscovery } from "@/store/reco";
import { MOODS, groupByMood } from "@/lib/auralis/mood";
import { Artwork } from "./Artwork";

/** ISO-ish year+week key so the discover mix is frozen for the whole week. */
function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

interface MixModel {
  id: string;
  label: string;
  colors: [string, string];
  tracks: import("@/lib/auralis/types").Track[];
  covers: string[];
}

/**
 * Personalised "Daily Mixes" + a weekly "À découvrir" — the discovery core Spotify
 * opens on. Mood mixes are taste-ranked (engine scores) and exclude dislikes; the
 * discover mix is server-built from never-played tracks and frozen for the week.
 */
export function DailyMixes() {
  const tracks = useLibraryStore((s) => s.tracks);
  const trackIndex = useLibraryStore((s) => s.trackIndex);
  const playList = usePlayer((s) => s.playList);
  const dislikes = usePlayer((s) => s.dislikes);
  const recoScores = useReco((s) => s.scores);

  const mixes = useMemo<MixModel[]>(() => {
    if (tracks.length === 0) return [];
    const byMood = groupByMood(tracks.filter((t) => !dislikes.has(t.trackhash)));
    const out: MixModel[] = [];
    for (const m of MOODS) {
      const pool = byMood.get(m.id);
      if (!pool || pool.length < 8) continue;
      const ranked = [...pool].sort((a, b) => (recoScores.get(b.trackhash) ?? 0) - (recoScores.get(a.trackhash) ?? 0));
      out.push({
        id: m.id,
        label: `Mix ${m.label}`,
        colors: m.colors,
        tracks: ranked.slice(0, 60),
        covers: ranked.map((t) => t.image).filter((x): x is string => Boolean(x)).slice(0, 4),
      });
    }
    return out.slice(0, 6);
  }, [tracks, dislikes, recoScores]);

  // Weekly discover mix, frozen in localStorage per week key.
  const [discover, setDiscover] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const wk = weekKey();
    try {
      const raw = localStorage.getItem("auralis.discover");
      if (raw) {
        const o = JSON.parse(raw) as { week?: string; hashes?: string[] };
        if (o.week === wk && Array.isArray(o.hashes)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDiscover(o.hashes);
          return;
        }
      }
    } catch {
      /* localStorage unavailable */
    }
    void fetchDiscovery(60).then((hashes) => {
      if (cancelled || hashes.length === 0) return;
      setDiscover(hashes);
      try {
        localStorage.setItem("auralis.discover", JSON.stringify({ week: wk, hashes }));
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const discoverTracks = useMemo(() => tracksFromIndex(trackIndex, discover), [trackIndex, discover]);

  if (mixes.length === 0 && discoverTracks.length < 4) return null;

  return (
    <section>
      <h2 className="mb-4 text-[20px] font-bold tracking-tight text-foreground lg:text-[24px]">Vos mix du jour</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {discoverTracks.length >= 4 && (
          <MixCard
            label="À découvrir cette semaine"
            sublabel={`${discoverTracks.length} titres jamais écoutés`}
            colors={["#1e3a8a", "#4f46e5"]}
            covers={discoverTracks.map((t) => t.image).filter((x): x is string => Boolean(x)).slice(0, 4)}
            icon
            onPlay={() => playList(discoverTracks, 0)}
          />
        )}
        {mixes.map((m) => (
          <MixCard
            key={m.id}
            label={m.label}
            sublabel={`${m.tracks.length} titres`}
            colors={m.colors}
            covers={m.covers}
            onPlay={() => playList(m.tracks, 0)}
          />
        ))}
      </div>
    </section>
  );
}

function MixCard({
  label,
  sublabel,
  colors,
  covers,
  icon,
  onPlay,
}: {
  label: string;
  sublabel: string;
  colors: [string, string];
  covers: string[];
  icon?: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      onClick={onPlay}
      aria-label={`Lire ${label}`}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-[var(--panel)] p-3 text-left transition-colors duration-200 hover:bg-[var(--panel-2)]"
    >
      <div
        className="relative mb-3 aspect-square w-full overflow-hidden rounded-md"
        style={{ background: colors[0] }}
      >
        {covers.length >= 4 ? (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2">
            {covers.slice(0, 4).map((src, i) => (
              <Artwork key={i} image={src} rounded={0} fluid className="h-full w-full" imgSize={120} />
            ))}
          </div>
        ) : icon ? (
          <span className="absolute inset-0 grid place-items-center">
            <Compass className="size-10 text-white/90" />
          </span>
        ) : null}
        <span className="signal-button absolute bottom-2 right-2 grid h-11 w-11 translate-y-2 place-items-center rounded-full opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <Play className="size-5 fill-current ml-0.5" />
        </span>
      </div>
      <span className="truncate text-[14px] font-bold text-foreground">{label}</span>
      <span className="truncate text-[12px] font-medium text-muted-foreground">{sublabel}</span>
    </button>
  );
}
