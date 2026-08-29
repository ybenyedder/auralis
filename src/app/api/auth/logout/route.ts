import { SESSION_COOKIE, revokeSessionToken } from "@/server/auth";
import { json, checkCsrf } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Without this, a cross-site page could force-logout a visiting user
  // (e.g. <img src="/api/auth/logout">) since the cookie rides along.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const cookie = request.headers.get("cookie");
  if (cookie) {
    const parts = cookie.split(";");
    for (const part of parts) {
      const idx = part.indexOf("=");
      if (idx !== -1 && part.slice(0, idx).trim() === SESSION_COOKIE) {
        revokeSessionToken(decodeURIComponent(part.slice(idx + 1).trim()));
      }
    }
  }

  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
