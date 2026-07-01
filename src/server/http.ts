// Shared HTTP helpers for the API routes: optional bearer-token auth for LAN
// hardening, consistent JSON responses and baseline security headers.

import { NextResponse } from "next/server";
import { isAuthenticated, getRequestUser, getTokenUser } from "./auth";

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

  // Token-bearing clients aren't cookie-driven → not subject to CSRF. But the mere
  // PRESENCE of a token is forgeable: a cross-site page can append ?token=anything
  // to slip past the guard. So we exempt only when the token actually AUTHENTICATES
  // a user (cookie ignored — getTokenUser validates bearer/?token= alone). A forged
  // or stale token returns null and falls through to the Origin/Referer check.
  if (getTokenUser(request)) return null;

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

// App Router route handlers have no built-in cap on request.json() — an
// oversized body is fully buffered into memory before any route-level
// validation (e.g. the 8MB playlist-cover check) gets a chance to reject it.
const MAX_JSON_BODY_BYTES = 10 * 1024 * 1024; // 8MB cover image + JSON/base64 overhead

export type JsonBodyResult<T> = { ok: true; body: T } | { ok: false; response: NextResponse };

/**
 * Reads and JSON-parses a request body while enforcing a hard cap on the actual
 * bytes read. A Content-Length pre-check alone isn't enough — a client can omit
 * the header or use chunked transfer-encoding, in which case an over-limit
 * request would sail straight through and get fully buffered by request.json()
 * before anything could reject it. This reads the stream manually and aborts
 * (cancelling the reader) the moment the running total crosses maxBytes, so an
 * oversized body is rejected regardless of what the client claims or omits.
 */
export async function readJsonBody<T>(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<JsonBodyResult<T>> {
  // Fast path: an honestly-declared oversized Content-Length rejects before
  // reading a single byte.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, response: json({ error: "Requête trop volumineuse" }, { status: 413 }) };

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: json({ error: "Invalid JSON body" }, { status: 400 }) };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, response: json({ error: "Requête trop volumineuse" }, { status: 413 }) };
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false, response: json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
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
