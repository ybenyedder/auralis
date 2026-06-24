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
  bitrate?: number;
  samplerate?: number;
  channels?: number;
  codec?: string;
  lossless?: boolean;
  size?: number;
  hasLyrics?: boolean;
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
