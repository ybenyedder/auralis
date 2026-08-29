// Real audio metadata extraction via music-metadata (pure JS, ESM-only — loaded
// through a cached dynamic import). Reads tags, technical format details and any
// embedded cover picture. Never throws: malformed files degrade to filename data.

import path from "path";
import { cacheArtBuffer } from "./art";

// music-metadata is ESM-only and its published types resolve to the browser-safe
// "core" entry (no parseFile). We type just the surface we use and cast the import.
interface ParsedAudio {
  common: {
    title?: string;
    artist?: string;
    artists?: string[];
    albumartist?: string;
    album?: string;
    year?: number;
    genre?: string[];
    track?: { no?: number | null };
    disk?: { no?: number | null };
    picture?: { format?: string; data: Uint8Array }[];
  };
  format: {
    duration?: number;
    bitrate?: number;
    sampleRate?: number;
    numberOfChannels?: number;
    codec?: string;
    lossless?: boolean;
  };
}
type ParseFile = (filePath: string, options?: { duration?: boolean; skipCovers?: boolean }) => Promise<ParsedAudio>;

let parseFilePromise: Promise<ParseFile> | null = null;
function loadParseFile(): Promise<ParseFile> {
  if (!parseFilePromise) {
    parseFilePromise = import("music-metadata").then((mod) => (mod as unknown as { parseFile: ParseFile }).parseFile);
  }
  return parseFilePromise;
}

export interface ExtractedMetadata {
  title: string;
  artist: string;
  albumartist: string;
  album: string;
  duration: number;
  year?: number;
  genre?: string;
  trackNo?: number;
  discNo?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  lossless: boolean;
  /** Content hash of the embedded cover, if any was cached. */
  arthash?: string;
}

const WHITESPACE = /\s+/g;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(WHITESPACE, " ").trim();
  return trimmed.length ? trimmed : undefined;
}

/** Derive title/artist from "Artist - Title" filenames when tags are absent. */
function fromFilename(filePath: string): { title: string; artist?: string } {
  const base = path.basename(filePath, path.extname(filePath))
    .replace(/_spotdown\.org$/i, "")
    .replace(/_+/g, " ")
    .replace(WHITESPACE, " ")
    .trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim() || undefined, title: parts.slice(1).join(" - ").trim() || base };
  }
  return { title: base || path.basename(filePath) };
}

export async function extractMetadata(filePath: string): Promise<ExtractedMetadata> {
  const fallback = fromFilename(filePath);
  const parentFolder = path.basename(path.dirname(filePath));

  try {
    const parseFile = await loadParseFile();
    const parsed = await parseFile(filePath, { duration: true, skipCovers: false });
    const { common, format } = parsed;

    let arthash: string | undefined;
    const picture = common.picture?.[0];
    if (picture?.data && picture.data.length > 0) {
      arthash = cacheArtBuffer(Buffer.from(picture.data)) ?? undefined;
    }

    const title = cleanString(common.title) ?? fallback.title;
    const artist =
      cleanString(common.artist) ??
      cleanString(common.artists?.[0]) ??
      fallback.artist ??
      "Artiste inconnu";
    const albumartist = cleanString(common.albumartist) ?? artist;
    const album =
      cleanString(common.album) ??
      (parentFolder && parentFolder !== "." ? parentFolder : "Singles");

    const bitrate = format.bitrate ? Math.round(format.bitrate / 1000) : undefined;

    return {
      title,
      artist,
      albumartist,
      album,
      duration: typeof format.duration === "number" && Number.isFinite(format.duration) ? format.duration : 0,
      year: typeof common.year === "number" && common.year > 0 ? common.year : undefined,
      genre: cleanString(common.genre?.[0]),
      trackNo: common.track?.no ?? undefined,
      discNo: common.disk?.no ?? undefined,
      bitrate,
      sampleRate: format.sampleRate ?? undefined,
      channels: format.numberOfChannels ?? undefined,
      codec: cleanString(format.codec),
      lossless: Boolean(format.lossless),
      arthash,
    };
  } catch {
    // Unreadable / unsupported container — still index it with filename data.
    return {
      title: fallback.title,
      artist: fallback.artist ?? (parentFolder !== "." ? parentFolder : "Artiste inconnu"),
      albumartist: fallback.artist ?? "Artiste inconnu",
      album: parentFolder && parentFolder !== "." ? parentFolder : "Singles",
      duration: 0,
      lossless: false,
    };
  }
}
