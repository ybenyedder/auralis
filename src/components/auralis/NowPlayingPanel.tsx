"use client";

import { X, Heart, MoreHorizontal } from "lucide-react";
import { usePlayer } from "@/store/player";
import { LyricsView } from "./LyricsView";
import { Artwork } from "./Artwork";
import { QueueList } from "./QueueList";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { useT } from "@/lib/auralis/i18n";
import { cn } from "@/lib/utils";

export function NowPlayingPanel() {
  const t = useT();
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
    <aside className="hidden w-[320px] lg:w-[380px] shrink-0 flex-col glass rounded-xl overflow-hidden xl:flex">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 pt-2">
        <h2 className="text-[16px] font-bold text-foreground">
          {tab === "queue" ? t("player.queue", "File d'attente") : tab === "lyrics" ? t("player.lyrics", "Paroles") : currentTrack?.album || t("panel.nowPlaying", "Lecture en cours")}
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
              aria-label={t("player.trackOptions", "Options du titre")}
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-foreground"
            >
              <MoreHorizontal className="size-5" />
            </button>
          )}
          <button
            onClick={toggleRightPanel}
            aria-label={t("panel.closePanel", "Fermer le panneau")}
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-foreground"
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
                <div className="w-full aspect-square overflow-hidden rounded-xl shadow-2xl shadow-black/30">
                  <Artwork
                    fluid
                    title={currentTrack.title}
                    trackhash={currentTrack.trackhash}
                    imgSize={400}
                    rounded={14}
                    colors={currentTrack.color}
                    image={currentTrack.image}
                    className="w-full h-full"
                  />
                </div>
              </div>

              {/* Track info & Add to Fav */}
              <div className="flex items-center justify-between pb-6 pt-2">
                <div className="flex min-w-0 flex-col">
                  <button
                    onClick={() => currentTrack.albumhash && navigate("album", currentTrack.albumhash)}
                    className="block w-full truncate text-left text-[24px] font-bold tracking-tight text-foreground transition-colors hover:underline"
                  >
                    {trackTitle(currentTrack)}
                  </button>
                  <button
                    onClick={() => { const ah = currentTrack.artists?.[0]?.artisthash; if (ah) navigate("artist", ah); }}
                    className={cn(
                      "block w-full truncate text-left text-[16px] font-medium text-[var(--text-muted)] mt-0.5",
                      currentTrack.artists?.[0]?.artisthash && "hover:text-foreground hover:underline"
                    )}
                  >
                    {trackArtist(currentTrack)}
                  </button>
                </div>
                <button
                  onClick={() => toggleFavorite(currentTrack.trackhash)}
                  aria-label={fav ? t("common.removeFavorite", "Retirer des favoris") : t("common.addFavorite", "Ajouter aux favoris")}
                  className="ml-4 flex shrink-0 items-center justify-center transition-transform active:scale-100"
                >
                  <Heart className={cn("size-6", fav ? "fill-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-foreground")} />
                </button>
              </div>

              {/* Auralis Metadata Card (Spotify style About the artist / Credits cards) */}
              <div className="mb-4 rounded-xl matte-panel-2 p-4">
                <h3 className="text-[16px] font-bold text-foreground mb-4">{t("panel.aboutTrack", "À propos du titre")}</h3>
                <div className="flex flex-col gap-3">
                  {currentTrack.album && (
                    <MetaLine label={t("mobile.album", "Album")} value={currentTrack.album} />
                  )}
                  {currentTrack.year && (
                    <MetaLine label={t("panel.year", "Année")} value={String(currentTrack.year)} />
                  )}
                  {currentTrack.genre && (
                    <MetaLine label={t("panel.genre", "Genre")} value={currentTrack.genre} />
                  )}
                  {currentTrack.bitrate && (
                    <MetaLine label={t("panel.quality", "Qualité")} value={`${currentTrack.bitrate} kbps`} />
                  )}
                  <MetaLine label={t("panel.duration", "Durée")} value={formatDuration(currentTrack.duration || 0)} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[14px] text-[var(--text-muted)]">{t("panel.noPlayback", "Aucune lecture en cours")}</p>
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
      <span className="text-[16px] font-bold text-foreground">{value}</span>
      <span className="text-[14px] font-medium text-[var(--text-muted)]">{label}</span>
    </div>
  );
}
