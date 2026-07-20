"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { usePlayer, bindAudio, consumeResumeSeek, consumeSkipExempt, type ViewId } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { TitleBar } from "@/components/auralis/TitleBar";
import { Sidebar } from "@/components/auralis/Sidebar";
import { PlayerBar } from "@/components/auralis/PlayerBar";
import { NowPlayingPanel } from "@/components/auralis/NowPlayingPanel";
import { ContextMenuHost } from "@/components/auralis/ContextMenu";
import { ToastHost } from "@/components/auralis/Toast";
import { StickyViewHeader } from "@/components/auralis/StickyViewHeader";
import { ThemeBackdrop } from "@/components/auralis/ThemeBackdrop";
import { HomeView } from "@/components/auralis/views/HomeView";
import { ExploreView } from "@/components/auralis/views/ExploreView";
import { LibraryView } from "@/components/auralis/views/LibraryView";
import { FavoritesView } from "@/components/auralis/views/FavoritesView";
import { RecentsView } from "@/components/auralis/views/RecentsView";
import { FoldersView } from "@/components/auralis/views/FoldersView";

// Heavy / conditionally-mounted surfaces are code-split out of the initial bundle.
// They're "use client" overlays + secondary views (DetailView is the single biggest
// component), so ssr:false is natural and shrinks the first-load JS / TTI.
const FullscreenPlayer = dynamic(() => import("@/components/auralis/FullscreenPlayer").then((m) => m.FullscreenPlayer), { ssr: false });
const VisualizerOverlay = dynamic(() => import("@/components/auralis/VisualizerOverlay").then((m) => m.VisualizerOverlay), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/auralis/CommandPalette").then((m) => m.CommandPalette), { ssr: false });
const KeyboardHelp = dynamic(() => import("@/components/auralis/KeyboardHelp").then((m) => m.KeyboardHelp), { ssr: false });
const DonateModal = dynamic(() => import("@/components/auralis/DonateReminder").then((m) => m.DonateModal), { ssr: false });
const InsightsView = dynamic(() => import("@/components/auralis/views/InsightsView").then((m) => m.InsightsView), { ssr: false });
const AlbumDetail = dynamic(() => import("@/components/auralis/views/DetailView").then((m) => m.AlbumDetail), { ssr: false });
const ArtistDetail = dynamic(() => import("@/components/auralis/views/DetailView").then((m) => m.ArtistDetail), { ssr: false });
const PlaylistDetail = dynamic(() => import("@/components/auralis/views/DetailView").then((m) => m.PlaylistDetail), { ssr: false });
const SettingsView = dynamic(() => import("@/components/auralis/views/DetailView").then((m) => m.SettingsView), { ssr: false });
import { useLibrary, useLibraryStore } from "@/store/library";
import { ensureAudioGraph, resumeAudioGraph, setGraphGain, dbToGain, fadeInGain } from "@/lib/auralis/audioGraph";
import { useStats } from "@/store/stats";
import { useRecap, monthKeyFr, monthLabelFr } from "@/store/reco";
import { api } from "@/lib/auralis/api";
import { trackTitle, trackArtist } from "@/lib/auralis/brand";
import { AuthGate } from "@/components/auralis/AuthGate";
import { MobileHeader } from "@/components/auralis/mobile/MobileHeader";
import { MobileDock } from "@/components/auralis/mobile/MobileDock";
import { SelectionBar } from "@/components/auralis/SelectionBar";
import { SyncManager } from "@/components/auralis/SyncManager";
import {
  mediaSupported,
  setMediaMetadata,
  setMediaHandlers,
  clearMediaHandlers,
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
  const normalization = usePlayer((s) => s.normalization);
  const crossfade = usePlayer((s) => s.crossfade);
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
  const lastFadedTrack = useRef<string | null>(null);
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

  // End-of-month mood recap nudge: once a new month has started and the previous
  // month has listening data the user hasn't been shown yet, surface its recap
  // (Spotify-Wrapped style, but monthly). Fires at most once per month.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void useRecap.getState().fetchRecap().then(() => {
      if (cancelled) return;
      const { months } = useRecap.getState();
      const thisMonth = monthKeyFr(Date.now());
      const elapsed = months.find((m) => m < thisMonth); // newest fully-elapsed month with data
      if (!elapsed) return;
      let seen = "";
      try { seen = window.localStorage.getItem("auralis.lastRecapSeen") || ""; } catch { /* unavailable */ }
      if (elapsed === seen) return;
      try { window.localStorage.setItem("auralis.lastRecapSeen", elapsed); } catch { /* unavailable */ }
      usePlayer.getState().notify(`Ton bilan d’humeur de ${monthLabelFr(elapsed)} est prêt`, {
        tone: "info",
        action: {
          label: "Voir",
          run: () => { void useRecap.getState().fetchRecap(elapsed); usePlayer.getState().navigate("insights"); },
        },
      });
    });
    return () => { cancelled = true; };
  }, []);

  // Nudge to personalise the auto-generated admin password (flagged by AuthGate).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("auralis.pwNudge")) {
        sessionStorage.removeItem("auralis.pwNudge");
        usePlayer.getState().notify("Tu utilises le mot de passe initial — personnalise-le dans Réglages.", {
          tone: "info",
          action: { label: "Réglages", run: () => usePlayer.getState().navigate("settings") },
        });
      }
    } catch { /* sessionStorage unavailable */ }
  }, []);

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
      // Also drop the action handlers: without this, an OS "play" after the queue
      // empties would still hit the stale handler and set isPlaying:true with no
      // track loaded — UI and OS state showing "playing" with nothing to play.
      clearMediaHandlers();
      return;
    }
    const artistName = currentTrack.artist ?? currentTrack.artists?.map((a) => a.name).join(", ") ?? "";
    // Sized thumbnail (not the full-res cover): car head-units fetch the OS media
    // artwork over Bluetooth AVRCP cover-art, which drops oversized images — a 512px
    // variant is what makes the cover appear on the dashboard (BMW iDrive & co.).
    const art = api.assetUrl(currentTrack.image, 512);
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
      // Build the Web Audio graph (analyser + normalization gain) on the first
      // real play — a user gesture, so the context can resume. No-ops thereafter.
      ensureAudioGraph(audio);
      resumeAudioGraph();
      // Rapid track switches abort the previous play() — that rejection is
      // expected, not a real failure, so don't toast on AbortError. Any other
      // rejection (autoplay blocked, decode failure) means we are NOT playing, so
      // flip the store back to paused to keep the UI honest with the element.
      audio.play().catch((err: unknown) => {
        if (!(err instanceof DOMException) || err.name !== "AbortError") {
          usePlayer.setState({ isPlaying: false });
          notify("Lecture audio indisponible", { tone: "error" });
        }
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

  // Volume normalization: drive the Web Audio gain node from the current track's
  // ReplayGain (per-track), or the album's average gain (per-album), or unity (off).
  // No-ops until the graph is built (gain is remembered and applied at build time).
  useEffect(() => {
    // Resolve the normalization multiplier for the current track…
    let mult = 1;
    if (normalization !== "off" && currentTrack) {
      let db = typeof currentTrack.gain === "number" ? currentTrack.gain : undefined;
      if (normalization === "album" && currentTrack.albumhash) {
        const albumGains = useLibraryStore
          .getState()
          .tracks.filter((t) => t.albumhash === currentTrack.albumhash && typeof t.gain === "number")
          .map((t) => t.gain as number);
        if (albumGains.length) db = albumGains.reduce((s, g) => s + g, 0) / albumGains.length;
      }
      mult = typeof db === "number" ? dbToGain(db) : 1;
    }
    // …then apply it: fade IN on a genuine track change when crossfade is on (smooth
    // entry, no hard start), else set instantly (a mid-track normalization change
    // mustn't dip to silence).
    const isNewTrack = (currentTrack?.trackhash ?? null) !== lastFadedTrack.current;
    if (crossfade > 0 && currentTrack && isNewTrack) fadeInGain(mult, Math.min(crossfade, 2));
    else setGraphGain(mult);
    lastFadedTrack.current = currentTrack?.trackhash ?? null;
  }, [currentTrack, normalization, crossfade]);

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
    let accumDuration = 0;
    let listened = 0;
    let lastClock = 0;
    let scrobbledHash = "";
    // The hash of a track that ENDED naturally (incl. via a seek to the end), so the
    // next track-change isn't mistaken for a skip.
    let endedHash = "";
    // Counts back-to-back media errors (dead/moved files) so a skip-on-error can't
    // spin forever on a wholly broken library. Reset the moment a track plays.
    let consecutiveErrors = 0;
    const onTimeUpdate = () => {
      usePlayhead.getState().setPosition(audio.currentTime);

      const ct = usePlayer.getState().currentTrack;
      if (ct) {
        const cur = audio.currentTime;
        if (ct.trackhash !== accumHash) {
          // Outgoing-track accounting: leaving a track before it was scrobbled — and
          // that DIDN'T end naturally and isn't an exempt move (previous / resumed
          // session) — is a SKIP, a negative taste signal scaled by how little was
          // heard. The >=1s guard ignores rapid re-selections and dead files (which
          // never really started), so they don't poison the profile. The exempt check
          // is consumed on every change (one-shot), regardless of the other guards.
          const exempt = accumHash ? consumeSkipExempt(accumHash) : false;
          if (accumHash && !exempt && accumHash !== scrobbledHash && accumHash !== endedHash && listened >= 1) {
            const ratio = accumDuration > 0 ? Math.min(1, listened / accumDuration) : 0;
            usePlayer.getState().recordSkip(accumHash, Math.round(listened * 1000), ratio);
          }
          accumHash = ct.trackhash;
          // Trust the element's duration only once it has actually loaded THIS track
          // (the src swap is async — a stray timeupdate can still report the previous
          // track's duration); otherwise fall back to the store track's own duration.
          accumDuration = audio.dataset.trackhash === ct.trackhash && audio.duration && Number.isFinite(audio.duration)
            ? audio.duration
            : ct.duration || 0;
          listened = 0;
          lastClock = cur;
        } else {
          const dt = cur - lastClock;
          if (dt > 0 && dt < 2) { listened += dt; consecutiveErrors = 0; }
          lastClock = cur;
          // Reconcile to the real duration once this track's own metadata has loaded.
          if (audio.dataset.trackhash === ct.trackhash && audio.duration && Number.isFinite(audio.duration)) accumDuration = audio.duration;
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
      // Repeat-one, OR repeat-all on a single-track queue: restart the element in
      // place. Routing the latter through playNext() would re-select the very same
      // track object — its ref and isPlaying are unchanged, so the audio effect
      // wouldn't re-fire and playback would simply stop at the end.
      if (state.repeat === "one" || (state.repeat === "all" && state.shuffledQueue.length <= 1)) {
        audio.currentTime = 0;
        usePlayhead.getState().setPosition(0);
        // Reset the scrobble gate so each repeat counts as its own listen.
        accumHash = "";
        accumDuration = 0;
        listened = 0;
        scrobbledHash = "";
        usePlayer.setState({ isPlaying: true });
        audio.play().catch(() => state.notify("Lecture audio indisponible", { tone: "error" }));
        return;
      }
      // Natural completion — mark it so the upcoming track-change isn't a "skip".
      endedHash = accumHash;
      state.playNext();
    };
    const onError = () => {
      // Clearing src on teardown and aborted loads fire a synthetic error — only
      // act on a genuine media failure on a real source.
      if (!audio.getAttribute("src")) return;
      if (audio.error && audio.error.code === audio.error.MEDIA_ERR_ABORTED) return;
      const state = usePlayer.getState();
      consecutiveErrors += 1;
      // A dead source (moved/deleted file, 404) must not freeze the queue: skip to
      // the next track. Stop after roughly a full lap of failures so a wholly
      // broken library can't spin the queue forever.
      if (consecutiveErrors === 1) state.notify("Piste illisible — passage à la suivante", { tone: "error" });
      if (consecutiveErrors >= Math.max(3, state.shuffledQueue.length)) {
        usePlayer.setState({ isPlaying: false });
        state.notify("Lecture impossible — fichiers introuvables", { tone: "error" });
        return;
      }
      // A dead source isn't a user skip. Mark the track that actually errored (the
      // current one) — accumHash can still point at the PREVIOUS track when a freshly
      // selected file fails before its first timeupdate, and that previous track's
      // genuine skip must NOT be suppressed.
      endedHash = state.currentTrack?.trackhash ?? accumHash;
      state.playNext();
    };

    // Background-suspend recovery: a mobile WebView (esp. MIUI/HyperOS) can freeze
    // while backgrounded — the OS pauses the <audio> element and may swallow the
    // "ended" event so the queue never advances. When we come back to the
    // foreground, reconcile: if the track finished while we were away, advance;
    // otherwise resume if our intent is still "playing" but the element got paused.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const state = usePlayer.getState();
      if (!state.currentTrack || !state.isPlaying) return;
      if (audio.ended) {
        onEnded();
      } else if (audio.paused) {
        audio.play().catch(() => usePlayer.setState({ isPlaying: false }));
      }
    };

    // Session resume: when a restored track's metadata loads, seek to the saved
    // position once (best-effort — a miss just starts from 0). Only ever set after
    // restoreLastSession(), so normal track changes pass through untouched.
    const onLoadedMeta = () => {
      // Only seek when the resume position was armed for THIS exact track (guards
      // against a restored track that 404s leaking its seek onto the next track).
      const seekTo = consumeResumeSeek(usePlayer.getState().currentTrack?.trackhash);
      if (seekTo != null && audio.duration && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(seekTo, Math.max(0, audio.duration - 0.25));
        usePlayhead.getState().setPosition(audio.currentTime);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      document.removeEventListener("visibilitychange", onVisibility);
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

      // Space/Enter on a focused button, link or slider is already handled by that
      // control — don't also fire the global transport shortcut (double-activation,
      // e.g. tabbing to a card then pressing Space would both open it and play/pause).
      if ((e.key === " " || e.key === "Enter") && target.closest("button, a, [role='button'], [role='slider']")) {
        return;
      }

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
        case "q":
        case "Q":
          usePlayer.getState().toggleQueue();
          break;
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

  // Memoise the active view element on the navigation target alone. The shell
  // re-renders on every play/pause, volume tick and mute (it subscribes to those),
  // and an inline renderView() would hand React a fresh element each time, forcing
  // the whole active view + its list to reconcile on transport changes. Keyed on
  // view.view/view.id, the element ref stays stable across those churns, so the
  // view subtree only re-renders when navigation changes or its own store slices do.
  const viewEl = useMemo(() => {
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
  }, [view.view, view.id]);

  return (
    <>
      <ThemeBackdrop />
      <div className="app-chrome relative z-[1] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-foreground">
      {/* Keyboard skip-link: first tab stop jumps straight to the main content,
          past the title bar / sidebar (WCAG 2.4.1 bypass blocks). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-[var(--panel-2)] focus:px-4 focus:py-2 focus:text-[13px] focus:font-bold focus:text-foreground focus:outline focus:outline-2 focus:outline-[var(--focus-ring)]"
      >
        Aller au contenu
      </a>
      <audio ref={audioRef} preload="metadata" />

      {/* Announce track changes to screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {currentTrack ? `En lecture : ${trackTitle(currentTrack)} — ${trackArtist(currentTrack)}` : ""}
      </div>

      {/* Desktop top bar. Hosts the OS window drag region + min/max/close controls
          (the Electron window is frameless, so without this it can't be moved or
          closed), plus the global search field and back navigation. */}
      <div className="hidden md:block shrink-0">
        <TitleBar />
      </div>

      <MobileHeader />

      <div className="flex min-h-0 flex-1 md:gap-2 md:px-2 md:pt-2 pb-2 md:pb-0">
        <div className="hidden shrink-0 md:flex flex-col gap-2 w-[280px] lg:w-[320px] max-w-[420px] min-h-0">
          <Sidebar />
        </div>
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          aria-label="Contenu principal"
          className={cn(
            "app-stage relative min-h-0 flex-1 overflow-y-auto scroll-auralis md:rounded-lg outline-none",
            // Clear the fixed mobile dock (tab bar, plus the mini-player when active).
            currentTrack
              ? "pb-[calc(var(--miniplayer-h)+var(--tabbar-h)+var(--safe-bottom))] md:pb-0"
              : "pb-[calc(var(--tabbar-h)+var(--safe-bottom))] md:pb-0",
          )}
        >
          <div className="hidden md:block">
            <StickyViewHeader scrollRef={mainRef} />
          </div>
          <div key={`${view.view}-${view.id ?? ""}`} className="relative fade-up h-full">{viewEl}</div>
        </main>
        <NowPlayingPanel />
      </div>

      <div className="app-playerbar-slot hidden md:block h-[90px] w-full">
        <PlayerBar />
      </div>

      <MobileDock />
      <SelectionBar />
      <SyncManager />

      {fullscreenPlayer && <FullscreenPlayer />}
      {visualizerOpen && <VisualizerOverlay />}
      <CommandPalette />
      <ContextMenuHost />
      <ToastHost />
      <KeyboardHelp />
      <DonateModal />
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
