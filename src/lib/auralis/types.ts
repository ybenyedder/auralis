// Auralis type system — label-grade model definitions

export interface Artist {
  artisthash: string;
  name: string;
  image?: string;
  trackcount?: number;
  albumcount?: number;
  playcount?: number;
  bio?: string;
  genres?: string[];
}

export interface Album {
  albumhash: string;
  title: string;
  albumartists: Artist[];
  image?: string;
  year?: number;
  trackcount?: number;
  duration?: number;
  genres?: string[];
  color?: [string, string, string];
}

export interface Track {
  trackhash: string;
  title: string;
  artist?: string;
  artists?: Artist[];
  album?: string;
  albumhash?: string;
  albumartists?: Artist[];
  duration?: number;
  filepath?: string;
  folder?: string;
  image?: string;
  is_favorite?: boolean;
  playcount?: number;
  disc?: number;
  track?: number;
  year?: number;
  genre?: string;
  /** Mood id from the audio-analysis classifier (server-computed); see mood.ts. */
  mood?: string;
  /** 0..1 RMS loudness/energy from analysis. */
  energy?: number;
  /** Estimated tempo (BPM) from analysis. */
  bpm?: number;
  /** ReplayGain-style adjustment in dB (toward -14 dBFS RMS) from analysis; used for
   *  transparent volume normalization. Undefined = not analysed yet. */
  gain?: number;
  bitrate?: number;
  samplerate?: number;
  channels?: number;
  codec?: string;
  lossless?: boolean;
  size?: number;
  hasLyrics?: boolean;
  /** Epoch ms when the file was first indexed (drives the "recently added" shelf). */
  addedAt?: number;
  color?: [string, string, string];
  lyrics?: { time: number; text: string; words?: { time: number; text: string }[] }[];
}

export interface FolderNode {
  name: string;
  path: string;
  trackcount: number;
  children?: FolderNode[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  image?: string;
  thumb?: string;
  trackcount?: number;
  count?: number;
  color?: [string, string, string];
  trackhashes?: string[];
  pinned?: boolean;
  /** When set, this is a SMART (dynamic) playlist computed live from rules instead
   *  of a static trackhash list. Persisted to the server as a JSON string. */
  rules?: import("./smartlist").SmartConfig;
  /** Owner has shared this playlist (collaborators can append/remove tracks). */
  shared?: boolean;
  /** This playlist is owned by ANOTHER user who shared it with us (read + append). */
  collaborator?: boolean;
  /** Owner's username, when this is a collaborator playlist. */
  owner?: string;
}

export type ViewId =
  | "home"
  | "explore"
  | "library"
  | "favorites"
  | "recents"
  | "folders"
  | "insights"
  | "album"
  | "artist"
  | "playlist"
  | "settings";

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackStats {
  tracks: number;
  albums: number;
  artists: number;
  totalDuration: number;
}
