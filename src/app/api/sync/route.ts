// Control plane for the realtime "Connect" hub: a device publishes its
// now-playing snapshot (`state`) or relays a transport command (`command`) to the
// user's other devices. The SSE channel (./stream) carries the fan-out the other
// way. Same-origin POST, so the standard CSRF guard applies (token clients exempt).

import { getRequestUser } from "@/server/auth";
import { json, checkCsrf, checkBodySize } from "@/server/http";
import { publishNowPlaying, sendCommand, type RemoteCommand } from "@/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMANDS: RemoteCommand["type"][] = ["play", "pause", "next", "prev", "seek"];

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const tooBig = checkBodySize(request);
  if (tooBig) return tooBig;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ error: "Bad Request" }, { status: 400 });

  if (body.action === "state") {
    const deviceId = String(body.deviceId || "").slice(0, 64);
    if (!deviceId) return json({ error: "deviceId required" }, { status: 400 });
    publishNowPlaying(user.id, {
      deviceId,
      trackhash: typeof body.trackhash === "string" ? body.trackhash : null,
      title: typeof body.title === "string" ? body.title.slice(0, 200) : undefined,
      artist: typeof body.artist === "string" ? body.artist.slice(0, 200) : undefined,
      image: typeof body.image === "string" ? body.image.slice(0, 400) : undefined,
      position: Number(body.position) || 0,
      duration: Number(body.duration) || 0,
      isPlaying: Boolean(body.isPlaying),
      updatedAt: Date.now(),
    });
    return json({ ok: true });
  }

  if (body.action === "command") {
    const type = body.type as RemoteCommand["type"];
    if (!COMMANDS.includes(type)) return json({ error: "bad command" }, { status: 400 });
    // Only forward a finite position (NaN/Infinity would set audioEl.currentTime to
    // a bad value on the target when its duration is unknown).
    const position =
      typeof body.position === "number" && Number.isFinite(body.position) ? body.position : undefined;
    sendCommand(user.id, {
      target: String(body.target || "").slice(0, 64),
      from: String(body.from || "").slice(0, 64),
      type,
      position,
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}
