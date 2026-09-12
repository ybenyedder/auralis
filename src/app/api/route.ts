import { json } from "@/server/http";
import { getRequestUser } from "@/server/auth";
import pkg from "../../../package.json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Same anti-fingerprinting rule as /api/health: the exact version is only
  // interesting to attackers shopping for a known CVE — authenticated clients
  // (the update check) still get it.
  const user = getRequestUser(request);
  return json({
    name: "Auralis",
    status: "ok",
    version: user ? pkg.version : null,
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
