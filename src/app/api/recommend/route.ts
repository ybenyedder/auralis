// Personalised recommendations driven by the taste engine.
//   GET /api/recommend                       → { profile, forYou[] }   (Made for you)
//   GET /api/recommend?seed=<hash>&limit=20   → { seed, tracks[] }       (personalised radio)
//   GET /api/recommend?exclude=h1,h2          → exclude hashes from a radio/mix
// Hashes only on the wire — the client resolves them against its library snapshot.

import { recommend, recommendRadio, recommendTrajectory, recommendDiscovery, recommendBlend } from "@/server/reco/engine";
import { getRequestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const seed = searchParams.get("seed");
  // Only clamp when a limit was actually supplied; otherwise leave it undefined so
  // the per-mode defaults (80 for the mix, 25 for radio) apply.
  const rawLimit = searchParams.get("limit");
  const n = rawLimit == null ? NaN : Number(rawLimit);
  const limit = Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(200, Math.trunc(n))) : undefined;
  const exclude = (searchParams.get("exclude") || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 500);

  const blend = searchParams.get("blend");
  if (blend) {
    // Resolve the household member by username (the public accounts list exposes
    // usernames). Blending with yourself or an unknown user yields an empty mix.
    const other = getDb().prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(blend.trim()) as { id: number } | undefined;
    if (!other || other.id === user.id) return json({ blend, forYou: [], match: 0 });
    return json({ blend, ...recommendBlend(user.id, other.id, limit ?? 80) });
  }

  const path = searchParams.get("path");
  if (path) {
    return json({ path, tracks: recommendTrajectory(user.id, path, limit ?? 30) });
  }
  if (searchParams.get("mode") === "discovery") {
    return json({ mode: "discovery", tracks: recommendDiscovery(user.id, limit ?? 60) });
  }
  if (seed) {
    return json({ seed, tracks: recommendRadio(user.id, seed, limit ?? 25, exclude) });
  }
  return json(recommend(user.id, limit ?? 80));
}
