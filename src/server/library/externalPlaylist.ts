// Import a playlist from a shared LINK. The user pastes a Spotify / Deezer /
// Apple Music / YouTube playlist (or album) URL — or a direct .m3u/.json URL — and
// we resolve it to a plain tracklist of { title, artist } pairs. The matching of
// those pairs against the local library happens client-side (see playlistIO.ts),
// so this module's only job is: fetch the source and extract the tracklist.
//
// No provider API keys: Deezer exposes a public JSON API, Spotify's /embed page
// ships the tracklist inline as __NEXT_DATA__, Apple Music emits JSON-LD, and
// YouTube's playlist page carries ytInitialData. All key-less, all public data.
//
// SSRF is the obvious risk of "fetch a user-supplied URL server-side". Two guards:
//   1. For the streaming providers we NEVER fetch the user's URL — we parse the id
//      out of it and build the request against a hard-coded host we control, so the
//      user only ever influences an opaque id, never the host.
//   2. The one path that does fetch the user's exact URL (generic .m3u/.json) is
//      https-only and rejects private / loopback / link-local hosts.

import { createLogger } from "../logger";

const log = createLogger("playlist-import");

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 6 * 1024 * 1024; // Spotify/Apple/YouTube pages can be a few MB
const MAX_TRACKS = 2000; // bound the tracklist we hand back to the client
// A browser-ish UA: Apple Music and YouTube serve a stripped page (or none) to an
// obvious bot UA, and the inline JSON we parse only ships in the full page.
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0";

export interface ExternalTrack {
  title: string;
  artist: string;
  album?: string;
}

export interface ExternalPlaylist {
  name: string;
  /** Provider label for the UI ("Spotify", "Deezer", …). */
  source: string;
  tracks: ExternalTrack[];
}

/** A parse failure the route maps to a user-facing message + HTTP status. */
export class PlaylistImportError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlaylistImportError";
    this.status = status;
  }
}

// --- fetch helpers ----------------------------------------------------------

/** GET text with a hard timeout, a size ceiling and redirect:error (an open
 *  redirect can't bounce a provider fetch onto an internal host). */
