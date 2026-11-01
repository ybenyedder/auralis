// QQ Music (y.qq.com / c.y.qq.com) lyrics source — second big gap-filler after
// NetEase. QQ serves line-level LRC and, on many tracks, word-level `qrc`. We
// consume the JSON lyric endpoint (`fcg_query_lyric_new.fcg`) which is what the
// web player itself calls and needs only a Referer header — no auth token.
//
//   GET https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg
//        ?songmid=<mid>&format=json&nobase64=1&g_tk=5381
//   GET https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=<kw>&format=json&n=10
//
// Best-effort and unofficial: every failure resolves to null so resolution falls
// through. Server-only module.

import { createLogger } from "../logger";
import { normalizeName } from "../library/ids";
import { fetchJsonCapped, fetchTextCapped, qs } from "./net";

const log = createLogger("lyrics:qq");

const SEARCH_BASE = (process.env.AURALIS_QQ_BASE || "https://c.y.qq.com").replace(/\/+$/, "");
// y.qq.com is the Referer the web client sends; without it the API answers 403.
const WEB_HEADERS: Record<string, string> = {
  Referer: "https://y.qq.com/",
  Accept: "application/json, text/plain, */*",
};

interface QqSong {
  songmid?: string;
  songname?: string;
  singer?: Array<{ name?: string }>;
  albumname?: string;
  interval?: number; // seconds
}

interface QqSearchBody {
  data?: { song?: { list?: QqSong[] } };
}

/** Pick the QQ song whose (title, artist, duration) best matches the track. */
async function searchBestMid(title: string, artist: string, durationSec: number): Promise<string | null> {
  const kw = [title, artist].filter(Boolean).join(" ");
  if (!kw) return null;
  const json = (await fetchJsonCapped(
    `${SEARCH_BASE}/soso/fcgi-bin/client_search_cp?${qs({ w: kw, format: "json", n: 10, p: 1 })}`,
    { headers: WEB_HEADERS },
  )) as QqSearchBody | null;
  const songs = json?.data?.song?.list ?? [];
  if (songs.length === 0) return null;

  const wantTitle = normalizeName(title);
  const wantArtist = normalizeName(artist);
  let best: { mid: string; score: number } | null = null;
  for (const s of songs) {
    const mid = s.songmid;
    if (!mid) continue;
    const sTitle = normalizeName(s.songname ?? "");
    const sArtist = normalizeName((s.singer ?? []).map((x) => x.name ?? "").join(" "));
    let score = 0;
    if (sTitle === wantTitle) score += 60;
    else if (sTitle && wantTitle && (sTitle.includes(wantTitle) || wantTitle.includes(sTitle))) score += 25;
    else score -= 80;
    if (sArtist && wantArtist && (sArtist.includes(wantArtist) || wantArtist.includes(sArtist))) score += 30;
    else if (sArtist && wantArtist) score -= 30;
    if (durationSec > 0 && typeof s.interval === "number" && s.interval > 0) {
      const delta = Math.abs(s.interval - durationSec);
      if (delta <= 3) score += 25;
      else if (delta <= 8) score += 8;
      else if (delta > 25) score -= 60;
    }
    if (!best || score > best.score) best = { mid, score };
  }
  return best && best.score > 0 ? best.mid : null;
}

/** Strip QQ's UTF-8 BOM / wrapper whitespace so the LRC parser sees clean text. */
function cleanLyric(raw: string): string | null {
  const t = raw.replace(/^\uFEFF/, "").replace(/\\n/g, "\n").trim();
  return t && /\[\d/.test(t) ? t : null;
}

/** Line-level LRC for a QQ track (its `lyric` field is base64 unless nobase64=1). */
export async function fetchFromQq(track: {
  title: string;
  artist: string;
  albumartist: string;
  duration: number;
}): Promise<{ synced: string | null; plain: string | null } | null> {
  const mid = await searchBestMid(track.title, track.albumartist || track.artist, track.duration);
  if (!mid) return null;
  // nobase64=1 → the `lyric` field comes back as plain LRC text. If the mirror
  // ignores it and returns base64, we detect and decode below.
  const json = (await fetchJsonCapped(
    `${SEARCH_BASE}/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${qs({ songmid: mid, format: "json", nobase64: 1, g_tk: 5381 })}`,
    { headers: WEB_HEADERS },
  )) as { lyric?: string; trans?: string } | null;
  if (!json?.lyric) return null;
  const decoded = maybeBase64(json.lyric);
  const synced = cleanLyric(decoded);
  return synced ? { synced, plain: null } : null;
}

/** If the string looks base64-encoded (QQ's older mirrors), decode it; else pass through. */
function maybeBase64(s: string): string {
  const looksB64 = /^[A-Za-z0-9+/=\s]+$/.test(s) && !s.includes("[");
  if (!looksB64) return s;
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return s;
  }
}

export const __qqInternals = { searchBestMid, cleanLyric, maybeBase64, log, fetchTextCapped };
