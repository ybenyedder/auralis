// Shared HTTP helpers for the API routes: optional bearer-token auth for LAN
// hardening, consistent JSON responses and baseline security headers.

import { NextResponse } from "next/server";
import { isAuthenticated } from "./auth";

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

/** Returns a 401 response unless the request carries a valid admin session or token. */
export function checkAuth(request: Request): NextResponse | null {
  if (isAuthenticated(request)) return null;
  return json({ error: "Unauthorized" }, { status: 401 });
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
