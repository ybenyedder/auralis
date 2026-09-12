"use client";

import { Home, Search, Library, Compass, Radio } from "lucide-react";
import { api } from "@/lib/auralis/api";
import { usePlayer, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { Artwork } from "../Artwork";
import { EqualizerBars } from "../SectionHeader";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";
import { useT } from "@/lib/auralis/i18n";
import { cn } from "@/lib/utils";
import { FrostedSurface } from "../FrostedSurface";

interface Tab {
  id: ViewId;
  labelKey: string;
  labelFallback: string;
  icon: React.ComponentType<{ className?: string; fill?: string; strokeWidth?: number }>;
  owns: ViewId[];
}

// Apple Music 5-tab dock: Accueil, Parcourir, Radio, Bibliothèque, Rechercher.
// Every tab owns a DISTINCT icon — the old dock rendered "Parcourir" and
// "Rechercher" with the same magnifier glyph, which made the active tab
// impossible to read ("I'm on Library but the Search tab looks selected").
const TABS: Tab[] = [
  { id: "home", labelKey: "mobile.tabHome", labelFallback: "Accueil", icon: Home, owns: ["home"] },
  { id: "explore", labelKey: "mobile.tabBrowse", labelFallback: "Parcourir", icon: Compass, owns: ["explore"] },
  { id: "radio", labelKey: "mobile.tabRadio", labelFallback: "Radio", icon: Radio, owns: ["radio"] },
  { id: "library", labelKey: "mobile.tabLibrary", labelFallback: "Bibliothèque", icon: Library, owns: ["library", "album", "artist", "playlist", "folders", "recents", "insights", "settings", "favorites"] },
  { id: "search", labelKey: "mobile.tabSearch", labelFallback: "Rechercher", icon: Search, owns: ["search"] },
];

/** Subtle haptic tick on navigation taps (no-op where unsupported). */
function haptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(8); } catch { /* unavailable */ }
  }
}

export function MobileDock() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center justify-end md:hidden pointer-events-none">
      {/* The mini-player slot only captures events while a track is actually
          loaded — the old wrapper kept pointer-events-auto even when empty,
          leaving an invisible full-width strip above the tab bar that ate
          taps meant for content scrolled underneath it. */}
      {currentTrack && (
        <div className="w-full px-2 pb-2 pointer-events-auto">
          <MiniPlayer />
        </div>
      )}
      <FrostedSurface className="w-full pointer-events-auto pb-[env(safe-area-inset-bottom)]">
        <TabBar />
      </FrostedSurface>
    </div>
  );
}

