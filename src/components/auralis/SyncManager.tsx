"use client";

// Headless glue for the realtime "Connect" hub: opens the SSE connection and keeps
// the hub's view of THIS device's playback in sync. Incoming commands are handled
// inside the sync store (it calls the player directly); this component only owns
// the outbound publishing cadence.

import { useCallback, useEffect } from "react";
import { useSync } from "@/store/sync";
import { usePlayer } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";

export function SyncManager() {
  const connect = useSync((s) => s.connect);
  const publish = useSync((s) => s.publish);
  const controllingId = useSync((s) => s.controllingId);

  // Snapshot publisher — always reads live state at call time. Stable (publish is a
  // stable store action), so the effects below don't churn.
  const publishNow = useCallback(() => {
    const s = useSync.getState();
    if (s.controllingId || !s.isLeader) return; // we're a remote / not the leader tab
    const p = usePlayer.getState();
    const ph = usePlayhead.getState();
    publish({
      trackhash: p.currentTrack?.trackhash ?? null,
      title: p.currentTrack ? trackTitle(p.currentTrack) : undefined,
      artist: p.currentTrack ? trackArtist(p.currentTrack) : undefined,
      image: p.currentTrack?.image,
      position: Math.floor(ph.position),
      duration: Math.floor(ph.duration || p.currentTrack?.duration || 0),
      isPlaying: p.isPlaying,
    });
  }, [publish]);

  useEffect(() => {
    connect();
  }, [connect]);

  // Publish immediately whenever the track or the play/pause state flips.
  useEffect(() => {
    let lastTrack = usePlayer.getState().currentTrack?.trackhash;
    let lastPlaying = usePlayer.getState().isPlaying;
    return usePlayer.subscribe((s) => {
      const tk = s.currentTrack?.trackhash;
      if (tk !== lastTrack || s.isPlaying !== lastPlaying) {
        lastTrack = tk;
        lastPlaying = s.isPlaying;
        publishNow();
      }
    });
  }, [publishNow]);

  // Keep the position fresh for any device watching us play (cheap, 4s cadence) —
  // but ONLY while another device is actually connected. A solo user (the common
  // self-host case) would otherwise POST every 4s for a whole track with no peer to
  // receive it: pointless network + battery, especially on mobile.
  useEffect(() => {
    const t = setInterval(() => {
      const s = useSync.getState();
      if (usePlayer.getState().isPlaying && !s.controllingId && s.devices.length > 1) publishNow();
    }, 4000);
    return () => clearInterval(t);
  }, [publishNow]);

  // The 4s ticker stays idle while alone, so when a second device first appears it
  // would have no fresh position to show. Publish once on that roster transition to
  // close the gap (subsequent freshness is the ticker's job).
  useEffect(() => {
    let hadAudience = useSync.getState().devices.length > 1;
    return useSync.subscribe((s) => {
      const audience = s.devices.length > 1;
      if (audience && !hadAudience) publishNow();
      hadAudience = audience;
    });
  }, [publishNow]);

  // Entering remote mode: announce we're idle so we drop off other devices' "now
  // playing". Leaving it: re-announce our real state.
  useEffect(() => {
    if (controllingId) publish({ trackhash: null, position: 0, duration: 0, isPlaying: false });
    else publishNow();
  }, [controllingId, publish, publishNow]);

  return null;
}
