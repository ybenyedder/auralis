import { withAuth, json } from "@/server/http";
import { getListeningStats } from "@/server/state/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// withAuth resolves the user once and returns 401 for unauthenticated callers,
// replacing the manual getRequestUser + null-check boilerplate.
export const GET = withAuth((_req, user) => json(getListeningStats(user.id)));
