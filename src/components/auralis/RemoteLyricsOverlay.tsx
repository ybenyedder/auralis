"use client";

// Fullscreen remote-lyrics overlay. When this device is remote-controlling
// another (e.g. the phone drives the PC), this sheet shows the controlled
// device's SYNCED lyrics and tracks the active line against that device's
// now-playing position — the same sing-along surface as the local lyrics pane,
// but driven by the hub's NowPlaying snapshots instead of the local <audio>.
//
// The position is interpolated from the snapshot's LOCAL arrival time
// (receivedAt), never the server-stamped updatedAt, so cross-host clock skew
// can't make the highlight jump or stall. Lyrics come from the existing
// /api/lyrics/[trackhash] endpoint (trackhash travels in every NowPlaying).

import { useEffect, useRef, useState } from "react";
import { X, Mic2, Loader2 } from "lucide-react";
import { useSync, type LiveNowPlaying } from "@/store/sync";
import { api } from "@/lib/auralis/api";
import { formatDuration } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

type LyricLine = { time: number; text: string; words?: { time: number; text: string }[] };
interface LyricsResponse {
  status: "found" | "instrumental" | "notfound";
  lines: LyricLine[];
  plain: string | null;
  synced: boolean;
}

export function RemoteLyricsOverlay() {
  const controllingId = useSync((s) => s.controllingId);
  const open = useSync((s) => s.remoteLyricsOpen);
  const setOpen = useSync((s) => s.setRemoteLyricsOpen);
  const command = useSync((s) => s.command);
  const np = useSync((s) => (controllingId ? s.nowPlaying[controllingId] : undefined)) as LiveNowPlaying | undefined;

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plain, setPlain] = useState<string | null>(null);
  const [status, setStatus] = useState<LyricsResponse["status"] | "loading">("loading");
  // Live clock: interpolated remote position (s). Recomputed ~4×/s; the line
  // highlight follows it closely enough for sing-along without a 60fps rAF.
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  const trackhash = np?.trackhash ?? null;

  // (Re)fetch lyrics whenever the controlled track changes.
  useEffect(() => {
    let cancelled = false;
    if (!open || !trackhash) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLyrics([]);
      setPlain(null);
      setStatus("loading");
      return;
    }
    setStatus("loading");
    api
      .get<LyricsResponse>(`/api/lyrics/${encodeURIComponent(trackhash)}`)
      .then((res) => {
        if (cancelled || np?.trackhash !== trackhash) return;
        setLyrics(res.lines ?? []);
        setPlain(res.plain ?? null);
        setStatus(res.status);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("notfound");
      });
    return () => {
      cancelled = true;
    };
  }, [open, trackhash, np?.trackhash]);

  // Advance the interpolated clock while the remote is playing.
  useEffect(() => {
    if (!open || !np?.isPlaying) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [open, np?.isPlaying]);

  const livePos = np
    ? Math.max(0, Math.min(np.duration || 0, np.position + (np.isPlaying ? (now - np.receivedAt) / 1000 : 0)))
    : 0;

  // Active line is a pure derivation of the interpolated position — no state/effect
  // needed (and no cascading-render lint hazard).
  let activeIndex = -1;
  if (lyrics.length) {
    for (let i = 0; i < lyrics.length; i++) {
      const next = lyrics[i + 1];
      if (livePos >= lyrics[i].time && (!next || livePos < next.time)) {
        activeIndex = i;
        break;
      }
    }
  }

  // Centre the active line.
  useEffect(() => {
    const el = activeRef.current;
    const container = scrollRef.current;
    if (!el || !container) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = eRect.top - cRect.top - (container.clientHeight / 2 - eRect.height / 2);
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
  }, [activeIndex]);

  const onScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!np?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    command("seek", Math.round(ratio * np.duration));
  };

  if (!open || !controllingId) return null;

  const synced = lyrics.length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[var(--primary)]">
          <Mic2 className="size-4" />
          Paroles · {np?.title ?? "—"}
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Fermer les paroles"
          className="grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Now-playing line */}
      <div className="flex items-center gap-4 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[22px] font-black tracking-tight text-white">{np?.title ?? "—"}</p>
          <p className="truncate text-[14px] text-white/60">{np?.artist ?? ""}</p>
        </div>
      </div>

      {/* Lyrics body */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {status === "loading" ? (
          <div className="flex h-full items-center justify-center text-white/50">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : synced ? (
          <div ref={scrollRef} className="lyrics-fade h-full overflow-y-auto scroll-auralis px-6 pb-24 pt-8">
            <div className="mx-auto max-w-2xl space-y-4 text-center">
              {lyrics.map((line, i) => {
                const active = i === activeIndex;
                const past = i < activeIndex;
                return (
                  <p
                    key={i}
                    ref={active ? activeRef : undefined}
                    onClick={() => np && command("seek", Math.round(line.time))}
                    className={cn(
                      "cursor-pointer text-[24px] font-bold leading-snug transition-all duration-300 sm:text-[28px]",
                      active ? "text-white" : past ? "text-white/25" : "text-white/45",
                      active && "lyric-glow scale-[1.02]",
                    )}
                  >
                    {line.text || "♪"}
                  </p>
                );
              })}
            </div>
          </div>
        ) : plain ? (
          <div ref={scrollRef} className="lyrics-fade h-full overflow-y-auto scroll-auralis px-6 pb-24 pt-8">
            <div className="mx-auto max-w-2xl space-y-3 whitespace-pre-line text-center text-[20px] font-medium leading-relaxed text-white/70">
              {plain}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-white/50">
            <Mic2 className="size-8 opacity-50" />
            <p className="text-[15px] font-bold">
              {status === "instrumental" ? "Morceau instrumental" : "Aucune parole trouvée"}
            </p>
            <p className="text-[12px]">Les paroles apparaîtront ici si elles sont disponibles côté serveur.</p>
          </div>
        )}
      </div>

      {/* Scrubber + transport mirror (so the sheet is a full remote). */}
      <div className="border-t border-white/10 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
        <div onClick={onScrub} className="group relative mb-1 h-1.5 w-full cursor-pointer rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-white group-hover:bg-[var(--primary)]"
            style={{ width: `${np && np.duration > 0 ? Math.min(100, (livePos / np.duration) * 100) : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] tabular-nums text-white/50">
          <span>{formatDuration(livePos)}</span>
          <span>{formatDuration(np?.duration ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
