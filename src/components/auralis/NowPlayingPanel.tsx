"use client";

import { ListMusic, Mic2, ChevronLeft, Heart, Plus } from "lucide-react";
import { usePlayer } from "@/store/player";
import { LyricsView } from "./LyricsView";
import { Artwork } from "./Artwork";
import { QueueList } from "./QueueList";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

export function NowPlayingPanel() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const navigate = usePlayer((s) => s.navigate);
  const rightPanelOpen = usePlayer((s) => s.rightPanelOpen);
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const isFavorite = usePlayer((s) => s.isFavorite);
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  const fav = currentTrack ? isFavorite(currentTrack.trackhash) : false;

  const tab: "now" | "queue" | "lyrics" = queueOpen ? "queue" : lyricsOpen ? "lyrics" : "now";

  const selectTab = (next: "now" | "queue" | "lyrics") => {
    if (queueOpen) toggleQueue();
    if (lyricsOpen) toggleLyrics();
    if (next === "queue") toggleQueue();
    else if (next === "lyrics") toggleLyrics();
  };

  if (!rightPanelOpen) return null;

  return (
    <aside className="glass-chrome keyline-left hidden w-[300px] shrink-0 flex-col bg-[var(--sidebar)] xl:flex">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="flex items-center gap-1">
          <TabButton active={tab === "now"} onClick={() => selectTab("now")} label="Lecture" />
          <TabButton active={tab === "lyrics"} onClick={() => selectTab("lyrics")} label="Paroles" icon={Mic2} />
          <TabButton active={tab === "queue"} onClick={() => selectTab("queue")} label="File" icon={ListMusic} />
        </div>
        <button
          onClick={toggleRightPanel}
          aria-label="Close panel"
          className="grid h-8 w-8 place-items-center rounded-[11px] text-muted-foreground/45 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Content */}
      {tab === "now" && (
        <div className="flex flex-1 flex-col overflow-y-auto scroll-auralis">
          {currentTrack ? (
            <>
              {/* Cover */}
              <div className="p-4 pb-3">
                <Artwork
                  title={currentTrack.title}
                  trackhash={currentTrack.trackhash}
                  size={240}
                  rounded={11}
                  colors={currentTrack.color}
                  image={currentTrack.image}
                  className="w-full aspect-square h-auto"
                />
              </div>

              {/* Track info */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => currentTrack.albumhash && navigate("album", currentTrack.albumhash)}
                  className="block w-full text-left"
                >
                  <p className="line-clamp-2 text-[18px] font-black leading-tight tracking-tight text-foreground transition-colors hover:text-primary-soft">
                    {trackTitle(currentTrack)}
                  </p>
                </button>
                <p className="mt-1 text-[12.5px] font-medium text-muted-foreground/75">
                  {trackArtist(currentTrack)}
                </p>

                {/* Quick actions — favourite + add to playlist (context menu) */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleFavorite(currentTrack.trackhash)}
                    aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full transition-colors",
                      fav ? "bg-primary/15 text-primary" : "text-muted-foreground/55 hover:bg-white/[0.06] hover:text-foreground",
                    )}
                  >
                    <Heart className={cn("size-[18px]", fav && "fill-primary")} />
                  </button>
                  <button
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      openContextMenu(r.left, r.bottom + 4, currentTrack);
                    }}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/[0.04] px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
                  >
                    <Plus className="size-4" /> Playlist
                  </button>
                </div>

                {/* Inline metadata — no boxes */}
                <div className="mt-5 border-t border-[var(--line)] pt-3">
                  {currentTrack.album && (
                    <MetaLine label="Album" value={currentTrack.album} />
                  )}
                  {currentTrack.year && (
                    <MetaLine label="Year" value={String(currentTrack.year)} />
                  )}
                  {currentTrack.genre && (
                    <MetaLine label="Genre" value={currentTrack.genre} />
                  )}
                  {currentTrack.bitrate && (
                    <MetaLine label="Quality" value={`${currentTrack.bitrate} kbps`} />
                  )}
                  <MetaLine label="Duration" value={formatDuration(currentTrack.duration || 0)} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center opacity-40">
              <p className="text-[13px] text-muted-foreground">Aucune lecture</p>
            </div>
          )}
        </div>
      )}

      {tab === "lyrics" && (
        <div className="min-h-0 flex-1 px-2 pb-4 pt-3">
          <LyricsView variant="panel" />
        </div>
      )}
      {tab === "queue" && <QueueList />}
    </aside>
  );
}

function TabButton({ active, onClick, label, icon: Icon, disabled = false }: {
  active: boolean; onClick: () => void; label: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${label} non disponibles pour ce titre` : label}
      className={cn(
        "flex items-center gap-1 rounded-[11px] px-2 py-1.5 text-[11px] font-bold transition-colors",
        disabled ? "cursor-not-allowed text-muted-foreground/25" : active ? "bg-[var(--paper)] text-[var(--ink)]" : "text-muted-foreground/50 hover:bg-white/[0.06] hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      <span>{label}</span>
    </button>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-2 border-b border-[var(--line)] py-2 last:border-0">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground/45">{label}</span>
      <span className="truncate text-[12px] text-muted-foreground/85">{value}</span>
    </div>
  );
}
