import { changePassword, getRequestUser, createSessionToken, SESSION_COOKIE, sessionCookieOptions, isPasswordCompromised, validatePassword } from "@/server/auth";
import { json, checkCsrf, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await readJsonBody<{ currentPassword?: string; newPassword?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // Validate locally BEFORE the third-party breach check (no point paying a
  // network round-trip for a 2-char password), and ENFORCE the verdict instead
  // of merely echoing it — a password in public breach lists is a compromise
  // waiting to happen, whatever the client renders.
  const pwError = validatePassword(body.newPassword ?? "");
  if (pwError) return json({ error: pwError }, { status: 400 });
  if (await isPasswordCompromised(body.newPassword ?? "")) {
    return json({ error: "Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre." }, { status: 400 });
  }

  const result = await changePassword(user.id, body.currentPassword ?? "", body.newPassword ?? "");
  if (!result.ok) return json({ error: result.error }, { status: 400 });

  // setUserPassword deletes this user's session rows, signing out every other
  // device (the legacy token_version column is no longer read anywhere). Re-issue a fresh one so the CURRENT session stays logged in while
  // OTHER devices are signed out. Cookie clients update transparently; token
  // clients (Android) read `token` from the body and re-store it.
  const token = createSessionToken(user.id);
  const res = json({ ok: true, token });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return res;
}
