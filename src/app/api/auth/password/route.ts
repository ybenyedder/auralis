import { changePassword, getRequestUser, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/server/auth";
import { json, checkCsrf } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return json({ error: "Invalid body" }, { status: 400 });
  }

  const result = changePassword(user.id, body.currentPassword ?? "", body.newPassword ?? "");
  if (!result.ok) return json({ error: result.error }, { status: 400 });

  // The change bumped token_version, invalidating every existing token (incl. this
  // device's). Re-issue a fresh one so the CURRENT session stays logged in while
  // OTHER devices are signed out. Cookie clients update transparently; token
  // clients (Android) read `token` from the body and re-store it.
  const token = createSessionToken(user.id);
  const res = json({ ok: true, token });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_S });
  return res;
}
