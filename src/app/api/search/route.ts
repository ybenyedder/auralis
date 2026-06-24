import { search } from "@/server/library/repository";
import { checkAuth, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = checkAuth(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  if (!q) return json({ tracks: [], albums: [], artists: [], query: "" });
  return json({ ...search(q, limit), query: q });
}
