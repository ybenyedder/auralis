import {
  SESSION_COOKIE,
  createSessionToken,
  createUser,
  sessionCookieOptions,
  validatePassword,
} from "@/server/auth";
import { json, readJsonBody } from "@/server/http";
import { clientKey, rateLimitWindow } from "@/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RegisterBody {
  username?: unknown;
  password?: unknown;
}

const USERNAME_RE = /^[a-zA-Z0-9._@-]{2,32}$/;

export async function POST(request: Request) {
  const parsed = await readJsonBody<RegisterBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body || typeof body !== "object") {
    return json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!USERNAME_RE.test(rawUsername)) {
    return json(
      {
        error:
          "Identifiant invalide (2 à 32 caractères : lettres, chiffres, ., _, @ ou -).",
      },
      { status: 400 },
    );
  }

  const pwError = validatePassword(password);
  if (pwError) {
    return json({ error: pwError }, { status: 400 });
  }

  if (rateLimitWindow(clientKey(request, "register"), 30, 15 * 60 * 1000)) {
    return json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const created = await createUser(rawUsername, password, false);
  if (!created.ok || !created.id) {
    const msg = created.error ?? "Impossible de créer ce compte.";
    const isDuplicate = /existe|exist|taken|déjà|duplicate|unique/i.test(msg);
    return json(
      { error: isDuplicate ? "Ce nom d'utilisateur est déjà pris." : msg },
      { status: isDuplicate ? 409 : 400 },
    );
  }

  const normalizedUsername = rawUsername.toLowerCase();
  const token = createSessionToken(created.id, request);
  const res = json(
    {
      ok: true,
      defaultPassword: false,
      username: normalizedUsername,
      isAdmin: false,
      token,
    },
    { status: 201 },
  );
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
  return res;
}
