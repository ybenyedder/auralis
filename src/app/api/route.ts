import { json } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  return json({
    name: "Auralis",
    status: "ok",
    version: "1.1.0",
    endpoints: [
      "/api/health",
      "/api/library",
      "/api/library/scan",
      "/api/library/events",
      "/api/search?q=",
      "/api/lyrics/:trackhash",
      "/api/art/:hash",
      "/api/state",
      "/api/stats",
      "/api/stream/:path",
    ],
  });
}
