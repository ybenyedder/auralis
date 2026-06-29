"use client";

// Client side of the recommendation system. Two small stores:
//   • useReco  — the server's "Made for you" mix + a per-track taste-score map the
//     Home shelves use to re-rank, refreshed (debounced) whenever the user gives
//     feedback (play / skip / like / dislike).
//   • useRecap — the monthly mood recap: the list of months with data and the
//     currently-selected month's recap object.
// Both read straight from the server engine, so all clients (web/desktop/Android)
// share one authoritative profile.

import { create } from "zustand";
import { api } from "@/lib/auralis/api";
import type { RecoTrack, RecoProfile, RecommendResponse, MonthlyRecap } from "@/lib/auralis/reco";

interface RecoState {
  forYou: RecoTrack[];
  /** trackhash → taste score, for re-ranking any shelf the client builds. */
  scores: Map<string, number>;
  profile: RecoProfile | null;
  /** Disliked trackhashes (mirrors the server hard-exclude) for quick client filtering. */
  disliked: Set<string>;
  loaded: boolean;
  fetchForYou: () => Promise<void>;
  /** Debounced refresh after a feedback event so the engine has settled. */
  scheduleRefresh: () => void;
  scoreOf: (trackhash: string) => number;
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export const useReco = create<RecoState>((set, get) => ({
  forYou: [],
  scores: new Map(),
  profile: null,
  disliked: new Set(),
  loaded: false,
  fetchForYou: async () => {
    try {
      const res = await api.get<RecommendResponse>("/api/recommend?limit=120");
      const scores = new Map<string, number>();
      for (const r of res.forYou) scores.set(r.trackhash, r.score);
      set({
        forYou: res.forYou,
        scores,
        profile: res.profile,
        disliked: new Set(res.profile?.disliked ?? []),
        loaded: true,
      });
    } catch {
      set({ loaded: true }); // offline — keep whatever we had
    }
  },
  scheduleRefresh: () => {
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void get().fetchForYou();
    }, 1500);
  },
  scoreOf: (trackhash) => get().scores.get(trackhash) ?? 0,
}));

/** Fetch a personalised radio continuation around a seed track (autoplay). Returns
 *  trackhashes ordered by similarity-to-seed × taste; empty on failure. */
export async function fetchRadio(seedHash: string, exclude: string[] = [], limit = 25): Promise<string[]> {
  try {
    const qs = new URLSearchParams({ seed: seedHash, limit: String(limit) });
    if (exclude.length) qs.set("exclude", exclude.slice(0, 200).join(","));
    const res = await api.get<{ seed: string; tracks: RecoTrack[] }>(`/api/recommend?${qs.toString()}`);
    return res.tracks.map((t) => t.trackhash);
  } catch {
    return [];
  }
}

/** Fetch a mood-trajectory radio (a set that glides along a named arc, e.g.
 *  "winddown" / "warmup"). Returns ordered trackhashes; empty on failure. */
export async function fetchTrajectory(path: string, limit = 40): Promise<string[]> {
  try {
    const res = await api.get<{ path: string; tracks: RecoTrack[] }>(`/api/recommend?path=${encodeURIComponent(path)}&limit=${limit}`);
    return res.tracks.map((t) => t.trackhash);
  } catch {
    return [];
  }
}

/** Fetch a household Blend mix with another account (by username). Returns ordered
 *  trackhashes + a 0..100 compatibility score. */
export async function fetchBlend(username: string, limit = 80): Promise<{ hashes: string[]; match: number }> {
  try {
    const res = await api.get<{ forYou: RecoTrack[]; match: number }>(`/api/recommend?blend=${encodeURIComponent(username)}&limit=${limit}`);
    return { hashes: res.forYou.map((t) => t.trackhash), match: res.match ?? 0 };
  } catch {
    return { hashes: [], match: 0 };
  }
}

/** Fetch the "discover" mix — taste-ranked tracks the user has never played. */
export async function fetchDiscovery(limit = 60): Promise<string[]> {
  try {
    const res = await api.get<{ tracks: RecoTrack[] }>(`/api/recommend?mode=discovery&limit=${limit}`);
    return res.tracks.map((t) => t.trackhash);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------

interface RecapState {
  months: string[];
  recap: MonthlyRecap | null;
  loading: boolean;
  loaded: boolean;
  selectedMonth: string | null;
  fetchRecap: (month?: string) => Promise<void>;
}

export const useRecap = create<RecapState>((set) => ({
  months: [],
  recap: null,
  loading: false,
  loaded: false,
  selectedMonth: null,
  fetchRecap: async (month) => {
    set({ loading: true });
    try {
      const qs = month ? `?month=${encodeURIComponent(month)}` : "";
      const res = await api.get<{ months: string[]; recap: MonthlyRecap }>(`/api/recap${qs}`);
      set({
        months: res.months,
        recap: res.recap,
        selectedMonth: res.recap?.month ?? month ?? null,
        loading: false,
        loaded: true,
      });
    } catch {
      set({ loading: false, loaded: true });
    }
  },
}));

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** "Juin 2026" from a "2026-06" key (client-side, for selectors/toasts). */
export function monthLabelFr(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_FR[(m || 1) - 1] ?? key} ${y}`;
}

/** Local "YYYY-MM" for a timestamp. */
export function monthKeyFr(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
