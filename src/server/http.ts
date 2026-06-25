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

/**
 * CSRF guard for COOKIE-authenticated mutations. A cross-site page can make the
 * browser send a state-changing POST/PUT with the session cookie attached, so for
 * such requests we require a same-origin Origin/Referer. Bearer / ?token= clients
 * (Android, desktop) are exempt — those credentials are never sent automatically,
 * so they aren't a CSRF vector. Returns a 403 response to block, or null to allow.
 */
export function checkCsrf(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  // Token-bearing clients aren't cookie-driven → not subject to CSRF.
  const authz = request.headers.get("authorization");
  const hasBearer = !!authz && authz.toLowerCase().startsWith("bearer ");
  const hasQueryToken = new URL(request.url).searchParams.has("token");
  if (hasBearer || hasQueryToken) return null;

  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) {
    // A cookie-authed mutation with no Origin/Referer is suspicious — reject.
    return json({ error: "Origine de la requête manquante" }, { status: 403 });
  }
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return json({ error: "Origine de la requête invalide" }, { status: 403 });
  }

  // Build the set of acceptable hosts. Behind a reverse proxy the Host header is
  // often the upstream (localhost) while the real public host arrives in
  // X-Forwarded-Host, so we honour both — plus an explicit operator allowlist
  // (AURALIS_ALLOWED_ORIGINS) for setups that rewrite neither. This mirrors how
  // Next's Server Action CSRF reconciles Origin against Host/forwarded host.
  const allowed = new Set<string>();
  const host = request.headers.get("host");
  if (host) allowed.add(host);
  const xfh = request.headers.get("x-forwarded-host");
  if (xfh) xfh.split(",").forEach((h) => allowed.add(h.trim()));
  for (const entry of (process.env.AURALIS_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      allowed.add(new URL(entry.includes("://") ? entry : `https://${entry}`).host);
    } catch {
      allowed.add(entry);
    }
  }

  if (allowed.has(sourceHost)) return null;
  return json({ error: "Origine de la requête non autorisée" }, { status: 403 });
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
