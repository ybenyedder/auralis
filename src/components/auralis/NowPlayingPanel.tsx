"use client";

import { X, Heart, MoreHorizontal } from "lucide-react";
import { usePlayer } from "@/store/player";
import { LyricsView } from "./LyricsView";
import { Artwork } from "./Artwork";
import { QueueList } from "./QueueList";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

export function NowPlayingPanel() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const queueOpen = usePlayer((s) => s.queueOpen);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);
  const navigate = usePlayer((s) => s.navigate);
  const rightPanelOpen = usePlayer((s) => s.rightPanelOpen);
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel);
  const toggleFavorite = usePlayer((s) => s.toggleFavorite);
  const openContextMenu = usePlayer((s) => s.openContextMenu);
  const fav = usePlayer((s) => (currentTrack ? s.favorites.has(currentTrack.trackhash) : false));

  const tab: "now" | "queue" | "lyrics" = queueOpen ? "queue" : lyricsOpen ? "lyrics" : "now";

  if (!rightPanelOpen) return null;

  return (
    <aside className="hidden w-[320px] lg:w-[380px] shrink-0 flex-col rounded-lg bg-[var(--background)] xl:flex">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 pt-2">
        <h2 className="text-[16px] font-bold text-white">
          {tab === "queue" ? "File d'attente" : tab === "lyrics" ? "Paroles" : currentTrack?.album || "Lecture en cours"}
        </h2>
        <div className="flex items-center gap-2">
          {tab === "now" && (
            <button
              onClick={(e) => {
                if (currentTrack) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  openContextMenu(r.left, r.bottom + 4, currentTrack);
                }
              }}
              aria-label="Options du titre"
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-white"
            >
              <MoreHorizontal className="size-5" />
            </button>
          )}
          <button
            onClick={toggleRightPanel}
            aria-label="Fermer le panneau"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === "now" && (
        <div className="flex flex-1 flex-col overflow-y-auto scroll-auralis px-4 pb-4">
          {currentTrack ? (
            <>
              {/* Cover */}
              <div className="w-full pb-4 pt-2">
                <Artwork
                  title={currentTrack.title}
                  trackhash={currentTrack.trackhash}
                  size={400}
                  rounded={8}
                  colors={currentTrack.color}
                  image={currentTrack.image}
                  className="w-full aspect-square h-auto shadow-xl"
                />
              </div>

              {/* Track info & Add to Fav */}
              <div className="flex items-center justify-between pb-6 pt-2">
                <div className="flex min-w-0 flex-col">
                  <button
                    onClick={() => currentTrack.albumhash && navigate("album", currentTrack.albumhash)}
                    className="block w-full truncate text-left text-[24px] font-bold tracking-tight text-white transition-colors hover:underline"
                  >
                    {trackTitle(currentTrack)}
                  </button>
                  <button
                    onClick={() => { const ah = currentTrack.artists?.[0]?.artisthash; if (ah) navigate("artist", ah); }}
                    className={cn(
                      "block w-full truncate text-left text-[16px] font-medium text-[var(--text-muted)] mt-0.5",
                      currentTrack.artists?.[0]?.artisthash && "hover:text-white hover:underline"
                    )}
                  >
                    {trackArtist(currentTrack)}
                  </button>
                </div>
                <button
                  onClick={() => toggleFavorite(currentTrack.trackhash)}
                  aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className="ml-4 flex shrink-0 items-center justify-center transition-transform active:scale-100"
                >
                  <Heart className={cn("size-6", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-white")} />
                </button>
              </div>

              {/* Auralis Metadata Card (Spotify style About the artist / Credits cards) */}
              <div className="mb-4 rounded-lg bg-[var(--panel-2)] p-4">
                <h3 className="text-[16px] font-bold text-white mb-4">À propos du titre</h3>
                <div className="flex flex-col gap-3">
                  {currentTrack.album && (
                    <MetaLine label="Album" value={currentTrack.album} />
                  )}
                  {currentTrack.year && (
                    <MetaLine label="Année" value={String(currentTrack.year)} />
                  )}
                  {currentTrack.genre && (
                    <MetaLine label="Genre" value={currentTrack.genre} />
                  )}
                  {currentTrack.bitrate && (
                    <MetaLine label="Qualité" value={`${currentTrack.bitrate} kbps`} />
                  )}
                  <MetaLine label="Durée" value={formatDuration(currentTrack.duration || 0)} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[14px] text-[var(--text-muted)]">Aucune lecture en cours</p>
            </div>
          )}
        </div>
      )}

      {tab === "lyrics" && (
        <div className="min-h-0 flex-1 px-4 pb-4">
          <LyricsView variant="panel" />
        </div>
      )}
      {tab === "queue" && (
        <div className="min-h-0 flex-1 px-4 pb-4">
          <QueueList />
        </div>
      )}
    </aside>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[16px] font-bold text-white">{value}</span>
      <span className="text-[14px] font-medium text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