async function fetchText(url: string, accept: string, extraHeaders?: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: accept, "Accept-Language": "en", ...extraHeaders },
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) throw new PlaylistImportError(`La source a répondu ${res.status}.`, 502);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new PlaylistImportError("Réponse trop volumineuse.", 502);
    // Stream with a running byte cap: content-length can be absent (chunked).
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new PlaylistImportError("Réponse trop volumineuse.", 502);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (error) {
    if (error instanceof PlaylistImportError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlaylistImportError("La source n'a pas répondu à temps.", 504);
    }
    log.warn("fetch failed", { url: safeHost(url), error: String(error) });
    throw new PlaylistImportError("Impossible de récupérer cette adresse.", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const text = await fetchText(url, "application/json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PlaylistImportError("Réponse illisible de la source.", 502);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
}

// --- generic tracklist shaping ---------------------------------------------

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
}

function pushTrack(out: ExternalTrack[], title: unknown, artist: unknown, album?: unknown): void {
  const t = clean(title);
  if (!t || out.length >= MAX_TRACKS) return;
  out.push({ title: t, artist: clean(artist), ...(clean(album) ? { album: clean(album) } : {}) });
}

/** Depth-first search for the first array whose objects look like tracklist rows
 *  (they carry a `title`/`name` AND a `subtitle`/artist-ish sibling). Lets the
 *  Spotify/embed parser survive small shape changes in __NEXT_DATA__. */
function findTrackArray(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 8 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    const rows = node.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
    const looksLikeTracks =
      rows.length > 0 &&
      rows.length === node.length &&
      rows.every((r) => ("title" in r || "name" in r) && ("subtitle" in r || "artists" in r || "artistName" in r));
    if (looksLikeTracks) return rows;
    for (const child of node) {
      const hit = findTrackArray(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const hit = findTrackArray(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Extract the first brace-balanced `{…}` object that follows `marker` in `text`,
 *  respecting string literals so nested braces don't end it early. Needed for
 *  inline assignments like `var ytInitialData = {…};` where the object is embedded
 *  in a larger script (a regex can't balance nested JSON). */
function extractBalancedObject(text: string, marker: RegExp): string | null {
  const m = marker.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < text.length && text[i] !== "{") i += 1;
  if (i >= text.length) return null;
  const start = i;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Pull the JSON payload of a `<script id="..." type="application/json">` (or the
 *  first application/ld+json block) out of an HTML page. */
function scriptJson(html: string, id: string): unknown | null {
  const re = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// --- providers --------------------------------------------------------------

/** Deezer — public REST API, cleanest of the lot. Handles playlists and albums. */
async function fromDeezer(kind: "playlist" | "album", id: string): Promise<ExternalPlaylist> {
  if (kind === "album") {
    const data = await fetchJson<{ title?: string; artist?: { name?: string }; tracks?: { data?: unknown[] } }>(
      `https://api.deezer.com/album/${id}?limit=${MAX_TRACKS}`,
    );
    const tracks: ExternalTrack[] = [];
    for (const raw of data.tracks?.data ?? []) {
      const t = raw as { title?: string; artist?: { name?: string } };
      pushTrack(tracks, t.title, t.artist?.name ?? data.artist?.name, data.title);
    }
    if (!tracks.length) throw new PlaylistImportError("Album Deezer vide ou introuvable.", 404);
    return { name: clean(data.title) || "Album Deezer", source: "Deezer", tracks };
  }
  const data = await fetchJson<{ title?: string; error?: unknown; tracks?: { data?: unknown[] } }>(
    `https://api.deezer.com/playlist/${id}?limit=${MAX_TRACKS}`,
  );
  if (data.error) throw new PlaylistImportError("Playlist Deezer introuvable (est-elle publique ?).", 404);
  const tracks: ExternalTrack[] = [];
  for (const raw of data.tracks?.data ?? []) {
    const t = raw as { title?: string; artist?: { name?: string }; album?: { title?: string } };
    pushTrack(tracks, t.title, t.artist?.name, t.album?.title);
  }
  if (!tracks.length) throw new PlaylistImportError("Playlist Deezer vide.", 404);
  return { name: clean(data.title) || "Playlist Deezer", source: "Deezer", tracks };
}

/** Spotify — the /embed page ships the whole tracklist inline as __NEXT_DATA__,
 *  no token needed. `subtitle` holds the artist(s). Works for playlist + album. */
async function fromSpotify(kind: "playlist" | "album", id: string): Promise<ExternalPlaylist> {
  const html = await fetchText(`https://open.spotify.com/embed/${kind}/${id}`, "text/html");
  const data = scriptJson(html, "__NEXT_DATA__");
  if (!data) throw new PlaylistImportError("Impossible de lire la page Spotify.", 502);
  const rows = findTrackArray(data);
  if (!rows || !rows.length) {
    throw new PlaylistImportError("Playlist Spotify vide ou privée.", 404);
  }
  // The entity name lives near the tracklist; grab a best-effort "name" from the
  // deep object without hard-coding the (occasionally shifting) full path.
  const name = clean(deepFind(data, "name")) || clean(deepFind(data, "title")) || `${kind === "album" ? "Album" : "Playlist"} Spotify`;
  const tracks: ExternalTrack[] = [];
  for (const r of rows) {
    pushTrack(tracks, r.title ?? r.name, r.subtitle ?? artistsToString(r.artists));
  }
  if (!tracks.length) throw new PlaylistImportError("Playlist Spotify vide.", 404);
  return { name, source: "Spotify", tracks };
}

/** Apple Music — the page carries JSON-LD (schema.org MusicPlaylist / MusicAlbum)
 *  whose `track` list gives us name + byArtist. */
async function fromAppleMusic(rawUrl: string): Promise<ExternalPlaylist> {
  const html = await fetchText(rawUrl, "text/html");
  // There can be several ld+json blocks; scan them all for a music entity.
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(b[1]);
    } catch {
      continue;
    }
    const entities = Array.isArray(json) ? json : [json];
    for (const ent of entities) {
      const e = ent as { "@type"?: string; name?: string; track?: unknown };
      const type = String(e["@type"] ?? "");
      if (!/MusicPlaylist|MusicAlbum/i.test(type)) continue;
      // Albums carry the list under `tracks` with the artist at the album level;
      // playlists use `track` and carry no per-track artist in JSON-LD.
      const album = e as { track?: unknown; tracks?: unknown; byArtist?: unknown };
      const list = extractItemList(album.track ?? album.tracks);
      const albumArtist = artistsToString(album.byArtist);
      const tracks: ExternalTrack[] = [];
      for (const item of list) {
        const it = item as { name?: string; byArtist?: unknown };
        pushTrack(tracks, it.name, artistsToString(it.byArtist) || albumArtist);
      }
      if (tracks.length) return { name: clean(e.name) || "Playlist Apple Music", source: "Apple Music", tracks };
    }
  }
  throw new PlaylistImportError("Impossible de lire cette playlist Apple Music (essayez un lien public).", 502);
}

/** A music-video title is usually "Artist - Song (Official Video)". Prefer that
 *  embedded "Artist - Title" split (it's cleaner than the channel byline, which is
 *  often "…VEVO" / "… - Topic"); fall back to the channel name when there's no
 *  dash. The client matcher then strips the "(Official Video)" / "feat." noise. */
function splitYouTubeTitle(rawTitle: string, channel: string): { title: string; artist: string } {
  const sep = /\s[-–—]\s/.exec(rawTitle);
  if (sep && sep.index > 0) {
    return { artist: rawTitle.slice(0, sep.index).trim(), title: rawTitle.slice(sep.index + sep[0].length).trim() };
  }
  const cleanChannel = channel.replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").trim();
  return { title: rawTitle, artist: cleanChannel };
}

/** YouTube / YouTube Music — best-effort scrape of ytInitialData. Modern pages ship
 *  each row as a `lockupViewModel` (older ones as `playlistVideoRenderer`); we read
 *  both. Titles are noisy ("Artist - Song (Official Video)") — see splitYouTubeTitle. */
async function fromYouTube(id: string): Promise<ExternalPlaylist> {
  // hl/gl force an English, region-stable page; the consent cookie skips the EU
  // interstitial (a redirect that would otherwise strip ytInitialData and, with
  // redirect:error, fail the fetch outright).
  const html = await fetchText(
    `https://www.youtube.com/playlist?list=${id}&hl=en&gl=US`,
    "text/html",
    { Cookie: "SOCS=CAI; CONSENT=YES+1" },
  );
  const raw =
    extractBalancedObject(html, /var\s+ytInitialData\s*=\s*/) ??
    extractBalancedObject(html, /ytInitialData"\]\s*=\s*/) ??
    extractBalancedObject(html, /ytInitialData\s*=\s*/);
  if (!raw) throw new PlaylistImportError("Impossible de lire cette playlist YouTube.", 502);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new PlaylistImportError("Impossible de lire cette playlist YouTube.", 502);
  }

  const tracks: ExternalTrack[] = [];
  // New format: lockupViewModel.metadata.lockupMetadataViewModel.{title, metadataRows}.
  for (const n of collectByKey(data, "lockupViewModel")) {
    const meta = (n as { metadata?: { lockupMetadataViewModel?: unknown } })?.metadata?.lockupMetadataViewModel as
      | { title?: { content?: string }; metadata?: { contentMetadataViewModel?: { metadataRows?: { metadataParts?: { text?: { content?: string } }[] }[] } } }
      | undefined;
    const rawTitle = clean(meta?.title?.content);
    if (!rawTitle) continue;
    const channel = clean(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content);
    const { title, artist } = splitYouTubeTitle(rawTitle, channel);
    pushTrack(tracks, title, artist);
  }
  // Legacy format fallback.
  if (!tracks.length) {
    for (const r of collectByKey(data, "playlistVideoRenderer")) {
      const row = r as { title?: { runs?: { text?: string }[] }; shortBylineText?: { runs?: { text?: string }[] } };
      const rawTitle = clean(row.title?.runs?.[0]?.text);
      if (!rawTitle) continue;
      const { title, artist } = splitYouTubeTitle(rawTitle, clean(row.shortBylineText?.runs?.[0]?.text));
      pushTrack(tracks, title, artist);
    }
  }
  if (!tracks.length) throw new PlaylistImportError("Playlist YouTube vide ou privée.", 404);

  const metaNode = (collectByKey(data, "playlistMetadataRenderer")[0] ?? collectByKey(data, "microformatDataRenderer")[0]) as { title?: string } | undefined;
  const name = clean(metaNode?.title) || "Playlist YouTube";
  return { name, source: "YouTube", tracks };
}

/** Direct .m3u / .json URL (e.g. an Auralis export hosted somewhere, or a shared
 *  M3U). https-only, public-host-only (SSRF guard) since here we fetch the exact
 *  user URL rather than a host we control. */
async function fromDirectUrl(url: URL): Promise<ExternalPlaylist> {
  if (url.protocol !== "https:") {
    throw new PlaylistImportError("Seules les adresses https sont acceptées pour un lien direct.", 400);
  }
  if (isPrivateHost(url.hostname)) {
    throw new PlaylistImportError("Cette adresse pointe vers un hôte privé.", 400);
  }
  const text = await fetchText(url.toString(), "*/*");
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    let json: { name?: string; tracks?: unknown[] };
    try {
      json = JSON.parse(text);
    } catch {
      throw new PlaylistImportError("Fichier JSON invalide.", 400);
    }
    const tracks: ExternalTrack[] = [];
    for (const raw of json.tracks ?? []) {
      const t = raw as { title?: string; artist?: string; album?: string };
      pushTrack(tracks, t.title, t.artist, t.album);
    }
    if (!tracks.length) throw new PlaylistImportError("Aucun titre dans ce fichier.", 400);
    return { name: clean(json.name) || "Playlist importée", source: "Fichier", tracks };
  }
  // M3U / M3U8: read #EXTINF:duration,Artist - Title lines.
  const tracks: ExternalTrack[] = [];
  let name = "Playlist importée";
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith("#PLAYLIST:")) name = clean(l.slice(10)) || name;
    else if (l.startsWith("#EXTINF:")) {
      const label = l.slice(l.indexOf(",") + 1).trim();
      const dash = label.indexOf(" - ");
      if (dash >= 0) pushTrack(tracks, label.slice(dash + 3), label.slice(0, dash));
      else pushTrack(tracks, label, "");
    }
  }
  if (!tracks.length) throw new PlaylistImportError("Aucun titre lisible dans ce fichier.", 400);
  return { name, source: "Fichier", tracks };
}

// --- small structural helpers ----------------------------------------------

function artistsToString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(artistsToString).filter(Boolean).join(", ");
  if (v && typeof v === "object") return clean((v as { name?: string }).name);
  return "";
}

/** schema.org `track` may be a bare array, or an ItemList with `itemListElement`
 *  (each possibly wrapped in a ListItem `item`). Flatten to the track objects. */
function extractItemList(track: unknown): unknown[] {
  if (!track) return [];
  if (Array.isArray(track)) return track;
  const t = track as { itemListElement?: unknown };
  if (Array.isArray(t.itemListElement)) {
    return t.itemListElement.map((el) => (el && typeof el === "object" && "item" in el ? (el as { item: unknown }).item : el));
  }
  return [];
}

/** First value for `key` anywhere in the object graph (bounded depth). */
function deepFind(node: unknown, key: string, depth = 0): unknown {
  if (depth > 8 || node === null || typeof node !== "object") return undefined;
  if (!Array.isArray(node) && key in (node as Record<string, unknown>)) {
    const v = (node as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    const hit = deepFind(value, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Collect every value stored under `key` anywhere in the graph (bounded). Depth
 *  is generous because YouTube's tracklist rows nest ~15 levels deep. */
function collectByKey(node: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 24 || node === null || typeof node !== "object" || out.length >= MAX_TRACKS) return out;
  if (!Array.isArray(node) && key in (node as Record<string, unknown>)) {
    out.push((node as Record<string, unknown>)[key]);
  }
  for (const value of Object.values(node as Record<string, unknown>)) collectByKey(value, key, out, depth + 1);
  return out;
}

/** Block SSRF targets: loopback, private, link-local, unique-local, metadata. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "::") return true;
  // IPv4 literal → range checks.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) return true;
  }
  // IPv6 unique-local (fc00::/7) / link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
  return false;
}

// --- URL routing ------------------------------------------------------------

const SPOTIFY_ID = /[a-zA-Z0-9]{16,}/;

/** Detect the provider from a URL and dispatch to the matching parser. Throws a
 *  PlaylistImportError (with an HTTP status) on anything we can't handle. */
export async function importPlaylistFromUrl(rawInput: string): Promise<ExternalPlaylist> {
  const raw = rawInput.trim();
  if (!raw) throw new PlaylistImportError("Adresse vide.", 400);

  // Accept spotify: URIs too (spotify:playlist:xxxx).
  const uri = /^spotify:(playlist|album):([a-zA-Z0-9]+)$/.exec(raw);
  if (uri) return fromSpotify(uri[1] as "playlist" | "album", uri[2]);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PlaylistImportError("Adresse invalide.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PlaylistImportError("Protocole non supporté.", 400);
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;

  // Spotify — open.spotify.com/(intl-xx/)?(playlist|album)/{id}
  if (host === "open.spotify.com" || host.endsWith(".spotify.com")) {
    const m = /\/(playlist|album)\/([a-zA-Z0-9]+)/.exec(path);
    if (m && SPOTIFY_ID.test(m[2])) return fromSpotify(m[1] as "playlist" | "album", m[2]);
    throw new PlaylistImportError("Lien Spotify non reconnu (collez un lien de playlist ou d'album).", 400);
  }

  // Deezer — deezer.com/(xx/)?(playlist|album)/{id}. Short links are not resolved.
  if (host === "deezer.com" || host.endsWith(".deezer.com")) {
    if (host.startsWith("link.") || host.includes("page.link")) {
      throw new PlaylistImportError("Ouvrez le lien court Deezer et collez l'adresse complète.", 400);
    }
    const m = /\/(playlist|album)\/(\d+)/.exec(path);
    if (m) return fromDeezer(m[1] as "playlist" | "album", m[2]);
    throw new PlaylistImportError("Lien Deezer non reconnu (collez un lien de playlist ou d'album).", 400);
  }

  // Apple Music — music.apple.com/{country}/(playlist|album)/...
  if (host === "music.apple.com" || host === "itunes.apple.com") {
    if (!/\/(playlist|album)\//.test(path)) {
      throw new PlaylistImportError("Lien Apple Music non reconnu.", 400);
    }
    return fromAppleMusic(url.toString());
  }

  // YouTube / YouTube Music — needs a ?list= playlist id.
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
    const list = url.searchParams.get("list");
    if (list && /^[a-zA-Z0-9_-]{10,}$/.test(list)) return fromYouTube(list);
    throw new PlaylistImportError("Lien YouTube non reconnu (il faut une playlist, avec ?list=).", 400);
  }

  // Fallback: a direct .m3u / .m3u8 / .json URL.
  if (/\.(m3u8?|json)$/i.test(path)) return fromDirectUrl(url);

  throw new PlaylistImportError(
    "Service non reconnu. Collez un lien Spotify, Deezer, Apple Music ou YouTube.",
    415,
  );
}
