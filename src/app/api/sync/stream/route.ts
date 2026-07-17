// SSE channel for the realtime "Connect" hub. A client opens this once; the
// device id / name / kind ride in the query (EventSource can't set headers).
// Auth is the usual cookie or ?token= (appended by the api client), so WebView /
// desktop clients stay authenticated.

import { getRequestUser } from "@/server/auth";
import { registerSubscriber, unregisterSubscriber, heartbeat, type DeviceKind } from "@/server/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DeviceKind[] = ["desktop", "mobile", "web"];

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const deviceId = (url.searchParams.get("device") || "").slice(0, 64);
  const name = (url.searchParams.get("name") || "Appareil").slice(0, 40);
  const rawKind = url.searchParams.get("kind") || "web";
  const kind: DeviceKind = KINDS.includes(rawKind as DeviceKind) ? (rawKind as DeviceKind) : "web";
  if (!deviceId) return new Response("Bad Request", { status: 400 });

  const subId = globalThis.crypto.randomUUID();
  const encoder = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  // Shared with cancel() below — it's a separate method on this object, not
  // nested inside start(), so a `closed` declared only inside start() would be
  // invisible to it and the two cleanup paths couldn't guard against each other.
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const listener = (event: string, data: unknown) =>
        safeEnqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      registerSubscriber(user.id, subId, { id: deviceId, name, kind }, listener);
      safeEnqueue(`event: ready\ndata: ${JSON.stringify({ id: subId })}\n\n`);

      ping = setInterval(() => {
        // If a prior enqueue already flipped `closed` (the client vanished without
        // firing abort/cancel — a proxy that swallowed the FIN), stop the timer and
        // stop refreshing lastSeen. Otherwise heartbeat() would keep this dead
        // device fresh forever, so the staleness sweep could never reap it and the
        // interval would leak for the life of the process.
        if (closed) {
          if (ping) clearInterval(ping);
          return;
        }
        heartbeat(user.id, deviceId);
        safeEnqueue(`: ping\n\n`); // comment frame keeps the connection warm
      }, 25000);

      // Clean up OUR resources only. The runtime closes the controller itself on
      // disconnect; calling controller.close() here too triggers an uncaught
      // ERR_INVALID_STATE ("Controller is already closed") inside Next's internals.
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unregisterSubscriber(user.id, subId);
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (ping) clearInterval(ping);
      unregisterSubscriber(user.id, subId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