function MiniPlayer() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const playPrev = usePlayer((s) => s.playPrev);
  const openFullscreen = usePlayer((s) => s.toggleFullscreenPlayer);
  const t = useT();

  if (!currentTrack) return null;

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-md matte-panel-2 shadow-[0_4px_16px_rgba(0,0,0,0.2)] ring-1 ring-white/[0.03]"
    >
      {/* Ambient backdrop wash: a blown-up, blurred copy of the cover art
          tinting the bar so the mini-player picks up the now-playing color
          field — a softer echo of the fullscreen player's ambient stage. */}
      {currentTrack.image && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url("${api.assetUrl(currentTrack.image, 256) ?? currentTrack.image}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "saturate(1.4) blur(36px) brightness(0.55)",
          }}
        />
      )}
      <div className="relative flex h-14 items-center gap-2 px-2 py-1">
        <button
          onClick={openFullscreen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={t("mobile.openPlayer", "Ouvrir le lecteur")}
        >
          <div className="relative shrink-0">
            <Artwork
              title={currentTrack.title}
              trackhash={currentTrack.trackhash}
              size={40}
              rounded={4}
              colors={currentTrack.color}
              image={currentTrack.image}
            />
            {/* Equalizer overlay on the artwork when playing — the classic
                "now playing" affordance, painted over the cover so the bar
                doesn't steal a column from the title/artist on a 56px bar. */}
            {isPlaying && (
              <span
                aria-hidden
                className="absolute inset-0 grid place-items-center rounded-[4px] bg-black/55"
              >
                <EqualizerBars active className="h-3.5" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
              {trackTitle(currentTrack)}
            </span>
            <span className="block truncate text-[12px] font-medium leading-tight text-[var(--text-muted)]">
              {trackArtist(currentTrack)}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center">
          {/* Transport trio (prev / play-pause / next) — the mini-player used to
              expose only play/pause, so skipping a track from the dock meant
              opening the fullscreen player first. The heart lives one tap away
              in the fullscreen player / context menu; transport wins the space. */}
          <button
            onClick={() => { haptic(); playPrev(); }}
            aria-label={t("mobile.previous", "Titre précédent")}
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0V5Zm12.53.15a1 1 0 0 1 0 1.7L11.6 12l6.93 5.15a1 1 0 0 1-1.13 1.65l-8-6a1 1 0 0 1 0-1.6l8-6a1 1 0 0 1 1.13 0Z" />
            </svg>
          </button>
          <button
            onClick={() => { haptic(); togglePlay(); }}
            aria-label={isPlaying ? t("mobile.pause", "Pause") : t("mobile.play", "Lecture")}
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-6 ml-0.5" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 1-1.5.86Z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => { haptic(); playNext(); }}
            aria-label={t("mobile.next", "Titre suivant")}
            className="tap-press grid h-11 w-11 place-items-center rounded-full text-foreground transition-transform active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-6" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0V5ZM5.47 5.15a1 1 0 0 0 0 1.7L12.4 12l-6.93 5.15a1 1 0 0 0 1.13 1.65l8-6a1 1 0 0 0 0-1.6l-8-6a1 1 0 0 0-1.13 0Z" />
            </svg>
          </button>
        </div>
      </div>
      <MiniProgress />
    </div>
  );
}

function MiniProgress() {
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const trackhash = usePlayer((s) => s.currentTrack?.trackhash);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div className="relative h-[2px] w-full bg-white/15">
      <div key={trackhash} className="absolute inset-y-0 left-0 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-soft)] transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
      {/* Subtle "glow head" at the playhead so the bar reads as alive — a small
          radial dot at the leading edge, blending into the gradient fill. */}
      <div
        aria-hidden
        className="absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)]"
        style={{ left: `calc(${pct}% - 2px)`, opacity: pct > 0 && pct < 100 ? 1 : 0 }}
      />
    </div>
  );
}

function TabBar() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);
  const t = useT();

  // Active index drives a single sliding indicator that lives on the nav
  // itself — instead of every tab owning its own pill, one absolutely-
  // positioned pill translates between slots. The slide is a single transition
  // on `left` so the eye reads the indicator as one continuous motion when
  // switching tabs (Apple Music / Instagram parity).
  const activeIndex = TABS.findIndex((tab) => tab.owns.includes(view.view));
  const idx = activeIndex === -1 ? 0 : activeIndex;

  return (
    <nav aria-label={t("mobile.mainNav", "Navigation principale")} className="relative flex h-[64px] items-stretch justify-around px-1">
      {/* Single sliding active pill — Apple Music style. The 5 slots are
          evenly spaced, so the pill's left = idx × (100% / 5). */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1.5 z-0 h-[30px] rounded-full bg-[var(--primary)]/18 transition-[left,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          left: `calc(${idx} * 20% + (100% / 5 - 46px) / 2)`,
          width: 46,
          opacity: 1,
        }}
      />
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.owns.includes(view.view);
        return (
          <button
            key={tab.id}
            onClick={() => {
              if (!active) haptic();
              navigate(tab.id);
            }}
            aria-current={active ? "page" : undefined}
            className="tap-press relative z-10 flex w-16 flex-col items-center justify-center gap-1"
          >
            <Icon
              className={cn(
                "relative size-[23px] transition-colors duration-200",
                active ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
              )}
              strokeWidth={active ? 2.4 : 2}
            />
            <span
              className={cn(
                "relative text-[10px] font-semibold leading-none transition-colors duration-200",
                active ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
              )}
            >
              {t(tab.labelKey, tab.labelFallback)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
