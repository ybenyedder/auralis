import { SESSION_COOKIE, revokeSessionToken } from "@/server/auth";
import { json, checkCsrf } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Without this, a cross-site page could force-logout a visiting user
  // (e.g. <img src="/api/auth/logout">) since the cookie rides along.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  // Revoke EVERY credential the request carries: the cookie, but also the
  // bearer token and the legacy ?token= — those are what localStorage clients
  // actually present, and they used to survive "logout" indefinitely.
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    revokeSessionToken(auth.slice(7).trim());
  }
  try {
    const qToken = new URL(request.url).searchParams.get("token");
    if (qToken) revokeSessionToken(qToken);
  } catch { /* malformed URL — nothing to revoke */ }

  const cookie = request.headers.get("cookie");
  if (cookie) {
    const parts = cookie.split(";");
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx !== -1 && part.slice(0, idx).trim() === SESSION_COOKIE) {
        const raw = part.slice(idx + 1).trim();
        try { revokeSessionToken(decodeURIComponent(raw)); } catch { revokeSessionToken(raw); }
      }
    }
  }

  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
