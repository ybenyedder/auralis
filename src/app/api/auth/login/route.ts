import { verifyCredentials, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/server/auth";
import { json, readJsonBody } from "@/server/http";
import { clientKey, usernameKey, rateLimitCheck, rateLimitFail, rateLimitReset } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Unauthenticated endpoint — the size guard runs before anything else here,
  // ahead of even the rate limiter, since there's no session to key work off yet.
  const parsed = await readJsonBody<{ username?: string; password?: string }>(request);
  if (!parsed.ok) return parsed.response;

  // Username is optional for backward compatibility — the single original
  // account is "admin", so a password-only login still works.
  const username = (parsed.body.username ?? "admin").trim().toLowerCase() || "admin";
  const password = parsed.body.password ?? "";

  // Brute-force guard: two independent buckets. `ipKey` (IP+username) blunts a
  // single source; `userKey` (username only) caps total failures for an account
  // regardless of source IP, so rotating/spoofing X-Forwarded-For can't bypass it.
  const ipKey = clientKey(request, username);
  const userKey = usernameKey(username);
  const wait = Math.max(rateLimitCheck(ipKey), rateLimitCheck(userKey));
  if (wait > 0) {
    return json(
      { error: `Trop de tentatives. Réessayez dans ${Math.ceil(wait / 1000)} s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } },
    );
  }

  const user = verifyCredentials(username, password);
  if (!user) {
    rateLimitFail(ipKey);
    rateLimitFail(userKey);
    return json({ error: "Identifiant ou mot de passe incorrect" }, { status: 401 });
  }
  rateLimitReset(ipKey);
  rateLimitReset(userKey);

  const token = createSessionToken(user.id);
  // Return the token so the client can persist it (localStorage) and present it
  // as a bearer on later launches — this keeps WebView clients logged in even
  // when the session cookie is dropped on app restart.
  const res = json({ ok: true, defaultPassword: user.is_default === 1, username: user.username, isAdmin: user.is_admin === 1, token });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
