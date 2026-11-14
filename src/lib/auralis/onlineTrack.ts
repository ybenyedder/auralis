import { api } from "./api";
import type { Track } from "./types";
import { useLibraryStore } from "@/store/library";

export interface OnlineSearchHit {
  videoId: string;
  title: string;
  artist?: string;
  uploader: string;
  duration: number;
  thumbnail: string | null;
  url: string;
}

export function onlineHitToTrack(hit: OnlineSearchHit): Track {
  const artist = (hit.artist || hit.uploader || "YouTube").replace(/\s*-\s*Topic$/i, "").trim() || "YouTube";
  return {
    trackhash: `yt:${hit.videoId}`,
    title: hit.title,
    artist,
    artists: [{ artisthash: `yt-ar:${artist.toLowerCase()}`, name: artist }],
    album: "Streaming",
    duration: Number.isFinite(hit.duration) ? hit.duration : 0,
    filepath: `yt://${hit.videoId}`,
    image: `/api/online/art/${encodeURIComponent(hit.videoId)}`,
    isOnline: true,
    videoId: hit.videoId,
  };
}

/** Add an online streamed track to the client index immediately so likes,
 *  recents, and lyrics UI see it right away, and persist lightweight metadata
 *  to the server in the background (0 B of audio stored on disk). */
export function registerOnlineTrack(hit: OnlineSearchHit): Track {
  const track = onlineHitToTrack(hit);
  useLibraryStore.getState().upsertTrack(track);
  void api
    .post<{ ok: boolean; track?: Track }>("/api/online/register", {
      videoId: hit.videoId,
      title: hit.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      thumbnail: hit.thumbnail,
    })
    .then((res) => {
      if (res?.ok && res.track) useLibraryStore.getState().upsertTrack(res.track);
    })
    .catch(() => {});
  return track;
}
