import {
  getUserState, setFavorite, setDislike, recordPlay, recordSkip, setSetting,
  upsertPlaylist, deletePlaylist, reorderPlaylists, replaceUserState, resetUserStats, isHash,
  setPlaylistShared, addCollaborator, addTrackToPlaylist, removeTrackFromPlaylist,
} from "@/server/state/userState";
import { getRequestUser } from "@/server/auth";
import { json, checkCsrf } from "@/server/http";
import { invalidateReco } from "@/server/reco/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  return json(getUserState(user.id));
}

interface ActionBody {
  action: string;
  trackhash?: string;
  value?: unknown;
  key?: string;
  id?: string;
  ids?: string[];
  /** Milliseconds actually heard before a play/skip (taste-engine signal strength). */
  msPlayed?: number;
  /** Fraction of the track heard, 0..1 (how "complete" the listen / how early the skip). */
  ratio?: number;
  playlist?: { id?: string; name: string; description?: string | null; pinned?: boolean; trackhashes?: string[]; rules?: string | null };
  /** Collaborator username for playlist.collaborator. */
  username?: string;
  state?: Parameters<typeof replaceUserState>[1];
}

export async function PUT(request: Request) {
  // Block cross-site cookie-driven mutations (a malicious page could otherwise
  // invoke the 'replace' action and wipe a logged-in user's whole library).
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const uid = user.id;

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "favorite":
      if (!isHash(body.trackhash)) return json({ error: "valid trackhash required" }, { status: 400 });
      setFavorite(uid, body.trackhash, Boolean(body.value));
      invalidateReco(uid);
      return json({ ok: true });
    case "dislike":
      if (!isHash(body.trackhash)) return json({ error: "valid trackhash required" }, { status: 400 });
      setDislike(uid, body.trackhash, Boolean(body.value));
      invalidateReco(uid);
      return json({ ok: true });
    case "play": {
      if (!isHash(body.trackhash)) return json({ error: "valid trackhash required" }, { status: 400 });
      const count = recordPlay(uid, body.trackhash, body.msPlayed, body.ratio);
      invalidateReco(uid);
      return json({ ok: true, count });
    }
    case "skip":
      if (!isHash(body.trackhash)) return json({ error: "valid trackhash required" }, { status: 400 });
      recordSkip(uid, body.trackhash, body.msPlayed, body.ratio);
      invalidateReco(uid);
      return json({ ok: true });
    case "setting":
      if (!body.key) return json({ error: "key required" }, { status: 400 });
      setSetting(uid, body.key, body.value);
      return json({ ok: true });
    case "playlist.upsert": {
      if (!body.playlist?.name) return json({ error: "playlist.name required" }, { status: 400 });
      const id = upsertPlaylist(uid, body.playlist);
      return json({ ok: true, id });
    }
    case "playlist.delete":
      if (!body.id) return json({ error: "id required" }, { status: 400 });
      deletePlaylist(uid, body.id);
      return json({ ok: true });
    case "playlist.reorder":
      if (!Array.isArray(body.ids)) return json({ error: "ids required" }, { status: 400 });
      reorderPlaylists(uid, body.ids);
      return json({ ok: true });
    case "playlist.share":
      if (!body.id) return json({ error: "id required" }, { status: 400 });
      setPlaylistShared(uid, body.id, Boolean(body.value));
      return json({ ok: true });
    case "playlist.collaborator": {
      if (!body.id || !body.username) return json({ error: "id and username required" }, { status: 400 });
      const r = addCollaborator(uid, body.id, body.username);
      return r.ok ? json({ ok: true }) : json({ error: r.error }, { status: 400 });
    }
    case "playlist.addTrack":
      if (!body.id || !isHash(body.trackhash)) return json({ error: "id and trackhash required" }, { status: 400 });
      addTrackToPlaylist(uid, body.id, body.trackhash);
      return json({ ok: true });
    case "playlist.removeTrack":
      if (!body.id || !isHash(body.trackhash)) return json({ error: "id and trackhash required" }, { status: 400 });
      removeTrackFromPlaylist(uid, body.id, body.trackhash);
      return json({ ok: true });
    case "replace":
      if (!body.state) return json({ error: "state required" }, { status: 400 });
      replaceUserState(uid, body.state);
      return json({ ok: true });
    case "resetStats":
      // Clear this user's play counts / recents / event log (favourites + playlists kept).
      resetUserStats(uid);
      invalidateReco(uid);
      return json({ ok: true });
    default:
      return json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
