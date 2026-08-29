"use client";

import { create } from "zustand";

// Playback position lives in its own tiny store. It updates ~4×/second during
// playback, so isolating it here means the main player store never churns at that
// rate — only the few components that actually show the position (scrubber, lyrics,
// visualizer) re-render on each tick, not the whole app.
interface PlayheadState {
  position: number;
  duration: number;
  setPosition: (n: number) => void;
  setDuration: (n: number) => void;
  reset: (duration?: number) => void;
}

export const usePlayhead = create<PlayheadState>((set) => ({
  position: 0,
  duration: 0,
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),
  reset: (duration = 0) => set({ position: 0, duration }),
}));
