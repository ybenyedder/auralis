// Shared HTTP helpers for the API routes: optional bearer-token auth for LAN
// hardening, consistent JSON responses and baseline security headers.

import { NextResponse } from "next/server";
import { isAuthenticated, getRequestUser } from "./auth";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
};

// API auth also accepts a bearer / ?token=, so a wildcard ACAO would let any
// origin read a user's data. The app is same-origin, so we deliberately do NOT
// emit Access-Control-Allow-Origin on authenticated responses. Only unauthenticated
// probes that legitimately need cross-origin reads (e.g. /api/health) opt in.
export function withCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  return res;
}

/** Returns a 401 response unless the request carries a valid (any-user) session or token. */
export function checkAuth(request: Request): NextResponse | null {
  if (isAuthenticated(request)) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
}

/** Returns a 401/403 response unless the request belongs to an ADMIN account.
 *  Use this for destructive / host-level operations (repointing the music dir,
 *  triggering scans) — checkAuth alone only proves *some* valid user, which would
 *  let any non-admin account repoint the library at arbitrary host paths. */
export function requireAdmin(request: Request): NextResponse | null {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_admin !== 1) return json({ error: "Réservé à l'administrateur" }, { status: 403 });
  return null;
}

export function json(body: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}
