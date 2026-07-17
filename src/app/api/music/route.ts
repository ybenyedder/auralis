// Backwards-compatible alias of /api/library kept so older clients keep working.
// It re-exports the same GET handler instead of duplicating it, so the two never
// drift apart.
export { GET } from "../library/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
