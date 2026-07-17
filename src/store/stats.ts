"use client";

// Listening stats (streak / weekly recap) fetched from /api/stats. Kept in its
// own tiny store rather than the already-large player store: it's read by the
// Home shelves and the streak chips, and refreshed when a scrobble lands.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";
import { usePlayer } from "./player";

export interface ListeningStats {
  totalPlays: number;
  todayPlays: number;
  weekPlays: number;
  streak: number;
  playsByDay: { day: string; count: number }[];
  weekListeningSeconds: number;
  totalListeningSeconds: number;
}

interface StatsState extends ListeningStats {
  loaded: boolean;
  fetchStats: () => Promise<void>;
}

// Streak milestones worth a small celebration (once each). Persisted so a refresh
// or a second scrobble the same day doesn't re-fire it.
const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
const MILESTONE_KEY = "auralis.streakMilestone";

function celebrateStreak(streak: number) {
  if (typeof window === "undefined" || streak <= 0) return;
  let last = 0;
  try { last = Number(window.localStorage.getItem(MILESTONE_KEY)) || 0; } catch { /* unavailable */ }
  const reached = MILESTONES.filter((m) => m <= streak);
  const top = reached.length ? reached[reached.length - 1] : 0;
  if (top > last) {
    try { window.localStorage.setItem(MILESTONE_KEY, String(top)); } catch { /* unavailable */ }
    usePlayer.getState().notify(`🔥 ${streak} jours d’écoute d’affilée — continue comme ça !`, { tone: "info" });
  } else if (top < last) {
    // The streak broke since the last celebration — lower the bar so re-climbing
    // to the milestone is celebrated again.
    try { window.localStorage.setItem(MILESTONE_KEY, String(top)); } catch { /* unavailable */ }
  }
}

export const useStats = create<StatsState>((set) => ({
  totalPlays: 0,
  todayPlays: 0,
  weekPlays: 0,
  streak: 0,
  playsByDay: [],
  weekListeningSeconds: 0,
  totalListeningSeconds: 0,
  loaded: false,
  fetchStats: async () => {
    try {
      const s = await api.get<ListeningStats>("/api/stats");
      set({ ...s, loaded: true });
      celebrateStreak(s.streak);
    } catch {
      set({ loaded: true }); // offline — leave the last known values
    }
  },
}));
