import { getRequestUser } from "@/server/auth";
import { json } from "@/server/http";
import { getListeningStats } from "@/server/state/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  return json(getListeningStats(user.id));
}
