// Admin-only account management. List, create and delete user accounts; each
// account carries its own favorites / playlists / history (see userState).
import { getRequestUser, listUsers, createUser, deleteUser, setUserPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { json, checkCsrf, readJsonBody } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_admin !== 1) return json({ error: "Réservé à l'administrateur" }, { status: 403 });
  return json({
    users: listUsers().map((u) => ({ id: u.id, username: u.username, isAdmin: u.is_admin === 1, createdAt: u.created_at })),
    me: user.id,
  });
}

export async function POST(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_admin !== 1) return json({ error: "Réservé à l'administrateur" }, { status: 403 });

  const parsed = await readJsonBody<{ username?: string; password?: string; isAdmin?: boolean }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const result = createUser(body.username ?? "", body.password ?? "", Boolean(body.isAdmin));
  if (!result.ok) return json({ error: result.error }, { status: 400 });
  return json({ ok: true, id: result.id });
}

export async function PUT(request: Request) {
  // Admin password reset for another account.
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_admin !== 1) return json({ error: "Réservé à l'administrateur" }, { status: 403 });

  const parsed = await readJsonBody<{ id?: number; password?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (typeof body.id !== "number") return json({ error: "id required" }, { status: 400 });
  const result = setUserPassword(body.id, body.password ?? "");
  if (!result.ok) return json({ error: result.error }, { status: 400 });

  // setUserPassword bumped token_version, invalidating every token for that user.
  // If the admin reset their OWN password here, re-issue this session so they
  // aren't silently logged out (mirrors /api/auth/password). Cookie clients update
  // transparently; token clients adopt the returned `token`.
  if (body.id === user.id) {
    const token = createSessionToken(user.id);
    const res = json({ ok: true, token });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
    return res;
  }
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const csrf = checkCsrf(request);
  if (csrf) return csrf;
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  if (user.is_admin !== 1) return json({ error: "Réservé à l'administrateur" }, { status: 403 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return json({ error: "id required" }, { status: 400 });
  if (id === user.id) return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, { status: 400 });
  const result = deleteUser(id);
  if (!result.ok) return json({ error: result.error }, { status: 400 });
  return json({ ok: true });
}
