import {
  getUserState, setFavorite, recordPlay, setSetting,
  upsertPlaylist, deletePlaylist, reorderPlaylists, replaceUserState,
} from "@/server/state/userState";
import { getRequestUser } from "@/server/auth";
import { json } from "@/server/http";

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
  playlist?: { id?: string; name: string; description?: string | null; pinned?: boolean; trackhashes?: string[] };
  state?: Parameters<typeof replaceUserState>[1];
}

export async function PUT(request: Request) {
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
      if (!body.trackhash) return json({ error: "trackhash required" }, { status: 400 });
      setFavorite(uid, body.trackhash, Boolean(body.value));
      return json({ ok: true });
    case "play": {
      if (!body.trackhash) return json({ error: "trackhash required" }, { status: 400 });
      const count = recordPlay(uid, body.trackhash);
      return json({ ok: true, count });
    }
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
    case "replace":
      if (!body.state) return json({ error: "state required" }, { status: 400 });
      replaceUserState(uid, body.state);
      return json({ ok: true });
    default:
      return json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  }
}
