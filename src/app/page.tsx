"use client";

import { useEffect, useRef } from "react";
import { usePlayer, bindAudio, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { TitleBar } from "@/components/auralis/TitleBar";
import { Sidebar } from "@/components/auralis/Sidebar";
import { PlayerBar } from "@/components/auralis/PlayerBar";
import { NowPlayingPanel } from "@/components/auralis/NowPlayingPanel";
import { FullscreenPlayer } from "@/components/auralis/FullscreenPlayer";
import { CommandPalette } from "@/components/auralis/CommandPalette";
import { ContextMenuHost } from "@/components/auralis/ContextMenu";
import { ToastHost } from "@/components/auralis/Toast";
import { KeyboardHelp } from "@/components/auralis/KeyboardHelp";
import { StickyViewHeader } from "@/components/auralis/StickyViewHeader";
import { VisualizerOverlay } from "@/components/auralis/VisualizerOverlay";
import { ThemeBackdrop } from "@/components/auralis/ThemeBackdrop";
import { HomeView } from "@/components/auralis/views/HomeView";
import { ExploreView } from "@/components/auralis/views/ExploreView";
import { LibraryView } from "@/components/auralis/views/LibraryView";
import { FavoritesView } from "@/components/auralis/views/FavoritesView";
import { RecentsView } from "@/components/auralis/views/RecentsView";
import { FoldersView } from "@/components/auralis/views/FoldersView";
import { InsightsView } from "@/components/auralis/views/InsightsView";
import { AlbumDetail, ArtistDetail, PlaylistDetail, SettingsView } from "@/components/auralis/views/DetailView";
import { useLibrary } from "@/store/library";
import { useStats } from "@/store/stats";
import { api } from "@/lib/auralis/api";
import { AuthGate } from "@/components/auralis/AuthGate";
import { MobileHeader } from "@/components/auralis/mobile/MobileHeader";
import { MobileDock } from "@/components/auralis/mobile/MobileDock";
import {
  mediaSupported,
  setMediaMetadata,
  setMediaHandlers,
  setMediaPlaybackState,
  setMediaPositionState,
} from "@/lib/auralis/nativeMedia";
import { cn } from "@/lib/utils";

function AuralisShell() {
  // Atomic selectors instead of one whole-store subscription. Actions are stable
  // refs (selecting them never triggers a render), and we watch only the specific
  // values this shell actually uses — so unrelated state churn (toasts, favorites,
  // playcounts, context-menu opens, playlist edits) no longer re-renders the entire
  // app shell + active view on every change.
  const view = usePlayer((s) => s.view);
  const fullscreenPlayer = usePlayer((s) => s.fullscreenPlayer);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const visualizerOpen = usePlayer((s) => s.visualizerOpen);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const sleepTimer = usePlayer((s) => s.sleepTimer);
  const lyricsOpen = usePlayer((s) => s.lyricsOpen);

  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const playPrev = usePlayer((s) => s.playPrev);
  const seek = usePlayer((s) => s.seek);
  const seekRelative = usePlayer((s) => s.seekRelative);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleFullscreenPlayer = usePlayer((s) => s.toggleFullscreenPlayer);
  const setCommandOpen = usePlayer((s) => s.setCommandOpen);
  const setHelpOpen = usePlayer((s) => s.setHelpOpen);
  const toggleVisualizer = usePlayer((s) => s.toggleVisualizer);
  const notify = usePlayer((s) => s.notify);
  const hydrateLocal = usePlayer((s) => s.hydrateLocal);
  const hydrateFromServer = usePlayer((s) => s.hydrateFromServer);
  const fetchLyrics = usePlayer((s) => s.fetchLyrics);

  const mainRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Mounts the library loader + SSE scan stream; `status` lets us restore the last
  // session once the catalogue is available (to resolve track hashes).
  const { status: libStatus } = useLibrary();

  // Apply persisted local state after mount (avoids SSR hydration mismatch), then
  // reconcile with the server's shared state.
  useEffect(() => {
    hydrateLocal();
    void hydrateFromServer();
    void useStats.getState().fetchStats();
  }, [hydrateLocal, hydrateFromServer]);

  // Restore the last session (current track + queue, paused) once the library is
  // ready to resolve the saved hashes. No-ops if the user already started playing.
  useEffect(() => {
    if (libStatus === "ready") usePlayer.getState().restoreLastSession();
  }, [libStatus]);

  // Deep-link support: a PWA shortcut / shared link can open a specific view via
  // ?view= (navigation is client-side state, so we resolve it here on load).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = new URLSearchParams(window.location.search).get("view");
    const valid: ViewId[] = ["explore", "library", "favorites", "recents", "folders", "insights", "settings"];
    if (v && (valid as string[]).includes(v)) {
      usePlayer.getState().navigate(v as ViewId);
    }
  }, []);

  // Desktop (Electron) OS media keys → transport controls.
  useEffect(() => {
    const desktop = (window as unknown as { auralisDesktop?: { onMediaKey: (cb: (a: string) => void) => () => void } }).auralisDesktop;
    if (!desktop) return;
    return desktop.onMediaKey((action) => {
      if (action === "playpause") togglePlay();
      else if (action === "next") playNext();
      else if (action === "prev") playPrev();
    });
  }, [togglePlay, playNext, playPrev]);

  // OS media controls (lock screen / notification). On the web and Electron this
  // drives navigator.mediaSession; inside the Android WebView it routes through a
  // native plugin (the WebView's own media session is often not promoted to a
  // system notification on MIUI/Xiaomi). The branch lives in nativeMedia.ts.
  useEffect(() => {
    if (!mediaSupported()) return;
    if (!currentTrack) {
      setMediaMetadata(null);
      return;
    }
    const artistName = currentTrack.artist ?? currentTrack.artists?.map((a) => a.name).join(", ") ?? "";
    const art = api.assetUrl(currentTrack.image);
    setMediaMetadata({
      title: currentTrack.title,
      artist: artistName,
      album: currentTrack.album ?? "",
      // Declare several sizes off the one source so Android/iOS pick an
      // appropriate resolution for the notification, lock screen and Dynamic Island.
      artwork: art
        ? [
            { src: art, sizes: "96x96", type: "image/jpeg" },
            { src: art, sizes: "256x256", type: "image/jpeg" },
            { src: art, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
    // Explicit play/pause (not toggle) so the notification button always matches
    // its label, plus a Stop action that halts playback and rewinds to the start.
    setMediaHandlers({
      play: () => usePlayer.setState({ isPlaying: true }),
      pause: () => usePlayer.setState({ isPlaying: false }),
      previoustrack: () => playPrev(),
      nexttrack: () => playNext(),
      seekto: (t) => seek(t),
      // Relative scrub from the lock screen / wired-headset seek buttons.
      seekbackward: (offset) => seekRelative(-offset),
      seekforward: (offset) => seekRelative(offset),
      stop: () => { usePlayer.setState({ isPlaying: false }); seek(0); },
    });
  }, [currentTrack, togglePlay, playNext, playPrev, seek, seekRelative]);

  // Reflect transport state to the OS media controls.
  useEffect(() => {
    if (!mediaSupported()) return;
    setMediaPlaybackState(isPlaying ? "playing" : "paused");
  }, [isPlaying]);

  // Reset lyric UI on track change; auto-resolve when the lyrics pane is open.
  useEffect(() => {
    usePlayer.setState({ lyricsStatus: "idle", lyricsPlain: null });
    if (lyricsOpen && currentTrack && !currentTrack.lyrics?.length) void fetchLyrics(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.trackhash]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const trackSrc = currentTrack?.filepath ? api.streamUrl(currentTrack.filepath) : null;
    if (!trackSrc || !currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.dataset.trackhash = "";
      return;
    }

    if (audio.dataset.trackhash !== currentTrack.trackhash) {
      audio.src = trackSrc;
      audio.load();
      audio.dataset.trackhash = currentTrack.trackhash;
    }

    if (isPlaying) {
      // Rapid track switches abort the previous play() — that rejection is
      // expected, not a real failure, so don't toast on AbortError.
      audio.play().catch((err: unknown) => {
        if (!(err instanceof DOMException) || err.name !== "AbortError") notify("Lecture audio indisponible", { tone: "error" });
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying, notify]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  // Bind the <audio> element so the player store can seek it directly.
  useEffect(() => {
    bindAudio(audioRef.current);
    return () => bindAudio(null);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastPositionPush = 0;
    // Scrobble gate: only count a play once the user has *actually listened* to
    // min(30s, 50% of the track). We sum small forward deltas (ignoring seeks — a
    // jump >2s isn't listening) so skip-spam no longer inflates counts/recents.
    let accumHash = "";
    let listened = 0;
    let lastClock = 0;
    let scrobbledHash = "";
    const onTimeUpdate = () => {
      usePlayhead.getState().setPosition(audio.currentTime);

      const ct = usePlayer.getState().currentTrack;
      if (ct) {
        const cur = audio.currentTime;
        if (ct.trackhash !== accumHash) {
          accumHash = ct.trackhash;
          listened = 0;
          lastClock = cur;
        } else {
          const dt = cur - lastClock;
          if (dt > 0 && dt < 2) listened += dt;
          lastClock = cur;
        }
        if (scrobbledHash !== ct.trackhash) {
          const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : ct.duration || 0;
          const threshold = dur > 0 ? Math.min(30, dur * 0.5) : 30;
          if (listened >= threshold) {
            scrobbledHash = ct.trackhash;
            usePlayer.getState().scrobble(ct.trackhash);
            // Refresh the streak/recap once the listen actually counts.
            void useStats.getState().fetchStats();
          }
        }
      }
      // Feed the OS media controls a position so the notification / lock screen /
      // Dynamic Island show a live progress bar (Spotify-style) and can scrub.
      // Throttled to ~1 Hz: on Android this crosses a JS→native bridge each call,
      // and timeupdate fires ~4×/s — the notification bar doesn't need finer.
      if (mediaSupported() && audio.duration && Number.isFinite(audio.duration)) {
        const now = performance.now();
        if (now - lastPositionPush >= 1000) {
          lastPositionPush = now;
          setMediaPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate || 1,
          });
        }
      }
    };
    const onDurationChange = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        usePlayhead.getState().setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      const state = usePlayer.getState();
      // "Stop at end of track" sleep mode wins over repeat-one and queue advance.
      if (state.sleepTimer.active && state.sleepTimer.endOfTrack) {
        usePlayer.setState({ isPlaying: false, sleepTimer: { active: false, endsAt: null, minutes: 0 } });
        state.notify("Minuteur terminé — lecture en pause");
        return;
      }
      if (state.repeat === "one") {
        audio.currentTime = 0;
        usePlayhead.getState().setPosition(0);
        usePlayer.setState({ isPlaying: true });
        audio.play().catch(() => state.notify("Lecture audio indisponible", { tone: "error" }));
        return;
      }
      state.playNext();
    };
    const onError = () => {
      // Clearing src on teardown and aborted loads fire a synthetic error — only
      // surface a toast for a genuine media failure on a real source.
      if (!audio.getAttribute("src")) return;
      if (audio.error && audio.error.code === audio.error.MEDIA_ERR_ABORTED) return;
      usePlayer.getState().notify("Flux audio indisponible", { tone: "error" });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    if (!sleepTimer.active || !sleepTimer.endsAt) return;
    const timeout = window.setTimeout(() => {
      const state = usePlayer.getState();
      if (!state.sleepTimer.active || !state.sleepTimer.endsAt || Date.now() < state.sleepTimer.endsAt) return;
      audioRef.current?.pause();
      usePlayer.setState({ isPlaying: false, sleepTimer: { active: false, endsAt: null, minutes: 0 } });
      state.notify("Sleep timer terminé - lecture en pause");
    }, Math.max(0, sleepTimer.endsAt - Date.now()));

    return () => window.clearTimeout(timeout);
  }, [sleepTimer.active, sleepTimer.endsAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!usePlayer.getState().commandOpen);
        return;
      }

      if (typing) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          // seekRelative already writes the bound <audio> element's currentTime;
          // writing it again here double-applied the offset (~10s jumps).
          if (e.shiftKey) playNext();
          else seekRelative(5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) playPrev();
          else seekRelative(-5);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(1, usePlayer.getState().volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, usePlayer.getState().volume - 0.05));
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "s":
        case "S":
          toggleShuffle();
          break;
        case "r":
        case "R":
          cycleRepeat();
          break;
        case "l":
        case "L": {
          // Like / unlike the current track (read via getState so this listener
          // doesn't re-bind on every track change).
          const liked = usePlayer.getState().currentTrack;
          if (liked) usePlayer.getState().toggleFavorite(liked.trackhash);
          break;
        }
        case "Escape":
          if (usePlayer.getState().fullscreenPlayer) toggleFullscreenPlayer();
          break;
        case "f":
        case "F":
          if (usePlayer.getState().currentTrack) toggleFullscreenPlayer();
          break;
        case "v":
        case "V":
          if (usePlayer.getState().currentTrack) toggleVisualizer();
          break;
        case "/":
          e.preventDefault();
          setCommandOpen(true);
          break;
        case "?":
          e.preventDefault();
          setHelpOpen(!usePlayer.getState().helpOpen);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Actions are stable store refs; transient values (currentTrack, fullscreenPlayer,
    // commandOpen, helpOpen) are read live via getState() inside the handler so this
    // listener binds ONCE instead of re-binding on every track change.
  }, [togglePlay, playNext, playPrev, seekRelative, setVolume, toggleMute, toggleShuffle, cycleRepeat, toggleFullscreenPlayer, setCommandOpen, setHelpOpen, toggleVisualizer]);

  const renderView = () => {
    switch (view.view) {
      case "home":
        return <HomeView />;
      case "explore":
        return <ExploreView />;
      case "library":
        return <LibraryView />;
      case "favorites":
        return <FavoritesView />;
      case "recents":
        return <RecentsView />;
      case "folders":
        return <FoldersView />;
      case "insights":
        return <InsightsView />;
      case "album":
        return <AlbumDetail albumhash={view.id || ""} />;
      case "artist":
        return <ArtistDetail artisthash={view.id || ""} />;
      case "playlist":
        return <PlaylistDetail id={view.id || ""} />;
      case "settings":
        return <SettingsView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <>
      <ThemeBackdrop paused={fullscreenPlayer || visualizerOpen} />
      <div className="app-chrome relative z-[1] flex h-[100dvh] w-screen flex-col overflow-hidden text-foreground">
      <audio ref={audioRef} preload="metadata" />

      {/* Desktop chrome — collapsed on phones in favour of the mobile shell. */}
      <div className="hidden md:block">
        <TitleBar />
      </div>
      <MobileHeader />

      <div className="flex min-h-0 flex-1">
        <div className="hidden shrink-0 md:block">
          <Sidebar />
        </div>
        <main
          ref={mainRef}
          className={cn(
            "relative min-h-0 flex-1 overflow-y-auto scroll-auralis bg-background md:pb-0",
            // Clear the fixed mobile dock (tab bar, plus the mini-player when active).
            currentTrack
              ? "pb-[calc(var(--miniplayer-h)+var(--tabbar-h)+var(--safe-bottom))]"
              : "pb-[calc(var(--tabbar-h)+var(--safe-bottom))]",
          )}
        >
          <div className="hidden md:block">
            <StickyViewHeader scrollRef={mainRef} />
          </div>
          <div key={`${view.view}-${view.id ?? ""}`} className="relative fade-up">{renderView()}</div>
        </main>
        <NowPlayingPanel />
      </div>

      <div className="hidden md:block">
        <PlayerBar />
      </div>
      <MobileDock />

      {fullscreenPlayer && <FullscreenPlayer />}
      {visualizerOpen && <VisualizerOverlay />}
      <CommandPalette />
      <ContextMenuHost />
      <ToastHost />
      <KeyboardHelp />
      </div>
    </>
  );
}

export default function Home() {
  return (
    <AuthGate>
      <AuralisShell />
    </AuthGate>
  );
}
