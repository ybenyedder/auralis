// Musixmatch lyrics source — word-by-word ("richsync") karaoke + line-level synced.
//
// Musixmatch is the only widely-populated catalogue of WORD-level synced lyrics, which
// LRCLIB never provides. There is no public key, so we use the SAME flow the Musixmatch
// desktop/web client uses internally (the approach behind syncedlyrics / spotify-lyrics-api):
//   1. GET an anonymous `user_token` from token.get on apic-desktop.musixmatch.com.
//   2. macro.subtitles.get matches our (title, artist, album, duration) → a track +
//      its line-level subtitle (LRC).
//   3. when the match has richsync, track.richsync.get returns per-word timing, which we
//      convert to enhanced LRC so the existing parser/karaoke get real word timing.
// No HMAC signature and no JS-bundle scraping (the signed www.musixmatch.com/ws endpoint
// the older libraries used is currently broken; this token endpoint works).
//
// Best-effort and inherently fragile (unofficial endpoint): every failure resolves to
// null so the caller falls back to LRCLIB. Server-only module.

import { createLogger } from "../logger";
import { normalizeName } from "../library/ids";
import { serializeLrc, type SyncedLine } from "./lrc";

const log = createLogger("lyrics:mxm");

// apic-desktop is the client API host (token-based). Overridable for region/mirror issues.
const BASE_URL = (process.env.AURALIS_MUSIXMATCH_BASE || "https://apic-desktop.musixmatch.com/ws/1.1/").replace(
  /\/?$/,
  "/",
);
const APP_ID = "web-desktop-app-v1.0";
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 9000;
const MAX_BYTES = 1024 * 1024;
const TOKEN_TTL_MS = 9 * 60 * 1000; // refresh the anonymous user token every ~9 minutes

interface TrackMetaLike {
  title: string;
  artist: string;
  albumartist: string;
  album: string;
  duration: number;
}

async function mxmGet(endpoint: string, params: Record<string, string | number>): Promise<unknown | null> {
  const query = Object.entries({ app_id: APP_ID, format: "json", ...params })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${endpoint}?${query}`, {
      headers: { "User-Agent": USER_AGENT, Cookie: "x-mxm-token-guid=" },
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_BYTES || text.trimStart().startsWith("<")) return null; // size / captcha-HTML guard
    return JSON.parse(text);
  } catch (error) {
    log.warn("musixmatch fetch failed", { error: String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── anonymous user token (cached) ─────────────────────────────────────────────
let tokenCache: { value: string; at: number } | null = null;

async function getUserToken(force = false): Promise<string | null> {
  if (!force && tokenCache && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
  const json = (await mxmGet("token.get", { t: `${Date.now()}` })) as
    | { message?: { header?: { status_code?: number }; body?: { user_token?: string } } }
    | null;
  const token = json?.message?.body?.user_token;
  if (!token || token === "UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly") {
    log.warn("musixmatch token unavailable");
    return null;
  }
  tokenCache = { value: token, at: Date.now() };
  return token;
}

// ── helpers to dig through the nested macro response ──────────────────────────
function deepFind(obj: unknown, key: string): unknown {
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = deepFind(v, key);
      if (r !== undefined) return r;
    }
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) return v;
      const r = deepFind(v, key);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

interface MxmMatchedTrack {
  track_name?: string;
  artist_name?: string;
  track_length?: number;
  commontrack_id?: number;
  has_richsync?: number;
  instrumental?: number;
}

/** Is the matched track close enough to ours to trust (avoid wrong-song lyrics)? */
function matchTrusted(t: MxmMatchedTrack, target: TrackMetaLike): boolean {
  const wantTitle = normalizeName(target.title);
  const wantArtist = normalizeName(target.artist || target.albumartist);
  const gotTitle = normalizeName(t.track_name ?? "");
  const gotArtist = normalizeName(t.artist_name ?? "");
  const durDelta =
    typeof t.track_length === "number" && target.duration ? Math.abs(t.track_length - target.duration) : Infinity;
  if (durDelta > 15 && Number.isFinite(durDelta)) return false;
  const titleOk = !!gotTitle && (gotTitle === wantTitle || gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle));
  const artistOk =
    !!gotArtist && (gotArtist === wantArtist || gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist));
  // A tight duration (≤4s) rescues decorated titles; otherwise need both title & artist.
  return (titleOk && artistOk) || (durDelta <= 4 && (titleOk || artistOk));
}

interface RichsyncChunk { c?: string; o?: number }
interface RichsyncEntry { ts?: number; x?: string; l?: RichsyncChunk[] }

/** Convert a richsync_body (JSON string) into parsed enhanced (word-timed) lines. */
export function richsyncToLines(richsyncBody: string): SyncedLine[] {
  let entries: RichsyncEntry[];
  try {
    entries = JSON.parse(richsyncBody);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  const lines: SyncedLine[] = [];
  for (const e of entries) {
    const ts = Number(e.ts);
    if (!Number.isFinite(ts)) continue;
    const words = (e.l ?? [])
      .map((w) => ({ time: ts + Number(w.o ?? 0), text: String(w.c ?? "").trim() }))
      .filter((w) => w.text.length > 0 && Number.isFinite(w.time));
    if (words.length > 0) lines.push({ time: ts, text: words.map((w) => w.text).join(" "), words });
    else if (e.x && e.x.trim()) lines.push({ time: ts, text: e.x.trim() });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Fetch synced lyrics for a track, preferring WORD-by-word (richsync) and falling back
 *  to Musixmatch's line-level subtitle. Returns canonical LRC, or null on any miss. */
export async function fetchRichsync(track: TrackMetaLike): Promise<string | null> {
  if (!track.title || !(track.artist || track.albumartist)) return null;
  let token = await getUserToken();
  if (!token) return null;

  const macroParams = (t: string) => ({
    namespace: "lyrics_richsynched",
    subtitle_format: "lrc",
    q_track: track.title,
    q_artist: track.artist || track.albumartist,
    q_album: track.album || "",
    q_duration: track.duration ? Math.round(track.duration) : "",
    usertoken: t,
  });

  // 1) Match the track and grab its line-level subtitle (LRC) in one macro call.
  let macro = await mxmGet("macro.subtitles.get", macroParams(token));
  // A token has a limited call quota: on 401 (exhausted) grab a fresh one and retry once.
  if (deepFind(macro, "status_code") === 401) {
    const fresh = await getUserToken(true);
    if (!fresh) return null;
    token = fresh;
    macro = await mxmGet("macro.subtitles.get", macroParams(token));
  }
  if (!macro) return null;

  const matched = deepFind(deepFind(macro, "matcher.track.get"), "track") as MxmMatchedTrack | undefined;
  if (!matched || !matchTrusted(matched, track)) return null;
  if (matched.instrumental) return null;

  // 2) Word-by-word when available.
  if (matched.has_richsync && matched.commontrack_id) {
    const rich = await mxmGet("track.richsync.get", { commontrack_id: matched.commontrack_id, usertoken: token });
    const body = deepFind(rich, "richsync_body");
    if (typeof body === "string" && body) {
      const lines = richsyncToLines(body);
      if (lines.some((l) => l.words && l.words.length > 0)) return serializeLrc(lines);
    }
  }

  // 3) Fall back to Musixmatch's line-level synced subtitle (already LRC text).
  const subtitle = deepFind(macro, "subtitle_body");
  if (typeof subtitle === "string" && subtitle.trim() && subtitle.includes("[")) return subtitle.trim();

  return null;
}
