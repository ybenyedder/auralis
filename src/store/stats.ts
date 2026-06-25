"use client";

// Listening stats (streak / weekly recap) fetched from /api/stats. Kept in its
// own tiny store rather than the already-large player store: it's read by the
// Home shelves and the streak chips, and refreshed when a scrobble lands.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";

export interface ListeningStats {
  totalPlays: number;
  todayPlays: number;
  weekPlays: number;
  streak: number;
  playsByDay: { day: string; count: number }[];
}

interface StatsState extends ListeningStats {
  loaded: boolean;
  fetchStats: () => Promise<void>;
}

export const useStats = create<StatsState>((set) => ({
  totalPlays: 0,
  todayPlays: 0,
  weekPlays: 0,
  streak: 0,
  playsByDay: [],
  loaded: false,
  fetchStats: async () => {
    try {
      const s = await api.get<ListeningStats>("/api/stats");
      set({ ...s, loaded: true });
    } catch {
      set({ loaded: true }); // offline — leave the last known values
    }
  },
}));
