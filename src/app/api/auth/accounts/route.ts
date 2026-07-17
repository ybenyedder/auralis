// Public list of account usernames so the login screen can offer a picker
// (the user selects who they are instead of typing it). Self-hosted LAN app:
// exposing just the usernames (no hashes) before login is an acceptable trade.
import { listUsers } from "@/server/auth";
import { json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ usernames: listUsers().map((u) => u.username) });
}
