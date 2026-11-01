// NetEase Cloud Music (music.163.com) lyrics source — the single biggest gap
// filler for Auralis. Its public web endpoints are key-less and its catalogue is
// huge (CN/JP/KR + international), which is exactly where LRCLIB often comes up
// empty. Two levels are served:
//   • `yrc`  — NetEase's WORD-level format (per-word start/duration), converted
//     to enhanced LRC so the karaoke wipe gets real word timing;
//   • `lrc`  — line-level synchronised, plus `tlyric` for translation.
//
// Endpoints (the same ones the mobile clients use, no auth):
//   GET /api/search/get/web?s=<kw>&type=1&limit=10
//   GET /api/song/lyric?id=<id>&lv=1&kv=1&tv=-1&yv=1
//
// Best-effort and unofficial: every failure resolves to null so the caller falls
// through to the next provider. Server-only module.

import { createLogger } from "../logger";
import { normalizeName } from "../library/ids";
import { serializeLrc, type LyricWord, type SyncedLine } from "./lrc";
import { fetchJsonCapped, qs, searchVariants } from "./net";

const log = createLogger("lyrics:netease");

const BASE_URL = (process.env.AURALIS_NETEASE_BASE || "https://music.163.com").replace(/\/+$/, "");
// music.163.com rejects requests without a browser-ish UA + Referer.
const WEB_HEADERS: Record<string, string> = {
  Referer: "https://music.163.com/",
  Accept: "application/json, text/plain, */*",
};

interface NeteaseSong {
  id?: number;
  name?: string;
  artists?: Array<{ name?: string }>;
  album?: { name?: string };
  duration?: number; // ms
}

interface NeteaseLyricBody {
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
  yrc?: { lyric?: string };
  code?: number;
}

/** Search NetEase for the closest (title, artist, duration) candidate, trying
 *  each query variant in turn (exact → cleaned → bare title) so decorated or
 *  apostrophe-heavy titles ("Kyle's mom") still resolve. */
async function searchBestId(title: string, artist: string, durationMs: number): Promise<number | null> {
  for (const kw of searchVariants(title, artist)) {
    const json = (await fetchJsonCapped(
      `${BASE_URL}/api/search/get/web?${qs({ s: kw, type: 1, limit: 10 })}`,
      { headers: WEB_HEADERS },
    )) as { result?: { songs?: NeteaseSong[] } } | null;
    const songs = json?.result?.songs ?? [];
    if (songs.length === 0) continue;

    const wantTitle = normalizeName(title);
    const wantArtist = normalizeName(artist);
    let best: { id: number; score: number } | null = null;
    for (const s of songs) {
      if (typeof s.id !== "number") continue;
      const sTitle = normalizeName(s.name ?? "");
      const sArtist = normalizeName((s.artists ?? []).map((a) => a.name ?? "").join(" "));
      let score = 0;
      if (sTitle === wantTitle) score += 60;
      else if (sTitle && wantTitle && (sTitle.includes(wantTitle) || wantTitle.includes(sTitle))) score += 25;
      else score -= 80;
      if (sArtist && wantArtist && (sArtist.includes(wantArtist) || wantArtist.includes(sArtist))) score += 30;
      else if (sArtist && wantArtist) score -= 30;
      if (durationMs > 0 && typeof s.duration === "number" && s.duration > 0) {
        const delta = Math.abs(s.duration - durationMs) / 1000;
        if (delta <= 3) score += 25;
        else if (delta <= 8) score += 8;
        else if (delta > 25) score -= 60; // clearly a different recording
      }
      if (!best || score > best.score) best = { id: s.id, score };
    }
    // Only accept a candidate the matcher actually recognises — a wild pick would
    // pair the wrong song's words with the track (the wrong-song guard).
    if (best && best.score > 0) return best.id;
  }
  return null;
}

/**
 * Convert NetEase `yrc` (word-level) to the enhanced-LRC line model.
 * Format per line:  `[startMs,durationMs](wordStartMs,wordDurationMs,0)word(...)word…`
 * Whitespace between words is significant; tokens carry their own text.
 */
export function parseYrc(yrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  const wordRe = /\((\d+),(\d+),(\d+)\)([^()]*)/g;
  for (const raw of yrc.split(/\r?\n/)) {
    const head = raw.match(/^\[(\d+),(\d+)\]/);
    if (!head) continue;
    const words: LyricWord[] = [];
    wordRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(raw)) !== null) {
      const text = m[4];
      if (!text) continue;
      words.push({ time: Number(m[1]) / 1000, text });
    }
    if (words.length === 0) continue;
    // Rebuild the line text from its tokens (they already carry spacing).
    const text = words.map((w) => w.text).join("").trim();
    if (!text) continue;
    lines.push({ time: Number(head[1]) / 1000, text, words });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Best-effort fetch: word-level when `yrc` exists, else line-level `lrc`.
 *  Returns enhanced-LRC text (so `serializeLrc`/the parser handle word timing). */
export async function fetchFromNetease(track: {
  title: string;
  artist: string;
  albumartist: string;
  duration: number;
}): Promise<{ synced: string | null; plain: string | null } | null> {
  const id = await searchBestId(track.title, track.albumartist || track.artist, Math.round(track.duration * 1000));
  if (id == null) return null;
  const json = (await fetchJsonCapped(
    `${BASE_URL}/api/song/lyric?${qs({ id, lv: 1, kv: 1, tv: -1, yv: 1 })}`,
    { headers: WEB_HEADERS },
  )) as NeteaseLyricBody | null;
  if (!json) return null;

  // Word-level first.
  const yrc = json.yrc?.lyric?.trim();
  if (yrc) {
    const parsed = parseYrc(yrc);
    if (parsed.length > 0) return { synced: serializeLrc(parsed), plain: null };
  }
  // Line-level.
  const lrc = json.lrc?.lyric?.trim();
  if (lrc && /\[\d/.test(lrc)) {
    return { synced: lrc, plain: null };
  }
  return null;
}

/** Raw (unparsed) line-level lookup, used by the alignment/pre-fetch paths. */
export async function fetchPlainFromNetease(track: {
  title: string;
  artist: string;
  albumartist: string;
  duration: number;
}): Promise<string | null> {
  const r = await fetchFromNetease(track);
  return r?.plain ?? null;
}

export const __neteaseInternals = { searchBestId, log };
