import { getRequestUser, createSessionToken } from "@/server/auth";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  return json({
    authenticated: Boolean(user),
    // Only reveal account details to an authenticated session.
    defaultPassword: user ? user.is_default === 1 : false,
    username: user?.username ?? null,
    isAdmin: user ? user.is_admin === 1 : false,
    // Re-issue a fresh session token so a cookie-authenticated client can persist
    // it in localStorage and present it on every request — this is what keeps
    // writes (favorites, playlists) working reliably across app restarts.
    token: user ? createSessionToken(user.id) : null,
  });
}
