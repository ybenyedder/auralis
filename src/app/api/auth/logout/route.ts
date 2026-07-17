import { SESSION_COOKIE } from "@/server/auth";
import { json, checkCsrf } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Without this, a cross-site page could force-logout a visiting user
  // (e.g. <img src="/api/auth/logout">) since the cookie rides along.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;

  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
