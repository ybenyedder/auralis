import type { Track } from "@/lib/auralis/types";
import type { Persisted } from "./types";
import { normalizeMode } from "@/lib/auralis/themes";
import type { Locale } from "@/lib/auralis/i18n";
import type { SmartConfig } from "@/lib/auralis/smartlist";
import { useReco } from "../reco";
import { usePlayer } from "../player";

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function reorderWithFirst<T>(list: T[], firstIndex: number): T[] {
  if (firstIndex < 0 || firstIndex >= list.length) return list;
  const first = list[firstIndex];
  const rest = list.filter((_, i) => i !== firstIndex);
  return [first, ...rest];
}

export function buildContinuation(current: Track | null, queued: Track[], library: Track[]): Track[] {
  if (library.length === 0) return [];
  const inQueue = new Set(queued.map((t) => t.trackhash));
  const { scores, disliked } = useReco.getState();
  const playerDislikes = usePlayer.getState().dislikes;
  const isDisliked = (h: string) => playerDislikes.has(h) || disliked.has(h);
  const curArtists = new Set((current?.artists ?? []).map((a) => a.artisthash).filter(Boolean));
  const curGenre = current?.genre;
  const available = library.filter((t) => !inQueue.has(t.trackhash) && !isDisliked(t.trackhash));
  const similar = available.filter(
    (t) => (t.artists ?? []).some((a) => curArtists.has(a.artisthash)) || (!!curGenre && t.genre === curGenre),
  );
  const pool = similar.length >= 5 ? similar : available;
  const rank = (t: Track) => (scores.get(t.trackhash) ?? 0) + Math.random() * 0.6;
  return [...pool].sort((a, b) => rank(b) - rank(a)).slice(0, 20);
}

export const DEFAULT_LYRICS_OFFSET = 0.15;
const LYRICS_OFFSET_MAX = 3;
export function clampOffset(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-LYRICS_OFFSET_MAX, Math.min(LYRICS_OFFSET_MAX, Math.round(n * 100) / 100));
}

export function parseRules(s?: string | null): SmartConfig | undefined {
  if (!s) return undefined;
  try {
    const o = JSON.parse(s) as SmartConfig;
    return o && Array.isArray(o.rules) ? o : undefined;
  } catch {
    return undefined;
  }
}

export const LS_KEY = "auralis.vault.v1";

export function loadPersisted(): Partial<Persisted> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'state' in parsed && 'version' in parsed) {
      return parsed.state as Partial<Persisted>;
    }
    return parsed as Partial<Persisted>;
  } catch {
    return {};
  }
}

export const initial = loadPersisted();
export const initialMode = normalizeMode(initial.mode ?? (initial as any /* eslint-disable-line @typescript-eslint/no-explicit-any */).accent);
export const initialLocale: Locale = (initial.locale as Locale) ?? (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr");

let _toastSeq = 0;
export function nextToastSeq() { return ++_toastSeq; }
