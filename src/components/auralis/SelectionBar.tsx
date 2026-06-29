"use client";

import { Sparkles, Play, X } from "lucide-react";
import { usePlayer } from "@/store/player";
import { tracksForHashes } from "@/store/library";
import { cn } from "@/lib/utils";

/**
 * Spotify-style floating action bar shown while multi-select mode is active. It is
 * the entry point to the headline feature: pick a few tracks → "Mix IA" asks the
 * server's taste engine to build a playlist from them + your taste. Floats above the
 * mobile dock (or the desktop player bar) so it never hides the bottom chrome.
 */
export function SelectionBar() {
  const selectionMode = usePlayer((s) => s.selectionMode);
  const count = usePlayer((s) => s.selected.size);
  const hasTrack = usePlayer((s) => Boolean(s.currentTrack));
  const exitSelection = usePlayer((s) => s.exitSelection);
  const generateAiPlaylist = usePlayer((s) => s.generateAiPlaylist);
  const playList = usePlayer((s) => s.playList);

  if (!selectionMode) return null;

  const playSelection = () => {
    const tracks = tracksForHashes([...usePlayer.getState().selected]);
    if (tracks.length) {
      playList(tracks, 0);
      exitSelection();
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-[60] flex justify-center px-3 md:px-0",
        // Sit above the mobile dock (mini-player + tab bar when a track plays), and
        // above the desktop player bar.
        hasTrack
          ? "bottom-[calc(var(--miniplayer-h)+var(--tabbar-h)+var(--safe-bottom)+12px)]"
          : "bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+12px)]",
        "md:bottom-[102px]",
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-2)]/95 px-2.5 py-2 shadow-xl backdrop-blur-md">
        <button
          onClick={exitSelection}
          aria-label="Quitter la sélection"
          className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white">
          {count > 0 ? `${count} sélectionné${count > 1 ? "s" : ""}` : "Choisissez des titres"}
        </span>

        <button
          onClick={playSelection}
          disabled={count === 0}
          aria-label="Lire la sélection"
          className="grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Play className="size-5 fill-current" />
        </button>

        <button
          onClick={() => void generateAiPlaylist()}
          disabled={count === 0}
          className="tap-press flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-[13px] font-bold text-[var(--primary-foreground)] transition-transform active:scale-95 disabled:opacity-40"
        >
          <Sparkles className="size-4" />
          Mix IA
        </button>
      </div>
    </div>
  );
}
