// Server-Sent Events stream of live scan progress. Clients (web/desktop/mobile)
// subscribe to render a progress bar without polling.

import { subscribeScan, getScanProgress } from "@/server/library/scanner";
import { checkAuth } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (data: unknown) => write(`data: ${JSON.stringify(data)}\n\n`);
      send(getScanProgress());
      const unsubscribe = subscribeScan(send);
      const keepalive = setInterval(() => write(": keepalive\n\n"), 15000);

      // Tear down OUR resources only. Do NOT call controller.close() here: when
      // the client disconnects the runtime closes the controller itself, and a
      // second close() lands in Next's internals as an uncaught ERR_INVALID_STATE.
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
