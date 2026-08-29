"use client";

// Smart (dynamic) playlists driven by the per-track audio DSP + library metadata.
// A SmartConfig is a tiny rule set evaluated LIVE against the library, so the
// playlist always reflects the current collection — "Énergie haute", "Calme du
// soir", "160+ BPM", "Jamais écouté" — a transparent, editable take on something
// Spotify only offers as opaque algorithmic mixes.

import type { Track } from "./types";
import { foldAccents } from "@/lib/utils";

export type SmartField =
  | "mood"
  | "genre"
  | "energy"
  | "bpm"
  | "year"
  | "addedDays"
  | "playcount"
  | "favorite"
  | "lossless"
  | "title";
export type SmartOp = "is" | "not" | "gt" | "lt" | "contains" | "true" | "false";

export interface SmartRule {
  field: SmartField;
  op: SmartOp;
  value?: string | number;
}

export interface SmartConfig {
  /** Human label shown on the playlist (the preset name, or "Règles personnalisées"). */
  label?: string;
  rules: SmartRule[];
  match: "all" | "any";
  sort?: "added" | "plays" | "az" | "random";
  limit?: number;
}

export interface SmartContext {
  favorites: Set<string>;
  playCounts: Record<string, number>;
}

function cmpNum(v: number | undefined | null, r: SmartRule): boolean {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  const target = Number(r.value);
  if (!Number.isFinite(target)) return false;
  switch (r.op) {
    case "gt": return v > target;
    case "lt": return v < target;
    case "is": return v === target;
    case "not": return v !== target;
    default: return false;
  }
}

function testRule(t: Track, r: SmartRule, ctx: SmartContext, now: number): boolean {
  switch (r.field) {
    case "mood": return r.op === "not" ? t.mood !== r.value : t.mood === r.value;
    case "genre":
      if (r.op === "contains") return foldAccents(t.genre || "").includes(foldAccents(String(r.value ?? "")));
      return r.op === "not" ? t.genre !== r.value : t.genre === r.value;
    case "energy": return cmpNum(t.energy, r);
    case "bpm": return cmpNum(t.bpm, r);
    case "year": return cmpNum(t.year, r);
    case "addedDays": {
      // value = N days; match tracks added within the last N days.
      if (!t.addedAt) return false;
      const days = (now - t.addedAt) / 86_400_000;
      return r.op === "gt" ? days > Number(r.value) : days <= Number(r.value);
    }
    case "playcount": return cmpNum(ctx.playCounts[t.trackhash] ?? 0, r);
    case "favorite": return ctx.favorites.has(t.trackhash) === (r.op !== "false");
    case "lossless": return Boolean(t.lossless) === (r.op !== "false");
    case "title": return foldAccents(t.title).includes(foldAccents(String(r.value ?? "")));
    default: return true;
  }
}

/** Resolve a smart config against the library + the user's favourites/play counts. */
export function evaluateSmartList(tracks: Track[], config: SmartConfig, ctx: SmartContext): Track[] {
  const now = Date.now();
  const matched = tracks.filter((t) => {
    if (config.rules.length === 0) return true;
    const results = config.rules.map((r) => testRule(t, r, ctx, now));
    return config.match === "any" ? results.some(Boolean) : results.every(Boolean);
  });
  const sorted = [...matched];
  if (config.sort === "added") sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  else if (config.sort === "plays") sorted.sort((a, b) => (ctx.playCounts[b.trackhash] ?? 0) - (ctx.playCounts[a.trackhash] ?? 0));
  else if (config.sort === "az") sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  else if (config.sort === "random") {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }
  return typeof config.limit === "number" ? sorted.slice(0, config.limit) : sorted;
}

/** One-tap smart-playlist presets exposed in the UI. */
export const SMART_PRESETS: { id: string; name: string; config: SmartConfig }[] = [
  { id: "high-energy", name: "Énergie haute", config: { label: "Énergie haute", match: "all", sort: "plays", rules: [{ field: "energy", op: "gt", value: 0.6 }] } },
  { id: "calm-evening", name: "Calme du soir", config: { label: "Calme du soir", match: "any", sort: "random", rules: [{ field: "mood", op: "is", value: "chill" }, { field: "mood", op: "is", value: "melancholy" }] } },
  { id: "running", name: "Running 160+ BPM", config: { label: "Running 160+ BPM", match: "all", sort: "random", rules: [{ field: "bpm", op: "gt", value: 150 }] } },
  { id: "focus", name: "Concentration", config: { label: "Concentration", match: "all", sort: "random", rules: [{ field: "mood", op: "is", value: "focus" }] } },
  { id: "never-played", name: "Jamais écouté", config: { label: "Jamais écouté", match: "all", sort: "random", rules: [{ field: "playcount", op: "is", value: 0 }] } },
  { id: "recent", name: "Récemment ajoutés", config: { label: "Récemment ajoutés", match: "all", sort: "added", limit: 100, rules: [{ field: "addedDays", op: "lt", value: 30 }] } },
  { id: "lossless", name: "Tout en lossless", config: { label: "Tout en lossless", match: "all", sort: "az", rules: [{ field: "lossless", op: "true" }] } },
];
